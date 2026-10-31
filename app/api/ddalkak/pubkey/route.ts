// GET /api/ddalkak/pubkey — 앱이 인증서 서명을 확인할 공개키(비밀 아님). 아직 발급된 적 없으면 404.
import { NextResponse } from 'next/server';
import { signingKey, publicPem } from '@/lib/ddalkak-license';

export async function GET() {
  const k = await signingKey(false);
  if (!k) return NextResponse.json({ error: '아직 준비되지 않았어요' }, { status: 404 });
  return NextResponse.json({ pem: publicPem(k) });
}
