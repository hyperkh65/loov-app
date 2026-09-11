/**
 * LOOV 소유 사이트끼리 내부 상호링크 — 외부 플랫폼(핀터레스트/미디엄) 백링크가
 * 전부 막혀서(정책상 차단), 제어 가능한 자체 자산끼리라도 링크를 걸어 체류시간/
 * 페이지뷰를 늘리고 SEO 내부링크 신호를 주기 위함. 새 글 발행 시 제목 키워드로
 * 다른 사이트를 검색해서 관련 글 하나를 찾아 본문 끝에 링크를 붙인다.
 */
import { createAdminClient } from '@/lib/supabase-server';

export interface CrossLinkResult {
  url: string;
  title: string;
}

/** excludeSiteUrl과 다른 LOOV 사이트들 중에서 keyword로 검색해 관련 글 하나를 찾음 */
export async function findCrossSiteLink(excludeSiteUrl: string, keyword: string): Promise<CrossLinkResult | null> {
  if (!keyword?.trim()) return null;
  const admin = createAdminClient();
  const { data: sites } = await admin.from('wordpress_sites').select('site_url').eq('is_active', true);
  if (!sites?.length) return null;

  let excludeHost = '';
  try { excludeHost = new URL(excludeSiteUrl).host; } catch { /* ignore */ }

  // 매번 같은 사이트만 링크 걸리지 않도록 순서를 섞음
  const others = sites.filter(s => {
    try { return new URL(s.site_url).host !== excludeHost; } catch { return true; }
  }).sort(() => Math.random() - 0.5);

  // AI가 만든 제목은 "서인영 남편 서인영 이혼..."처럼 단어가 반복되는 경우가
  // 많아서 앞 N단어를 그대로 이어붙이면 워드프레스 검색(다단어 AND에 가까움)이
  // 매칭을 못 찾는 게 실사용 중 확인됨 — 중복 제거한 첫 단어(보통 핵심
  // 인물/주제명) 하나만 검색어로 써서 매칭률을 높임
  const words = keyword.split(' ').filter(Boolean);
  const searchTerm = [...new Set(words)][0] || words[0] || keyword;
  if (!searchTerm || searchTerm.length < 2) return null;

  for (const site of others) {
    try {
      const res = await fetch(
        `${site.site_url.replace(/\/$/, '')}/wp-json/wp/v2/posts?search=${encodeURIComponent(searchTerm)}&per_page=1&status=publish`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) continue;
      const posts = await res.json() as Array<{ link?: string; title?: { rendered?: string } }>;
      const post = posts?.[0];
      if (post?.link && post.title?.rendered) {
        return { url: post.link, title: post.title.rendered.replace(/<[^>]+>/g, '').trim() };
      }
    } catch { continue; }
  }
  return null;
}

/** 본문 끝에 관련 글 링크 박스를 붙임 (없으면 원본 content 그대로 반환) */
export function appendCrossLink(content: string, link: CrossLinkResult | null): string {
  if (!link) return content;
  const box = `<p style="margin:24px 0 0;padding:14px 18px;background:#f6f6f6;border-left:3px solid #888;border-radius:4px;">🔗 함께 읽으면 좋은 글: <a href="${link.url}" target="_blank" rel="noopener">${link.title}</a></p>`;
  return content + box;
}
