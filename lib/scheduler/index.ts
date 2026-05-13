/**
 * 스케줄러 공통 타입 및 유틸
 *
 * DB 테이블 (Supabase에서 직접 생성 필요):
 *
 * CREATE TABLE bossai_schedules (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id uuid NOT NULL,
 *   name text NOT NULL,
 *   type text NOT NULL,          -- 'blog_auto' | 'coupang_auto'
 *   is_active boolean DEFAULT true,
 *   interval_hours integer DEFAULT 24,
 *   run_at_hour integer DEFAULT 9,
 *   config jsonb DEFAULT '{}',
 *   last_run_at timestamptz,
 *   next_run_at timestamptz,
 *   last_status text,            -- 'success' | 'failed' | 'running'
 *   keyword_index integer DEFAULT 0,
 *   created_at timestamptz DEFAULT now()
 * );
 *
 * CREATE TABLE bossai_schedule_logs (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   schedule_id uuid REFERENCES bossai_schedules(id) ON DELETE CASCADE,
 *   user_id uuid,
 *   started_at timestamptz DEFAULT now(),
 *   finished_at timestamptz,
 *   status text DEFAULT 'running',
 *   summary text,
 *   result jsonb,
 *   error text
 * );
 */

export type ScheduleType = 'blog_auto' | 'coupang_auto' | 'agoda_auto' | 'shorts_auto' | 'instagram_auto';

export interface BlogAutoConfig {
  content_type: 'product' | 'info';
  blog_platform: 'blogger' | 'wordpress';
  blogger_blog_id?: string;
  wp_site_id?: string;
  // legacy fallback fields
  keywords?: string[];
  keyword_mode?: 'rotate' | 'random';
  wp_url?: string;
  wp_username?: string;
  wp_app_password?: string;
}

export interface CoupangAutoConfig {
  product_source: 'goldbox' | 'keyword';
  search_keywords?: string[];
  sns_platforms: string[];
  min_discount?: number;
}

export interface Schedule {
  id: string;
  user_id: string;
  name: string;
  type: ScheduleType;
  is_active: boolean;
  interval_hours: number;
  run_at_hour: number;
  config: BlogAutoConfig | CoupangAutoConfig | AgodaAutoConfig | ShortsAutoConfig | InstagramAutoConfig;
  last_run_at: string | null;
  next_run_at: string | null;
  last_status: string | null;
  keyword_index: number;
  created_at: string;
}

export interface ScheduleLog {
  id: string;
  schedule_id: string;
  user_id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'failed';
  summary: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
}

export interface AgodaAutoConfig {
  cities: Array<{ id: number; name: string; nameEn: string }>;
  city_mode: 'rotate' | 'random';
  blog_platform: 'blogger' | 'wordpress';
  blogger_blog_id?: string;
  wp_site_id?: string;
  wp_url?: string;
  wp_username?: string;
  wp_app_password?: string;
  travel_style?: string;
  sns_platforms?: string[];
}

export interface ShortsAutoConfig {
  topics: string[];
  topic_mode: 'rotate' | 'random';
  duration: 30 | 60 | 120;
  tone: string;
  platform: string;
  save_to_blog: boolean;
  blog_platform?: 'blogger' | 'wordpress';
  blogger_blog_id?: string;
  wp_site_id?: string;
  wp_url?: string;
  wp_username?: string;
  wp_app_password?: string;
}

export interface InstagramAutoConfig {
  topics: string[];
  topic_mode: 'rotate' | 'random';
  tone: string;
  auto_publish: boolean;
}

export const INTERVAL_OPTIONS = [
  { value: 1,   label: '매시간' },
  { value: 3,   label: '3시간마다' },
  { value: 6,   label: '6시간마다' },
  { value: 12,  label: '12시간마다' },
  { value: 24,  label: '매일' },
  { value: 48,  label: '이틀에 한 번' },
  { value: 168, label: '주 1회' },
];

export function computeNextRunAt(intervalHours: number, runAtHour: number, lastRunAt: string | null): Date {
  const now = new Date();

  if (!lastRunAt) {
    // 최초 실행: 오늘 run_at_hour 시각, 이미 지났으면 intervalHours 후
    if (intervalHours >= 24) {
      const candidate = new Date();
      candidate.setHours(runAtHour, 0, 0, 0);
      if (candidate > now) return candidate;
      candidate.setTime(candidate.getTime() + intervalHours * 3600000);
      return candidate;
    }
    return new Date(now.getTime() + intervalHours * 3600000);
  }

  const last = new Date(lastRunAt);
  const next = new Date(last.getTime() + intervalHours * 3600000);

  if (intervalHours >= 24) {
    // 일간 이상: run_at_hour에 맞춤
    next.setHours(runAtHour, 0, 0, 0);
    if (next <= now) next.setTime(next.getTime() + intervalHours * 3600000);
  }

  return next > now ? next : new Date(now.getTime() + 60000); // 최소 1분 후
}

export function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const past = diff < 0;

  if (abs < 60000) return past ? '방금 전' : '곧';
  if (abs < 3600000) {
    const m = Math.round(abs / 60000);
    return past ? `${m}분 전` : `${m}분 후`;
  }
  if (abs < 86400000) {
    const h = Math.round(abs / 3600000);
    return past ? `${h}시간 전` : `${h}시간 후`;
  }
  const d = Math.round(abs / 86400000);
  return past ? `${d}일 전` : `${d}일 후`;
}
