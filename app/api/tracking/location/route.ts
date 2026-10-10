import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

export const maxDuration = 30;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getUser(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (token) {
    const { data } = await createAdminClient().auth.getUser(token);
    return data.user;
  }
  const { data } = await (await createClient()).auth.getUser();
  return data.user;
}

// 10분 이상 머문 지점 감지 (100m 반경 클러스터링)
function detectDwellPoints(pts: { lat: number; lng: number; recorded_at: string }[]) {
  const DWELL_RADIUS_KM = 0.1; // 100m
  const DWELL_MIN_MS = 10 * 60 * 1000; // 10분
  const dwells: { lat: number; lng: number; startTime: string; endTime: string; durationMin: number }[] = [];
  let i = 0;
  while (i < pts.length) {
    const anchor = pts[i];
    let j = i + 1;
    // 앵커로부터 100m 안에 있는 연속된 마지막 점 찾기
    while (j < pts.length && haversineKm(anchor.lat, anchor.lng, pts[j].lat, pts[j].lng) < DWELL_RADIUS_KM) {
      j++;
    }
    const clusterPts = pts.slice(i, j);
    const elapsed = new Date(clusterPts[clusterPts.length - 1].recorded_at).getTime()
      - new Date(clusterPts[0].recorded_at).getTime();
    if (elapsed >= DWELL_MIN_MS) {
      // 클러스터 중심
      const lat = clusterPts.reduce((s, p) => s + p.lat, 0) / clusterPts.length;
      const lng = clusterPts.reduce((s, p) => s + p.lng, 0) / clusterPts.length;
      dwells.push({
        lat, lng,
        startTime: clusterPts[0].recorded_at,
        endTime: clusterPts[clusterPts.length - 1].recorded_at,
        durationMin: Math.round(elapsed / 60000),
      });
    }
    i = j > i ? j : i + 1; // 클러스터 끝으로 점프
  }
  return dwells;
}

async function reverseGeocode(lat: number, lng: number) {
  try {
    const [koRes, enRes] = await Promise.all([
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ko`, {
        headers: { 'User-Agent': 'loov-tracker/1.0' },
      }),
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=en`, {
        headers: { 'User-Agent': 'loov-tracker/1.0' },
      }),
    ]);
    const [ko, en] = await Promise.all([koRes.json(), enRes.json()]);
    // 간결한 주소: road + suburb or city
    const addr = (data: { address?: Record<string, string>; display_name?: string }) => {
      const a = data.address ?? {};
      const parts = [a.road || a.pedestrian || a.footway, a.suburb || a.neighbourhood || a.quarter || a.city_district, a.city || a.town || a.village].filter(Boolean);
      return parts.length > 0 ? parts.join(' ') : (data.display_name ?? '').split(',').slice(0, 2).join(',');
    };
    return { ko: addr(ko), en: addr(en) };
  } catch {
    return { ko: '', en: '' };
  }
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
      accuracy: accuracy ?? null, altitude: altitude ?? null,
      speed: speed ?? null, heading: heading ?? null,
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
      .from('bossai_tracking_locations').select('*')
      .eq('user_id', user.id).gte('recorded_at', startUTC).lte('recorded_at', endUTC)
      .order('recorded_at', { ascending: true });
    if (locErr) throw locErr;

    const { data: memos, error: memoErr } = await db
      .from('bossai_tracking_voice_memos').select('*')
      .eq('user_id', user.id).gte('created_at', startUTC).lte('created_at', endUTC)
      .order('created_at', { ascending: true });
    if (memoErr) throw memoErr;

    const pts = locations ?? [];

    // 통계
    let totalDistanceKm = 0;
    for (let i = 1; i < pts.length; i++)
      totalDistanceKm += haversineKm(pts[i-1].lat, pts[i-1].lng, pts[i].lat, pts[i].lng);
    const durationMin = pts.length >= 2
      ? Math.round((new Date(pts[pts.length-1].recorded_at).getTime() - new Date(pts[0].recorded_at).getTime()) / 60000) : 0;

    // 체류 감지 + 역지오코딩 (병렬)
    const rawDwells = detectDwellPoints(pts);
    const dwellPoints = await Promise.all(
      rawDwells.map(async (d) => {
        const address = await reverseGeocode(d.lat, d.lng);
        return { ...d, address };
      })
    );

    return NextResponse.json({
      date: dateStr,
      locations: pts,
      voiceMemos: memos ?? [],
      dwellPoints,
      stats: { pointCount: pts.length, totalDistanceKm: Math.round(totalDistanceKm * 100) / 100, durationMin },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
