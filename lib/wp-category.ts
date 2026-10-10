import { callAISimple } from '@/lib/ai-call';

// 2days.kr 전용 — 기존 카테고리에서만 고르고 절대 새로 만들지 않음. 못 정하면 Aboda.
export const isTwoDays = (siteUrl: string) => { try { return new URL(siteUrl).host === '2days.kr'; } catch { return false; } };

const SKIP = new Set([1, 21338, 21296]); // 미분류(리다이렉트 루프), 트렌드(별도 파이프라인), Featured
const ABODA = 75;
export type WpCat = { id: number; name: string; parent: number };

let cache: { at: number; list: WpCat[] } | null = null;
export async function listWpCategories(siteUrl: string): Promise<WpCat[]> {
  if (cache && Date.now() - cache.at < 600e3) return cache.list;
  const r = await fetch(`${siteUrl.replace(/\/$/, '')}/wp-json/wp/v2/categories?per_page=100&hide_empty=false&_fields=id,name,parent`, { signal: AbortSignal.timeout(10000) });
  const list = ((await r.json()) as WpCat[]).filter(c => !SKIP.has(c.id));
  cache = { at: Date.now(), list };
  return list;
}

export async function pickWpCategory(siteUrl: string, title: string, text = ''): Promise<number> {
  try {
    const list = await listWpCategories(siteUrl);
    const byId = new Map(list.map(c => [c.id, c]));
    const menu = list.map(c => `${c.id}: ${c.name}${c.parent && byId.get(c.parent) ? ` (상위: ${byId.get(c.parent)!.name})` : ''}`).join('\n');
    const out = await callAISimple(
      `블로그 글에 가장 알맞은 카테고리 ID 하나만 숫자로 답하세요. 목록에 없거나 애매하면 ${ABODA}.\n\n[카테고리]\n${menu}\n\n[제목] ${title}\n[본문 일부] ${text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600)}`,
      '당신은 블로그 카테고리 분류기입니다. 숫자 ID만 출력합니다.',
    );
    const id = Number(out.match(/\d+/)?.[0]);
    return byId.has(id) ? id : ABODA;
  } catch { return ABODA; }
}
