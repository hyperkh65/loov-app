import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { isInternalRequest } from '@/lib/internal-auth';

export const maxDuration = 30;

async function getUser(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (token) {
    const { data } = await createAdminClient().auth.getUser(token);
    return data.user;
  }
  const { data } = await (await createClient()).auth.getUser();
  return data.user;
}

export async function GET(req: NextRequest) {
  try {
    const internal = isInternalRequest(req);
    let userId: string | null = null;

    if (!internal) {
      const user = await getUser(req);
      if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });
      userId = user.id;
    }

    const { searchParams } = new URL(req.url);
    const dateFilter = searchParams.get('date');

    const db = createAdminClient();
    let query = db
      .from('bossai_schedule_events')
      .select('*');

    if (userId) query = query.eq('user_id', userId);
    query = query
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    if (dateFilter) {
      query = query.eq('date', dateFilter);
    }

    const { data: events, error } = await query;
    if (error) throw error;

    // Map snake_case DB columns to camelCase ScheduleEvent interface
    const mapped = (events ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description ?? undefined,
      date: e.date,
      time: e.time ?? undefined,
      endTime: e.end_time ?? undefined,
      type: e.type ?? 'other',
      assignedEmployeeIds: e.assigned_employee_ids ?? [],
      isAllDay: e.is_all_day ?? false,
      color: e.color ?? undefined,
      source: e.source ?? 'manual',
    }));

    return NextResponse.json({ events: mapped });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const body = await req.json();
    const { id, title, description, date, time, endTime, type, assignedEmployeeIds, isAllDay, color } = body;

    if (!title || !date) return NextResponse.json({ error: 'title, date 필요' }, { status: 400 });

    const db = createAdminClient();
    const { data: event, error } = await db
      .from('bossai_schedule_events')
      .insert({
        id: id ?? crypto.randomUUID(),
        user_id: user.id,
        title,
        description: description || null,
        date,
        time: time || null,
        end_time: endTime || null,
        type: type || 'other',
        assigned_employee_ids: assignedEmployeeIds ?? [],
        is_all_day: isAllDay ?? false,
        color: color || null,
        source: body.source || 'manual',
      })
      .select()
      .single();
    if (error) throw error;

    const mapped = {
      id: event.id,
      title: event.title,
      description: event.description ?? undefined,
      date: event.date,
      time: event.time ?? undefined,
      endTime: event.end_time ?? undefined,
      type: event.type ?? 'other',
      assignedEmployeeIds: event.assigned_employee_ids ?? [],
      isAllDay: event.is_all_day ?? false,
      color: event.color ?? undefined,
      source: event.source ?? 'manual',
    };

    return NextResponse.json({ event: mapped });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
