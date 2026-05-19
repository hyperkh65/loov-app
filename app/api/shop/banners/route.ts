import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export async function GET() {
  const sb = createAdminClient();
  const { data, error } = await sb.from('shop_banners').select('*').order('sort_order');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ banners: data ?? [] });
}

export async function POST(req: Request) {
  const sb = createAdminClient();
  const body = await req.json();
  const { data, error } = await sb.from('shop_banners').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ banner: data });
}

export async function PUT(req: Request) {
  const sb = createAdminClient();
  const { id, ...body } = await req.json();
  const { data, error } = await sb.from('shop_banners').update(body).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ banner: data });
}

export async function DELETE(req: NextRequest) {
  const sb = createAdminClient();
  const { id } = await req.json();
  const { error } = await sb.from('shop_banners').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
