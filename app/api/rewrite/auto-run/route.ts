/**
 * POST /api/rewrite/auto-run
 * 10분 크론: Notion 동기화 → pending 기사 최대 N개 리라이팅
 * Auth: Bearer CRON_SECRET
 */
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://loov.co.kr';

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
    const res = await fetch(`${BASE}/api/rewrite/publish-next`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(60_000),
    });
    publishResult = await res.json();
  } catch (e) {
    publishResult = { ok: false, error: String(e) };
  }

  return NextResponse.json({
    ok: true,
    sync: syncResult,
    processed: results.filter((r) => !('error' in r)).length,
    results,
    publish: publishResult,
  });
}
