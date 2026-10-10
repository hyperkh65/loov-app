import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

async function refreshToken(userId: string, refreshToken: string, supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('토큰 갱신 실패')
  await supabase.from('bossai_google_tokens').update({
    access_token: data.access_token,
    expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId)
  return data.access_token as string
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const siteUrl = req.nextUrl.searchParams.get('site_url')
  if (!siteUrl) return NextResponse.json({ error: 'site_url 필요' }, { status: 400 })

  const { data: tokenRow } = await supabase
    .from('bossai_google_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', user.id)
    .single()

  if (!tokenRow?.access_token) {
    return NextResponse.json({ error: 'Google 연결이 필요합니다', needs_auth: true }, { status: 401 })
  }

  let accessToken = tokenRow.access_token
  if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date(Date.now() + 60000)) {
    if (!tokenRow.refresh_token) {
      return NextResponse.json({ error: 'Google 재연결이 필요합니다', needs_auth: true }, { status: 401 })
    }
    try {
      accessToken = await refreshToken(user.id, tokenRow.refresh_token, supabase)
    } catch {
      return NextResponse.json({ error: 'Google 재연결이 필요합니다', needs_auth: true }, { status: 401 })
    }
  }

  const dimension = req.nextUrl.searchParams.get('dimension') || 'page'
  const endDate = new Date().toISOString().slice(0, 10)
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // Try with trailing slash and without
  const siteVariants = [
    siteUrl.replace(/\/$/, '') + '/',
    siteUrl.replace(/\/$/, ''),
    'sc-domain:' + siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''),
  ]

  for (const variant of siteVariants) {
    const encoded = encodeURIComponent(variant)
    const gscRes = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: [dimension],
          rowLimit: 25,
          orderby: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
        }),
        signal: AbortSignal.timeout(15000),
      }
    )

    if (gscRes.status === 403) {
      const body = await gscRes.json()
      const msg = JSON.stringify(body)
      if (msg.includes('insufficientPermissions') || msg.includes('PERMISSION_DENIED') || msg.includes('insufficient scope')) {
        return NextResponse.json({
          error: 'Search Console 권한이 없습니다. Google을 재연결하여 권한을 추가하세요.',
          needs_scope: true,
        }, { status: 403 })
      }
      // 사이트 미등록 → 다음 variant 시도
      continue
    }

    if (gscRes.status === 401) {
      return NextResponse.json({ error: 'Google 재연결이 필요합니다', needs_auth: true }, { status: 401 })
    }

    if (!gscRes.ok) continue

    const data = await gscRes.json()
    const rows = ((data.rows || []) as { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[])
      .map(row => ({
        // dimension=query → 'query' field; dimension=page → 'page' field
        ...(dimension === 'query' ? { query: row.keys[0] } : { page: row.keys[0] }),
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: Math.round(row.ctr * 1000) / 10,
        position: Math.round(row.position * 10) / 10,
      }))

    return NextResponse.json({ rows, start_date: startDate, end_date: endDate, matched_site: variant })
  }

  return NextResponse.json({
    error: 'Google Search Console에 이 사이트가 등록되지 않았습니다. GSC(search.google.com/search-console)에서 사이트를 먼저 추가하세요.',
    not_registered: true,
  }, { status: 404 })
}
