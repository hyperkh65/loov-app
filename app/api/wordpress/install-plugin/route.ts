import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
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

  // 1. 이미 설치/활성화 여부 확인
  const checkRes = await fetch(`${base}/wp-json/wp/v2/plugins/${plugin_slug}/${plugin_slug}`, {
    headers: { Authorization: auth },
    signal: AbortSignal.timeout(10000),
  })

  if (checkRes.ok) {
    const existing = await checkRes.json()
    if (existing.status === 'active') {
      return NextResponse.json({ ok: true, message: '이미 활성화되어 있습니다', already_active: true })
    }
    // 설치는 됐지만 비활성화 → 활성화만
    const activateRes = await fetch(`${base}/wp-json/wp/v2/plugins/${plugin_slug}/${plugin_slug}`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
      signal: AbortSignal.timeout(15000),
    })
    if (activateRes.ok) return NextResponse.json({ ok: true, message: '플러그인 활성화 완료' })
  }

  // 2. 설치 + 활성화 (WP REST API)
  const installRes = await fetch(`${base}/wp-json/wp/v2/plugins`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: plugin_slug, status: 'active' }),
    signal: AbortSignal.timeout(60000),
  })

  if (installRes.ok) {
    return NextResponse.json({ ok: true, message: '플러그인 설치 및 활성화 완료' })
  }

  const errText = await installRes.text()
  let errMsg = `설치 실패 (${installRes.status})`
  try {
    const errJson = JSON.parse(errText)
    errMsg = errJson.message || errMsg
  } catch { /* ignore */ }

  return NextResponse.json({ error: errMsg, status: installRes.status }, { status: 500 })
}
