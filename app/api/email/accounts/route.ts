import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('bossai_email_accounts')
    .select('id, name, email, imap_host, imap_port, smtp_host, smtp_port, is_active, created_at')
    .eq('user_id', user.id)
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, email, imap_host, imap_port, imap_secure, imap_user, imap_password,
          smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, testOnly } = body;

  // IMAP 연결 테스트
  const client = new ImapFlow({
    host: imap_host, port: imap_port ?? 993,
    secure: imap_secure !== false,
    auth: { user: imap_user, pass: imap_password },
    logger: false,
  });
  try {
    await client.connect();
    await client.logout();
  } catch (e) {
    return NextResponse.json({ error: `IMAP 연결 실패: ${(e as Error).message}` }, { status: 400 });
  }

  // SMTP 연결 테스트
  const transporter = nodemailer.createTransport({
    host: smtp_host, port: smtp_port ?? 587,
    secure: smtp_secure === true,
    auth: { user: smtp_user, pass: smtp_password },
  });
  try {
    await transporter.verify();
  } catch (e) {
    return NextResponse.json({ error: `SMTP 연결 실패: ${(e as Error).message}` }, { status: 400 });
  }

  if (testOnly) return NextResponse.json({ ok: true });

  const { data, error } = await supabase.from('bossai_email_accounts').insert({
    user_id: user.id, name, email,
    imap_host, imap_port: imap_port ?? 993, imap_secure: imap_secure !== false,
    imap_user, imap_password,
    smtp_host, smtp_port: smtp_port ?? 587, smtp_secure: smtp_secure === true,
    smtp_user, smtp_password,
  }).select('id, name, email, imap_host, imap_port, smtp_host, smtp_port, is_active, created_at').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  const { error } = await supabase.from('bossai_email_accounts')
    .delete().eq('id', id).eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
