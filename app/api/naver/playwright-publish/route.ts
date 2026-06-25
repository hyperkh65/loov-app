import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { postToNaverBlog } from '@/lib/naver-blog'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { title, content, tags = [], categoryNo = 0 } = await req.json()

  if (!title?.trim()) return NextResponse.json({ error: '제목이 필요합니다' }, { status: 400 })
  if (!content?.trim()) return NextResponse.json({ error: '내용이 필요합니다' }, { status: 400 })

  const { data: conn } = await supabase
    .from('naver_connections')
    .select('blog_id, nid_aut, nid_ses')
    .eq('user_id', user.id)
    .single()

  if (!conn?.blog_id || !conn?.nid_aut || !conn?.nid_ses) {
    return NextResponse.json({ error: '네이버 블로그 연결 정보가 없습니다. 설정 탭에서 먼저 연결해주세요.' }, { status: 400 })
  }

  const result = await postToNaverBlog({
    blogId: conn.blog_id,
    nidAut: conn.nid_aut,
    nidSes: conn.nid_ses,
    title,
    content,
    tags,
    categoryNo,
    isPublish: true,
  })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.errorCode === 'AUTH' ? 401 : 500 })
  }

  return NextResponse.json({ postId: result.postId, postUrl: result.postUrl })
}
