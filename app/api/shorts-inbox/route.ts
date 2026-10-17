import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { youtubeAccess, uploadShort, ShortsError, inboxAuthed } from '@/lib/shorts-youtube';

export const maxDuration = 300;

// 숏폼 딸깍(맥 앱) → LOOV. Bearer SHORTS_INBOX_TOKEN. 영상은 LOOV에 연결된 YouTube 채널로 바로 업로드.
// publish_at(ISO)이 있으면 비공개로 올리고 YouTube가 그 시각에 공개(예약). 결과는 shorts_jobs에 기록.
export async function POST(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  try {
    const f = await req.formData();
    const conn = await youtubeAccess(admin, undefined, String(f.get('channel') || ''));
    const video = f.get('video') as File | null;
    if (!video || typeof video === 'string') return NextResponse.json({ error: 'video 없음' }, { status: 400 });
    const str = (k: string) => String(f.get(k) || '');
    const r = await uploadShort(conn.accessToken, {
      buf: Buffer.from(await video.arrayBuffer()), title: str('title'), description: str('description'),
      tags: str('tags'), comment: str('comment'), publishAt: str('publish_at'),
    });
    const id = str('job') ? `${str('job')}_${str('clip') || '0'}` : `yt_${r.videoId}`;
    await admin.from('shorts_jobs').upsert({
      id, user_id: conn.user_id, title: str('title') || '쇼츠', description: str('description'),
      status: r.scheduled ? 'scheduled' : 'uploaded', scheduled_at: r.scheduled, uploaded_at: new Date().toISOString(),
      video_id: r.videoId, video_url: r.url, error: null, updated_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, videoId: r.videoId, url: r.url, scheduled: r.scheduled, channel: conn.channelName });
  } catch (e) {
    if (e instanceof ShortsError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: String((e as Error).message || e) }, { status: 500 });
  }
}
