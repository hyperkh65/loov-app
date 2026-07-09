import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: '로그인 필요' }, { status: 401 });

  const { data: settings } = await supabase
    .from('bossai_auto_settings')
    .select('last_run_at, last_run_status, last_run_count')
    .eq('user_id', user.id)
    .single();

  if (!settings?.last_run_at) {
    return Response.json({ is_running: false, started_at: null, articles: [] });
  }

  const is_running = settings.last_run_status === 'running';

  // last_run_at 기준으로 해당 실행에서 생성된 article 조회 (앞뒤 2분 여유)
  const windowStart = new Date(new Date(settings.last_run_at).getTime() - 2 * 60 * 1000).toISOString();

  const { data: articles } = await supabase
    .from('bossai_auto_articles')
    .select('keyword, focus_keyword, status, title, created_at, published_urls')
    .eq('user_id', user.id)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: true });

  return Response.json({
    is_running,
    started_at: settings.last_run_at,
    last_run_status: settings.last_run_status,
    last_run_count: settings.last_run_count,
    articles: (articles || []).map(a => ({
      keyword: a.keyword || a.focus_keyword || '',
      status: a.status,
      title: a.title,
      published_urls: a.published_urls || {},
    })),
  });
}
