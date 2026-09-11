/**
 * POST /api/rewrite/auto-run
 * 10분 크론: Notion 동기화 → pending 기사 최대 N개 리라이팅
 * Auth: Bearer CRON_SECRET
 */
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

// 공개 도메인으로 자기 자신을 호출하면 hairpin NAT로 간헐적으로 Synology
// 에러 페이지(HTML)가 응답으로 와서 JSON 파싱이 실패하는 게 실사용 중 확인됨
// (다른 곳에서도 이미 겪은 문제 — /api/affiliate-engine/render 등). localhost는
// Next standalone server.js가 컨테이너 자체 IP에만 바인딩돼 있어 연결 거부됨
// (docker HOSTNAME env 이슈, docker run 재생성 전까진 안 고쳐짐) — 대신 도커
// 브리지 게이트웨이+게시된 포트(172.17.0.1:3100)로 우회하면 확실히 도달함(확인됨).
const BASE = 'http://172.17.0.1:3100';

async function authOk(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET || process.env.BOT_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  try {
    const { createClient } = await import('@/lib/supabase-server');
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return !!user;
  } catch { return false; }
}

function err(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: NextRequest) {
  if (!await authOk(req)) return err('인증 실패', 401);

  const body = await req.json().catch(() => ({}));
  const { max = 2, ai_model = 'qwen3', skip_sync = false } = body as {
    max?: number; ai_model?: string; skip_sync?: boolean;
  };

  const cronSecret = process.env.CRON_SECRET || process.env.BOT_SECRET || '';
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cronSecret}`,
  };

  // 1. Notion 동기화 + 소스 사이트 RSS 동기화
  let syncResult: { synced?: number; skipped?: number } = {};
  if (!skip_sync) {
    try {
      const syncRes = await fetch(`${BASE}/api/rewrite/sync`, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      syncResult = await syncRes.json();
    } catch (e) {
      syncResult = { synced: 0, skipped: 0 };
      console.error('Notion sync 실패:', e);
    }

    try {
      await fetch(`${BASE}/api/rewrite/sync-sites`, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(90_000),
      });
    } catch (e) {
      console.error('사이트 RSS 동기화 실패:', e);
    }
  }

  // 2. 순서대로 리라이팅
  const results: Array<{ id: string; title: string; word_count: number } | { error: string }> = [];

  for (let i = 0; i < max; i++) {
    try {
      const res = await fetch(`${BASE}/api/rewrite/process`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ai_model }),
        signal: AbortSignal.timeout(280_000),
      });
      const data = await res.json();

      if (data.processed === 0) break; // 더 이상 처리할 기사 없음
      if (data.ok && data.data) results.push(data.data);
      else results.push({ error: data.error || '알 수 없는 오류' });
    } catch (e) {
      results.push({ error: String(e) });
      break;
    }
  }

  // 3. 발행 대기열에서 하나 발행 시도 (간격 15분은 publish-next가 자체 체크)
  let publishResult: unknown = null;
  try {
    // 워드프레스+SNS 4종+네이버카페까지 순차 발행하면 60초로는 부족한 경우가
    // 실사용 중 확인돼 늘림 (전체 라우트 maxDuration=300, NAS cron --max-time 280과 맞춤)
    const res = await fetch(`${BASE}/api/rewrite/publish-next`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(200_000),
    });
    publishResult = await res.json();
  } catch (e) {
    publishResult = { ok: false, error: String(e) };
  }

  // 4. 고CPC 키워드 캐시 자동 재발굴 — pickKeywordForUser는 12시간 넘은 캐시를
  // 무시하고 구글트렌드로 폴백하므로(lib/scheduler/keyword-picker.ts), 그보다
  // 여유 있게 10시간마다 재발굴해서 공백이 안 생기게 함. 대시보드에서 사람이
  // 안 눌러도 이미 10분마다 도는 이 크론에 얹어서 실행하고, 응답은 기다리지
  // 않고 백그라운드로 흘려보냄(fire-and-forget) — 실패해도 리라이트/발행
  // 결과에는 영향 없음.
  try {
    const { createAdminClient } = await import('@/lib/supabase-server');
    const admin = createAdminClient();
    const { data: latest } = await admin
      .from('bossai_keyword_opportunities')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    const staleMs = 10 * 60 * 60 * 1000;
    const isStale = !latest || Date.now() - new Date(latest.created_at).getTime() > staleMs;
    if (isStale) {
      fetch(`${BASE}/api/keyword/auto-discover`, {
        method: 'POST', headers, signal: AbortSignal.timeout(50_000),
      }).catch(() => {});
    }
  } catch { /* 캐시 신선도 체크 실패는 무시 — 부가 기능 */ }

  return NextResponse.json({
    ok: true,
    sync: syncResult,
    processed: results.filter((r) => !('error' in r)).length,
    results,
    publish: publishResult,
  });
}
