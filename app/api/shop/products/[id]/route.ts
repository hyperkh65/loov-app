import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('shop_products')
    .select(`*, shop_categories(id,name,slug), shop_product_images(url,sort_order)`)
    .eq('id', id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  // 리뷰
  const { data: reviews } = await sb
    .from('shop_reviews')
    .select('*')
    .eq('product_id', id)
    .order('created_at', { ascending: false })
    .limit(20);

  // 관련 상품
  const { data: related } = await sb
    .from('shop_products')
    .select('id,name,price,sale_price,thumbnail_url,is_new,is_best')
    .eq('category_id', data.category_id)
    .eq('is_active', true)
    .neq('id', id)
    .limit(6);

  return NextResponse.json({ product: data, reviews: reviews ?? [], related: related ?? [] });
}
