import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('bossai_product_detail_projects')
    .select('id, name, product_name, product_category, brand, template_id, status, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ projects: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, product_name, product_model, product_category, brand, template_id } = body;
  if (!name?.trim()) return NextResponse.json({ error: '프로젝트 이름이 필요합니다' }, { status: 400 });

  const { data, error } = await supabase
    .from('bossai_product_detail_projects')
    .insert({
      user_id: user.id,
      name: name.trim(),
      product_name: product_name ?? '',
      product_model: product_model ?? '',
      product_category: product_category ?? '',
      brand: brand ?? '',
      template_id: template_id ?? 'pure-white',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  const { data, error } = await supabase
    .from('bossai_product_detail_projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  await supabase.from('bossai_product_detail_projects').delete().eq('id', id).eq('user_id', user.id);
  return NextResponse.json({ deleted: true });
}
