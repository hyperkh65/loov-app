/**
 * WeChat 백업 설정 API
 * GET  /api/wechat/config          — 현재 설정 조회
 * POST /api/wechat/config          — 설정 저장
 * GET  /api/wechat/config?download — config.json 파일 다운로드 (loov_token 자동 포함)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('bossai_company_settings')
    .select('wechat_config')
    .eq('user_id', user.id)
    .single();

  const cfg = data?.wechat_config || {};

  // ?download=true → config.json 파일 반환 (loov_token 자동 포함)
  if (req.nextUrl.searchParams.get('download') !== null) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token || '';

    const fileContent = JSON.stringify({
      my_wxid: cfg.my_wxid || '',
      nas_host: cfg.nas_host || 'hy64.synology.me',
      nas_port: cfg.nas_port || 22,
      nas_user: cfg.nas_user || '',
      nas_password: cfg.nas_password || '',
      nas_backup_dir: cfg.nas_backup_dir || '~/wechat_backup',
      openrouter_api_key: cfg.openrouter_api_key || '',
      anthropic_api_key: cfg.anthropic_api_key || '',
      loov_url: 'https://loov.co.kr',
      loov_token: token,
      hours_back: cfg.hours_back || 26,
    }, null, 2);

    return new NextResponse(fileContent, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="config.json"',
      },
    });
  }

  return NextResponse.json({ config: cfg });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  const { error } = await supabase
    .from('bossai_company_settings')
    .upsert({ user_id: user.id, wechat_config: body }, { onConflict: 'user_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
