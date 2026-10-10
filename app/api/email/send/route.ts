import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { accountId, to, cc, bcc, subject, html, text, attachments, replyTo, inReplyTo, references } = body;

  if (!to || !subject) {
    return NextResponse.json({ error: '받는 사람과 제목을 입력하세요' }, { status: 400 });
  }

  const { data: acc } = await supabase
    .from('bossai_email_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();

  if (!acc) return NextResponse.json({ error: '계정을 찾을 수 없습니다' }, { status: 404 });

  const mailAttachments = (attachments ?? []).map((a: { filename: string; contentType: string; content: string }) => ({
    filename: a.filename,
    contentType: a.contentType,
    content: Buffer.from(a.content, 'base64'),
  }));

  const mailOptions: nodemailer.SendMailOptions = {
    from: `"${acc.name}" <${acc.email}>`,
    to: Array.isArray(to) ? to.join(', ') : to,
    cc: cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined,
    bcc: bcc ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : undefined,
    subject,
    html: html || undefined,
    text: text || undefined,
    replyTo: replyTo || undefined,
    inReplyTo: inReplyTo || undefined,
    references: references || undefined,
    attachments: mailAttachments,
  };

  try {
    // 1) raw 메시지 생성 (IMAP append용)
    const streamTransport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
    const rawResult = await streamTransport.sendMail(mailOptions);
    const rawMessage = rawResult.message as Buffer;

    // 2) SMTP 전송
    const smtpTransport = nodemailer.createTransport({
      host: acc.smtp_host,
      port: acc.smtp_port,
      secure: acc.smtp_secure,
      auth: { user: acc.smtp_user, pass: acc.smtp_password },
    });
    await smtpTransport.sendMail(mailOptions);

    // 3) IMAP 보낸편지함에 저장 (실패해도 전송은 성공 처리)
    appendToSent(acc, rawMessage).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

async function appendToSent(acc: {
  imap_host: string; imap_port: number; imap_secure: boolean;
  imap_user: string; imap_password: string;
}, raw: Buffer) {
  const client = new ImapFlow({
    host: acc.imap_host, port: acc.imap_port,
    secure: acc.imap_secure,
    auth: { user: acc.imap_user, pass: acc.imap_password },
    logger: false,
  });

  try {
    await client.connect();
    const list = await client.list();

    // Sent 폴더 탐색 (specialUse 우선, 이름으로 fallback)
    const sentFolder = list.find(f => f.specialUse === '\\Sent')
      ?? list.find(f => /sent|보낸/i.test(f.name));

    if (sentFolder) {
      await client.append(sentFolder.path, raw, ['\\Seen']);
    }
    await client.logout();
  } catch {
    await client.logout().catch(() => {});
  }
}
