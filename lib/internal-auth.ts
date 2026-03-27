import { NextRequest } from 'next/server';

/**
 * 텔레그램 봇 등 내부 서버-to-서버 요청인지 확인
 * webhook의 internalFetch가 x-internal-key 헤더를 포함해서 보냄
 */
export function isInternalRequest(req: NextRequest): boolean {
  const key = req.headers.get('x-internal-key');
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !key) return false;
  return key === secret;
}
