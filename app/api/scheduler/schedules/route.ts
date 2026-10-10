import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { computeNextRunAt } from '@/lib/scheduler';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data, error } = await supabase
    .from('bossai_schedules')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json();
  const { name, type, interval_hours = 24, run_at_hour = 9, config = {} } = body;

  if (!name || !type) return NextResponse.json({ error: 'name, type 필수' }, { status: 400 });

  const nextRunAt = computeNextRunAt(interval_hours, run_at_hour, null);

  const { data, error } = await supabase
    .from('bossai_schedules')
    .insert({
      user_id: user.id,
      name,
      type,
      is_active: true,
      interval_hours,
      run_at_hour,
      config,
      next_run_at: nextRunAt.toISOString(),
      keyword_index: 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
