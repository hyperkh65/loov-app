import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import { getGoldboxProducts, searchProducts } from '@/lib/coupang/api';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'goldbox';
  const keyword = searchParams.get('keyword') || '';

  const accessKey = await getSetting('COUPANG_ACCESS_KEY');
  const secretKey = await getSetting('COUPANG_SECRET_KEY');

  if (!accessKey || !secretKey)
    return NextResponse.json({ error: '쿠팡파트너스 API 키를 먼저 설정해주세요 (설정 > 쿠팡파트너스)' }, { status: 400 });

  try {
    const products = type === 'search' && keyword
      ? await searchProducts(keyword, accessKey, secretKey)
      : await getGoldboxProducts(accessKey, secretKey);

    return NextResponse.json({ products });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
