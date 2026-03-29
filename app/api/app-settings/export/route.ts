import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

// 전체 설정 내보내기 (실제 값 반환)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const admin = createAdminClient();

  // app_settings (API 키 등)
  const { data: settingsRow } = await admin
    .from('app_settings')
    .select('settings, updated_at')
    .eq('id', 1)
    .single();

  // bossai_company_settings (Notion, 회사 설정 등)
  const { data: companyRow } = await admin
    .from('bossai_company_settings')
    .select('notion_config, company_name, industry, description')
    .eq('user_id', user.id)
    .single();

  const exportData = {
    version: 2,
    exported_at: new Date().toISOString(),
    exported_by: user.email,
    app_settings: settingsRow?.settings || {},
    company_settings: {
      notion_config: companyRow?.notion_config || {},
      company_name: companyRow?.company_name || '',
      industry: companyRow?.industry || '',
      description: companyRow?.description || '',
    },
  };

  return NextResponse.json(exportData);
}
