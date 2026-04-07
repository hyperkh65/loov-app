import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const sb = createAdminClient();
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');   // slug
  const search   = searchParams.get('q');
  const featured = searchParams.get('featured');
  const isNew    = searchParams.get('new');
  const best     = searchParams.get('best');
  const limit    = parseInt(searchParams.get('limit') ?? '40');
  const offset   = parseInt(searchParams.get('offset') ?? '0');
  const sort     = searchParams.get('sort') ?? 'sort_order';
  const admin    = searchParams.get('admin') === '1';

  let q = sb
    .from('shop_products')
    .select(`*, shop_categories(id,name,slug), shop_product_images(url,sort_order)`, { count: 'exact' });

  if (!admin) q = q.eq('is_active', true);
  if (category) {
    const { data: cat } = await sb.from('shop_categories').select('id').eq('slug', category).single();
    if (cat) q = q.eq('category_id', cat.id);
  }
  if (search) q = q.ilike('name', `%${search}%`);
  if (featured === '1') q = q.eq('is_featured', true);
  if (isNew === '1') q = q.eq('is_new', true);
  if (best === '1') q = q.eq('is_best', true);

  const sortMap: Record<string, { col: string; asc: boolean }> = {
    sort_order: { col: 'sort_order', asc: true },
    newest:     { col: 'created_at', asc: false },
    price_asc:  { col: 'price', asc: true },
    price_desc: { col: 'price', asc: false },
  };
  const s = sortMap[sort] ?? sortMap.sort_order;
  q = q.order(s.col, { ascending: s.asc }).range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ products: data, total: count });
}

export async function POST(req: Request) {
  const sb = createAdminClient();
  const { images, ...body } = await req.json();
  const { data, error } = await sb.from('shop_products').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (images?.length) {
    await sb.from('shop_product_images').insert(
      images.map((url: string, i: number) => ({ product_id: data.id, url, sort_order: i }))
    );
  }
  return NextResponse.json({ product: data });
}

export async function PUT(req: Request) {
  const sb = createAdminClient();
  const { id, images, ...body } = await req.json();
  const { data, error } = await sb.from('shop_products').update(body).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (images !== undefined) {
    await sb.from('shop_product_images').delete().eq('product_id', id);
    if (images.length) {
      await sb.from('shop_product_images').insert(
        images.map((url: string, i: number) => ({ product_id: id, url, sort_order: i }))
      );
    }
  }
  return NextResponse.json({ product: data });
}

export async function DELETE(req: Request) {
  const sb = createAdminClient();
  const { id } = await req.json();
  const { error } = await sb.from('shop_products').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
