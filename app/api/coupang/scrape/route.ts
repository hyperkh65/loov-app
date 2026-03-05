import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { scrapeProductData } from '@/lib/coupang/api';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { productId } = await req.json();
  if (!productId) return NextResponse.json({ error: 'productId가 필요합니다' }, { status: 400 });

  try {
    const { reviews, images } = await scrapeProductData(productId);
    return NextResponse.json({ reviews, images });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
