import { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

// Vercel 영상 페이지가 발급한 5분짜리 서명 링크로 hy64 워커 파일을 내려준다.
const WORKER_BASE = process.env.VIDEO_WORKER_BASE || 'http://172.17.0.1:58100';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const f = p.get('f') || '', exp = p.get('exp') || '', sig = p.get('sig') || '';
  const secret = process.env.VIDEO_WORKER_TOKEN || '';
  const good = createHmac('sha256', secret).update(`${f}.${exp}`).digest('hex');
  const ok = secret !== '' && /^\d+$/.test(exp) && Number(exp) >= Date.now() / 1000
    && sig.length === good.length && timingSafeEqual(Buffer.from(sig), Buffer.from(good));
  if (!ok || !f || f.includes('/') || f.includes('..')) return new Response('Forbidden', { status: 403 });

  try {
    const up = await fetch(`${WORKER_BASE}/files/${encodeURIComponent(f)}`, { headers: { 'X-Worker-Token': secret } });
    if (!up.ok || !up.body) return new Response('Not found', { status: 404 });
    const headers: Record<string, string> = {
      'Content-Type': up.headers.get('content-type') || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f)}`,
    };
    const cl = up.headers.get('content-length');
    if (cl) headers['Content-Length'] = cl;
    return new Response(up.body, { headers });
  } catch {
    return new Response('worker unreachable', { status: 502 });
  }
}
