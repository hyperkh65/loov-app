import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { ImapFlow } from 'imapflow';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const accountId = sp.get('accountId');
  const folder = sp.get('folder') || 'INBOX';
  const q = (sp.get('q') || '').trim();

  if (!q) return NextResponse.json([]);

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
    const messages: unknown[] = [];

    try {
      // IMAP SEARCH: 제목 + 발신자 + 본문 검색
      const uids = await client.search({
        or: [
          { subject: q },
          { from: q },
          { text: q },
        ],
      }, { uid: true });

      if (uids && uids.length > 0) {
        // 최신 50개만
        const recent = uids.slice(-50);
        for await (const msg of client.fetch(recent, {
          uid: true, flags: true, envelope: true, bodyStructure: true,
        }, { uid: true })) {
          messages.push({
            uid: msg.uid,
            seq: msg.seq,
            subject: msg.envelope?.subject ?? '(제목 없음)',
            from: msg.envelope?.from?.[0] ?? null,
            to: msg.envelope?.to ?? [],
            date: msg.envelope?.date ?? null,
            seen: msg.flags?.has('\\Seen') ?? false,
            flagged: msg.flags?.has('\\Flagged') ?? false,
            hasAttachment: false,
          });
        }
        messages.reverse();
      }
    } finally {
      lock.release();
    }

    await client.logout();
    return NextResponse.json(messages);
  } catch (e) {
    await client.logout().catch(() => {});
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
