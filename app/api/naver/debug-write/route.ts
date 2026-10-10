import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { data: conn } = await supabase
    .from('naver_connections')
    .select('blog_id, nid_aut, nid_ses')
    .eq('user_id', user.id)
    .single()

  if (!conn?.nid_aut) return NextResponse.json({ error: '네이버 연결 없음' }, { status: 400 })

  const res = await fetch('http://host.docker.internal:4567/find-write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blogId: conn.blog_id, nidAut: conn.nid_aut, nidSes: conn.nid_ses }),
    signal: AbortSignal.timeout(60000),
  })
  const data = await res.json()
  return NextResponse.json(data)
}
