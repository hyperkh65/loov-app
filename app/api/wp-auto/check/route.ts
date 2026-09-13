import { NextRequest, NextResponse } from 'next/server';
import { NAS_TARGETS, WEB_ROOT, type NasKey } from '@/lib/nas-targets';

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const sub = params.get('domain') || '';
  const nas = (params.get('nas') === 'hy65' ? 'hy65' : 'hy64') as NasKey;
  if (!sub || !/^[a-z0-9-]{2,30}$/.test(sub)) {
    return NextResponse.json({ error: '도메인은 영문 소문자·숫자·하이픈 2~30자' }, { status: 400 });
  }
  const target = NAS_TARGETS[nas];
  try {
    const { stdout } = await target.exec(`test -d ${WEB_ROOT}/${sub} && echo exists || echo available`);
    return NextResponse.json({ available: stdout.trim() === 'available', domain: `${sub}.${target.domainSuffix}` });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
