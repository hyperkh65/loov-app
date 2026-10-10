import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    const secret = process.env.CAMERA_SECRET_PASSWORD || '0506';

    if (password === secret) {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: '비밀번호가 틀렸습니다.' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
