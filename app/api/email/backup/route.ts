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
  const folder = sp.get('folder') || 'INBOX';
  const limitParam = parseInt(sp.get('limit') || '100', 10);

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
    const backupItems: unknown[] = [];

    try {
      const mailbox = client.mailbox as { exists?: number } | false;
      const total = (mailbox && typeof mailbox === 'object') ? (mailbox.exists ?? 0) : 0;
      if (total === 0) {
        return NextResponse.json({ folder, total: 0, emails: [] });
      }

      const start = Math.max(1, total - limitParam + 1);
      const end = total;

      for await (const msg of client.fetch(`${start}:${end}`, { uid: true, source: true })) {
        if (msg && typeof msg === 'object' && 'source' in msg && msg.source) {
          try {
            const parsed = await simpleParser(msg.source as Buffer);
            backupItems.push({
              uid: msg.uid,
              subject: parsed.subject ?? '',
              from: parsed.from?.text ?? '',
              to: parsed.to && !Array.isArray(parsed.to) ? parsed.to.text : '',
              date: parsed.date?.toISOString() ?? '',
              text: parsed.text ?? '',
              html: parsed.html || '',
              attachmentCount: parsed.attachments?.length ?? 0,
            });
          } catch { /* 파싱 실패 메일 건너뜀 */ }
        }
      }
      backupItems.reverse();
    } finally {
      lock.release();
    }

    await client.logout();

    // JSON 다운로드로 반환
    const filename = `email_backup_${folder.replace(/[^a-zA-Z0-9가-힣]/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify({ folder, total: backupItems.length, emails: backupItems }, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e) {
    await client.logout().catch(() => {});
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
