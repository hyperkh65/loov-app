/** 발행 결과에서 "블로그 글 주소"를 고른다(영상 설명란·댓글에 넣을 주소). 카페 주소는 절대 고르지 않는다. */
export const isBlogKey = (k: string) => k === 'naver' || k === 'tistory' || k === 'blogger' || k.startsWith('wordpress_') || k.startsWith('wp_');
const isCafeUrl = (u: string) => /^https?:\/\/(m\.)?cafe\.(naver|daum)\.(com|net)\//i.test(u) || /^https?:\/\/[^/]*cafe[^/]*\.(naver|daum)\./i.test(u);
export const isBlogUrl = (u?: string | null): u is string => !!u && /^https?:\/\//i.test(u) && !isCafeUrl(u);

type R = Record<string, { success?: boolean; url?: string } | undefined>;
const rank = (k: string) => (k.startsWith('wordpress_') || k.startsWith('wp_') ? 0 : k === 'tistory' ? 1 : k === 'blogger' ? 2 : 3); // 내 사이트(워드프레스) 우선

export function pickBlogUrl(results?: R | null, published?: Record<string, string> | null): string {
  const cands: Array<[string, string]> = [];
  for (const [k, r] of Object.entries(results || {})) if (isBlogKey(k) && r?.success && isBlogUrl(r.url)) cands.push([k, r.url as string]);
  for (const [k, u] of Object.entries(published || {})) if (isBlogKey(k) && isBlogUrl(u)) cands.push([k, u]);
  cands.sort((a, b) => rank(a[0]) - rank(b[0]));
  return cands[0]?.[1] || '';
}
