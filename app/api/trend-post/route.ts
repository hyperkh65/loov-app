/**
 * /api/trend-post — 2days.kr 트렌드 글(로컬 Claude가 작성). Auth: x-trend-key = app_settings.TREND_POST_KEY
 *  POST { article: {title, html, outlets?, thumb_prompt?}, keyword } → 이미지 붙여 즉시 발행, 응답에 url
 *  POST { keyword? }                → 작성 대기열에 추가(PC의 trend-runner가 Claude로 처리)
 *  POST { notify: "..." }           → 텔레그램 알림(로컬 러너 실패 보고용)
 *  POST { image_prompt }            → 고품질 AI 이미지 생성(Lucid Origin) → { url } (로컬 Claude가 확인 후 thumb_image_url로 사용)
 *  GET                              → 대기열에서 작업 1건 꺼내기(로컬 러너 전용)
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getSetting } from '@/lib/get-setting';
import { enqueueTrendJob, takeTrendJob, publishTrendArticle, generateTrendImage, type TrendArticle } from '@/lib/trend-post';
import { alertOwner } from '@/lib/owner-alert';

export const maxDuration = 300;

async function authed(req: NextRequest) {
  const key = await getSetting('TREND_POST_KEY');
  const got = req.headers.get('x-trend-key') || '';
  return !!key && got.length === key.length && timingSafeEqual(Buffer.from(got), Buffer.from(key));
}

export async function GET(req: NextRequest) {
  if (!await authed(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, job: takeTrendJob() });
}

export async function POST(req: NextRequest) {
  if (!await authed(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const { keyword, article, notify, image_prompt } = await req.json().catch(() => ({})) as { keyword?: string; article?: TrendArticle; notify?: string; image_prompt?: string };
  if (image_prompt) {
    const url = await generateTrendImage(String(image_prompt).slice(0, 1500));
    return NextResponse.json(url ? { ok: true, url } : { ok: false, error: '이미지 생성 실패(할당량 소진 가능)' }, { status: url ? 200 : 502 });
  }
  if (notify) { await alertOwner(`runner:${Date.now()}`, String(notify).slice(0, 1000)); return NextResponse.json({ ok: true }); }
  if (article) {
    try { return NextResponse.json(await publishTrendArticle(article, keyword || article.title)); }
    catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message?.slice(0, 300) }, { status: 500 }); }
  }
  const job = enqueueTrendJob(keyword);
  return NextResponse.json({ ok: true, queued: job });
}
