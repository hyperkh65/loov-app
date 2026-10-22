import { NextRequest, NextResponse } from 'next/server';
import { saveMonglePost, parseMonglePost } from '@/lib/mongle-posts';
import { createAdminClient } from '@/lib/supabase-server';
import { youtubeAccess, uploadShort, ShortsError, inboxAuthed } from '@/lib/shorts-youtube';
import { r2Available, uploadToR2 } from '@/lib/r2-storage';
import { saveToNasq, isLimit } from '@/lib/shorts-nasq';

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
    if (str('hold')) { // 발행 대기: R2에 보관만 하고 대시보드에서 [발행]을 누를 때 YouTube·Threads·Instagram에 올린다. phrase=YouTube 채널
      if (!r2Available()) return NextResponse.json({ error: 'R2 미설정' }, { status: 500 });
      const id = `hold_${str('job') || Date.now()}_${str('clip') || '0'}`;
      const url = await uploadToR2(`shorts/${id}.mp4`, Buffer.from(await video.arrayBuffer()), 'video/mp4');
      await admin.from('shorts_jobs').upsert({ id, user_id: conn.user_id, title: str('title') || '쇼츠', description: str('description'), phrase: str('channel') || null, status: 'created', source: 'hold', video_url: url, error: null, updated_at: new Date().toISOString() });
      const mp = str('post') && id.startsWith('hold_mongle_') ? parseMonglePost(str('post')) : null; if (mp) saveMonglePost(id, mp); // 몽글: ManyChat에 붙여 넣을 문구
      return NextResponse.json({ ok: true, url, hold: true });
    }
    const buf = Buffer.from(await video.arrayBuffer());
    let r;
    if (str('nasq')) { // 딸깍이 이미 한도를 알고 있음 → YouTube 시도 없이 바로 NAS로
      const id = `${str('job') || Date.now()}_${str('clip') || '0'}`;
      await saveToNasq({ id, userId: conn.user_id, buf, title: str('title') || '쇼츠', description: str('description'), tags: str('tags'), channel: str('channel'), publishAt: str('publish_at'), error: '딸깍: 오늘 한도 도달' });
      return NextResponse.json({ ok: true, nasq: true, url: 'nasq:' + id });
    }
    try {
      r = await uploadShort(conn.accessToken, { buf, title: str('title'), description: str('description'), tags: str('tags'), comment: str('comment'), publishAt: str('publish_at') });
    } catch (e) { // YouTube 한도 → NAS에 보관, 스케줄러가 하루 2개씩 올린다(딸깍은 성공으로 보고 넘어감)
      const msg = String((e as Error).message || e);
      if (!isLimit(msg)) throw e;
      const id = `${str('job') || Date.now()}_${str('clip') || '0'}`;
      await saveToNasq({ id, userId: conn.user_id, buf, title: str('title') || '쇼츠', description: str('description'), tags: str('tags'), channel: str('channel'), publishAt: str('publish_at'), error: msg });
      return NextResponse.json({ ok: true, nasq: true, url: 'nasq:' + id });
    }
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
