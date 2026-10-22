import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { createAdminClient } from '@/lib/supabase-server';
import { inboxAuthed } from '@/lib/shorts-youtube';
import { NASQ_DIR } from '@/lib/shorts-nasq';

// 점검용(딸깍 토큰): 몽글 인스타 연결·최근 게시물 댓글 허용 여부·DM 발송 기록
export async function GET(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  const { data: conns } = await createAdminClient().from('sns_connections').select('platform_username, access_token, updated_at, is_active').eq('platform', 'instagram');
  const G = 'https://graph.instagram.com/v21.0', out = [];
  for (const c of conns || []) {
    const me = await fetch(`${G}/me?fields=user_id,username&access_token=${c.access_token}`).then(r => r.json()).catch(e => ({ error: String(e) }));
    const media = await fetch(`${G}/me/media?fields=id,caption,timestamp,comments_count,is_comment_enabled,permalink&limit=5&access_token=${c.access_token}`).then(r => r.json()).catch(e => ({ error: String(e) }));
    const subs = await fetch(`${G}/me/subscribed_apps?access_token=${c.access_token}`).then(r => r.json()).catch(e => ({ error: String(e) }));
    out.push({ username: c.platform_username, active: c.is_active, updated_at: c.updated_at, me, subs, media: (media.data || media.error || []).map ? (media.data || []).map((m: { caption?: string }) => ({ ...m, caption: (m.caption || '').slice(0, 40) })) : media });
  }
  let log: string[] = [];
  try { log = fs.readFileSync(path.join(NASQ_DIR, 'ig-dm-log.jsonl'), 'utf8').trim().split('\n').slice(-20); } catch {}
  return NextResponse.json({ accounts: out, log });
}
