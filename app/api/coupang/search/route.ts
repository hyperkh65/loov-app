import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import crypto from 'crypto';

function buildCoupangAuth(method: string, path: string, query: string, accessKey: string, secretKey: string) {
  const dt = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z/, 'Z').slice(0, 16) + 'Z';
  const message = `${dt}\n${method}\n${path}\n${query}`;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${dt}, signature=${signature}`;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const keyword = req.nextUrl.searchParams.get('keyword');
  if (!keyword) return NextResponse.json({ error: '키워드 필요' }, { status: 400 });

  const { data: settings } = await supabase
    .from('bossai_blogger_settings')
    .select('coupang_access_key, coupang_secret_key')
    .eq('user_id', user.id)
    .single();

  if (!settings?.coupang_access_key || !settings?.coupang_secret_key) {
    return NextResponse.json({ error: '쿠팡 파트너스 API 키를 먼저 설정해주세요.' }, { status: 400 });
  }

  const path = '/v2/providers/affiliate_open_api/apis/openapi/v1/products/search';
  const query = `keyword=${encodeURIComponent(keyword)}&limit=10`;
  const authorization = buildCoupangAuth('GET', path, query, settings.coupang_access_key, settings.coupang_secret_key);

  try {
    const res = await fetch(`https://api-gateway.coupang.com${path}?${query}`, {
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.message || '검색 실패', detail: data }, { status: 502 });
    return NextResponse.json({ products: data.data?.productData || [] });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
