import { NextRequest, NextResponse } from 'next/server';
import { inboxAuthed } from '@/lib/shorts-youtube';
import { generateText, getLastProvider, snsChainTrace } from '@/lib/auto-blog-ai';
import { buildHookCaptions, lastCaptionDiag, captionTrace } from '@/lib/sns/hook-captions';

export const maxDuration = 180;
const g = globalThis as unknown as { __capState?: string };

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
  if (step === 'status') return NextResponse.json({ trace: captionTrace, chain: snsChainTrace.slice(-12), diag: lastCaptionDiag, state: g.__capState });
  if (step === 'start') {
    captionTrace.length = 0; g.__capState = 'running'; const t1 = Date.now();
    buildHookCaptions(String(title || ''), String(summary || '')).then(c => { g.__capState = `done ${Date.now() - t1}ms keys=${Object.keys(c).join(',')}`; }).catch(e => { g.__capState = `err ${e}`; });
    return NextResponse.json({ started: true });
  }
  const caps = await cap(buildHookCaptions(String(title || ''), String(summary || '')).catch(e => ({ __err: String(e) })));
  return NextResponse.json({ ms: Date.now() - t, keys: typeof caps === 'string' ? caps : Object.keys(caps), diag: lastCaptionDiag, provider: getLastProvider() });
}
