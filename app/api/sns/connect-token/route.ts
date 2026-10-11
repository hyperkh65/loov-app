import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

// 텔레그램 채널(봇 토큰) / Bluesky(앱 비밀번호) — OAuth 없이 직접 입력받아 검증 후 저장
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { platform, token, target } = await req.json() as { platform: string; token?: string; target?: string };
  const secret = (token || '').trim();
  const dest = (target || '').trim();
  if (!secret || !dest) return NextResponse.json({ error: '토큰과 대상(채널/핸들)을 모두 입력하세요' }, { status: 400 });

  let row: { platform_user_id: string; platform_username: string; platform_display_name: string };
  try {
    if (platform === 'telegram') {
      const tg = async (method: string, body?: Record<string, unknown>) => {
        const r = await fetch(`https://api.telegram.org/bot${secret}/${method}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(15_000),
        });
        const d = await r.json().catch(() => null);
        if (!d?.ok) throw new Error(d?.description || `HTTP ${r.status}`);
        return d.result;
      };
      const me = await tg('getMe');
      const chatRef = /^-?\d+$/.test(dest) ? dest : `@${dest.replace(/^@|^https?:\/\/t\.me\//, '')}`;
      const chat = await tg('getChat', { chat_id: chatRef });
      const member = await tg('getChatMember', { chat_id: chat.id, user_id: me.id });
      if (member.status !== 'administrator' && member.status !== 'creator') throw new Error('봇을 채널 관리자로 추가하세요 (게시 권한 필요)');
      row = {
        platform_user_id: String(chat.id),
        platform_username: chat.username ? `@${chat.username}` : chat.title,
        platform_display_name: chat.title || chat.username,
      };
    } else if (platform === 'bluesky') {
      const r = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: dest.replace(/^@/, ''), password: secret }), signal: AbortSignal.timeout(15_000),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.did) throw new Error(d?.message || `HTTP ${r.status} — 핸들과 앱 비밀번호를 확인하세요`);
      row = { platform_user_id: d.did, platform_username: d.handle, platform_display_name: d.handle };
    } else {
      return NextResponse.json({ error: '지원하지 않는 플랫폼' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }

  const { error } = await supabase.from('sns_connections').upsert({
    user_id: user.id, platform, ...row, access_token: secret, refresh_token: null, token_expires_at: null,
    is_active: true, connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,platform,platform_user_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, account: row.platform_username });
}
