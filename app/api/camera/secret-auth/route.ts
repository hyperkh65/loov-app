import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    const secret = process.env.CAMERA_SECRET_PASSWORD;

    if (!secret) {
      return NextResponse.json(
        { error: 'Vercel 환경변수 CAMERA_SECRET_PASSWORD가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    if (password === secret) {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: '비밀번호가 틀렸습니다.' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
