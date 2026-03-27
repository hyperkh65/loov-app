import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const language = searchParams.get('language');

    let query = supabase
      .from('language_vocabulary')
      .select('*')
      .eq('user_id', user.id)
      .order('level', { ascending: true })
      .order('next_review', { ascending: true });

    if (language) {
      query = query.eq('language', language);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ words: data || [] });
  } catch (error) {
    console.error('Vocabulary GET error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

    const body = await req.json() as {
      language: string;
      word: string;
      translation: string;
      pronunciation?: string;
      example?: string;
      context?: string;
    };

    const { language, word, translation, pronunciation, example, context } = body;

    if (!language || !word || !translation) {
      return NextResponse.json({ error: '언어, 단어, 번역은 필수입니다' }, { status: 400 });
    }

    // Upsert: update if already exists, insert if new
    const { data, error } = await supabase
      .from('language_vocabulary')
      .upsert(
        {
          user_id: user.id,
          language,
          word,
          translation,
          pronunciation: pronunciation || null,
          example: example || null,
          context: context || null,
          level: 0,
          next_review: new Date().toISOString(),
        },
        { onConflict: 'user_id,language,word' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ word: data });
  } catch (error) {
    console.error('Vocabulary POST error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

    const body = await req.json() as {
      id: string;
      level?: number;
      next_review?: string;
    };

    const { id, level, next_review } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID가 필요합니다' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (level !== undefined) updates.level = level;
    if (next_review !== undefined) updates.next_review = next_review;

    const { data, error } = await supabase
      .from('language_vocabulary')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ word: data });
  } catch (error) {
    console.error('Vocabulary PATCH error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID가 필요합니다' }, { status: 400 });
    }

    const { error } = await supabase
      .from('language_vocabulary')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Vocabulary DELETE error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
