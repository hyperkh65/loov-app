/** YouTube 업로드 한도(쿼터·채널 일일 한도)에 걸린 딸깍 영상을 NAS(/app은 /volume1/web/loov-dist 볼륨, 배포 때 지우지 않음)에 보관했다가 하루 N개씩 올린다. */
import fs from 'fs';
import path from 'path';
import { createAdminClient } from '@/lib/supabase-server';
import { youtubeAccess, uploadShort } from '@/lib/shorts-youtube';

export const NASQ_DIR = process.env.SHORTS_NASQ_DIR || '/app/shorts-queue';
const PER_DAY = 2;
export const isLimit = (m: string) => /quota|uploadLimitExceeded|exceeded the number of videos|429|rateLimit/i.test(m);

export async function saveToNasq(o: { id: string; userId: string; buf: Buffer; title: string; description: string; tags: string; channel: string; publishAt: string; error: string }) {
  fs.mkdirSync(NASQ_DIR, { recursive: true });
  fs.writeFileSync(path.join(NASQ_DIR, `${o.id}.mp4`), o.buf);
  fs.writeFileSync(path.join(NASQ_DIR, `${o.id}.json`), JSON.stringify({ title: o.title, description: o.description, tags: o.tags, channel: o.channel, publishAt: o.publishAt }));
  await createAdminClient().from('shorts_jobs').upsert({ id: o.id, user_id: o.userId, title: o.title, description: o.description, phrase: o.channel || null, status: 'created', source: 'nasq', error: o.error.slice(0, 300), updated_at: new Date().toISOString() });
}

/** 스케줄러(30분마다)가 부른다. 오늘(KST) 이미 올린 수를 빼고 PER_DAY까지만. 한도에 또 걸리면 거기서 멈춘다. 예약 시각이 지났으면 바로 공개. */
export async function drainNasq(): Promise<string[]> {
  const db = createAdminClient(), log: string[] = [];
  const dayStart = new Date(new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00+09:00').toISOString();
  const { count } = await db.from('shorts_jobs').select('id', { count: 'exact', head: true }).eq('source', 'nasq').in('status', ['scheduled', 'uploaded']).gte('uploaded_at', dayStart);
  let left = PER_DAY - (count || 0);
  if (left <= 0) return ['오늘 한도 채움'];
  const { data: rows } = await db.from('shorts_jobs').select('id, user_id').eq('source', 'nasq').eq('status', 'created').order('created_at', { ascending: true }).limit(left);
  for (const r of rows || []) {
    const mp4 = path.join(NASQ_DIR, `${r.id}.mp4`), meta = path.join(NASQ_DIR, `${r.id}.json`);
    if (!fs.existsSync(mp4) || !fs.existsSync(meta)) { await db.from('shorts_jobs').update({ status: 'failed', error: 'NAS 파일 없음' }).eq('id', r.id); continue; }
    const m = JSON.parse(fs.readFileSync(meta, 'utf8'));
    try {
      const conn = await youtubeAccess(db, r.user_id, m.channel);
      const up = await uploadShort(conn.accessToken, { buf: fs.readFileSync(mp4), title: m.title, description: m.description, tags: m.tags, publishAt: m.publishAt });
      await db.from('shorts_jobs').update({ status: up.scheduled ? 'scheduled' : 'uploaded', scheduled_at: up.scheduled, uploaded_at: new Date().toISOString(), video_id: up.videoId, video_url: up.url, error: null, updated_at: new Date().toISOString() }).eq('id', r.id);
      fs.rmSync(mp4, { force: true }); fs.rmSync(meta, { force: true });
      log.push(`${r.id} → ${up.url}`); if (--left <= 0) break;
    } catch (e) {
      const msg = (e as Error).message; log.push(`${r.id} 실패: ${msg.slice(0, 120)}`);
      await db.from('shorts_jobs').update({ error: msg.slice(0, 300), updated_at: new Date().toISOString() }).eq('id', r.id);
      if (isLimit(msg)) break;
    }
  }
  return log;
}
