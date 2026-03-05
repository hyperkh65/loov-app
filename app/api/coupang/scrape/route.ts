import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { scrapeProductData, extractProductId } from '@/lib/coupang/api';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { productId, productUrl } = await req.json();

  // URL에서 productId 추출 지원
  const id = productId || (productUrl ? extractProductId(productUrl) : null);
  if (!id) return NextResponse.json({ error: '상품 ID 또는 URL이 필요합니다' }, { status: 400 });

  try {
    const result = await scrapeProductData(id);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
