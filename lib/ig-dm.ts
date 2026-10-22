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

// 팔로우 확인 대기: 댓글 단 사람(IGSID) → 받을 가이드. "완료" 답장이 오면 팔로우를 확인하고 보낸다
const PENDING = path.join(NASQ_DIR, 'ig-dm-pending.json');
type Pending = { keyword: string; username?: string; at: number };
const readPending = (): Record<string, Pending> => { try { return JSON.parse(fs.readFileSync(PENDING, 'utf8')); } catch { return {}; } };
function savePending(p: Record<string, Pending>) { const keep = Object.entries(p).filter(([, v]) => Date.now() - v.at < 7 * 864e5); fs.mkdirSync(NASQ_DIR, { recursive: true }); fs.writeFileSync(PENDING, JSON.stringify(Object.fromEntries(keep))); }
export function setPending(igsid: string, v: Pending) { const p = readPending(); p[igsid] = v; savePending(p); }
export function takePending(igsid: string): Pending | null { const p = readPending(), v = p[igsid] || null; return v; }
export function clearPending(igsid: string) { const p = readPending(); delete p[igsid]; savePending(p); }

const auth = (token: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });
async function send(token: string, recipient: Record<string, string>, text: string) {
  const r = await fetch(`${G}/me/messages`, { method: 'POST', headers: auth(token), body: JSON.stringify({ recipient, message: { text: text.slice(0, 1000) } }) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 300)); return j;
}
/** 상대가 나를 팔로우하는지(대화가 열린 상대만 조회 가능 — 모르면 null) */
export async function follows(token: string, igsid: string): Promise<boolean | null> {
  const j = await fetch(`${G}/${igsid}?fields=is_user_follow_business,username`, { headers: auth(token) }).then(r => r.json()).catch(() => ({}));
  return typeof j.is_user_follow_business === 'boolean' ? j.is_user_follow_business : null;
}
const guideText = (p: MonglePost) => [p.dm, p.guide && !p.dm.includes(p.guide) ? `👉 ${p.guide}` : ''].filter(Boolean).join('\n\n');
export const ASK_FOLLOW = (kw: string) => `"${kw}" 가이드 요청 고마워요 💜\n\n몽글을 팔로우하고 이 메시지에 "완료"라고 답장 주시면 가이드를 바로 보내 드릴게요!`;
export const NOT_YET = '아직 팔로우가 확인되지 않아요 🥲\n@mongle.by.2days 팔로우 후 다시 "완료"를 보내 주세요!';

/** 댓글 → 이미 팔로워면 바로 가이드, 아니면(또는 모르면) 팔로우 요청 DM(비공개 답장, 댓글당 1번·7일 이내) + 공개 답글 */
export async function onKeywordComment(token: string, commentId: string, fromId: string | undefined, username: string | undefined, p: MonglePost) {
  const f = fromId ? await follows(token, fromId) : null;
  if (f === true) await send(token, { comment_id: commentId }, guideText(p));
  else { await send(token, { comment_id: commentId }, ASK_FOLLOW(p.keyword)); if (fromId) setPending(fromId, { keyword: p.keyword, username, at: Date.now() }); }
  await fetch(`${G}/${commentId}/replies`, { method: 'POST', headers: auth(token), body: JSON.stringify({ message: 'DM 보냈어요 💜 메시지함(또는 요청함)을 확인해 주세요!' }) }).catch(() => {});
  return f === true ? 'guide' : 'ask-follow';
}
/** DM 답장(완료 등) → 대기 중이면 팔로우 확인 후 가이드, 아니면 재요청 */
export async function onReply(token: string, igsid: string, posts = allPosts()) {
  const w = takePending(igsid); if (!w) return 'no-pending';
  const p = posts.find(x => x.keyword === w.keyword); if (!p) { clearPending(igsid); return 'no-post'; }
  const f = await follows(token, igsid);
  if (f === false) { await send(token, { id: igsid }, NOT_YET); return 'not-following'; }
  await send(token, { id: igsid }, guideText(p)); clearPending(igsid); return f === true ? 'guide' : 'guide-unverified'; // 확인이 안 되면(권한 문제 등) 막지 않고 보낸다
}
