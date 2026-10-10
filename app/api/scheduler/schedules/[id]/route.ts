import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { computeNextRunAt } from '@/lib/scheduler';

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json();
  const { name, type, is_active, interval_hours, run_at_hour, config } = body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (type !== undefined) updates.type = type;
  if (is_active !== undefined) updates.is_active = is_active;
  if (interval_hours !== undefined) updates.interval_hours = interval_hours;
  if (run_at_hour !== undefined) updates.run_at_hour = run_at_hour;
  if (config !== undefined) updates.config = config;

  // 스케줄 변경 시 next_run_at 재계산
  if (interval_hours !== undefined || run_at_hour !== undefined || is_active === true) {
    const { data: existing } = await supabase
      .from('bossai_schedules')
      .select('interval_hours, run_at_hour, last_run_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (existing) {
      const nextRunAt = computeNextRunAt(
        interval_hours ?? existing.interval_hours,
        run_at_hour ?? existing.run_at_hour,
        existing.last_run_at,
      );
      updates.next_run_at = nextRunAt.toISOString();
    }
  }

  const { data, error } = await supabase
    .from('bossai_schedules')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { error } = await supabase
    .from('bossai_schedules')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
