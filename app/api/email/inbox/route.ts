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
  // page/limit은 하위 호환 유지, 기본은 전체 로드
  const page = parseInt(sp.get('page') || '1', 10);
  const limitParam = parseInt(sp.get('limit') || '0', 10); // 0 = 전체

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
      const mailbox = client.mailbox as { exists?: number } | false;
      const total = (mailbox && typeof mailbox === 'object') ? (mailbox.exists ?? 0) : 0;

      // limitParam=0 → 전체 (최대 2000), limitParam>0 → 페이징
      const cap = limitParam > 0 ? limitParam : 2000;
      const end = total;
      const start = Math.max(1, end - cap * page + 1);

      if (total > 0 && start <= end) {
        // bodyStructure 제거 → 속도 대폭 향상 (첨부파일 여부는 상세 열 때 확인)
        for await (const msg of client.fetch(`${start}:${end}`, {
          uid: true, flags: true, envelope: true,
        })) {
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
      }
      messages.reverse();
      await client.logout();
      return NextResponse.json({ messages, total, page, folder });
    } finally {
      lock.release();
    }
  } catch (e) {
    await client.logout().catch(() => {});
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
