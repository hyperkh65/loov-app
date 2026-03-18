import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 30;

// Haversine formula: returns km
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

// POST: save location point
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const body = await req.json();
    const { lat, lng, accuracy, altitude, speed, heading, sessionId, recordedAt } = body;
    if (lat == null || lng == null) return NextResponse.json({ error: 'lat/lng 필요' }, { status: 400 });

    const { error } = await supabase.from('bossai_tracking_locations').insert({
      user_id: user.id,
      lat,
      lng,
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

// GET: get route for a given date (default: today KST)
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    let dateStr = searchParams.get('date'); // YYYY-MM-DD

    // Default: today KST (UTC+9)
    if (!dateStr) {
      const now = new Date();
      const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      dateStr = kst.toISOString().slice(0, 10);
    }

    const startUTC = new Date(`${dateStr}T00:00:00+09:00`).toISOString();
    const endUTC = new Date(`${dateStr}T23:59:59+09:00`).toISOString();

    // Fetch locations
    const { data: locations, error: locErr } = await supabase
      .from('bossai_tracking_locations')
      .select('*')
      .eq('user_id', user.id)
      .gte('recorded_at', startUTC)
      .lte('recorded_at', endUTC)
      .order('recorded_at', { ascending: true });

    if (locErr) throw locErr;

    // Fetch voice memos
    const { data: memos, error: memoErr } = await supabase
      .from('bossai_tracking_voice_memos')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', startUTC)
      .lte('created_at', endUTC)
      .order('created_at', { ascending: true });

    if (memoErr) throw memoErr;

    // Calculate stats
    const pts = locations ?? [];
    let totalDistanceKm = 0;
    for (let i = 1; i < pts.length; i++) {
      totalDistanceKm += haversineKm(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
    }

    let durationMin = 0;
    if (pts.length >= 2) {
      const first = new Date(pts[0].recorded_at).getTime();
      const last = new Date(pts[pts.length - 1].recorded_at).getTime();
      durationMin = Math.round((last - first) / 60000);
    }

    return NextResponse.json({
      date: dateStr,
      locations: pts,
      voiceMemos: memos ?? [],
      stats: {
        pointCount: pts.length,
        totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
        durationMin,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
