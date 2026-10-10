import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { videoDb } from '@/lib/video-db';

// hy64 워커의 파일 서버(호스트 58100)를 프록시. 작업 소유자만 받을 수 있음.
const WORKER_BASE = process.env.VIDEO_WORKER_BASE || 'http://172.17.0.1:58100';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !id) return new Response('Unauthorized', { status: 401 });

  const { data: job } = await videoDb().from('bossai_video_jobs')
    .select('result').eq('id', id).eq('user_id', user.id).maybeSingle();
  const file = (job?.result as { file?: string } | null)?.file;
  if (!file || file.includes('/') || file.includes('..')) return new Response('Not found', { status: 404 });

  try {
    const up = await fetch(`${WORKER_BASE}/files/${encodeURIComponent(file)}`, {
      headers: { 'X-Worker-Token': process.env.VIDEO_WORKER_TOKEN || '' },
    });
    if (!up.ok || !up.body) return new Response('파일 없음', { status: 404 });
    const headers: Record<string, string> = {
      'Content-Type': up.headers.get('content-type') || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file)}`,
    };
    const cl = up.headers.get('content-length');
    if (cl) headers['Content-Length'] = cl;
    return new Response(up.body, { headers });
  } catch (e) {
    return new Response(`워커 연결 실패: ${String(e)}`, { status: 502 });
  }
}
