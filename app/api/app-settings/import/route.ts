import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { invalidateSettingsCache } from '@/lib/get-setting';

interface ImportData {
  version?: number;
  app_settings?: Record<string, string>;
  company_settings?: {
    notion_config?: Record<string, string>;
    company_name?: string;
    industry?: string;
    description?: string;
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  let importData: ImportData;
  try {
    importData = await req.json() as ImportData;
  } catch {
    return NextResponse.json({ error: '잘못된 JSON 형식' }, { status: 400 });
  }

  const admin = createAdminClient();
  const results: string[] = [];

  // app_settings 복원
  if (importData.app_settings && typeof importData.app_settings === 'object') {
    const { data: existing } = await admin
      .from('app_settings')
      .select('settings')
      .eq('id', 1)
      .single();

    const current = (existing?.settings as Record<string, string>) || {};
    const merged = { ...current };

    for (const [key, val] of Object.entries(importData.app_settings)) {
      if (val && typeof val === 'string') merged[key] = val;
    }

    const { error } = await admin
      .from('app_settings')
      .update({ settings: merged, updated_at: new Date().toISOString() })
      .eq('id', 1);

    if (!error) {
      results.push(`API 키 ${Object.keys(importData.app_settings).length}개 복원`);
      invalidateSettingsCache();
    } else {
      results.push(`API 키 복원 실패: ${error.message}`);
    }
  }

  // company_settings 복원 (Notion 등)
  if (importData.company_settings) {
    const cs = importData.company_settings;
    const updateObj: Record<string, unknown> = {};
    if (cs.notion_config && Object.keys(cs.notion_config).length > 0) updateObj.notion_config = cs.notion_config;
    if (cs.company_name) updateObj.company_name = cs.company_name;
    if (cs.industry) updateObj.industry = cs.industry;
    if (cs.description) updateObj.description = cs.description;

    if (Object.keys(updateObj).length > 0) {
      // upsert
      const { error } = await admin
        .from('bossai_company_settings')
        .upsert({ user_id: user.id, ...updateObj }, { onConflict: 'user_id' });

      if (!error) results.push('회사 설정 복원');
      else results.push(`회사 설정 복원 실패: ${error.message}`);
    }
  }

  return NextResponse.json({ ok: true, results });
}
