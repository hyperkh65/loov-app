/**
 * RapidAPI "Aliexpress DataHub" 클라이언트. 알리익스프레스 공식 제휴 API 승인 전
 * 무료로 쓸 수 있는 대체 경로 — 인기 상품 검색 + 상품에 실제 홍보 영상이 있는지 확인하는
 * 용도로만 사용(공식 승인 나면 aliexpress.affiliate.hotproduct.query로 교체 가능).
 */
import { getSetting } from '@/lib/get-setting';

const HOST = 'aliexpress-datahub.p.rapidapi.com';

async function callDataHub(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const key = await getSetting('RAPIDAPI_KEY');
  if (!key) throw new Error('RAPIDAPI_KEY 설정이 필요합니다');

  const qs = new URLSearchParams(params);
  const res = await fetch(`https://${HOST}/${path}?${qs}`, {
    headers: { 'x-rapidapi-host': HOST, 'x-rapidapi-key': key },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Aliexpress DataHub 실패(${res.status})`);
  return res.json();
}

export interface AliItem {
  itemId: string;
  title: string;
  sales: number;
  itemUrl: string;
  image: string;
  averageStarRate?: number;
}

interface RawSearchItem {
  item: {
    itemId: string | number; title: string; sales: string;
    itemUrl: string; image: string; averageStarRate?: number;
  };
}

/** sort=salesDesc로 해당 키워드에서 잘 팔리는 순으로 상품 검색 (트렌드 랭킹 API가 없어 대신 씀) */
export async function searchAliExpressItems(keyword: string, limit = 10): Promise<AliItem[]> {
  const data = await callDataHub('item_search_2', { q: keyword, sort: 'salesDesc', page: '1' });
  const result = data.result as { resultList?: RawSearchItem[] } | undefined;
  const list = result?.resultList || [];
  return list.slice(0, limit).map(r => ({
    itemId: String(r.item.itemId),
    title: r.item.title,
    sales: parseInt(r.item.sales, 10) || 0,
    itemUrl: r.item.itemUrl?.startsWith('http') ? r.item.itemUrl : `https:${r.item.itemUrl}`,
    image: r.item.image?.startsWith('http') ? r.item.image : `https:${r.item.image}`,
    averageStarRate: r.item.averageStarRate,
  }));
}

export interface AliItemDetail {
  itemId: string;
  title: string;
  videoUrl: string | null;
  videoThumbnail: string | null;
}

interface RawItemDetail {
  title: string;
  video?: { url?: string; thumbnail?: string };
}

/** 이 상품에 알리 자체 홍보 영상이 있는지 확인 (없으면 videoUrl: null) */
export async function getAliExpressItemDetail(itemId: string): Promise<AliItemDetail | null> {
  const data = await callDataHub('item_detail', { itemId });
  const item = (data.result as { item?: RawItemDetail } | undefined)?.item;
  if (!item) return null;

  const rawVideoUrl = item.video?.url;
  const rawThumb = item.video?.thumbnail;
  return {
    itemId,
    title: item.title,
    videoUrl: rawVideoUrl ? (rawVideoUrl.startsWith('http') ? rawVideoUrl : `https:${rawVideoUrl}`) : null,
    videoThumbnail: rawThumb ? (rawThumb.startsWith('http') ? rawThumb : `https:${rawThumb}`) : null,
  };
}
