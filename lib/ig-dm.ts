/** 인스타 댓글 키워드 → 비공개 답장(DM) 자동 발송. 몽글 카드의 키워드·DM 문구(mongle-posts)를 쓴다. 보낸 댓글·로그는 NAS 파일에 남긴다 */
import fs from 'fs';
import path from 'path';
import { NASQ_DIR } from '@/lib/shorts-nasq';
import type { MonglePost } from '@/lib/mongle-posts';

const DIR = path.join(NASQ_DIR, 'mongle-posts'), DONE = path.join(NASQ_DIR, 'ig-dm-done.json'), LOG = path.join(NASQ_DIR, 'ig-dm-log.jsonl');
const G = 'https://graph.instagram.com/v21.0';
const norm = (s: string) => s.replace(/[\s"'“”‘’!?.~,]/g, '').toLowerCase();

export function allPosts(): MonglePost[] {
  try { return fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) as MonglePost); } catch { return []; }
}
/** 댓글이 키워드 그 자체이거나 키워드를 포함하면 매칭. 긴 키워드 먼저(예: "꿀팁2"가 "꿀팁"보다 먼저) */
export function matchPost(text: string, posts = allPosts()): MonglePost | null {
  const t = norm(text); if (!t || t.length > 40) return null;
  return posts.filter(p => p.keyword && t.includes(norm(p.keyword))).sort((a, b) => b.keyword.length - a.keyword.length)[0] || null;
}
const done = (): Record<string, number> => { try { return JSON.parse(fs.readFileSync(DONE, 'utf8')); } catch { return {}; } };
export function markDone(commentId: string): boolean { // 이미 보낸 댓글이면 false
  const d = done(); if (d[commentId]) return false;
  d[commentId] = Date.now(); const keep = Object.entries(d).filter(([, t]) => Date.now() - t < 30 * 864e5);
  fs.mkdirSync(NASQ_DIR, { recursive: true }); fs.writeFileSync(DONE, JSON.stringify(Object.fromEntries(keep))); return true;
}
export const logDm = (o: object) => { try { fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n'); } catch {} };

/** 댓글 단 사람에게 DM 1통(댓글 7일 이내·댓글당 1번) + 공개 답글 */
export async function sendGuide(token: string, commentId: string, p: MonglePost) {
  const text = [p.dm, p.guide && !p.dm.includes(p.guide) ? `👉 ${p.guide}` : ''].filter(Boolean).join('\n\n').slice(0, 1000);
  const r = await fetch(`${G}/me/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 300));
  await fetch(`${G}/${commentId}/replies`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ message: 'DM으로 보내 드렸어요 💜 메시지함을 확인해 주세요!' }) }).catch(() => {});
  return j;
}
