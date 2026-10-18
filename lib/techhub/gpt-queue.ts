/** 맥(Codex, ChatGPT 구독)에 맡기는 대표이미지+캡션 작업 큐 — R2 JSON 파일 한 개로 충분(한 번에 한 건). */
import { uploadToR2, readFromR2 } from '@/lib/r2-storage';

const Q = 'techhub/gptq';
export interface GptJob { id: string; created: number; slug: string; coverPrompt: string; captionPrompts: Record<string, string> }
export interface GptResult { coverUrl?: string; captions?: Record<string, unknown> }

const put = (key: string, v: unknown) => uploadToR2(key, Buffer.from(JSON.stringify(v)), 'application/json');

export const enqueueGpt = (job: GptJob) => put(`${Q}/current.json`, job);
export const saveGptResult = (id: string, r: GptResult) => put(`${Q}/${id}.result.json`, r);

async function readJson<T>(key: string): Promise<T | null> {
  const t = await readFromR2(key);
  try { return t ? JSON.parse(t) as T : null; } catch { return null; }
}

export async function pendingGptJob(): Promise<GptJob | null> {
  const j = await readJson<GptJob>(`${Q}/current.json`);
  if (!j || Date.now() - j.created > 6 * 60_000) return null;
  return await readJson(`${Q}/${j.id}.result.json`) ? null : j;
}

export async function currentGptJob(): Promise<GptJob | null> { return readJson<GptJob>(`${Q}/current.json`); }

/** 맥이 꺼져 있으면 null → 호출 측이 원본 이미지/기존 AI로 폴백 */
export async function waitGpt(id: string, ms: number): Promise<GptResult | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const r = await readJson<GptResult>(`${Q}/${id}.result.json`);
    if (r) return r;
    await new Promise(r => setTimeout(r, 4000));
  }
  return null;
}
