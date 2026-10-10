/**
 * LOOV 봇 통합 API
 * clawdbot/OpenClaw 에이전트가 LOOV 기능을 호출하는 진입점
 *
 * GET  /api/bot?action=keywords           트렌딩 키워드 조회
 * GET  /api/bot?action=articles           초안/발행 목록
 * GET  /api/bot?action=status             시스템 상태
 * POST /api/bot  { action, ...params }    글 생성/발행/예약/자동실행
 *
 * Authorization: Bearer <BOT_SECRET>
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://loov.co.kr';

function auth(req: NextRequest): boolean {
  const secret = process.env.BOT_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function err(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

// ── GET 핸들러 ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!auth(req)) return err('인증 실패', 401);

  const action = req.nextUrl.searchParams.get('action') || 'status';
  const supabase = await createAdminClient();
  const ownerId = process.env.OWNER_USER_ID!;

  // ── 트렌딩 키워드 조회 ──
  if (action === 'keywords') {
    try {
      const res = await fetch(`${BASE}/api/auto-service/keywords`, {
        headers: { cookie: '' },
        signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json();
      return NextResponse.json({ ok: true, action, data });
    } catch (e) {
      return err(String(e));
    }
  }

  // ── 초안/발행 목록 ──
  if (action === 'articles') {
    const status = req.nextUrl.searchParams.get('status') || undefined;
    let q = supabase
      .from('bossai_auto_articles')
      .select('id, title, keyword, status, scheduled_at, published_at, word_count, created_at')
      .eq('user_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return err(error.message);
    return NextResponse.json({ ok: true, action, data });
  }

  // ── 시스템 상태 ──
  if (action === 'status') {
    const { data: settings } = await supabase
      .from('bossai_auto_settings')
      .select('enabled, ai_model, max_per_run, last_run_at, last_run_status, last_run_count')
      .eq('user_id', ownerId)
      .single();

    const { count: draftCount } = await supabase
      .from('bossai_auto_articles')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ownerId)
      .eq('status', 'draft');

    const { count: scheduledCount } = await supabase
      .from('bossai_auto_articles')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ownerId)
      .eq('status', 'scheduled');

    return NextResponse.json({
      ok: true, action,
      data: { settings, draftCount, scheduledCount },
    });
  }

  return err(`알 수 없는 action: ${action}`);
}

// ── POST 핸들러 ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!auth(req)) return err('인증 실패', 401);

  const body = await req.json().catch(() => ({}));
  const { action, ...params } = body as { action: string; [k: string]: unknown };
  const botSecret = process.env.BOT_SECRET || process.env.CRON_SECRET || '';

  // ── 글 생성 ──
  if (action === 'generate') {
    const { keyword, ai_model = 'qwen3' } = params as { keyword: string; ai_model?: string };
    if (!keyword) return err('keyword 필요');
    try {
      const res = await fetch(`${BASE}/api/auto-service/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${botSecret}`,
        },
        body: JSON.stringify({ keyword, ai_model }),
        signal: AbortSignal.timeout(540_000),
      });
      const text = await res.text();
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
      return NextResponse.json({ ok: res.ok, action, data });
    } catch (e) {
      return err(String(e));
    }
  }

  // ── 자동 실행 (트렌딩 키워드 → 자동 글 생성) ──
  if (action === 'auto-run') {
    const { keywords = [], max = 3, ai_model = 'qwen3' } = params as {
      keywords?: string[]; max?: number; ai_model?: string;
    };
    try {
      const res = await fetch(`${BASE}/api/auto-service/auto-run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${botSecret}`,
        },
        body: JSON.stringify({ keywords, max, ai_model }),
        signal: AbortSignal.timeout(600_000),
      });
      const text = await res.text();
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
      return NextResponse.json({ ok: res.ok, action, data });
    } catch (e) {
      return err(String(e));
    }
  }

  // ── 글 발행 ──
  if (action === 'publish') {
    const { article_id, blog_platforms = [], sns_platforms = [], wp_site_ids = [] } = params as {
      article_id: string; blog_platforms?: string[]; sns_platforms?: string[]; wp_site_ids?: string[];
    };
    if (!article_id) return err('article_id 필요');
    try {
      const res = await fetch(`${BASE}/api/auto-service/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${botSecret}`,
        },
        body: JSON.stringify({ article_id, blog_platforms, sns_platforms, wp_site_ids }),
        signal: AbortSignal.timeout(300_000),
      });
      const data = await res.json();
      return NextResponse.json({ ok: res.ok, action, data });
    } catch (e) {
      return err(String(e));
    }
  }

  // ── 예약 발행 ──
  if (action === 'schedule') {
    const { article_id, scheduled_at, blog_platforms = [], sns_platforms = [], wp_site_ids = [] } = params as {
      article_id: string; scheduled_at: string;
      blog_platforms?: string[]; sns_platforms?: string[]; wp_site_ids?: string[];
    };
    if (!article_id || !scheduled_at) return err('article_id, scheduled_at 필요');
    const supabase = await createAdminClient();
    const { error } = await supabase
      .from('bossai_auto_articles')
      .update({
        status: 'scheduled',
        scheduled_at,
        scheduled_platforms: { blog_platforms, sns_platforms, wp_site_ids },
        updated_at: new Date().toISOString(),
      })
      .eq('id', article_id);
    if (error) return err(error.message);
    return NextResponse.json({ ok: true, action, data: { article_id, scheduled_at } });
  }

  // ── 글 승인 (draft → approved) ──
  if (action === 'approve') {
    const { article_id } = params as { article_id: string };
    if (!article_id) return err('article_id 필요');
    const supabase = await createAdminClient();
    const { error } = await supabase
      .from('bossai_auto_articles')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', article_id);
    if (error) return err(error.message);
    return NextResponse.json({ ok: true, action, data: { article_id } });
  }

  // ── WordPress 사이트 목록 ──
  if (action === 'wp-sites') {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('wordpress_sites')
      .select('id, site_name, site_url')
      .eq('user_id', process.env.OWNER_USER_ID!);
    if (error) return err(error.message);
    return NextResponse.json({ ok: true, action, data });
  }

  return err(`알 수 없는 action: ${action}`);
}
