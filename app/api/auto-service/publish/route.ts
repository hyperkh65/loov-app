import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { article_id, blog_platforms = [], sns_platforms = [] } = await req.json();
  if (!article_id) return NextResponse.json({ error: 'article_id 필요' }, { status: 400 });

  const { data: article, error: fetchErr } = await supabase
    .from('bossai_auto_articles')
    .select('*')
    .eq('id', article_id)
    .eq('user_id', user.id)
    .single();

  if (fetchErr || !article) return NextResponse.json({ error: '글을 찾을 수 없습니다' }, { status: 404 });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`;
  const results: Record<string, { success: boolean; url?: string; error?: string }> = {};

  // 세션 쿠키 전달
  const cookieHeader = req.headers.get('cookie') || '';

  // 블로그 발행
  for (const platform of blog_platforms) {
    try {
      if (platform === 'naver') {
        const res = await fetch(`${baseUrl}/api/naver/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
          body: JSON.stringify({
            title: article.title,
            content: article.content,
            tags: article.focus_keyword ? [article.focus_keyword] : [],
          }),
        });
        const data = await res.json();
        results.naver = res.ok ? { success: true, url: data.url } : { success: false, error: data.error };
      } else if (platform === 'blogger') {
        const res = await fetch(`${baseUrl}/api/blogger/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
          body: JSON.stringify({
            title: article.title,
            content: article.content,
            labels: article.focus_keyword ? [article.focus_keyword] : [],
          }),
        });
        const data = await res.json();
        results.blogger = res.ok ? { success: true, url: data.url } : { success: false, error: data.error };
      } else if (platform === 'wordpress') {
        const res = await fetch(`${baseUrl}/api/wordpress/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
          body: JSON.stringify({
            title: article.title,
            content: article.content,
            tags: article.focus_keyword ? [article.focus_keyword] : [],
            status: 'publish',
          }),
        });
        const data = await res.json();
        results.wordpress = res.ok ? { success: true, url: data.url } : { success: false, error: data.error };
      }
    } catch (err) {
      results[platform] = { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // SNS 발행
  if (sns_platforms.length > 0) {
    try {
      const snsContent = `${article.title}\n\n${article.meta_description || ''}`;
      const res = await fetch(`${baseUrl}/api/sns/post-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
        body: JSON.stringify({
          content: snsContent,
          platforms: sns_platforms,
          media_urls: article.representative_image_url ? [article.representative_image_url] : [],
        }),
      });
      const data = await res.json();
      if (data.results) {
        for (const r of data.results) {
          results[`sns_${r.platform}`] = { success: r.success, error: r.error };
        }
      }
    } catch (err) {
      results.sns = { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const anySuccess = Object.values(results).some(r => r.success);
  const publishedUrls: Record<string, string> = {};
  for (const [k, v] of Object.entries(results)) {
    if (v.success && v.url) publishedUrls[k] = v.url;
  }

  // 상태 업데이트
  await supabase
    .from('bossai_auto_articles')
    .update({
      status: anySuccess ? 'published' : 'failed',
      blog_platforms,
      sns_platforms,
      published_urls: publishedUrls,
      published_at: anySuccess ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', article_id)
    .eq('user_id', user.id);

  return NextResponse.json({ results, published_urls: publishedUrls });
}
