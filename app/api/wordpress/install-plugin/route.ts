import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { nasExec } from '@/lib/nas-ssh'

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

    let wpApiErr = `설치 실패 (HTTP ${installRes.status})`
    try {
      const errJson = await installRes.json()
      wpApiErr = errJson.message || wpApiErr
    } catch { /* ignore */ }

    // WP REST API 실패 → NAS WP-CLI 폴백 시도
    try {
      const hostname = new URL(site.site_url).hostname
      const parts = hostname.split('.')
      const WP_CLI = '/volume1/homes/urjent/bin/wp'
      const PHP = '/usr/local/bin/php82'

      // 후보 경로: subdomain.domain.tld → /volume1/web/subdomain, hostname 등
      const candidatePaths: string[] = []
      if (parts.length >= 3) candidatePaths.push(`/volume1/web/${parts[0]}`)
      candidatePaths.push(`/volume1/web/${hostname}`)
      if (parts.length >= 2) candidatePaths.push(`/volume1/web/${parts[parts.length - 2]}`)

      for (const wpPath of candidatePaths) {
        const check = await nasExec(`test -f ${wpPath}/wp-config.php && echo exists || echo missing`)
        if (!check.stdout.includes('exists')) continue

        // 플러그인 디렉토리 권한 먼저 수정
        await nasExec(`chmod -R 755 ${wpPath}/wp-content/plugins 2>/dev/null; chown -R http:http ${wpPath}/wp-content/plugins 2>/dev/null; true`)

        const r = await nasExec(`${PHP} ${WP_CLI} plugin install ${plugin_slug} --activate --allow-root --path=${wpPath} 2>&1`)
        const out = (r.stdout + ' ' + r.stderr).toLowerCase()

        if (out.includes('success') || out.includes('activated') || out.includes('already installed') || r.code === 0) {
          return NextResponse.json({ ok: true, message: `플러그인 설치 및 활성화 완료 (NAS WP-CLI: ${wpPath})` })
        }
        return NextResponse.json({ error: `NAS WP-CLI 실패: ${r.stdout || r.stderr}` }, { status: 500 })
      }

      return NextResponse.json({ error: `NAS에서 WordPress 경로를 찾을 수 없습니다 (시도: ${candidatePaths.join(', ')})` }, { status: 500 })
    } catch (nasErr) {
      // NAS SSH도 실패하면 원래 WP REST API 오류 반환
      return NextResponse.json({ error: `WP REST API: ${wpApiErr} | NAS SSH: ${String(nasErr)}` }, { status: 500 })
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
