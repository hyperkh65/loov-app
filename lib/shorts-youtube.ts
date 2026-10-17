import { timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

type Admin = ReturnType<typeof createAdminClient>;
export type ShortsConn = { user_id: string; accessToken: string; channelId: string; channelName: string };
export class ShortsError extends Error { constructor(msg: string, public status = 502) { super(msg); } }

// LOOV에 연결된 YouTube(userId 지정 시 그 사용자의 것, 없으면 OWNER_USER_ID/가장 최근 것)의 액세스 토큰. 만료 시 갱신.
// channel: 채널 ID(UC…) 또는 채널 이름. 채널이 여러 개 연결돼 있을 때 지정(미지정이면 가장 최근 연결).
export async function youtubeAccess(admin: Admin, userId?: string, channel?: string): Promise<ShortsConn> {
  let q = admin.from('sns_connections').select('user_id, access_token, refresh_token, extra, platform_user_id, platform_username')
    .eq('platform', 'youtube').eq('is_active', true).order('updated_at', { ascending: false }).limit(1);
  const uid = userId || process.env.OWNER_USER_ID;
  if (uid) q = q.eq('user_id', uid);
  const ch = (channel || '').trim();
  if (ch) q = ch.startsWith('UC') ? q.eq('platform_user_id', ch) : q.ilike('platform_username', ch);
  const { data: conn } = await q.maybeSingle();
  if (!conn) throw new ShortsError(ch ? `LOOV에 '${ch}' 채널이 연결돼 있지 않아요` : 'LOOV에 YouTube가 연결돼 있지 않아요', 400);

  let accessToken = conn.access_token as string;
  const exp = conn.extra?.expires_at ? new Date(conn.extra.expires_at) : null;
  if (conn.refresh_token && (!exp || exp <= new Date(Date.now() + 60_000))) {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({ refresh_token: conn.refresh_token, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, grant_type: 'refresh_token' }),
    });
    const d = await r.json();
    if (!r.ok) throw new ShortsError('토큰 갱신 실패: ' + (d.error_description || d.error));
    accessToken = d.access_token;
    await admin.from('sns_connections').update({ access_token: accessToken, extra: { ...conn.extra, expires_at: new Date(Date.now() + 3500_000).toISOString() } })
      .eq('user_id', conn.user_id).eq('platform', 'youtube').eq('platform_user_id', conn.platform_user_id);
  }
  return { user_id: conn.user_id, accessToken, channelId: conn.platform_user_id || '', channelName: conn.platform_username || '' };
}

// publishAt(ISO)이 1분 이상 미래면 비공개로 올리고 YouTube가 그 시각에 공개(예약).
export async function uploadShort(accessToken: string, o: { buf: Buffer; title: string; description?: string; tags?: string; comment?: string; publishAt?: string }) {
  const when = o.publishAt && !isNaN(Date.parse(o.publishAt)) && Date.parse(o.publishAt) > Date.now() + 60_000 ? new Date(o.publishAt).toISOString() : '';
  const title = o.title || '쇼츠';
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(o.buf.length) },
    body: JSON.stringify({
      snippet: { title: (title.includes('#Shorts') ? title : `${title.slice(0, 88)} #Shorts`).slice(0, 100), description: (o.description || '').slice(0, 5000), tags: (o.tags || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 15), categoryId: '22' },
      status: { privacyStatus: when ? 'private' : 'public', selfDeclaredMadeForKids: false, ...(when ? { publishAt: when } : {}) },
    }),
  });
  if (!init.ok) throw new ShortsError(`YouTube 시작 실패 ${init.status} ${(await init.text()).slice(0, 200)}`);
  const loc = init.headers.get('location');
  if (!loc) throw new ShortsError('upload URL 없음');
  const put = await fetch(loc, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: new Uint8Array(o.buf) });
  if (!put.ok) throw new ShortsError(`YouTube 업로드 실패 ${put.status} ${(await put.text()).slice(0, 200)}`);
  const videoId = (await put.json()).id as string;

  if (o.comment) await fetch('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet', {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snippet: { videoId, topLevelComment: { snippet: { textOriginal: o.comment } } } }),
  }).catch(() => {}); // 댓글 권한(force-ssl)이 없어도 업로드는 성공 처리
  return { videoId, url: `https://youtube.com/shorts/${videoId}`, scheduled: when || null };
}

// 딸깍 → LOOV 요청 인증: Authorization: Bearer SHORTS_INBOX_TOKEN
export function inboxAuthed(req: NextRequest) {
  const secret = process.env.SHORTS_INBOX_TOKEN;
  const got = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  return !!secret && got.length === secret.length && timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}
