/**
 * GET /api/wechat/token
 * 현재 로그인 세션의 access_token 반환 (wechat_pipeline.py loov_token 용)
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ token: session.access_token });
}
