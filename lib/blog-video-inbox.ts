/** 블로그 → 유튜브 쇼츠를 맥(딸깍)이 만들도록 일감을 R2 JSON에 쌓아 둔다. 맥이 최근에 가져간 기록(heartbeat)이 있을 때만 맥에 맡긴다. */
import { uploadToR2, readFromR2 } from '@/lib/r2-storage';

const KEY = 'blogvideo/inbox.json', BEAT = 'blogvideo/mac.json', ONLINE_MS = 120_000;
export interface BlogVideoItem { id: string; at: number; data: Record<string, unknown>; taken?: number }

const read = async (): Promise<BlogVideoItem[]> => { try { return JSON.parse((await readFromR2(KEY)) || '[]'); } catch { return []; } };
const write = (items: BlogVideoItem[]) => uploadToR2(KEY, Buffer.from(JSON.stringify(items)), 'application/json');

export const beat = () => uploadToR2(BEAT, Buffer.from(JSON.stringify({ at: Date.now() })), 'application/json');
export async function macOnline(): Promise<boolean> {
  try { return Date.now() - (JSON.parse((await readFromR2(BEAT)) || '{}').at || 0) < ONLINE_MS; } catch { return false; }
}

export async function addItem(id: string, data: Record<string, unknown>) { await write([...(await read()).filter(i => i.id !== id).slice(-20), { id, at: Date.now(), data }]); }

/** 가져간 뒤 40분 안에 끝났다는 보고(ack)가 없으면 다시 내준다 */
export async function takePending(): Promise<BlogVideoItem[]> {
  const items = await read(), now = Date.now(), out = items.filter(i => !i.taken || now - i.taken > 40 * 60_000);
  if (out.length) await write(items.map(i => out.includes(i) ? { ...i, taken: now } : i));
  return out;
}
export async function ack(id: string) { await write((await read()).filter(i => i.id !== id)); }
