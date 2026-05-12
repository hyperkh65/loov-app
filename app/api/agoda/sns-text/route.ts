import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    title: string;
    cityName: string;
    hotels?: { hotelName: string; reviewScore: number; dailyRate: number; discountPercentage: number }[];
    blogUrls?: string[];
    travelStyle?: string;
  };

  const { title, cityName, hotels = [], blogUrls = [], travelStyle = '커플' } = body;
  if (!title) return NextResponse.json({ error: '제목이 필요합니다' }, { status: 400 });

  const hotelSummary = hotels.slice(0, 3).map(h =>
    `${h.hotelName} (리뷰 ${h.reviewScore}/10, 1박 ${Math.round(h.dailyRate).toLocaleString('ko-kr')}원${h.discountPercentage > 0 ? ` -${Math.round(h.discountPercentage)}%` : ''})`
  ).join(', ');

  const urlNote = blogUrls.length > 0 ? `발행된 블로그 URL: ${blogUrls.join(', ')}` : '블로그 URL: (발행 후 추가 예정)';
  const primaryUrl = blogUrls[0] || '';

  const prompt = `너는 SNS 마케팅 전문가야. 여행 호텔 블로그 포스트를 각 SNS 플랫폼에 맞는 후킹성 멘트로 작성해줘.
반드시 한국어로만 작성하고, 중국어·일본어·러시아어 등 외국 문자 절대 사용 금지.

블로그 제목: ${title}
여행지: ${cityName}
여행 스타일: ${travelStyle}
호텔 정보: ${hotelSummary || cityName + ' 추천 호텔들'}
${urlNote}

[플랫폼별 작성 규칙]
- instagram: 감성적이고 이모지 풍부하게, 해시태그 10-15개 포함, 200자 내외. URL은 "🔗 링크 : ${primaryUrl || '프로필링크 참조'}" 형태로 해시태그 앞에 추가
- twitter: 임팩트 있고 짧게, 이모지 2-3개, 240자 이내. 본문 마지막에 URL 직접 포함 (${primaryUrl || '링크'})
- facebook: 친근하고 상세하게, 이모지 적당히, 250자 내외. 본문 중간 자연스럽게 "👉 자세히 보기: ${primaryUrl || '링크'}" 포함
- threads: 후킹성 텍스트만 200자 내외, URL 없이 (URL은 별도 댓글로 추가됨). 이모지 3-5개, 대화체

반드시 아래 구분자 형식으로만 출력 (설명/코드블록 없이):
[[[INSTAGRAM]]]
인스타그램용 텍스트
[[[TWITTER]]]
트위터용 텍스트
[[[FACEBOOK]]]
페이스북용 텍스트
[[[THREADS]]]
스레드용 텍스트`;

  try {
    const text = await generateText(prompt, 'qwen3');

    const getSection = (tag: string) => {
      const marker = `[[[${tag}]]]`;
      const ALL = ['INSTAGRAM', 'TWITTER', 'FACEBOOK', 'THREADS'];
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

    const instagram = getSection('INSTAGRAM');
    const twitter = getSection('TWITTER');
    const facebook = getSection('FACEBOOK');
    const threads = getSection('THREADS');

    // JSON 폴백
    if (!instagram && !twitter && !threads) {
      try {
        const raw = text.replace(/```[\w]*\n?/g, '').trim();
        const m = raw.match(/\{[\s\S]*\}/);
        const j = JSON.parse(m?.[0] || raw) as { instagram?: string; twitter?: string; facebook?: string; threads?: string };
        return NextResponse.json({
          instagram: j.instagram || '',
          twitter: j.twitter || '',
          facebook: j.facebook || '',
          threads: j.threads || '',
          threadsUrl: primaryUrl,
        });
      } catch { /* ignore */ }
    }

    return NextResponse.json({ instagram, twitter, facebook, threads, threadsUrl: primaryUrl });
  } catch (err) {
    console.error('SNS text generate error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
