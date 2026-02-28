import { createClient } from '@supabase/supabase-js';

// 빌드/prerender 시 env가 없어도 throw하지 않도록 fallback 처리
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── 테이블 이름 (bossai_ 접두어) ─────────────────────────────
export const TABLES = {
  PROFILES:             'bossai_profiles',
  COMPANY_SETTINGS:     'bossai_company_settings',
  EMPLOYEES:            'bossai_employees',
  DIRECT_CHATS:         'bossai_direct_chats',
  MEETINGS:             'bossai_meetings',
  MEETING_MESSAGES:     'bossai_meeting_messages',
  PROJECTS:             'bossai_projects',
  DIRECTIVES:           'bossai_directives',
  DIRECTIVE_RESPONSES:  'bossai_directive_responses',
  SALES_LEADS:          'bossai_sales_leads',
  ACCOUNTING_ENTRIES:   'bossai_accounting_entries',
  MARKETING_CAMPAIGNS:  'bossai_marketing_campaigns',
  SCHEDULE_EVENTS:      'bossai_schedule_events',
  DAILY_REPORTS:        'bossai_daily_reports',
} as const;

// ── 현재 로그인 사용자 가져오기 ────────────────────────────────
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
