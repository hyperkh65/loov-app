import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { publish, slug, theme, pages } = body;

    if (slug !== undefined) {
      // slug 중복 확인
      const { data: existing } = await supabase
        .from('bossai_website_config')
        .select('user_id')
        .eq('slug', slug)
        .neq('user_id', user.id)
        .single();

      if (existing) {
        return NextResponse.json({ error: '이미 사용 중인 슬러그입니다. 다른 주소를 사용해주세요.' }, { status: 409 });
      }
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (slug !== undefined) updateData.slug = slug;
    if (theme !== undefined) updateData.theme = theme;
    if (pages !== undefined) updateData.pages = pages;
    if (publish !== undefined) updateData.is_published = publish;

    const { data, error } = await supabase
      .from('bossai_website_config')
      .upsert({ user_id: user.id, ...updateData })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      config: data,
      url: data.slug && data.is_published
        ? `https://${data.slug}.${process.env.NEXT_PUBLIC_MAIN_DOMAIN || 'loov.co.kr'}`
        : null,
    });
  } catch (error) {
    console.error('Website publish error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data } = await supabase
      .from('bossai_website_config')
      .select('*')
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({ config: data });
  } catch {
    return NextResponse.json({ config: null });
  }
}
