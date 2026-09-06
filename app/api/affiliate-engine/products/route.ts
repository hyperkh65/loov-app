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

  const { data: scores } = await supabase
    .from('affiliate_product_scores')
    .select('product_id, opportunity_score, saturation_level, explanation')
    .in('product_id', productIds)
    .order('computed_at', { ascending: false });
  const scoreByProduct = new Map<string, unknown>();
  for (const s of scores || []) if (!scoreByProduct.has(s.product_id)) scoreByProduct.set(s.product_id, s);

  const { data: scripts } = await supabase
    .from('affiliate_scripts')
    .select('id, product_id, hook_text, full_script, created_at')
    .in('product_id', productIds)
    .order('created_at', { ascending: false });
  const scriptByProduct = new Map<string, unknown>();
  for (const s of scripts || []) if (!scriptByProduct.has(s.product_id)) scriptByProduct.set(s.product_id, s);

  const { data: projects } = await supabase
    .from('affiliate_video_projects')
    .select('id, product_id')
    .in('product_id', productIds);
  const projectByProduct = new Map<string, string>();
  const projectIds: string[] = [];
  for (const pr of projects || []) { projectByProduct.set(pr.product_id, pr.id); projectIds.push(pr.id); }

  const videoUrlByProduct = new Map<string, string>();
  if (projectIds.length) {
    const { data: variants } = await supabase
      .from('affiliate_video_variants')
      .select('id, project_id')
      .in('project_id', projectIds);
    const variantIds = (variants || []).map(v => v.id);
    const projectByVariant = new Map((variants || []).map(v => [v.id, v.project_id]));

    if (variantIds.length) {
      const { data: renders } = await supabase
        .from('affiliate_renders')
        .select('variant_id, public_url, status')
        .in('variant_id', variantIds)
        .eq('status', 'completed');
      for (const r of renders || []) {
        const projectId = projectByVariant.get(r.variant_id);
        const productId = [...projectByProduct.entries()].find(([, pid]) => pid === projectId)?.[0];
        if (productId && r.public_url) videoUrlByProduct.set(productId, r.public_url);
      }
    }
  }

  const merged = products.map(p => ({
    ...p,
    match: matchByProduct.get(p.id) || null,
    score: scoreByProduct.get(p.id) || null,
    script: scriptByProduct.get(p.id) || null,
    video_url: videoUrlByProduct.get(p.id) || null,
  }));
  return NextResponse.json(merged);
}
