import { callAISimple } from '@/lib/ai-call';

// 2days.kr 전용 — 기존 카테고리에서만 고르고 절대 새로 만들지 않음. 못 정하면 Aboda.
export const isTwoDays = (siteUrl: string) => { try { return new URL(siteUrl).host === '2days.kr'; } catch { return false; } };

const SKIP = new Set([1, 21338, 21296]); // 미분류(리다이렉트 루프), 트렌드(별도 파이프라인), Featured
const ABODA = 75;
export type WpCat = { id: number; name: string; parent: number };

// 2days.kr 카테고리 스냅샷(2026-11-09). 앱 컨테이너가 같은 NAS의 자기 공개주소(2days.kr)를 호출하는
// 구조라 간헐적으로 막힐 수 있어(hairpin NAT), 실시간 조회가 실패하면 이 목록으로 드롭다운이 뜨게 함.
// 카테고리가 추가/변경되면 실시간 조회가 성공할 때 최신으로 바뀜 — 이 목록은 비상용.
const FALLBACK_CATEGORIES: WpCat[] = [
  { id: 75, name: "Aboda", parent: 0 },
  { id: 3353, name: "aboda_edu", parent: 75 },
  { id: 3271, name: "aboda_eng", parent: 75 },
  { id: 3355, name: "aboda_gongin", parent: 75 },
  { id: 4362, name: "aboda_study", parent: 75 },
  { id: 3354, name: "aboda_suhak", parent: 75 },
  { id: 7088, name: "aboda_trade", parent: 75 },
  { id: 755, name: "blog", parent: 3260 },
  { id: 2043, name: "Computer", parent: 928 },
  { id: 3260, name: "Contents", parent: 0 },
  { id: 3259, name: "drama", parent: 3260 },
  { id: 1186, name: "dream", parent: 956 },
  { id: 968, name: "Economic", parent: 0 },
  { id: 314, name: "English", parent: 0 },
  { id: 3623, name: "Food", parent: 0 },
  { id: 3269, name: "hidden-gem", parent: 3623 },
  { id: 3266, name: "History", parent: 932 },
  { id: 928, name: "IT", parent: 0 },
  { id: 932, name: "Korea Now", parent: 0 },
  { id: 315, name: "license", parent: 932 },
  { id: 18632, name: "Life", parent: 0 },
  { id: 3264, name: "Management", parent: 932 },
  { id: 3477, name: "movie", parent: 3260 },
  { id: 317, name: "program", parent: 928 },
  { id: 3261, name: "song", parent: 3260 },
  { id: 3378, name: "sports", parent: 932 },
  { id: 3262, name: "Star", parent: 3260 },
  { id: 312, name: "Stock", parent: 932 },
  { id: 25, name: "Study", parent: 932 },
  { id: 3357, name: "tips", parent: 956 },
  { id: 3478, name: "Wellfare", parent: 932 },
  { id: 3270, name: "youtube", parent: 3260 },
  { id: 958, name: "경제 상식", parent: 968 },
  { id: 967, name: "국내 여행", parent: 956 },
  { id: 956, name: "라이프", parent: 0 },
  { id: 954, name: "문화", parent: 932 },
  { id: 959, name: "법률", parent: 932 },
  { id: 1634, name: "전기전자", parent: 928 },
  { id: 966, name: "전자 제품", parent: 969 },
  { id: 969, name: "테크", parent: 928 },
  { id: 970, name: "해외", parent: 956 },
  { id: 971, name: "해외 토픽", parent: 956 }
];

let cache: { at: number; list: WpCat[] } | null = null;
export async function listWpCategories(siteUrl: string): Promise<WpCat[]> {
  if (cache && Date.now() - cache.at < 600e3) return cache.list;
  try {
    const r = await fetch(`${siteUrl.replace(/\/$/, '')}/wp-json/wp/v2/categories?per_page=100&hide_empty=false&_fields=id,name,parent`, { signal: AbortSignal.timeout(6000) });
    const json = await r.json();
    if (!Array.isArray(json)) throw new Error('카테고리 응답이 배열이 아님');
    const list = (json as WpCat[]).filter(c => !SKIP.has(c.id));
    cache = { at: Date.now(), list };
    return list;
  } catch (e) {
    console.error('[wp-category] 실시간 조회 실패 → 스냅샷 사용:', String(e).slice(0, 150));
    return isTwoDays(siteUrl) ? FALLBACK_CATEGORIES : [];
  }
}

export async function pickWpCategory(siteUrl: string, title: string, text = ''): Promise<number> {
  try {
    const list = await listWpCategories(siteUrl);
    const byId = new Map(list.map(c => [c.id, c]));
    const menu = list.map(c => `${c.id}: ${c.name}${c.parent && byId.get(c.parent) ? ` (상위: ${byId.get(c.parent)!.name})` : ''}`).join('\n');
    const out = await callAISimple(
      `블로그 글에 가장 알맞은 카테고리 ID 하나만 숫자로 답하세요. 목록에 없거나 애매하면 ${ABODA}.\n\n[카테고리]\n${menu}\n\n[제목] ${title}\n[본문 일부] ${text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600)}`,
      '당신은 블로그 카테고리 분류기입니다. 숫자 ID만 출력합니다.',
      // Gemini 키가 무효(API_KEY_INVALID)라 기본값(gemini)으로 부르면 폴백까지 ~65초 걸림 — Groq 직접 호출은 ~1.3초(2026-11-09 실측)
      'groq',
    );
    const id = Number(out.match(/\d+/)?.[0]);
    return byId.has(id) ? id : ABODA;
  } catch { return ABODA; }
}

export async function relatedPostsBox(siteUrl: string, catId: number): Promise<string> {
  try {
    const r = await fetch(`${siteUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts?categories=${catId}&per_page=3&_fields=link,title`, { signal: AbortSignal.timeout(8000) });
    const posts = (await r.json()) as Array<{ link: string; title: { rendered: string } }>;
    if (!Array.isArray(posts) || !posts.length) return '';
    return `<h2>함께 읽으면 좋은 글</h2><ul>${posts.map(p => `<li><a href="${p.link}">${p.title.rendered.replace(/<[^>]+>/g, '')}</a></li>`).join('')}</ul>`;
  } catch { return ''; }
}
