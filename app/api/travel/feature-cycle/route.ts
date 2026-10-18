/**
 * POST /api/travel/feature-cycle — blog.2days.kr 여행 특집(세계/국내 여행지·맛집) 1편 발행 + 여행 계정 Threads 크로스포스트
 * Auth: Bearer CRON_SECRET
 */
import { NextRequest, NextResponse } from 'next/server';
import { runTravelFeature } from '@/lib/scheduler/travel-feature';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET || process.env.BOT_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: '인증 실패' }, { status: 401 });
  try { return NextResponse.json(await runTravelFeature()); }
  catch (e) { return NextResponse.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500 }); }
}
