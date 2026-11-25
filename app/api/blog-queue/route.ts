// loov 글을 Mac(blog-bot)이 네이버/티스토리에 발행(mode=publish, 기본) 또는 임시저장(mode=draft)하도록 요청하는 대기열.
// Mac의 queue_worker.mjs가 blog_publish_queue 를 읽어 처리한다.
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

const PLATFORMS = ['naver', 'tistory'] as const;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { article_id, platform, blog, ai_mark, mode } = await req.json().catch(() => ({})) as { article_id?: string; platform?: string; blog?: string; ai_mark?: boolean; mode?: string };
  if (!article_id || !PLATFORMS.includes(platform as typeof PLATFORMS[number])) return NextResponse.json({ error: 'article_id, platform(naver|tistory) 필요' }, { status: 400 });
  if (blog && !/^[A-Za-z0-9_.-]{1,40}$/.test(blog)) return NextResponse.json({ error: '블로그 이름 형식 오류' }, { status: 400 });

  const admin = createAdminClient();
  const { data: art } = await admin.from('bossai_auto_articles').select('id, user_id').eq('id', article_id).single();
  if (!art || art.user_id !== user.id) return NextResponse.json({ error: '글을 찾을 수 없음' }, { status: 404 });

  // 같은 글·같은 곳으로 대기/진행 중인 요청이 있으면 새로 만들지 않는다(중복 클릭 방지)
  const { data: dup } = await admin.from('blog_publish_queue').select('*').eq('article_id', article_id).eq('platform', platform).in('status', ['pending', 'running']).limit(1);
  if (dup?.[0]) return NextResponse.json({ item: dup[0], duplicate: true });

  const { data, error } = await admin.from('blog_publish_queue')
    .insert({ article_id, platform, blog: blog || null, ai_mark: ai_mark !== false, mode: mode === 'draft' ? 'draft' : 'publish', requested_by: user.id }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
  const article_id = req.nextUrl.searchParams.get('article_id');
  if (!article_id) return NextResponse.json({ error: 'article_id 필요' }, { status: 400 });
  const { data } = await createAdminClient().from('blog_publish_queue').select('id, platform, blog, mode, status, message, created_at, finished_at')
    .eq('article_id', article_id).eq('requested_by', user.id).order('created_at', { ascending: false }).limit(6);
  return NextResponse.json({ items: data || [] });
}
