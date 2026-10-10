import { NextRequest, NextResponse } from 'next/server';

const PASSWORD = process.env.MODE_VIDEO_PASSWORD || 'mode2024';
const COOKIE_NAME = 'mode-video-auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30일

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(COOKIE_NAME);
  if (cookie?.value === 'ok') {
    return NextResponse.json({ authenticated: true });
  }
  return NextResponse.json({ authenticated: false }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  if (password !== PASSWORD) {
    return NextResponse.json({ error: '비밀번호가 틀렸습니다.' }, { status: 401 });
  }
  const res = NextResponse.json({ authenticated: true });
  res.cookies.set(COOKIE_NAME, 'ok', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
  return res;
}
