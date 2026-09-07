import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { searchAliExpressItems, getAliExpressItemDetail } from '@/lib/affiliate-engine/aliexpress-datahub';
import { upsertCoupangMatch } from '@/lib/affiliate-engine/coupang-match';
import { searchProducts } from '@/lib/coupang/api';
import { getSetting } from '@/lib/get-setting';

const SOURCE_NAME = '알리익스프레스 (영상 보유 상품)';

/**
 * 알리익스프레스에 실제 홍보 영상이 붙어있는(=영상 만들 가치가 있다고 이미 검증된) 인기
 * 상품을 찾아서, 그 상품명으로 쿠팡을 검색해 같은 카테고리의 매칭 상품을 찾는다.
 * 알리 영상 자체는 절대 재사용/다운로드하지 않음 — "이 종류 상품은 영상화할 만하다"는
 * 신호 + 참고용으로만 쓰고, 실제로 우리가 만드는 영상은 매칭된 쿠팡 상품 사진으로 렌더링.
 *
 * RapidAPI 무료 플랜은 월 100회 요청 한도라 검색 1회 + 후보당 상세조회 1회씩 소모됨 —
 * limit을 낮게 유지해야 함(기본 5 = 최대 6회 소모).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const keyword: string | undefined = body.keyword;
  const limit: number = Math.min(body.limit || 5, 10);
  if (!keyword?.trim()) return NextResponse.json({ error: 'keyword 필요 (RapidAPI 무료 한도가 작아 시드 키워드를 자동 순환하지 않음)' }, { status: 400 });

  const accessKey = await getSetting('COUPANG_ACCESS_KEY');
  const secretKey = await getSetting('COUPANG_SECRET_KEY');
  if (!accessKey || !secretKey) return NextResponse.json({ error: '쿠팡파트너스 API 키가 설정되지 않았습니다' }, { status: 400 });

  const admin = createAdminClient();

  // 소스 레지스트리에 없으면 생성
  let { data: source } = await admin.from('affiliate_sources').select('id').eq('user_id', user.id).eq('name', SOURCE_NAME).maybeSingle();
  if (!source) {
    const { data: created, error } = await admin.from('affiliate_sources').insert({
      user_id: user.id, name: SOURCE_NAME, source_type: 'ecommerce',
      discovery_method: 'API', usage_mode: 'PRODUCT_DISCOVERY',
      connector_status: 'CONNECTED', commercial_use_status: 'ALLOWED', enabled: true, priority: 30,
      notes: 'RapidAPI Aliexpress DataHub로 영상 보유 인기상품 탐색 — 알리 영상은 신호로만 사용, 재배포 안 함.',
    }).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    source = created;
  }

  const results: Array<{ title: string; hasVideo: boolean; coupangMatch?: string; status: string }> = [];

  try {
    const items = await searchAliExpressItems(keyword, limit);

    for (const item of items) {
      const detail = await getAliExpressItemDetail(item.itemId).catch(() => null);
      if (!detail?.videoUrl) {
        results.push({ title: item.title, hasVideo: false, status: 'SKIPPED_NO_VIDEO' });
        continue;
      }

      // 발굴 원본으로 기록 (영상 파일은 URL만 참조, 다운로드 안 함)
      const { data: sourceItem } = await admin.from('affiliate_source_items').upsert({
        user_id: user.id, source_id: source.id, external_id: item.itemId,
        url: item.itemUrl, title: item.title, thumbnail_url: detail.videoThumbnail || item.image,
        raw_metrics: { sales: item.sales, rating: item.averageStarRate, video_url: detail.videoUrl },
        status: 'PROCESSED',
      }, { onConflict: 'source_id,external_id' }).select('id').single();

      // 상품명으로 쿠팡 검색 → 매칭
      const coupangCandidates = await searchProducts(item.title, accessKey, secretKey).catch(() => []);
      const best = coupangCandidates.find(c => c.productImage);
      if (!best) {
        results.push({ title: item.title, hasVideo: true, status: 'NO_COUPANG_MATCH' });
        continue;
      }

      const match = await upsertCoupangMatch(admin, user.id, best, accessKey, secretKey);
      if (match.status === 'FAILED' || !match.productId) {
        results.push({ title: item.title, hasVideo: true, status: `매칭 실패: ${match.error || ''}` });
        continue;
      }

      if (sourceItem) {
        await admin.from('affiliate_product_aliases').upsert({
          user_id: user.id, product_id: match.productId, source_item_id: sourceItem.id,
          alias_name: item.title,
        }, { onConflict: 'product_id,source_item_id' });
      }

      results.push({ title: item.title, hasVideo: true, coupangMatch: match.name, status: match.status });
    }

    return NextResponse.json({ processed: results.length, results });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
