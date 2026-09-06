/**
 * POST /api/affiliate-engine/normalize
 * Phase 4: 아직 정규화되지 않은(brand IS NULL) 상품을 AI로 채운다.
 * Body: { limit?: number } (기본 5, 최대 20 — 비용/시간 제어)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { normalizeProduct } from '@/lib/affiliate-engine/normalize';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(body.limit || 5, 20);

  const { data: products, error } = await supabase
    .from('affiliate_products')
    .select('id, product_name, category, estimated_price_min, estimated_price_max')
    .eq('user_id', user.id)
    .is('brand', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!products?.length) return NextResponse.json({ processed: 0, results: [] });

  const results: Array<{ id: string; name: string; status: string }> = [];

  for (const p of products) {
    try {
      const fields = await normalizeProduct(p.product_name, p.category, p.estimated_price_min, p.estimated_price_max);
      await supabase.from('affiliate_products').update({
        ...fields,
        updated_at: new Date().toISOString(),
      }).eq('id', p.id);
      results.push({ id: p.id, name: p.product_name, status: 'NORMALIZED' });
    } catch (e) {
      results.push({ id: p.id, name: p.product_name, status: `실패: ${String(e).slice(0, 150)}` });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
