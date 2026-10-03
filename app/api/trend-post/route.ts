/**
 * POST /api/trend-post — 트렌드 키워드로 2days.kr 글 자동 발행(Codex/Claude/외부 공용 진입점)
 * Auth: x-trend-key 헤더 = app_settings.TREND_POST_KEY
 * Body: { keyword?, wait?, article?: { title, html, outlets? } }
 *  - article 없음: 서버 AI가 트렌드 선정·교차검증·작성(로컬 꺼져도 동작). wait=false(기본)면 즉시 응답, 결과는 텔레그램
 *  - article 있음: 로컬 Claude/Codex가 쓴 완성 글 → 서버는 이미지·발행·SNS만(응답에 URL)
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getSetting } from '@/lib/get-setting';
import { runTrendPost } from '@/lib/trend-post';

export const maxDuration = 600;

export async function POST(req: NextRequest) {
  const key = await getSetting('TREND_POST_KEY');
  const got = req.headers.get('x-trend-key') || '';
  if (!key || got.length !== key.length || !timingSafeEqual(Buffer.from(got), Buffer.from(key))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const { keyword, wait, article } = await req.json().catch(() => ({})) as { keyword?: string; wait?: boolean; article?: { title: string; html: string; outlets?: string[] } };
  if (wait || article) return NextResponse.json(await runTrendPost({ keyword, article }));
  runTrendPost({ keyword }).catch(() => {});
  return NextResponse.json({ ok: true, started: true, keyword: keyword || '(자동 선정)', note: '3~6분 뒤 텔레그램으로 결과 링크 전송' });
}
