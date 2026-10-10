import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const accountId = sp.get('accountId');
  const uid = parseInt(sp.get('uid') || '0', 10);
  const folder = sp.get('folder') || 'INBOX';

  const { data: acc } = await supabase
    .from('bossai_email_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();

  if (!acc) return NextResponse.json({ error: '계정을 찾을 수 없습니다' }, { status: 404 });

  const client = new ImapFlow({
    host: acc.imap_host, port: acc.imap_port,
    secure: acc.imap_secure,
    auth: { user: acc.imap_user, pass: acc.imap_password },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    let result = null;

    try {
      // 읽음 표시
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });

      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (msg && typeof msg === 'object' && 'source' in msg && msg.source) {
        const parsed = await simpleParser(msg.source as Buffer);
        const attachments = (parsed.attachments ?? []).map((a) => ({
          filename: a.filename || 'attachment',
          contentType: a.contentType,
          size: a.size,
          contentId: a.cid,
          content: a.content.toString('base64'),
        }));

        result = {
          uid,
          subject: parsed.subject ?? '(제목 없음)',
          from: parsed.from?.value ?? [],
          to: parsed.to && !Array.isArray(parsed.to) ? parsed.to.value : (parsed.to ?? []),
          cc: parsed.cc && !Array.isArray(parsed.cc) ? parsed.cc.value : (parsed.cc ?? []),
          date: parsed.date ?? null,
          html: parsed.html || null,
          text: parsed.text || null,
          attachments,
        };
      }
    } finally {
      lock.release();
    }

    await client.logout();
    if (!result) return NextResponse.json({ error: '메시지를 찾을 수 없습니다' }, { status: 404 });
    return NextResponse.json(result);
  } catch (e) {
    await client.logout().catch(() => {});
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
