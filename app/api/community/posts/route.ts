import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const limit = parseInt(searchParams.get('limit') || '30');

    let query = supabase
      .from('bossai_posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (category && category !== '전체') {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ posts: data || [] });
  } catch (error) {
    console.error('Posts GET error:', error);
    return NextResponse.json({ posts: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { title, content, category, tags, authorName, authorAvatar } = body;

    if (!title?.trim() || !content?.trim()) {
      return NextResponse.json({ error: '제목과 내용을 입력해주세요' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('bossai_posts')
      .insert({
        user_id: user.id,
        author_name: authorName || user.email?.split('@')[0] || '익명',
        author_avatar: authorAvatar || '👤',
        title: title.trim(),
        content: content.trim(),
        category: category || '토론',
        tags: tags || [],
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ post: data });
  } catch (error) {
    console.error('Posts POST error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
