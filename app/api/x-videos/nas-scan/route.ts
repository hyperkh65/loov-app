import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const pat = process.env.GITHUB_PAT
  const repo = process.env.GITHUB_REPO || 'hyperkh65/loov-app'

  if (!pat) return NextResponse.json({ error: 'GitHub PAT 미설정' }, { status: 500 })

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/nas-xmedia-scan.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  )

  if (res.status === 204) {
    return NextResponse.json({ ok: true, message: 'NAS 스캔 시작됨 (약 1~2분 소요 후 자동 반영)' })
  }

  const text = await res.text()
  return NextResponse.json({ error: `GitHub API 오류: ${res.status} ${text}` }, { status: 500 })
}
