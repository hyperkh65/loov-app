import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { nasExec } from '@/lib/nas-ssh';
import { scanAndCache } from '@/app/api/x-videos/nas/route';

export const maxDuration = 300;

const NAS_URL_BASE = 'https://hy64.synology.me/xmedia';
const NAS_DIR = '/volume1/web/xmedia';
const SUPABASE_STORAGE_MARKER = '/x-videos/';

function extractStoragePath(url: string): string | null {
  const idx = url.indexOf(SUPABASE_STORAGE_MARKER);
  return idx >= 0 ? decodeURIComponent(url.slice(idx + SUPABASE_STORAGE_MARKER.length)) : null;
}

// GET: 현재 상태 (Supabase vs NAS 개수)
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

// POST: SSE 스트리밍으로 배치 마이그레이션
export async function POST(req: NextRequest) {
  const { limit = 20 } = await req.json().catch(() => ({}));
  const supabase = createAdminClient();

  // 구 Supabase Storage URL + 새 로컬 다운로드 경로 둘 다 처리
  const { data: supabaseVideos } = await supabase
    .from('bossai_x_videos')
    .select('id, username, video_url')
    .ilike('video_url', '%supabase.co%')
    .limit(limit);

  const { data: localVideos } = await supabase
    .from('bossai_x_videos')
    .select('id, username, video_url')
    .ilike('video_url', '/downloads/%')
    .limit(limit);

  const videos = [...(supabaseVideos || []), ...(localVideos || [])];

  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

      if (!videos?.length) {
        send({ type: 'complete', migrated: 0, failed: 0, remaining: 0 });
        controller.close();
        return;
      }

      send({ type: 'start', total: videos.length });

      let migrated = 0;
      let failed = 0;

      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        const storagePath = extractStoragePath(video.video_url);
        const isLocal = video.video_url.startsWith('/downloads/');

        let username: string;
        let filename: string;

        if (isLocal) {
          // /downloads/{username}/{filename}
          const rel = video.video_url.replace('/downloads/', '');
          const slashIdx = rel.indexOf('/');
          username = slashIdx >= 0 ? rel.slice(0, slashIdx) : (video.username || 'unknown');
          filename = slashIdx >= 0 ? rel.slice(slashIdx + 1) : rel;
        } else if (storagePath) {
          const parts = storagePath.split('/');
          username = parts.slice(0, -1).join('/') || video.username || 'unknown';
          filename = parts[parts.length - 1];
        } else {
          failed++;
          send({ type: 'skip', index: i + 1, id: video.id });
          continue;
        }

        const nasFilePath = `${NAS_DIR}/${username}/${filename}`;
        const nasUrl = `${NAS_URL_BASE}/${username}/${filename}`;

        send({ type: 'progress', index: i + 1, total: videos.length, file: filename });

        try {
          const isLocal = video.video_url.startsWith('/downloads/');

          if (isLocal) {
            // 새 스크래퍼: /downloads/{username}/{file} → /volume1/web/xmedia/{username}/{file}
            const srcPath = `/volume1/docker/x-notion${video.video_url}`; // 호스트 경로
            const mvResult = await nasExec(
              `mkdir -p "${NAS_DIR}/${username}" && ` +
              `cp "${srcPath}" "${nasFilePath}" 2>&1 && echo __OK__ || echo __FAIL__`
            );
            if (!mvResult.stdout.includes('__OK__')) {
              throw new Error(`복사 실패: ${mvResult.stderr || mvResult.stdout}`);
            }
          } else {
            // 구 Supabase Storage: wget으로 다운로드
            const dlResult = await nasExec(
              `mkdir -p "${NAS_DIR}/${username}" && ` +
              `wget -q --timeout=180 --tries=2 -O "${nasFilePath}" "${video.video_url}" 2>&1 && echo __OK__ || echo __FAIL__`
            );
            if (!dlResult.stdout.includes('__OK__') && dlResult.code !== 0) {
              throw new Error(`wget 실패: ${dlResult.stderr || dlResult.stdout}`);
            }
            // Supabase Storage 삭제
            if (storagePath) await supabase.storage.from('x-videos').remove([storagePath]);
          }

          // DB URL을 NAS URL로 업데이트
          await supabase.from('bossai_x_videos').update({ video_url: nasUrl }).eq('id', video.id);

          migrated++;
          send({ type: 'done_one', index: i + 1, file: filename, nasUrl });
        } catch (e) {
          await nasExec(`rm -f "${nasFilePath}"`).catch(() => {});
          failed++;
          send({ type: 'error_one', index: i + 1, file: filename, error: String(e).slice(0, 200) });
        }
      }

      // 남은 개수 재조회
      const { count: remaining } = await supabase
        .from('bossai_x_videos')
        .select('*', { count: 'exact', head: true })
        .ilike('video_url', '%supabase.co%');

      send({ type: 'complete', migrated, failed, remaining: remaining ?? 0 });

      // 마이그레이션 후 NAS 캐시 갱신 (background)
      if (migrated > 0) scanAndCache().catch(() => {});

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
