import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { id: postId } = await params;

    const { data, error } = await supabase
      .from('bossai_post_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ comments: data || [] });
  } catch (error) {
    console.error('Comments GET error:', error);
    return NextResponse.json({ comments: [] });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: postId } = await params;
    const body = await req.json();
    const { content, authorName } = body;

    if (!content?.trim()) {
      return NextResponse.json({ error: '내용을 입력해주세요' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('bossai_post_comments')
      .insert({
        post_id: postId,
        user_id: user.id,
        author_name: authorName || user.email?.split('@')[0] || '익명',
        content: content.trim(),
      })
      .select()
      .single();

    if (error) throw error;

    // 댓글 수 증가
    const { data: post } = await supabase.from('bossai_posts').select('comments_count').eq('id', postId).single();
    await supabase.from('bossai_posts').update({ comments_count: (post?.comments_count || 0) + 1 }).eq('id', postId);

    return NextResponse.json({ comment: data });
  } catch (error) {
    console.error('Comments POST error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
