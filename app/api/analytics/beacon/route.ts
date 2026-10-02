import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { isBotUA } from '@/lib/bot-ua';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// WP 사이트 비콘 수신: t=pv(방문) / t=d(누적 체류초). sendBeacon은 text/plain이라 본문을 직접 파싱.
export async function POST(req: NextRequest) {
  try {
    const b = JSON.parse(await req.text()) as { t?: string; s?: string; h?: string; p?: string; r?: string; d?: number };
    const sid = String(b.s || '').slice(0, 40);
    if (!sid) return new NextResponse(null, { status: 204, headers: CORS });
    const admin = createAdminClient();
    if (b.t === 'pv') {
      const ua = req.headers.get('user-agent') || '';
      await admin.from('bossai_pageviews').upsert({
        sid,
        host: String(b.h || '').slice(0, 100),
        path: String(b.p || '').slice(0, 300),
        referrer: String(b.r || '').slice(0, 300) || null,
        device_type: /mobile|iphone|android/i.test(ua) ? 'mobile' : 'desktop',
        is_bot: isBotUA(ua),
      }, { onConflict: 'sid', ignoreDuplicates: true });
    } else if (b.t === 'd') {
      const d = Math.min(Math.max(Math.round(Number(b.d) || 0), 0), 3600);
      await admin.from('bossai_pageviews').update({ dwell_sec: d }).eq('sid', sid);
    }
  } catch { /* 비콘은 조용히 무시 */ }
  return new NextResponse(null, { status: 204, headers: CORS });
}
