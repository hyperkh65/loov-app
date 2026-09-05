import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  void req;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data: products, error } = await supabase
    .from('affiliate_products')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!products?.length) return NextResponse.json([]);

  const productIds = products.map(p => p.id);
  const { data: matches } = await supabase
    .from('affiliate_product_matches')
    .select('product_id, match_confidence, listing_id, affiliate_listings(product_name, affiliate_url, current_price, discount_rate, image_url, network, rating, review_count)')
    .in('product_id', productIds);

  const matchByProduct = new Map<string, unknown>();
  for (const m of matches || []) matchByProduct.set(m.product_id, m);

  const merged = products.map(p => ({ ...p, match: matchByProduct.get(p.id) || null }));
  return NextResponse.json(merged);
}
