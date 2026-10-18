import { NextRequest, NextResponse } from 'next/server';
import { inboxAuthed } from '@/lib/shorts-youtube';
import { buildHookCaptions, lastCaptionDiag } from '@/lib/sns/hook-captions';

export const maxDuration = 180;

// 점검용 — SNS 문구 생성만 실행해 소요시간/실패 사유 반환(발행 없음)
export async function POST(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { title, summary } = await req.json();
  const t = Date.now();
  const caps = await buildHookCaptions(String(title || ''), String(summary || '')).catch(e => ({ __err: String(e) }));
  return NextResponse.json({ ms: Date.now() - t, keys: Object.keys(caps), threads: (caps as Record<string, string>).threads?.slice(0, 200), diag: lastCaptionDiag });
}
