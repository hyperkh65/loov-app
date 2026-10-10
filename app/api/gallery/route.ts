import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');

  let query = supabase
    .from('gallery_items')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (category && category !== 'all') query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json() as {
    category: string; title?: string; memo?: string;
    image_url?: string; notion_page_id?: string; notion_page_url?: string;
    tags?: string[]; is_favorite?: boolean;
  };

  const { data, error } = await supabase.from('gallery_items').insert({
    user_id: user.id,
    category: body.category || 'personal',
    title: body.title || '',
    memo: body.memo || '',
    image_url: body.image_url || null,
    notion_page_id: body.notion_page_id || '',
    notion_page_url: body.notion_page_url || '',
    tags: body.tags || [],
    is_favorite: body.is_favorite || false,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// 비밀번호 검증
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { password } = await req.json() as { password: string };
  const savedPw = await getSetting('GALLERY_SECRET_PASSWORD');

  if (!savedPw) return NextResponse.json({ error: '비밀번호가 설정되지 않았습니다. 설정에서 먼저 등록해주세요.' }, { status: 400 });
  if (password !== savedPw) return NextResponse.json({ error: '비밀번호가 틀렸습니다.' }, { status: 401 });
  return NextResponse.json({ ok: true });
}
