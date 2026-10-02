import { getSetting } from '@/lib/get-setting';

// 같은 키는 6시간에 1번만(프로세스 메모리 기준)
const DEDUPE_MS = 6 * 3600e3;
const lastSent = new Map<string, number>();
let chatIdCache = '';

export const isAuthError = (msg: string) =>
  /로그인|세션|쿠키|NID_|재연결|인증 ?(실패|만료|오류)|토큰 갱신 실패|unauthori[sz]ed|\b401\b|\b403\b|expired|invalid[_ ]?(grant|token)|refresh token/i.test(msg);

async function chatId(token: string): Promise<string> {
  if (chatIdCache) return chatIdCache;
  chatIdCache = await getSetting('TELEGRAM_ALERT_CHAT_ID');
  if (chatIdCache) return chatIdCache;
  // 설정이 없으면 봇에 /start 보낸 대화방을 자동으로 찾음
  const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, { signal: AbortSignal.timeout(10000) });
  const ups = ((await r.json()) as { result?: Array<{ message?: { chat: { id: number } } }> }).result || [];
  chatIdCache = String(ups.reverse().find(u => u.message)?.message?.chat.id || '');
  return chatIdCache;
}

/** 텔레그램으로 사장님께 알림 — 실패해도 호출 측엔 영향 없음 */
export async function alertOwner(key: string, text: string): Promise<void> {
  const now = Date.now();
  if (now - (lastSent.get(key) || 0) < DEDUPE_MS) return;
  try {
    const token = await getSetting('TELEGRAM_BOT_TOKEN');
    if (!token) return;
    const chat_id = await chatId(token);
    if (!chat_id) return;
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text: text.slice(0, 3500), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) lastSent.set(key, now);
  } catch { /* 알림 실패는 무시 */ }
}

/** 글 발행 성공 알림(사용자 요청: 배포될 때마다) */
export function notifyPublished(platform: string, title: string, url: string): void {
  let shown = url;
  try { shown = decodeURI(url); } catch { /* 그대로 */ }
  alertOwner(`pub:${url || title}`, `✅ [${platform}] 발행\n${title}\n${shown}`).catch(() => {});
}
