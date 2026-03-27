/**
 * Telegram Bot API utility functions
 * Required env vars:
 *   TELEGRAM_BOT_TOKEN - from @BotFather
 *   TELEGRAM_WEBHOOK_SECRET - random string for webhook verification
 *   TELEGRAM_ALLOWED_IDS - comma-separated Telegram user IDs (empty = allow all)
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  date: number;
  text?: string;
  photo?: Array<{ file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }>;
  caption?: string;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  inline_message_id?: string;
  data?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

// ─── Base caller ──────────────────────────────────────────────────────────────

export async function tgCall(method: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Send a text message with optional HTML parse mode */
export async function sendMessage(
  chat_id: number,
  text: string,
  extra?: Record<string, unknown>
): Promise<unknown> {
  return tgCall('sendMessage', {
    chat_id,
    text: text.slice(0, 4096), // Telegram max
    parse_mode: 'HTML',
    ...extra,
  });
}

/** Send a photo with optional caption */
export async function sendPhoto(
  chat_id: number,
  photo_url: string,
  caption?: string
): Promise<unknown> {
  return tgCall('sendPhoto', {
    chat_id,
    photo: photo_url,
    ...(caption ? { caption: caption.slice(0, 1024), parse_mode: 'HTML' } : {}),
  });
}

/** Show "typing…" indicator */
export async function sendTyping(chat_id: number): Promise<unknown> {
  return tgCall('sendChatAction', { chat_id, action: 'typing' });
}

/** Send a message with inline keyboard buttons.
 *  buttons: 2D array — each inner array is one row */
export async function sendInlineKeyboard(
  chat_id: number,
  text: string,
  buttons: InlineKeyboardButton[][]
): Promise<unknown> {
  return tgCall('sendMessage', {
    chat_id,
    text: text.slice(0, 4096),
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons },
  });
}

/** Answer a callback query (removes the loading spinner) */
export async function answerCallback(
  callback_query_id: string,
  text?: string
): Promise<unknown> {
  return tgCall('answerCallbackQuery', {
    callback_query_id,
    ...(text ? { text: text.slice(0, 200) } : {}),
  });
}

/** Edit an already-sent message */
export async function editMessage(
  chat_id: number,
  message_id: number,
  text: string,
  extra?: Record<string, unknown>
): Promise<unknown> {
  return tgCall('editMessageText', {
    chat_id,
    message_id,
    text: text.slice(0, 4096),
    parse_mode: 'HTML',
    ...extra,
  });
}

/** Check whether a Telegram user ID is allowed to use the bot */
export function isAllowedUser(userId: number): boolean {
  const allowed = process.env.TELEGRAM_ALLOWED_IDS ?? '';
  if (!allowed.trim()) return true; // no restriction
  return allowed
    .split(',')
    .map((s) => s.trim())
    .includes(String(userId));
}
