import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { postToNaverBlog, sanitizeForNaver } from '@/lib/naver-blog';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const {
    title, content, tags = [], categoryNo = 0,
    status = 'publish', notionPageId = '',
  } = await req.json() as {
    title: string; content: string; tags: string[];
    categoryNo: number; status: string; notionPageId: string;
  };

  if (!title?.trim()) return NextResponse.json({ error: '제목이 필요합니다' }, { status: 400 });
  if (!content?.trim()) return NextResponse.json({ error: '내용이 필요합니다' }, { status: 400 });

  // 연결 정보 조회
  const { data: conn } = await supabase
    .from('naver_connections')
    .select('blog_id, nid_aut, nid_ses')
    .eq('user_id', user.id)
    .single();

  if (!conn?.blog_id) return NextResponse.json({ error: '네이버 블로그 연결 정보가 없습니다. 설정 탭에서 먼저 연결해주세요.' }, { status: 400 });
  if (!conn.nid_aut || !conn.nid_ses) return NextResponse.json({ error: '네이버 쿠키(NID_AUT, NID_SES)가 없습니다. 설정 탭에서 쿠키를 입력해주세요.' }, { status: 400 });

  // 네이버 호환 HTML로 변환
  const cleanContent = sanitizeForNaver(content);

  const result = await postToNaverBlog({
    blogId: conn.blog_id,
    nidAut: conn.nid_aut,
    nidSes: conn.nid_ses,
    title: title.trim(),
    content: cleanContent,
    tags,
    categoryNo,
    isPublish: status === 'publish',
  });

  if (result.error) {
    const httpStatus = result.errorCode === 'AUTH' ? 401 : 500;
    return NextResponse.json({ error: result.error, errorCode: result.errorCode }, { status: httpStatus });
  }

  // 발행 히스토리 저장
  await supabase.from('naver_publish_history').insert({
    user_id: user.id,
    blog_id: conn.blog_id,
    post_id: result.postId || '',
    post_url: result.postUrl || '',
    title: title.trim(),
    notion_page_id: notionPageId,
    status,
  });

  return NextResponse.json({ postId: result.postId, postUrl: result.postUrl });
}
