/**
 * POST /api/scheduler/run
 *
 * NAS cron 설정 (1분마다 실행):
 *   * * * * * curl -s -X POST https://loov.co.kr/api/scheduler/run \
 *     -H "x-internal-key: YOUR_TELEGRAM_WEBHOOK_SECRET" 2>/dev/null
 *
 * 또는 대시보드에서 수동 실행 (로그인 세션 사용)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-server';
import { isInternalRequest } from '@/lib/internal-auth';
import { computeNextRunAt } from '@/lib/scheduler';
import { runBlogAuto } from '@/lib/scheduler/blog-runner';
import { runCoupangAuto } from '@/lib/scheduler/coupang-runner';
import { runAgodaAuto } from '@/lib/scheduler/agoda-runner';
import { runShortsAuto } from '@/lib/scheduler/shorts-runner';
import { runInstagramAuto } from '@/lib/scheduler/instagram-runner';
import type { Schedule } from '@/lib/scheduler';

export const maxDuration = 300;

async function executeSchedule(schedule: Schedule) {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // 실행 중으로 상태 변경
  await supabase
    .from('bossai_schedules')
    .update({ last_status: 'running' })
    .eq('id', schedule.id);

  // 로그 생성
  const { data: logRow } = await supabase
    .from('bossai_schedule_logs')
    .insert({ schedule_id: schedule.id, user_id: schedule.user_id, started_at: now, status: 'running' })
    .select()
    .single();

  const logId = logRow?.id;

  try {
    // 최근 발행된 쿠팡 상품 ID 조회 (중복 방지)
    let recentProductIds: string[] = [];
    if (schedule.type === 'coupang_auto') {
      const { data: recentLogs } = await supabase
        .from('bossai_schedule_logs')
        .select('result')
        .eq('schedule_id', schedule.id)
        .eq('status', 'success')
        .order('started_at', { ascending: false })
        .limit(10);
      recentProductIds = (recentLogs || [])
        .map(l => (l.result as { productId?: string })?.productId)
        .filter(Boolean) as string[];
    }

    let result: Record<string, unknown> = {};
    let summary = '';

    switch (schedule.type) {
      case 'blog_auto': {
        const r = await runBlogAuto(schedule);
        result = r;
        summary = `"${r.keyword}" 블로그 발행 완료`;
        break;
      }
      case 'coupang_auto': {
        const r = await runCoupangAuto(schedule, recentProductIds);
        result = r as unknown as Record<string, unknown>;
        summary = `${r.productName} → ${r.results.join(', ')}`;
        break;
      }
      case 'agoda_auto': {
        const r = await runAgodaAuto(schedule);
        result = r;
        summary = `${r.city} 호텔 블로그 발행 완료: ${r.title}`;
        break;
      }
      case 'shorts_auto': {
        const r = await runShortsAuto(schedule);
        result = r;
        summary = `"${r.topic}" 숏폼 스크립트 생성${r.saved ? ' + 블로그 발행' : ''}`;
        break;
      }
      case 'instagram_auto': {
        const r = await runInstagramAuto(schedule);
        result = r as unknown as Record<string, unknown>;
        summary = `"${r.topic}" 인스타 ${r.published ? '발행 완료' : '캡션 생성(미발행)'}`;
        break;
      }
    }

    const nextRunAt = computeNextRunAt(schedule.interval_hours, schedule.run_at_hour, now);

    await supabase.from('bossai_schedules').update({
      last_run_at: now,
      next_run_at: nextRunAt.toISOString(),
      last_status: 'success',
    }).eq('id', schedule.id);

    if (logId) {
      await supabase.from('bossai_schedule_logs').update({
        finished_at: new Date().toISOString(),
        status: 'success',
        summary,
        result,
      }).eq('id', logId);
    }

    return { success: true, summary };
  } catch (err: unknown) {
    const errorMsg = (err instanceof Error ? err.message : String(err)).slice(0, 500);

    const nextRunAt = computeNextRunAt(schedule.interval_hours, schedule.run_at_hour, now);
    await supabase.from('bossai_schedules').update({
      last_run_at: now,
      next_run_at: nextRunAt.toISOString(),
      last_status: 'failed',
    }).eq('id', schedule.id);

    if (logId) {
      await supabase.from('bossai_schedule_logs').update({
        finished_at: new Date().toISOString(),
        status: 'failed',
        error: errorMsg,
      }).eq('id', logId);
    }

    return { success: false, error: errorMsg };
  }
}

export async function POST(req: NextRequest) {
  const isInternal = isInternalRequest(req);

  let userId: string | null = null;

  if (!isInternal) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
    userId = user.id;
  }

  // 실행할 스케줄 아이디 (수동 실행 시)
  const body = await req.json().catch(() => ({})) as { schedule_id?: string };
  const scheduleId = body.schedule_id;

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  let query = supabase
    .from('bossai_schedules')
    .select('*')
    .eq('is_active', true)
    .or('last_status.is.null,last_status.neq.running');

  if (scheduleId) {
    query = query.eq('id', scheduleId);
  } else if (userId) {
    // 대시보드 수동 실행: 해당 유저 모든 스케줄
    query = query.eq('user_id', userId);
  } else {
    // NAS cron: 실행 시간이 된 것만
    query = query.lte('next_run_at', now);
  }

  const { data: schedules, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!schedules?.length) return NextResponse.json({ ran: 0, message: '실행할 스케줄 없음' });

  const results = await Promise.allSettled(
    schedules.map(s => executeSchedule(s as Schedule))
  );

  const summary = results.map((r, i) => ({
    id: schedules[i].id,
    name: schedules[i].name,
    ...(r.status === 'fulfilled' ? r.value : { success: false, error: String(r.reason) }),
  }));

  return NextResponse.json({ ran: schedules.length, results: summary });
}
