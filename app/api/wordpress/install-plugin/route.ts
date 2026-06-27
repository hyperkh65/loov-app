import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

    const { site_id, plugin_slug } = await req.json()
    if (!site_id || !plugin_slug) return NextResponse.json({ error: 'site_id, plugin_slug 필요' }, { status: 400 })

    const { data: site } = await supabase
      .from('wordpress_sites')
      .select('site_url, wp_username, app_password')
      .eq('id', site_id)
      .eq('user_id', user.id)
      .single()

    if (!site) return NextResponse.json({ error: '사이트 없음' }, { status: 404 })

    const auth = 'Basic ' + Buffer.from(`${site.wp_username}:${site.app_password}`).toString('base64')
    const base = site.site_url.replace(/\/$/, '')

    const wpFetch = (path: string, options?: RequestInit) =>
      fetch(`${base}/wp-json/wp/v2${path}`, {
        ...options,
        headers: { Authorization: auth, 'Content-Type': 'application/json', ...(options?.headers || {}) },
        signal: AbortSignal.timeout(60000),
      })

    // 1. 이미 설치/활성화 여부 확인
    try {
      const checkRes = await wpFetch(`/plugins/${plugin_slug}/${plugin_slug}`)
      if (checkRes.ok) {
        let existing: Record<string, unknown> = {}
        try { existing = await checkRes.json() } catch { /* ignore */ }
        if (existing.status === 'active') {
          return NextResponse.json({ ok: true, message: '이미 활성화되어 있습니다', already_active: true })
        }
        // 설치됐지만 비활성 → 활성화만
        const activateRes = await wpFetch(`/plugins/${plugin_slug}/${plugin_slug}`, {
          method: 'POST',
          body: JSON.stringify({ status: 'active' }),
        })
        if (activateRes.ok) return NextResponse.json({ ok: true, message: '플러그인 활성화 완료' })
      }
    } catch { /* check 실패해도 설치 시도 */ }

    // 2. 설치 + 활성화 (WP REST API)
    const installRes = await wpFetch('/plugins', {
      method: 'POST',
      body: JSON.stringify({ slug: plugin_slug, status: 'active' }),
    })

    if (installRes.ok) {
      return NextResponse.json({ ok: true, message: '플러그인 설치 및 활성화 완료! 이제부터 전체 방문자 수가 집계됩니다.' })
    }

    let errMsg = `설치 실패 (HTTP ${installRes.status})`
    try {
      const errJson = await installRes.json()
      errMsg = errJson.message || errMsg
    } catch { /* ignore */ }

    // WP REST API plugin install이 안 되는 경우 (권한 없거나 WP 5.5 미만)
    if (installRes.status === 403 || installRes.status === 404) {
      errMsg = 'WP REST API로 플러그인 설치 권한이 없습니다. WordPress 관리자 페이지에서 직접 "Post Views Counter" 플러그인을 설치해주세요.'
    }

    return NextResponse.json({ error: errMsg }, { status: 500 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
