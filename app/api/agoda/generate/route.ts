import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import { generateText } from '@/lib/auto-blog-ai';

interface AgodaHotel {
  hotelId: number;
  hotelName: string;
  starRating: number;
  reviewScore: number;
  reviewCount: number;
  currency: string;
  dailyRate: number;
  crossedOutRate: number;
  discountPercentage: number;
  imageURL: string;
  landingURL: string;
  includeBreakfast: boolean;
  freeWifi: boolean;
}


// Pixabay에서 호텔/도시 관련 이미지 검색
async function searchPixabayImages(query: string, count: number = 3): Promise<string[]> {
  try {
    const apiKey = await getSetting('PIXABAY_API_KEY');
    if (!apiKey) return [];
    const params = new URLSearchParams({
      key: apiKey,
      q: query,
      image_type: 'photo',
      per_page: String(count + 2),
      safesearch: 'true',
      min_width: '800',
      order: 'popular',
    });
    const res = await fetch(`https://pixabay.com/api/?${params}`);
    if (!res.ok) return [];
    const data = await res.json() as { hits?: { largeImageURL: string }[] };
    return (data.hits || []).map(h => h.largeImageURL).slice(0, count);
  } catch {
    return [];
  }
}

// 호텔 이미지 갤러리 카드 빌더 (메인 1장 + 추가 최대 3장)
function buildHotelImageCard(
  hotel: AgodaHotel,
  formatPrice: (p: number) => string,
  extraImages: string[] = [],
): string {
  const stars = '⭐'.repeat(Math.round(hotel.starRating));
  const discount = hotel.discountPercentage > 0
    ? `<span style="background:#ef4444;color:#fff;padding:2px 8px;border-radius:4px;font-size:13px;font-weight:bold;margin-left:8px">-${Math.round(hotel.discountPercentage)}%</span>`
    : '';
  const originalPrice = hotel.crossedOutRate > 0
    ? `<span style="text-decoration:line-through;color:#999;font-size:13px;margin-right:6px">${formatPrice(hotel.crossedOutRate)}</span>`
    : '';
  const amenities = [
    hotel.freeWifi ? '📶 무료 Wi-Fi' : '',
    hotel.includeBreakfast ? '🍳 조식 포함' : '',
  ].filter(Boolean).join(' &nbsp;|&nbsp; ');

  // 모든 이미지 수집 (Agoda 메인 + Pixabay 추가)
  const allImages = [hotel.imageURL, ...extraImages].filter(Boolean);

  // 메인 이미지 (전체 너비)
  const mainImageHtml = allImages[0]
    ? `<img src="${allImages[0]}" alt="${hotel.hotelName}" style="width:100%;height:260px;object-fit:cover;display:block">`
    : '';

  // 추가 이미지 갤러리 (2~4장, 그리드)
  const galleryImages = allImages.slice(1, 4);
  const galleryHtml = galleryImages.length > 0 ? `
<div style="display:grid;grid-template-columns:repeat(${galleryImages.length},1fr);gap:3px;margin-top:3px">
  ${galleryImages.map((url, i) => `<img src="${url}" alt="${hotel.hotelName} ${i + 2}" style="width:100%;height:160px;object-fit:cover;display:block">`).join('\n  ')}
</div>` : '';

  return `
<div style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin:24px 0;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  ${mainImageHtml}${galleryHtml}
  <div style="padding:16px">
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
      <span style="font-size:14px">${stars}</span>
      <span style="background:#fef3c7;color:#92400e;padding:2px 10px;border-radius:20px;font-size:13px;font-weight:600">리뷰 ${hotel.reviewScore}/10</span>
      <span style="color:#6b7280;font-size:12px">(${hotel.reviewCount.toLocaleString('ko-KR')}개)</span>
    </div>
    <div style="margin-bottom:10px">
      ${originalPrice}
      <span style="font-size:20px;font-weight:bold;color:#1f2937">1박 ${formatPrice(hotel.dailyRate)}</span>
      ${discount}
    </div>
    ${amenities ? `<div style="color:#6b7280;font-size:13px;margin-bottom:14px">${amenities}</div>` : ''}
    <a href="${hotel.landingURL}" target="_blank" rel="noopener noreferrer"
      style="display:inline-block;background:#f97316;color:#fff;padding:10px 24px;border-radius:8px;font-weight:bold;text-decoration:none;font-size:14px">
      아고다에서 예약하기 →
    </a>
  </div>
</div>`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    cityName: string;
    cityNameKo: string;
    cityNameEn?: string;
    hotels: AgodaHotel[];
    checkIn: string;
    checkOut: string;
    travelStyle?: string;
  };

  const { cityName, cityNameKo, cityNameEn, hotels, checkIn, checkOut, travelStyle = '커플' } = body;
  if (!hotels?.length) return NextResponse.json({ error: '호텔 데이터 필요' }, { status: 400 });

  const topHotels = hotels.slice(0, 5);
  const formatPrice = (p: number) => p > 0 ? `${Math.round(p).toLocaleString('ko-KR')}원` : '';

  // 각 호텔별 Pixabay 이미지 3장 병렬 검색
  const pixabayQuery = cityNameEn || cityName;
  const hotelExtraImages = await Promise.all(
    topHotels.map(async (h) => {
      // 호텔 이름으로 먼저 검색, 결과 없으면 도시명으로
      const byName = await searchPixabayImages(`${h.hotelName} hotel`, 3);
      if (byName.length >= 2) return byName;
      return searchPixabayImages(`${pixabayQuery} hotel luxury`, 3);
    })
  );

  // 호텔 이미지 카드 (Pixabay 이미지 포함)
  const hotelCards = topHotels.map((h, i) => ({
    name: h.hotelName,
    card: buildHotelImageCard(h, formatPrice, hotelExtraImages[i] || []),
  }));

  const hotelList = topHotels.map((h, i) => {
    const discount = h.discountPercentage > 0 ? ` (${Math.round(h.discountPercentage)}% 할인)` : '';
    const amenities = [h.freeWifi ? '무료 와이파이' : '', h.includeBreakfast ? '조식 포함' : ''].filter(Boolean).join(', ');
    const originalPrice = h.crossedOutRate > 0 ? `원가 ${formatPrice(h.crossedOutRate)} →` : '';
    return `${i + 1}. ${h.hotelName}
   - 별점: ⭐ ${h.starRating}성급 | 리뷰: ${h.reviewScore}/10 (${h.reviewCount.toLocaleString()}개 리뷰)
   - 가격: ${originalPrice} 1박 ${formatPrice(h.dailyRate)}${discount}
   - 편의시설: ${amenities || '없음'}
   - 예약링크: ${h.landingURL}`;
  }).join('\n\n');

  const outputRule = `\n\n반드시 아래 구분자 형식으로만 출력 (설명/코드블록 없이):\n[[[TITLE]]]\nSEO 제목 (60자 이내)\n[[[META]]]\n메타 설명 (150자 이내)\n[[[LABELS]]]\n태그1,태그2,태그3\n[[[CONTENT]]]\nHTML 본문 전체`;

  const prompt = `너는 여행 전문 블로거야. ${travelStyle} 여행자 관점에서 "${cityNameKo || cityName}" 여행 호텔 추천 글을 자연스러운 후기 형식으로 써줘.

[호텔 데이터 - 아고다 제휴]
${hotelList}

[글쓰기 규칙]
- 제목: "${cityNameKo} 호텔 추천", "가성비 숙소", "후기" 키워드 포함한 SEO 제목
- 본문: 최소 2000자, HTML 형식 (h2/h3/p/ul/li/a 태그 사용)
- 글 구성:
  * 도입: ${cityNameKo}에 대한 감성적 소개 + 여행 설레임 (h2)
  * 각 호텔을 <h3 id="hotel-N">호텔명</h3> 형식으로 섹션 구분 (N은 1부터 순서)
  * 각 호텔 소개: 특징/위치/분위기 2~3문단 + 예약 링크
  * 여행 팁: ${cityNameKo} 여행 실용 팁 (h2)
  * 마무리 CTA (h2)
- 각 호텔 링크는 <a href="예약링크" target="_blank" rel="noopener noreferrer" style="color:#f97316;font-weight:bold">아고다에서 예약하기</a> 형식
- "광고", "협찬", "제공받았습니다" 절대 사용 금지
- 체크인: ${checkIn}, 체크아웃: ${checkOut} 날짜 기준 가격${outputRule}`;

  try {
    const text = await generateText(prompt, 'qwen3');
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
    let parsed: { title: string; content: string; metaDescription: string; labels: string[] };
    const titleS = getSection('TITLE');
    const contentS = getSection('CONTENT');
    if (titleS || contentS) {
      const labelsRaw = getSection('LABELS');
      parsed = {
        title: titleS,
        content: contentS,
        metaDescription: getSection('META'),
        labels: labelsRaw ? labelsRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
      };
    } else {
      // JSON 폴백
      try {
        const raw = text.replace(/```[\w]*\n?/g, '').trim();
        const m = raw.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(m?.[0] || raw);
      } catch {
        return NextResponse.json({ error: 'AI 응답 파싱 실패', raw: text.slice(0, 300) }, { status: 500 });
      }
    }

    // AI 생성 본문에 호텔 이미지 갤러리 카드 삽입
    let content = parsed.content || '';

    // 방법1: id="hotel-N" 패턴으로 삽입
    hotelCards.forEach((hc, i) => {
      const idPattern = new RegExp(`(<h3[^>]*id=["']hotel-${i + 1}["'][^>]*>.*?</h3>)`, 'i');
      if (idPattern.test(content)) {
        content = content.replace(idPattern, `$1${hc.card}`);
      } else {
        // 방법2: 호텔명이 포함된 h3 뒤에 삽입
        const namePattern = new RegExp(`(<h3[^>]*>${hc.name.slice(0, 15).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^<]*</h3>)`, 'i');
        if (namePattern.test(content)) {
          content = content.replace(namePattern, `$1${hc.card}`);
        }
      }
    });

    // 방법3: 삽입 안 된 카드는 첫 번째 h2 뒤에 모아서 추가
    const insertedCards = hotelCards.filter((hc, i) => {
      const idPat = new RegExp(`hotel-${i + 1}`);
      return !idPat.test(content) && !content.includes(hc.name.slice(0, 10));
    });
    if (insertedCards.length > 0) {
      const allCards = insertedCards.map(hc => hc.card).join('');
      content = content.replace(/(<\/h2>)/, `$1${allCards}`);
    }

    return NextResponse.json({
      title: parsed.title || '',
      content,
      metaDescription: parsed.metaDescription || '',
      labels: Array.isArray(parsed.labels) ? parsed.labels : [],
    });
  } catch (err) {
    console.error('Agoda generate error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
