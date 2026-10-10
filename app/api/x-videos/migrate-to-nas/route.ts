import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { nasExec } from '@/lib/nas-ssh';
import { scanAndCache } from '@/app/api/x-videos/nas/route';

export const maxDuration = 300;

const NAS_URL_BASE = 'https://hy64.synology.me/xmedia';
const NAS_DIR = '/volume1/web/xmedia';
const DOWNLOADS_DIR = '/volume1/docker/x-notion/downloads';
const SUPABASE_STORAGE_MARKER = '/x-videos/';

function extractStoragePath(url: string): string | null {
  const idx = url.indexOf(SUPABASE_STORAGE_MARKER);
  return idx >= 0 ? decodeURIComponent(url.slice(idx + SUPABASE_STORAGE_MARKER.length)) : null;
}

// GET: 현재 상태
export async function GET() {
  const supabase = createAdminClient();
  const [{ count: total }, { count: supabaseCount }, { count: localCount }] = await Promise.all([
    supabase.from('bossai_x_videos').select('*', { count: 'exact', head: true }),
    supabase.from('bossai_x_videos').select('*', { count: 'exact', head: true })
      .ilike('video_url', '%supabase.co%'),
    supabase.from('bossai_x_videos').select('*', { count: 'exact', head: true })
      .ilike('video_url', '/downloads/%'),
  ]);
  const remaining = (supabaseCount ?? 0) + (localCount ?? 0);
  return NextResponse.json({ total: total ?? 0, remaining, done: (total ?? 0) - remaining });
}

// POST: SSE 스트리밍으로 마이그레이션
// Step 1: 파일시스템 레벨 동기화 (downloads/* → xmedia/*) — DB 상태와 무관하게 항상 실행
// Step 2: DB에 /downloads/ URL로 남은 레코드를 NAS URL로 업데이트
// Step 3: 구 Supabase Storage URL 처리 (wget)
// Step 4: R2 캐시 갱신
export async function POST(req: NextRequest) {
  const { limit = 500 } = await req.json().catch(() => ({}));
  const supabase = createAdminClient();
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let migrated = 0;
      let failed = 0;

      // ── Step 1: 파일시스템 동기화 ─────────────────────────────────────
      // downloads/에 있는 모든 계정 폴더를 xmedia/로 복사 (기존 파일 덮어쓰지 않음)
      send({ type: 'fs_sync_start', message: 'downloads → xmedia 파일 동기화 중...' });
      try {
        const syncResult = await nasExec(
          `find "${DOWNLOADS_DIR}" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | while read userdir; do
            username=$(basename "$userdir")
            mkdir -p "${NAS_DIR}/$username"
            cp -rn "$userdir/." "${NAS_DIR}/$username/" 2>/dev/null
            count=$(find "${NAS_DIR}/$username" -type f \\( -name "*.mp4" -o -name "*.mov" -o -name "*.avi" -o -name "*.mkv" \\) 2>/dev/null | wc -l)
            echo "$username:$count"
          done`
        );
        const accounts: { username: string; count: number }[] = [];
        for (const line of (syncResult.stdout || '').split('\n')) {
          const [username, countStr] = line.trim().split(':');
          if (username && countStr) accounts.push({ username, count: parseInt(countStr) || 0 });
        }
        send({ type: 'fs_sync_done', accounts });
        migrated += accounts.reduce((s, a) => s + a.count, 0);
      } catch (e) {
        send({ type: 'fs_sync_error', error: String(e).slice(0, 200) });
      }

      // ── Step 2: DB URL 업데이트 (/downloads/ → NAS URL) ───────────────
      const { data: localVideos } = await supabase
        .from('bossai_x_videos')
        .select('id, video_url')
        .ilike('video_url', '/downloads/%')
        .limit(limit);

      if (localVideos && localVideos.length > 0) {
        send({ type: 'db_update_start', count: localVideos.length });
        let dbUpdated = 0;
        for (const video of localVideos) {
          const rel = video.video_url.replace('/downloads/', '');
          const slashIdx = rel.indexOf('/');
          if (slashIdx < 0) continue;
          const username = rel.slice(0, slashIdx);
          const filename = rel.slice(slashIdx + 1);
          const nasUrl = `${NAS_URL_BASE}/${username}/${encodeURIComponent(filename)}`;
          await supabase.from('bossai_x_videos').update({ video_url: nasUrl }).eq('id', video.id);
          dbUpdated++;
        }
        send({ type: 'db_update_done', updated: dbUpdated });
      }

      // ── Step 3: 구 Supabase Storage URL 처리 ─────────────────────────
      const { data: supabaseVideos } = await supabase
        .from('bossai_x_videos')
        .select('id, username, video_url')
        .ilike('video_url', '%supabase.co%')
        .limit(limit);

      if (supabaseVideos && supabaseVideos.length > 0) {
        send({ type: 'start', total: supabaseVideos.length });
        for (let i = 0; i < supabaseVideos.length; i++) {
          const video = supabaseVideos[i];
          const storagePath = extractStoragePath(video.video_url);
          if (!storagePath) { failed++; continue; }
          const parts = storagePath.split('/');
          const username = parts.slice(0, -1).join('/') || video.username || 'unknown';
          const filename = parts[parts.length - 1];
          const nasFilePath = `${NAS_DIR}/${username}/${filename}`;
          const nasUrl = `${NAS_URL_BASE}/${username}/${filename}`;
          send({ type: 'progress', index: i + 1, total: supabaseVideos.length, file: filename });
          try {
            const dlResult = await nasExec(
              `mkdir -p "${NAS_DIR}/${username}" && ` +
              `wget -q --timeout=180 --tries=2 -O "${nasFilePath}" "${video.video_url}" 2>&1 && echo __OK__ || echo __FAIL__`
            );
            if (!dlResult.stdout.includes('__OK__') && dlResult.code !== 0) {
              throw new Error(`wget 실패: ${dlResult.stderr || dlResult.stdout}`);
            }
            if (storagePath) await supabase.storage.from('x-videos').remove([storagePath]);
            await supabase.from('bossai_x_videos').update({ video_url: nasUrl }).eq('id', video.id);
            migrated++;
            send({ type: 'done_one', index: i + 1, file: filename });
          } catch (e) {
            await nasExec(`rm -f "${nasFilePath}"`).catch(() => {});
            failed++;
            send({ type: 'error_one', index: i + 1, file: filename, error: String(e).slice(0, 200) });
          }
        }
      }

      // ── Step 4: R2 캐시 갱신 ─────────────────────────────────────────
      send({ type: 'scan_start', message: 'NAS 캐시 갱신 중...' });
      try {
        const cacheData = await scanAndCache();
        send({ type: 'scan_done', accounts: cacheData.accounts.length, total: cacheData.total });
      } catch (e) {
        send({ type: 'scan_error', error: String(e).slice(0, 200) });
      }

      // 남은 개수 재조회
      const [{ count: supabaseRemaining }, { count: localRemaining }] = await Promise.all([
        supabase.from('bossai_x_videos').select('*', { count: 'exact', head: true }).ilike('video_url', '%supabase.co%'),
        supabase.from('bossai_x_videos').select('*', { count: 'exact', head: true }).ilike('video_url', '/downloads/%'),
      ]);
      const remaining = (supabaseRemaining ?? 0) + (localRemaining ?? 0);

      send({ type: 'complete', migrated, failed, remaining });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
