import { NextRequest, NextResponse } from 'next/server';
import { inboxAuthed } from '@/lib/shorts-youtube';
import { generateText, getLastProvider } from '@/lib/auto-blog-ai';
import { buildHookCaptions, lastCaptionDiag } from '@/lib/sns/hook-captions';

export const maxDuration = 180;

// 점검용 — SNS 문구 생성 단계별 소요시간/실패 사유(발행 없음). 프록시 60초 제한 전에 응답하도록 50초 상한
export async function POST(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { title, summary, step } = await req.json();
  const cap = <T,>(p: Promise<T>) => Promise.race([p, new Promise<string>(r => setTimeout(() => r('50초 내 미응답'), 50_000))]);
  const t = Date.now();
  if (step === 'ping') {
    const r = await cap(generateText('한국어로 "안녕"만 답해', 'sns').then(x => x.slice(0, 80)).catch(e => `ERR ${String(e?.message || e).slice(0, 1200)}`));
    return NextResponse.json({ ms: Date.now() - t, r, provider: getLastProvider() });
  }
  const caps = await cap(buildHookCaptions(String(title || ''), String(summary || '')).catch(e => ({ __err: String(e) })));
  return NextResponse.json({ ms: Date.now() - t, keys: typeof caps === 'string' ? caps : Object.keys(caps), diag: lastCaptionDiag, provider: getLastProvider() });
}
