import { NextRequest, NextResponse, after } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import { matchPost, markDone, unmarkDone, logDm, onKeywordComment, onReply } from '@/lib/ig-dm';

// Meta(Instagram) 웹훅: 댓글이 달리면 키워드를 보고 가이드 DM을 보낸다. 대시보드 웹훅 설정의 콜백 URL = https://loov.co.kr/api/ig-webhook
const VERIFY_TOKEN = 'loov-ig-comments-dm';

export async function GET(req: NextRequest) { // 구독 확인(최초 1회)
  const q = req.nextUrl.searchParams;
  if (q.get('hub.mode') === 'subscribe' && q.get('hub.verify_token') === VERIFY_TOKEN) return new NextResponse(q.get('hub.challenge') || '', { status: 200 });
  return new NextResponse('forbidden', { status: 403 });
}

type Msg = { sender?: { id?: string }; message?: { text?: string; is_echo?: boolean } };
type Change = { field: string; value: { id?: string; text?: string; from?: { id?: string; username?: string }; media?: { id?: string } } };
const igIds = new Map<string, string>(); // 연결 토큰 → 인스타 계정 ID(user_id) 캐시

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = (await getSetting('INSTAGRAM_APP_SECRET')) || process.env.INSTAGRAM_APP_SECRET || '';
  const sig = req.headers.get('x-hub-signature-256') || '';
  const want = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
  if (!secret || sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return new NextResponse('bad signature', { status: 401 });
  const body = JSON.parse(raw || '{}') as { object?: string; entry?: { id: string; changes?: Change[]; messaging?: Msg[] }[] };

  after(async () => { // Meta는 빨리 200을 받아야 해서 처리는 응답 뒤에
    const admin = createAdminClient();
    const { data: conns } = await admin.from('sns_connections').select('platform_user_id, platform_username, access_token').eq('platform', 'instagram').eq('is_active', true);
    const tokenFor = async (acct: string) => {
      for (const c of conns || []) {
        if (!igIds.has(c.access_token)) { const me = await fetch(`https://graph.instagram.com/v21.0/me?fields=user_id&access_token=${c.access_token}`).then(r => r.json()).catch(() => ({})); igIds.set(c.access_token, String(me.user_id || c.platform_user_id)); }
        if (igIds.get(c.access_token) === acct || c.platform_user_id === acct) return c.access_token;
      }
      return '';
    };
    // DM 답장: 팔로우 확인 대기 중인 사람이면 확인 후 가이드
    for (const e of body.entry || []) for (const m of e.messaging || []) {
      const sid = m.sender?.id; if (!sid || sid === e.id || m.message?.is_echo || !m.message?.text) continue;
      const token = await tokenFor(e.id); if (!token) continue;
      try { const r = await onReply(token, sid); if (r !== 'no-pending') logDm({ reply: r, account: e.id, from: sid, text: m.message.text.slice(0, 30) }); }
      catch (err) { logDm({ reply: 'error', from: sid, error: (err as Error).message }); }
    }
    for (const e of body.entry || []) for (const ch of e.changes || []) {
      if (ch.field !== 'comments' || !ch.value?.id || !ch.value.text) continue;
      const v = ch.value, cid = ch.value.id, text = ch.value.text;
      if (v.from?.id === e.id) continue; // 내가 단 댓글(공개 답글 포함)은 무시
      const token = await tokenFor(e.id);
      const p = matchPost(text);
      if (!token || !p) { logDm({ skip: !token ? 'no-token' : 'no-keyword', account: e.id, text: text.slice(0, 60) }); continue; }
      if (!markDone(cid)) continue;
      try { const r = await onKeywordComment(token, cid, v.from?.id, v.from?.username, p); logDm({ ok: r, account: e.id, from: v.from?.username, keyword: p.keyword, comment: cid }); }
      catch (err) { unmarkDone(cid); logDm({ ok: false, account: e.id, from: v.from?.username, keyword: p.keyword, error: (err as Error).message }); }
    }
  });
  return NextResponse.json({ ok: true });
}
