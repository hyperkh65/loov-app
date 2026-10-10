/**
 * WeChat 전용 API 키 관리 (만료 없음)
 * GET  /api/wechat/apikey — 현재 키 조회 (또는 생성)
 * POST /api/wechat/apikey — 키 재발급
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { randomBytes } from 'crypto';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('bossai_company_settings')
    .select('wechat_api_key')
    .eq('user_id', user.id)
    .single();

  let apiKey = data?.wechat_api_key;
  if (!apiKey) {
    // 최초 자동 생성
    apiKey = 'wc_' + randomBytes(24).toString('hex');
    await supabase
      .from('bossai_company_settings')
      .upsert({ user_id: user.id, wechat_api_key: apiKey }, { onConflict: 'user_id' });
  }

  return NextResponse.json({ apiKey });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = 'wc_' + randomBytes(24).toString('hex');
  await supabase
    .from('bossai_company_settings')
    .upsert({ user_id: user.id, wechat_api_key: apiKey }, { onConflict: 'user_id' });

  return NextResponse.json({ apiKey });
}
