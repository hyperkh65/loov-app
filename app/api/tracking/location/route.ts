import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

export const maxDuration = 30;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getUser(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (token) {
    const { data } = await createAdminClient().auth.getUser(token);
    return data.user;
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const body = await req.json();
    const { lat, lng, accuracy, altitude, speed, heading, sessionId, recordedAt } = body;
    if (lat == null || lng == null) return NextResponse.json({ error: 'lat/lng 필요' }, { status: 400 });

    const db = createAdminClient();
    const { error } = await db.from('bossai_tracking_locations').insert({
      user_id: user.id, lat, lng,
      accuracy: accuracy ?? null,
      altitude: altitude ?? null,
      speed: speed ?? null,
      heading: heading ?? null,
      session_id: sessionId ?? null,
      recorded_at: recordedAt ?? new Date().toISOString(),
    });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    let dateStr = searchParams.get('date');
    if (!dateStr) {
      const kst = new Date(Date.now() + 9 * 3600_000);
      dateStr = kst.toISOString().slice(0, 10);
    }

    const startUTC = new Date(`${dateStr}T00:00:00+09:00`).toISOString();
    const endUTC = new Date(`${dateStr}T23:59:59+09:00`).toISOString();

    const db = createAdminClient();
    const { data: locations, error: locErr } = await db
      .from('bossai_tracking_locations')
      .select('*')
      .eq('user_id', user.id)
      .gte('recorded_at', startUTC)
      .lte('recorded_at', endUTC)
      .order('recorded_at', { ascending: true });
    if (locErr) throw locErr;

    const { data: memos, error: memoErr } = await db
      .from('bossai_tracking_voice_memos')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', startUTC)
      .lte('created_at', endUTC)
      .order('created_at', { ascending: true });
    if (memoErr) throw memoErr;

    const pts = locations ?? [];
    let totalDistanceKm = 0;
    for (let i = 1; i < pts.length; i++) {
      totalDistanceKm += haversineKm(pts[i-1].lat, pts[i-1].lng, pts[i].lat, pts[i].lng);
    }
    const durationMin = pts.length >= 2
      ? Math.round((new Date(pts[pts.length-1].recorded_at).getTime() - new Date(pts[0].recorded_at).getTime()) / 60000)
      : 0;

    return NextResponse.json({
      date: dateStr,
      locations: pts,
      voiceMemos: memos ?? [],
      stats: { pointCount: pts.length, totalDistanceKm: Math.round(totalDistanceKm * 100) / 100, durationMin },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
