import { NextRequest, NextResponse } from 'next/server';
import { nasExec } from '@/lib/nas-ssh';

export async function GET(req: NextRequest) {
  const sub = new URL(req.url).searchParams.get('domain') || '';
  if (!sub || !/^[a-z0-9-]{2,30}$/.test(sub)) {
    return NextResponse.json({ error: '도메인은 영문 소문자·숫자·하이픈 2~30자' }, { status: 400 });
  }
  try {
    const { stdout } = await nasExec(`test -d /volume1/web/${sub} && echo exists || echo available`);
    return NextResponse.json({ available: stdout.trim() === 'available', domain: `${sub}.aboda.kr` });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
