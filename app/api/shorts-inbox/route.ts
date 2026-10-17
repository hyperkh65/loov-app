import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase-server';

export const maxDuration = 300;

// 숏폼 딸깍(맥 앱) → LOOV. Bearer SHORTS_INBOX_TOKEN. 영상은 LOOV에 연결된 YouTube 채널로 바로 업로드.
// publish_at(ISO)이 있으면 비공개로 올리고 YouTube가 그 시각에 공개(예약).
const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(req: NextRequest) {
  const secret = process.env.SHORTS_INBOX_TOKEN;
  const got = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!secret || !safeEq(got, secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  let q = admin.from('sns_connections').select('user_id, access_token, refresh_token, extra')
    .eq('platform', 'youtube').eq('is_active', true).order('updated_at', { ascending: false }).limit(1);
  if (process.env.OWNER_USER_ID) q = q.eq('user_id', process.env.OWNER_USER_ID);
  const { data: conn } = await q.maybeSingle();
  if (!conn) return NextResponse.json({ error: 'LOOV에 YouTube가 연결돼 있지 않아요' }, { status: 400 });

  let accessToken = conn.access_token as string;
  const exp = conn.extra?.expires_at ? new Date(conn.extra.expires_at) : null;
  if (conn.refresh_token && (!exp || exp <= new Date(Date.now() + 60_000))) {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({ refresh_token: conn.refresh_token, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, grant_type: 'refresh_token' }),
    });
    const d = await r.json();
    if (!r.ok) return NextResponse.json({ error: '토큰 갱신 실패: ' + (d.error_description || d.error) }, { status: 502 });
    accessToken = d.access_token;
    await admin.from('sns_connections').update({ access_token: accessToken, extra: { ...conn.extra, expires_at: new Date(Date.now() + 3500_000).toISOString() } })
      .eq('user_id', conn.user_id).eq('platform', 'youtube');
  }

  const f = await req.formData();
  const video = f.get('video') as File | null;
  if (!video || typeof video === 'string') return NextResponse.json({ error: 'video 없음' }, { status: 400 });
  const str = (k: string) => String(f.get(k) || '');
  const title = str('title') || '쇼츠';
  const publishAt = str('publish_at');
  const when = publishAt && !isNaN(Date.parse(publishAt)) && Date.parse(publishAt) > Date.now() + 60_000 ? new Date(publishAt).toISOString() : '';
  const buf = Buffer.from(await video.arrayBuffer());

  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(buf.length) },
    body: JSON.stringify({
      snippet: { title: (title.includes('#Shorts') ? title : `${title.slice(0, 88)} #Shorts`).slice(0, 100), description: str('description').slice(0, 5000), tags: str('tags').split(',').map(t => t.trim()).filter(Boolean).slice(0, 15), categoryId: '22' },
      status: { privacyStatus: when ? 'private' : 'public', selfDeclaredMadeForKids: false, ...(when ? { publishAt: when } : {}) },
    }),
  });
  if (!init.ok) return NextResponse.json({ error: `YouTube 시작 실패 ${init.status} ${(await init.text()).slice(0, 200)}` }, { status: 502 });
  const loc = init.headers.get('location');
  if (!loc) return NextResponse.json({ error: 'upload URL 없음' }, { status: 502 });
  const put = await fetch(loc, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: buf });
  if (!put.ok) return NextResponse.json({ error: `YouTube 업로드 실패 ${put.status} ${(await put.text()).slice(0, 200)}` }, { status: 502 });
  const vid = (await put.json()).id as string;

  const comment = str('comment');
  if (comment) await fetch('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet', {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snippet: { videoId: vid, topLevelComment: { snippet: { textOriginal: comment } } } }),
  }).catch(() => {}); // 댓글 권한(force-ssl)이 없어도 업로드는 성공 처리

  // 목록용 기록: 별도 테이블 없이 sns_post_logs 재사용 (error_message에 제목/예약 메타 JSON)
  await admin.from('sns_post_logs').insert({ user_id: conn.user_id, platform: 'shorts-inbox', status: 'success', platform_post_id: vid, error_message: JSON.stringify({ title, scheduled: when || null }) });

  return NextResponse.json({ ok: true, videoId: vid, url: `https://youtube.com/shorts/${vid}`, scheduled: when || null });
}
