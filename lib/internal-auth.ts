import { NextRequest } from 'next/server';

/**
 * 텔레그램 봇 등 내부 서버-to-서버 요청인지 확인
 * webhook의 internalFetch가 x-internal-key 헤더를 포함해서 보냄.
 * GitHub Actions 크론(blog-auto-run.yml 등)은 이미 검증된 CRON_SECRET을
 * Authorization: Bearer로 보내므로 그것도 내부 요청으로 인정한다 — 새 시크릿을
 * GH에 또 등록할 필요 없이 기존 크론들과 같은 방식으로 인증하게 하기 위함.
 */
export function isInternalRequest(req: NextRequest): boolean {
  const key = req.headers.get('x-internal-key');
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && key === secret) return true;

  const auth = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  return false;
}
