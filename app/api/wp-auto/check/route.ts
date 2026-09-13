import { NextRequest, NextResponse } from 'next/server';
import { nasExec, nas2daysExec } from '@/lib/nas-ssh';

const NAS_EXEC = { hy64: nasExec, hy65: nas2daysExec } as const;
const DOMAIN_SUFFIX = { hy64: 'aboda.kr', hy65: '2days.kr' } as const;

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const sub = params.get('domain') || '';
  const nas = (params.get('nas') === 'hy65' ? 'hy65' : 'hy64') as keyof typeof NAS_EXEC;
  if (!sub || !/^[a-z0-9-]{2,30}$/.test(sub)) {
    return NextResponse.json({ error: '도메인은 영문 소문자·숫자·하이픈 2~30자' }, { status: 400 });
  }
  try {
    const { stdout } = await NAS_EXEC[nas](`test -d /volume1/web/${sub} && echo exists || echo available`);
    return NextResponse.json({ available: stdout.trim() === 'available', domain: `${sub}.${DOMAIN_SUFFIX[nas]}` });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
