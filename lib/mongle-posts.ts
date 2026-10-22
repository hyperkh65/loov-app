/** 몽글 꿀팁 카드별 "붙여 넣을 문구"(댓글 키워드·DM 문구·가이드 주소). ManyChat에 손으로 넣을 때 발행 대기 카드에서 복사한다. NAS 파일로 저장 */
import fs from 'fs';
import path from 'path';
import { NASQ_DIR } from '@/lib/shorts-nasq';

export interface MonglePost { keyword: string; dm: string; guide: string; threads?: string }
const DIR = path.join(NASQ_DIR, 'mongle-posts');
const file = (id: string) => path.join(DIR, id.replace(/[^\w-]/g, '') + '.json');
export function saveMonglePost(id: string, p: MonglePost) { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file(id), JSON.stringify(p)); }
export function readMonglePost(id: string): MonglePost | null { try { return JSON.parse(fs.readFileSync(file(id), 'utf8')); } catch { return null; } }
export function parseMonglePost(s: string): MonglePost | null {
  try { const p = JSON.parse(s); return p && typeof p.dm === 'string' && typeof p.keyword === 'string' ? { keyword: p.keyword.slice(0, 20), dm: p.dm.slice(0, 1000), guide: String(p.guide || '').slice(0, 300), threads: p.threads ? String(p.threads).slice(0, 1000) : undefined } : null; } catch { return null; }
}
