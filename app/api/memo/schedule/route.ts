/**
 * POST /api/memo/schedule
 * 메모를 스케줄(bossai_schedule_events + Google Calendar)에 추가
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { title, content, summary, category, memo_date, memo_id } = await req.json() as {
    title: string; content: string; summary?: string;
    category?: string; memo_date: string; memo_id?: string;
  };

  const eventTitle = title || content.slice(0, 40);
  const eventDesc  = summary || content.slice(0, 200);

  // 1. 로컬 스케줄 테이블
  const { error: schedErr } = await supabase.from('bossai_schedule_events').insert({
    id: crypto.randomUUID(),
    user_id: user.id,
    title: `📓 ${eventTitle}`,
    description: eventDesc,
    date: memo_date,
    time: null,
    type: category === '일정' || category === '회의' ? 'meeting' : 'other',
    assigned_employee_ids: [],
    is_all_day: true,
    source: 'memo',
    color: '#6366f1',
    ...(memo_id ? { memo_id } : {}),
  });

  // 2. Google Calendar API
  let googleOk = false;
  try {
    const { data: tokenRow } = await supabase
      .from('bossai_google_tokens')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (tokenRow) {
      let accessToken = tokenRow.access_token;

      if (new Date(tokenRow.expires_at) <= new Date()) {
        const res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            refresh_token: tokenRow.refresh_token,
            grant_type: 'refresh_token',
          }),
        });
        const d = await res.json() as { access_token?: string; expires_in?: number };
        if (d.access_token) {
          accessToken = d.access_token;
          await supabase.from('bossai_google_tokens').update({
            access_token: d.access_token,
            expires_at: new Date(Date.now() + (d.expires_in || 3600) * 1000).toISOString(),
          }).eq('user_id', user.id);
        }
      }

      const gcalRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: `📓 ${eventTitle}`,
          description: eventDesc,
          start: { date: memo_date },
          end: { date: memo_date },
          colorId: '9',
        }),
        signal: AbortSignal.timeout(10000),
      });
      googleOk = gcalRes.ok;
    }
  } catch {}

  return NextResponse.json({
    ok: !schedErr,
    google: googleOk,
    message: `📅 스케줄 추가됨${googleOk ? ' + Google Calendar' : ''}`,
  });
}
