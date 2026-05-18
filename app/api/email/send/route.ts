import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import nodemailer from 'nodemailer';

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

  const transporter = nodemailer.createTransport({
    host: acc.smtp_host,
    port: acc.smtp_port,
    secure: acc.smtp_secure,
    auth: { user: acc.smtp_user, pass: acc.smtp_password },
  });

  const mailAttachments = (attachments ?? []).map((a: { filename: string; contentType: string; content: string }) => ({
    filename: a.filename,
    contentType: a.contentType,
    content: Buffer.from(a.content, 'base64'),
  }));

  try {
    await transporter.sendMail({
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
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
