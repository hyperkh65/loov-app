/** "만든 영상" 카드의 "발행 대기로 보내기" 요청을 맥(딸깍)에 전달한다. 요청은 R2 JSON 에 쌓이고, 맥이 가져가 영상 파일을 LOOV로 올린다. */
import { uploadToR2, readFromR2 } from '@/lib/r2-storage';

const KEY = 'shortsreq/inbox.json';
export interface ShortsReq { id: string; at: number; taken?: number }

const read = async (): Promise<ShortsReq[]> => { try { return JSON.parse((await readFromR2(KEY)) || '[]'); } catch { return []; } };
const write = (items: ShortsReq[]) => uploadToR2(KEY, Buffer.from(JSON.stringify(items)), 'application/json');

export async function addReq(id: string) { await write([...(await read()).filter(i => i.id !== id).slice(-200), { id, at: Date.now() }]); }

/** 가져간 뒤 10분 안에 처리 보고(ack)가 없으면 다시 내준다 */
export async function takeReqs(): Promise<string[]> {
  const items = await read(), now = Date.now(), out = items.filter(i => !i.taken || now - i.taken > 10 * 60_000);
  if (out.length) await write(items.map(i => out.includes(i) ? { ...i, taken: now } : i));
  return out.map(i => i.id);
}
export async function ackReq(id: string) { await write((await read()).filter(i => i.id !== id)); }
export async function pendingReqs(): Promise<string[]> { return (await read()).map(i => i.id); }
