/** Custom GPT(Action)가 보낸 TOP10 JSON을 맥(딸깍)이 가져갈 때까지 R2 JSON 파일 하나에 쌓아 둔다. */
import { createHash, timingSafeEqual } from 'crypto';
import { uploadToR2, readFromR2 } from '@/lib/r2-storage';

const KEY = 'top10/inbox.json';
export interface Top10Item { id: string; at: number; data: Record<string, unknown>; taken?: number }

const read = async (): Promise<Top10Item[]> => { try { return JSON.parse((await readFromR2(KEY)) || '[]'); } catch { return []; } };
const write = (items: Top10Item[]) => uploadToR2(KEY, Buffer.from(JSON.stringify(items)), 'application/json');

/** GPT Action용 키: 새 환경변수 없이 딸깍과 공유하는 SHORTS_INBOX_TOKEN에서 파생(딸깍도 같은 값을 계산해 보여준다) */
export function actionKey(): string | null {
  const t = process.env.SHORTS_INBOX_TOKEN;
  return t ? createHash('sha256').update(t + ':top10-gpt-action').digest('hex').slice(0, 40) : null;
}
export function actionAuthed(header: string | null): boolean {
  const k = actionKey(), got = (header || '').replace(/^Bearer\s+/i, '');
  return !!k && got.length === k.length && timingSafeEqual(Buffer.from(got), Buffer.from(k));
}

export async function addItem(data: Record<string, unknown>): Promise<{ id: string; dup: boolean }> {
  const id = createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16), items = await read();
  if (items.some(i => i.id === id)) return { id, dup: true };
  await write([...items.slice(-50), { id, at: Date.now(), data }]);
  return { id, dup: false };
}

/** 가져간 뒤 30분 안에 확인(ack)이 없으면 다시 내준다(맥이 중간에 꺼진 경우) */
export async function takePending(): Promise<Top10Item[]> {
  const items = await read(), now = Date.now(), out = items.filter(i => !i.taken || now - i.taken > 30 * 60_000);
  if (out.length) await write(items.map(i => out.includes(i) ? { ...i, taken: now } : i));
  return out;
}

export async function ack(id: string): Promise<void> {
  const items = await read();
  await write(items.filter(i => i.id !== id));
}
