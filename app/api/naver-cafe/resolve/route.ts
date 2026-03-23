import { NextRequest, NextResponse } from 'next/server';

// cafe.naver.com/{slug} 페이지를 서버사이드로 가져와 숫자 clubId 추출
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')?.replace(/^cafe\.naver\.com\//, '').replace(/\/$/, '');
  if (!slug) return NextResponse.json({ error: 'slug 필요' }, { status: 400 });

  try {
    const res = await fetch(`https://cafe.naver.com/${slug}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return NextResponse.json({ error: `카페 페이지 로드 실패 (${res.status})` }, { status: 502 });

    const html = await res.text();

    // 여러 패턴으로 clubId 추출 시도
    const patterns = [
      /"clubId"\s*:\s*"?(\d+)"?/,
      /clubid=(\d+)/i,
      /cafeId=(\d+)/i,
      /cafe_id=(\d+)/i,
      /"clubid"\s*:\s*"?(\d+)"?/i,
      /var\s+clubId\s*=\s*"?(\d+)"?/,
      /data-clubid="(\d+)"/,
    ];

    let clubId: string | null = null;
    for (const pat of patterns) {
      const m = html.match(pat);
      if (m) { clubId = m[1]; break; }
    }

    // 카페 이름 추출
    const nameMatch = html.match(/<title>([^<]+)<\/title>/) || html.match(/"cafeName"\s*:\s*"([^"]+)"/);
    const cafeName = nameMatch ? nameMatch[1].replace(' : 네이버 카페', '').replace(' - 네이버 카페', '').trim() : '';

    if (!clubId) {
      return NextResponse.json({ error: '카페 ID를 찾을 수 없습니다. 카페 URL을 확인하세요.' }, { status: 404 });
    }

    return NextResponse.json({ club_id: clubId, cafe_name: cafeName, cafe_url: slug });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
