import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase-server';
import { isBotUA } from '@/lib/bot-ua';

function deviceTypeFromUA(ua: string): string {
  if (/mobile|iphone|android/i.test(ua)) return 'mobile';
  if (ua) return 'desktop';
  return 'unknown';
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: link } = await admin
    .from('bossai_affiliate_go_links')
    .select('destination_url')
    .eq('id', id)
    .single();

  if (!link?.destination_url) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  const ua = req.headers.get('user-agent') || '';

  // 클릭 기록 실패해도 리다이렉트는 무조건 진행 — await 하되 실패는 무시.
  // 링크 미리보기 봇/크롤러 요청은 클릭으로 세지 않음(클릭 수 부풀림 방지)
  if (!isBotUA(ua)) admin.from('bossai_affiliate_click_events').insert({
    go_link_id: id,
    referrer: req.headers.get('referer') || null,
    device_type: deviceTypeFromUA(ua),
    ip_hash: ip ? crypto.createHash('sha256').update(ip).digest('hex') : null,
  }).then(() => {}, () => {});

  return NextResponse.redirect(link.destination_url);
}
