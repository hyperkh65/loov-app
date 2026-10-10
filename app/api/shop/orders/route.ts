import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const adminClient = createAdminClient();
  const isAdmin = req.nextUrl.searchParams.get('admin') === '1';

  let q = adminClient.from('shop_orders').select(`*, shop_order_items(*)`);
  if (!isAdmin) q = q.eq('user_id', user.id);

  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    items: { product_id: number; product_name: string; option_name?: string; price: number; qty: number }[];
    shipping: { name: string; phone: string; addr: string; addr_detail: string; zipcode: string };
    memo?: string;
    user_id?: string;
  };

  const total = body.items.reduce((a, i) => a + i.price * i.qty, 0);
  const orderNo = 'ORD-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + Math.floor(Math.random()*100000).toString().padStart(5,'0');

  const sb = createAdminClient();
  const { data: order, error } = await sb.from('shop_orders').insert({
    order_no: orderNo,
    user_id: body.user_id ?? null,
    total_amount: total,
    shipping_name: body.shipping.name,
    shipping_phone: body.shipping.phone,
    shipping_addr: body.shipping.addr,
    shipping_addr_detail: body.shipping.addr_detail,
    shipping_zipcode: body.shipping.zipcode,
    memo: body.memo ?? '',
    status: 'pending',
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from('shop_order_items').insert(
    body.items.map(i => ({ ...i, order_id: order.id }))
  );

  return NextResponse.json({ order });
}

export async function PUT(req: Request) {
  const { id, status } = await req.json();
  const sb = createAdminClient();
  const { error } = await sb.from('shop_orders').update({ status }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
