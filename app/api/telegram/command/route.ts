/**
 * 텔레그램 명령 웹훅(@loov_alert_bot) — 사장님 대화방의 명령만 처리.
 *  "/글" · "클로드 글 써줘" · "코덱스 발행해" → 트렌드 키워드 자동 선정 후 2days.kr 발행
 *  "/글 키워드" · "키워드: 무엇" → 지정 키워드로 발행
 * Auth: X-Telegram-Bot-Api-Secret-Token = app_settings.TELEGRAM_CMD_SECRET, chat.id = TELEGRAM_ALERT_CHAT_ID
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/get-setting';
import { runTrendPost } from '@/lib/trend-post';

async function reply(chatId: string, text: string) {
  const token = await getSetting('TELEGRAM_BOT_TOKEN');
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => {});
}

export async function POST(req: NextRequest) {
  const secret = await getSetting('TELEGRAM_CMD_SECRET');
  if (!secret || req.headers.get('x-telegram-bot-api-secret-token') !== secret) return NextResponse.json({ ok: false }, { status: 401 });
  const update = await req.json().catch(() => ({})) as { message?: { chat?: { id?: number }; text?: string } };
  const chatId = String(update.message?.chat?.id || '');
  const text = (update.message?.text || '').trim();
  if (!text || chatId !== await getSetting('TELEGRAM_ALERT_CHAT_ID')) return NextResponse.json({ ok: true });

  const slash = text.match(/^\/(글|post)(?:@\w+)?\s*(.*)$/i);
  const named = text.match(/키워드\s*[:：]\s*(.+)$/);
  const natural = /(클로드|코덱스|claude|codex)/i.test(text) && /(글|발행|써|포스팅)/.test(text);
  if (!slash && !named && !natural) {
    await reply(chatId, '사용법\n/글 → 지금 뜨는 트렌드로 2days.kr 글 발행\n/글 키워드 → 그 키워드로 발행\n(“클로드 글 써줘”, “코덱스 발행해”도 됩니다)');
    return NextResponse.json({ ok: true });
  }
  const keyword = (named?.[1] || slash?.[2] || '').trim() || undefined;
  await reply(chatId, `🔎 ${keyword ? `“${keyword}”` : '실시간 트렌드(구글·X·네이버·빙)'} 분석 후 2days.kr 글 작성 시작\n3~6분 뒤 링크 보내드릴게요.`);
  runTrendPost({ keyword }).catch(() => {});
  return NextResponse.json({ ok: true });
}
