import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json() as { keywords: string[]; startDate?: string; endDate?: string; timeUnit?: string };
  const { keywords = [], startDate, endDate, timeUnit = 'month' } = body;

  const naverClientId = await getSetting('NAVER_CLIENT_ID');
  const naverClientSecret = await getSetting('NAVER_CLIENT_SECRET');

  if (!naverClientId || !naverClientSecret) {
    return NextResponse.json({ error: '네이버 Client ID / Secret을 설정에서 등록해주세요.' }, { status: 400 });
  }

  // Default date range: last 12 months
  const now = new Date();
  const end = endDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const startDt = new Date(now);
  startDt.setFullYear(startDt.getFullYear() - 1);
  const start = startDate || `${startDt.getFullYear()}-${String(startDt.getMonth() + 1).padStart(2, '0')}-${String(startDt.getDate()).padStart(2, '0')}`;

  const keywordGroups = keywords.slice(0, 5).map(kw => ({
    groupName: kw,
    keywords: [kw],
  }));

  try {
    const res = await fetch('https://openapi.naver.com/v1/datalab/search', {
      method: 'POST',
      headers: {
        'X-Naver-Client-Id': naverClientId,
        'X-Naver-Client-Secret': naverClientSecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: start,
        endDate: end,
        timeUnit,
        keywordGroups,
        device: 'pc',
        ages: [],
        gender: '',
      }),
    });

    const data = await res.json() as { results?: Array<{ title: string; keywords: string[]; data: Array<{ period: string; ratio: number }> }> };

    if (!res.ok) {
      return NextResponse.json({ error: '네이버 DataLab API 오류', detail: data }, { status: 400 });
    }

    return NextResponse.json({ results: data.results || [], startDate: start, endDate: end });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// GET: Get real-time trending topics (Naver hot topics via search suggestion)
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') || '';

  const naverClientId = await getSetting('NAVER_CLIENT_ID');
  const naverClientSecret = await getSetting('NAVER_CLIENT_SECRET');

  if (!naverClientId || !naverClientSecret) {
    return NextResponse.json({ error: '네이버 API 키 필요' }, { status: 400 });
  }

  try {
    // Get search suggestions as related keywords
    const res = await fetch(
      `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(query)}&con=1&frm=nv&ans=2&run=2`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const text = await res.text();
    // Parse JSONP or JSON response
    const suggestions: string[] = [];
    try {
      const json = JSON.parse(text.replace(/^[^(]+\(/, '').replace(/\);?$/, ''));
      if (json.items) {
        for (const group of json.items) {
          if (Array.isArray(group)) {
            suggestions.push(...group.map((item: string[]) => item[0]).filter(Boolean));
          }
        }
      }
    } catch { /* fallback */ }

    return NextResponse.json({ suggestions: suggestions.slice(0, 20) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
