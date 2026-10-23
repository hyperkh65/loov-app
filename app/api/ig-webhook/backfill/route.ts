import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { inboxAuthed } from '@/lib/shorts-youtube';
import { matchPost, markDone, unmarkDone, logDm, onKeywordComment } from '@/lib/ig-dm';

export const maxDuration = 300;
const G = 'https://graph.instagram.com/v21.0';

// 놓친 댓글 다시 처리(딸깍 토큰): 몽글 계정 최근 게시물의 댓글 중 7일 이내·키워드 일치·아직 안 보낸 것에 가이드 DM
export async function POST(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  const { data: conns } = await createAdminClient().from('sns_connections').select('platform_username, access_token').eq('platform', 'instagram').eq('is_active', true);
  const c = (conns || []).find(x => String(x.platform_username || '').replace(/^@/, '').toLowerCase() === 'mongle.by.2days');
  if (!c) return NextResponse.json({ error: '몽글 인스타 연결 없음' }, { status: 404 });
  const t = c.access_token, me = await fetch(`${G}/me?fields=user_id,username&access_token=${t}`).then(r => r.json());
  const media = await fetch(`${G}/me/media?fields=id,timestamp&limit=25&access_token=${t}`).then(r => r.json());
  const out: object[] = [], since = Date.now() - 7 * 864e5 + 3600e3;
  for (const m of media.data || []) {
    const cm = await fetch(`${G}/${m.id}/comments?fields=id,text,timestamp,from,username&limit=100&access_token=${t}`).then(r => r.json());
    for (const x of cm.data || []) {
      if (new Date(x.timestamp).getTime() < since) continue;
      const fromId = x.from?.id, user = x.from?.username || x.username;
      if (fromId === me.user_id || user === me.username) continue;
      const p = matchPost(x.text || ''); if (!p || !markDone(x.id)) continue;
      try { const r = await onKeywordComment(t, x.id, fromId, user, p); logDm({ ok: r, backfill: true, from: user, keyword: p.keyword, comment: x.id }); out.push({ user, keyword: p.keyword, result: r }); }
      catch (e) { unmarkDone(x.id); const msg = (e as Error).message.slice(0, 160); logDm({ ok: false, backfill: true, from: user, keyword: p.keyword, error: msg }); out.push({ user, keyword: p.keyword, error: msg }); }
    }
  }
  return NextResponse.json({ ok: true, media: (media.data || []).length, sent: out });
}
