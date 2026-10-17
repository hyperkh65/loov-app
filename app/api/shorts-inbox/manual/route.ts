import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { youtubeAccess, uploadShort, ShortsError } from '@/lib/shorts-youtube';

export const maxDuration = 300;

// LOOV 화면에서 직접 올리는 수동 업로드 (로그인한 사용자의 YouTube 연결 사용)
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
  const admin = createAdminClient();
  try {
    const conn = await youtubeAccess(admin, user.id);
    const f = await req.formData();
    const video = f.get('video') as File | null;
    if (!video || typeof video === 'string') return NextResponse.json({ error: '영상 파일을 선택하세요' }, { status: 400 });
    const str = (k: string) => String(f.get(k) || '');
    const r = await uploadShort(conn.accessToken, {
      buf: Buffer.from(await video.arrayBuffer()), title: str('title'), description: str('description'), tags: str('tags'), publishAt: str('publish_at'),
    });
    await admin.from('shorts_jobs').upsert({
      id: `manual_${r.videoId}`, user_id: user.id, title: str('title') || '쇼츠', description: str('description'), source: 'manual',
      status: r.scheduled ? 'scheduled' : 'uploaded', scheduled_at: r.scheduled, uploaded_at: new Date().toISOString(),
      video_id: r.videoId, video_url: r.url, updated_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ShortsError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: String((e as Error).message || e) }, { status: 500 });
  }
}
