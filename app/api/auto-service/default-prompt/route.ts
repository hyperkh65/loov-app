import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { DEFAULT_BLOG_PROMPT_TEMPLATE } from '@/lib/auto-blog-prompt';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
  return NextResponse.json({ prompt: DEFAULT_BLOG_PROMPT_TEMPLATE });
}
