import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

async function refreshAccessToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  refreshToken: string,
): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error('Token refresh failed');

  await supabase.from('bossai_google_tokens').update({
    access_token: data.access_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);

  return data.access_token;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Google 토큰 가져오기 (세션 클라이언트 — RLS 정책이 자신의 행 허용)
    const { data: tokenRow, error: tokenErr } = await supabase
      .from('bossai_google_tokens')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (tokenErr) {
      return NextResponse.json({ error: `토큰 조회 오류: ${tokenErr.message}` }, { status: 500 });
    }
    if (!tokenRow) {
      return NextResponse.json({ error: 'Google Calendar가 연결되지 않았습니다' }, { status: 400 });
    }

    let accessToken = tokenRow.access_token;

    // 토큰 만료 확인 및 갱신
    if (new Date(tokenRow.expires_at) <= new Date()) {
      accessToken = await refreshAccessToken(supabase, user.id, tokenRow.refresh_token);
    }

    const body = await req.json().catch(() => ({}));
    const { direction = 'both' } = body;

    const results: { imported: number; exported: number } = { imported: 0, exported: 0 };

    // ── Google → LOOV 가져오기 ──
    if (direction === 'both' || direction === 'import') {
      const now = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();

      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&maxResults=50`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const calData = await calRes.json();

      if (calData.items) {
        for (const event of calData.items) {
          const startDate = event.start?.date || event.start?.dateTime?.slice(0, 10);
          if (!startDate) continue;

          const { data: existing } = await supabase
            .from('bossai_schedule_events')
            .select('id')
            .eq('user_id', user.id)
            .eq('google_event_id', event.id)
            .maybeSingle();

          if (!existing) {
            const { error: insertErr } = await supabase.from('bossai_schedule_events').insert({
              user_id: user.id,
              id: crypto.randomUUID(),
              title: event.summary || '(제목 없음)',
              description: event.description || '',
              date: startDate,
              time: event.start?.dateTime?.slice(11, 16) || '',
              end_time: event.end?.dateTime?.slice(11, 16) || '',
              type: 'meeting',
              assigned_employee_ids: [],
              is_all_day: !!event.start?.date,
              color: '',
              google_event_id: event.id,
            });
            if (!insertErr) results.imported++;
            else console.error('Insert schedule error:', insertErr);
          }
        }
      }
    }

    // ── LOOV → Google 내보내기 ──
    if (direction === 'both' || direction === 'export') {
      const { data: localEvents } = await supabase
        .from('bossai_schedule_events')
        .select('*')
        .eq('user_id', user.id)
        .is('google_event_id', null)
        .gte('date', new Date().toISOString().slice(0, 10));

      for (const event of (localEvents || [])) {
        const googleEvent = {
          summary: event.title,
          description: event.description || '',
          start: event.is_all_day
            ? { date: event.date }
            : { dateTime: `${event.date}T${event.time || '09:00'}:00`, timeZone: 'Asia/Seoul' },
          end: event.is_all_day
            ? { date: event.date }
            : { dateTime: `${event.date}T${event.end_time || event.time || '10:00'}:00`, timeZone: 'Asia/Seoul' },
        };

        const createRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(googleEvent),
        });

        if (createRes.ok) {
          const created = await createRes.json();
          await supabase.from('bossai_schedule_events')
            .update({ google_event_id: created.id })
            .eq('id', event.id);
          results.exported++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `가져오기 ${results.imported}개, 내보내기 ${results.exported}개 완료`,
      ...results,
    });
  } catch (error) {
    console.error('Google sync error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
