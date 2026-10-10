import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { code } = await req.json().catch(() => ({}));
  const valid = process.env.INVITE_CODE;

  if (!valid) {
    return NextResponse.json({ error: '초대 코드가 설정되지 않았습니다.' }, { status: 500 });
  }
  if (!code || code !== valid) {
    return NextResponse.json({ error: '초대 코드가 올바르지 않습니다.' }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
