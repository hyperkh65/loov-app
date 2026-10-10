import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: postId } = await params;

    // 이미 좋아요 눌렀는지 확인
    const { data: existing } = await supabase
      .from('bossai_post_likes')
      .select('post_id')
      .eq('post_id', postId)
      .eq('user_id', user.id)
      .single();

    if (existing) {
      // 좋아요 취소
      await supabase.from('bossai_post_likes').delete().eq('post_id', postId).eq('user_id', user.id);
      // RPC가 없으면 직접 업데이트로 처리

      const { data: post } = await supabase.from('bossai_posts').select('likes').eq('id', postId).single();
      const newLikes = Math.max(0, (post?.likes || 1) - 1);
      await supabase.from('bossai_posts').update({ likes: newLikes }).eq('id', postId);

      return NextResponse.json({ liked: false, likes: newLikes });
    } else {
      // 좋아요 추가
      await supabase.from('bossai_post_likes').insert({ post_id: postId, user_id: user.id });

      const { data: post } = await supabase.from('bossai_posts').select('likes').eq('id', postId).single();
      const newLikes = (post?.likes || 0) + 1;
      await supabase.from('bossai_posts').update({ likes: newLikes }).eq('id', postId);

      return NextResponse.json({ liked: true, likes: newLikes });
    }
  } catch (error) {
    console.error('Like toggle error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
