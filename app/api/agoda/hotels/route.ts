import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

const AGODA_SITE_ID = (process.env.AGODA_SITE_ID || '1959217').trim();
const AGODA_API_KEY = (process.env.AGODA_API_KEY || 'c7ca62e2-55fa-4f42-b691-f949948ecc30').trim();

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    cityId: number;
    checkIn?: string;
    checkOut?: string;
    minStars?: number;
    minReview?: number;
    maxResult?: number;
    currency?: string;
    sortBy?: string;
  };

  const { cityId, minStars = 0, minReview = 0, maxResult = 10, currency = 'KRW', sortBy = 'AllGuestsReviewScore' } = body;
  if (!cityId) return NextResponse.json({ error: 'cityId 필요' }, { status: 400 });

  // 체크인: 7일 후, 체크아웃: 8일 후
  const ci = new Date(); ci.setDate(ci.getDate() + 7);
  const co = new Date(ci); co.setDate(co.getDate() + 1);
  const checkInDate = body.checkIn || ci.toISOString().split('T')[0];
  const checkOutDate = body.checkOut || co.toISOString().split('T')[0];

  const payload = {
    criteria: {
      additional: {
        currency,
        language: 'ko-kr',
        maxResult,
        minimumReviewScore: minReview,
        minimumStarRating: minStars,
        sortBy,
        occupancy: { numberOfAdult: 2, numberOfChildren: 0 },
      },
      checkInDate,
      checkOutDate,
      cityId,
    },
  };

  try {
    const res = await fetch('http://affiliateapi7643.agoda.com/affiliateservice/lt_v1', {
      method: 'POST',
      headers: {
        Authorization: `${AGODA_SITE_ID}:${AGODA_API_KEY}`,
        'Accept-Encoding': 'identity', // Node fetch handles decompression but we avoid it explicitly
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `아고다 API 오류 (${res.status}): ${errText}` }, { status: 502 });
    }

    const data = await res.json();
    if (data.error) return NextResponse.json({ error: data.error.message || '검색 실패' }, { status: 502 });

    return NextResponse.json({ hotels: data.results || [], checkIn: checkInDate, checkOut: checkOutDate });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
