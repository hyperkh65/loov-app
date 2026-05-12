import { createAdminClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';
import { refreshBloggerToken } from '@/lib/blogger-token';
import type { Schedule, BlogAutoConfig } from './index';

function parseAIOutput(text: string): { title: string; content: string; metaDescription: string; labels: string[] } {
  text = text.replace(/```[\w]*\n?/g, '').trim();

  const getSection = (tag: string) => {
    const marker = `[[[${tag}]]]`;
    const ALL = ['TITLE', 'META', 'LABELS', 'CONTENT'];
    const start = text.indexOf(marker);
    if (start < 0) return '';
    const from = start + marker.length;
    let end = text.length;
    for (const t of ALL) {
      if (t === tag) continue;
      const pos = text.indexOf(`[[[${t}]]]`, from);
      if (pos >= 0 && pos < end) end = pos;
    }
    return text.slice(from, end).trim();
  };

  const title = getSection('TITLE');
  const metaDescription = getSection('META');
  const labels = getSection('LABELS').split(',').map(s => s.trim()).filter(Boolean);
  const content = getSection('CONTENT');

  if (!title && !content) {
    try {
      const m = text.match(/\{[\s\S]*\}/)?.[0] || text;
      const j = JSON.parse(m) as { title?: string; content?: string; metaDescription?: string; labels?: string[] };
      return {
        title: j.title || '',
        content: j.content || '',
        metaDescription: j.metaDescription || '',
        labels: Array.isArray(j.labels) ? j.labels : [],
      };
    } catch { /* ignore */ }
  }
  return { title, content, metaDescription, labels };
}

async function getBloggerTokenAdmin(userId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: tokenRow } = await supabase
    .from('bossai_blogger_tokens')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!tokenRow) return null;

  const expiresAt = new Date(tokenRow.expires_at).getTime();
  if (expiresAt > Date.now() + 5 * 60 * 1000) return tokenRow.access_token;

  if (!tokenRow.refresh_token) return null;
  const refreshed = await refreshBloggerToken(tokenRow.refresh_token);
  if (!refreshed) return null;

  await supabase
    .from('bossai_blogger_tokens')
    .update({ access_token: refreshed.access_token, expires_at: refreshed.expires_at, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  return refreshed.access_token;
}

async function publishToBlogger(accessToken: string, blogId: string, title: string, content: string, labels: string[]): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content, labels, kind: 'blogger#post' }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `Blogger API 오류 ${res.status}`);
  }
  const data = await res.json();
  return data.url || data.id || '';
}

async function publishToWordPress(wpUrl: string, username: string, appPassword: string, title: string, content: string): Promise<string> {
  const creds = Buffer.from(`${username}:${appPassword}`).toString('base64');
  const apiUrl = `${wpUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content, status: 'publish' }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WordPress API 오류 ${res.status}: ${err.slice(0, 100)}`);
  }
  const data = await res.json();
  return data.link || '';
}

export async function runBlogAuto(schedule: Schedule): Promise<{ keyword: string; url: string; title: string }> {
  const config = schedule.config as BlogAutoConfig;

  if (!config.keywords?.length) throw new Error('키워드가 설정되지 않았습니다');

  const idx = schedule.keyword_index % config.keywords.length;
  const keyword = config.keyword_mode === 'random'
    ? config.keywords[Math.floor(Math.random() * config.keywords.length)]
    : config.keywords[idx];

  const outputRule = `\n\n반드시 아래 구분자 형식으로만 출력 (설명/코드블록 없이):\n[[[TITLE]]]\nSEO 제목 (60자 이내)\n[[[META]]]\n메타 설명 (150자 이내)\n[[[LABELS]]]\n태그1,태그2,태그3\n[[[CONTENT]]]\nHTML 본문 전체`;

  const prompt = config.content_type === 'product'
    ? `너는 쿠팡 파트너스 수익형 블로그 전문 마케터야. "${keyword}"에 대한 수익성 높은 구매 유도 글을 써줘.\n\n작성 규칙:\n- 제목: "추천", "순위", "비교", "가성비" 키워드 활용한 클릭유도형 SEO 제목\n- 본문: 최소 1500자, HTML 형식(h2/h3/p/ul 사용)\n- 구성: 도입(공감) → 상품 소개(장점+사용상황) → 가격/스펙 비교 → 구매 CTA\n- "광고", "홍보", "리뷰", "후기", "추천드립니다" 사용 금지${outputRule}`
    : `너는 검색 최적화 전문 블로거야. "${keyword}"에 대한 깊이 있는 지식 정보 글을 써줘.\n\n작성 규칙:\n- 제목: 검색 의도를 반영한 SEO 제목 (60자 이내)\n- 본문: 최소 2000자, HTML 형식\n- 구성: 목차 → h2 섹션 4-6개 → h3 소섹션 → 결론 요약\n- 전문적이지만 읽기 쉬운 문체${outputRule}`;

  const aiText = await generateText(prompt, 'qwen3');
  const { title, content, labels } = parseAIOutput(aiText);
  if (!title || !content) throw new Error('AI 글 생성 실패: 출력 파싱 오류');

  let publishedUrl = '';

  if (config.blog_platform === 'blogger') {
    const accessToken = await getBloggerTokenAdmin(schedule.user_id);
    if (!accessToken) throw new Error('Blogger 계정이 연결되지 않았습니다');
    const blogId = config.blogger_blog_id || '7951763866955162015';
    publishedUrl = await publishToBlogger(accessToken, blogId, title, content, labels);
  } else if (config.blog_platform === 'wordpress') {
    if (!config.wp_url || !config.wp_username || !config.wp_app_password)
      throw new Error('WordPress 설정(URL/사용자명/앱 패스워드)이 불완전합니다');
    publishedUrl = await publishToWordPress(config.wp_url, config.wp_username, config.wp_app_password, title, content);
  }

  // 키워드 인덱스 업데이트 (rotate 모드)
  if (config.keyword_mode === 'rotate') {
    const supabase = createAdminClient();
    await supabase
      .from('bossai_schedules')
      .update({ keyword_index: (idx + 1) % config.keywords.length })
      .eq('id', schedule.id);
  }

  return { keyword, url: publishedUrl, title };
}
