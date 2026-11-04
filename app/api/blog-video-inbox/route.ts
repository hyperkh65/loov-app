import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { inboxAuthed } from '@/lib/shorts-youtube';
import { beat, macOnline, addItem, takePending, ack } from '@/lib/blog-video-inbox';

const CHANNEL = '현가젯'; // 블로그 영상을 올릴 유튜브 채널(LOOV에 연결된 채널 이름에 포함된 글자)

const plain = (html: string) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// POST: 발행 화면이 "맥에서 영상 만들기"를 요청. 영상은 항상 맥(딸깍)에서 만든다. 맥이 꺼져 있으면 쌓아 두었다가 켜지면 만든다
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
  const b = await req.json().catch(() => ({})) as { article_id?: string; title?: string; keyword?: string; description?: string; blog_url?: string };
  if (!b.article_id || !b.title) return NextResponse.json({ error: 'article_id와 title이 필요해요' }, { status: 400 });
  const online = await macOnline(); // 맥이 꺼져 있어도 일감은 쌓아 두고, 맥이 켜지면 가져가 만든다(NAS에서는 만들지 않는다)

  const { data: art } = await supabase.from('bossai_auto_articles').select('content, representative_image_url, published_urls').eq('id', b.article_id).eq('user_id', user.id).single();
  if (!art) return NextResponse.json({ error: '글을 찾을 수 없어요' }, { status: 404 });
  const html = String(art.content || '');
  // 화면이 글 주소를 못 넘긴 경우(발행 결과에 주소가 없을 때)에도 이미 발행된 글 주소를 DB에서 찾아 영상 설명란·댓글에 넣는다
  const blogUrl = (b.blog_url || Object.values((art.published_urls || {}) as Record<string, string>).find(u => typeof u === 'string' && /^https?:\/\//.test(u)) || '') as string;
  const images = [...new Set([art.representative_image_url, ...[...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map(m => m[1])].filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u)))].slice(0, 12);

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: job } = await admin.from('bossai_shorts_queue').insert({ user_id: user.id, article_id: b.article_id, title: b.title, keyword: b.keyword ?? '', status: 'pending', progress: online ? '맥에서 영상 제작 대기 중...' : '맥이 꺼져 있어요 — 켜지면 영상을 만들어 올려요', created_at: now, updated_at: now }).select('id').single();
  if (!job) return NextResponse.json({ error: 'DB 저장 실패' }, { status: 500 });
  await addItem(job.id, { job_id: job.id, title: b.title, keyword: b.keyword ?? '', description: b.description ?? '', blog_url: blogUrl, text: plain(html).slice(0, 6000), images, channel: CHANNEL });
  return NextResponse.json({ mac: true, online, job_id: job.id });
}

// GET: 맥(딸깍)이 주기적으로 가져간다(가져가는 것 자체가 "맥 켜짐" 신호)
export async function GET(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await beat().catch(() => {});
  return NextResponse.json({ items: await takePending() });
}

// PUT: 맥이 진행 상황 보고 {job_id, progress, status?: running|done|error, video_url?, yt_url?, error?}
export async function PUT(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({})) as { job_id?: string; progress?: string; status?: string; video_url?: string; yt_url?: string; error?: string };
  if (!b.job_id) return NextResponse.json({ error: 'job_id 필요' }, { status: 400 });
  const status = b.status === 'done' || b.status === 'error' ? b.status : 'running';
  await createAdminClient().from('bossai_shorts_queue').update({
    status, progress: String(b.progress || '').slice(0, 200), updated_at: new Date().toISOString(),
    ...(b.video_url ? { video_url: b.video_url } : {}), ...(b.yt_url ? { yt_url: b.yt_url } : {}), ...(status === 'error' ? { error_message: String(b.error || b.progress || '').slice(0, 300) } : {}),
  }).eq('id', b.job_id);
  if (status !== 'running') await ack(b.job_id).catch(() => {});
  return NextResponse.json({ ok: true });
}
