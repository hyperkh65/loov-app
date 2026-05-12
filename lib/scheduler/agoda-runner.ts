import { createAdminClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';
import { refreshBloggerToken } from '@/lib/blogger-token';
import type { Schedule, AgodaAutoConfig } from './index';

const AGODA_SITE_ID = (process.env.AGODA_SITE_ID || '1959217').trim();
const AGODA_API_KEY = (process.env.AGODA_API_KEY || 'c7ca62e2-55fa-4f42-b691-f949948ecc30').trim();

interface AgodaHotel {
  hotelId: number;
  hotelName: string;
  starRating: number;
  reviewScore: number;
  reviewCount: number;
  dailyRate: number;
  crossedOutRate: number;
  discountPercentage: number;
  imageURL: string;
  landingURL: string;
}

async function fetchAgodaHotels(cityId: number): Promise<AgodaHotel[]> {
  const ci = new Date(); ci.setDate(ci.getDate() + 7);
  const co = new Date(ci); co.setDate(co.getDate() + 1);
  const checkIn = ci.toISOString().split('T')[0];
  const checkOut = co.toISOString().split('T')[0];

  const res = await fetch('http://affiliateapi7643.agoda.com/affiliateservice/lt_v1', {
    method: 'POST',
    headers: { Authorization: `${AGODA_SITE_ID}:${AGODA_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      criteria: {
        additional: { currency: 'KRW', language: 'ko-kr', maxResult: 5, minimumReviewScore: 7, minimumStarRating: 3, sortBy: 'AllGuestsReviewScore', occupancy: { numberOfAdult: 2, numberOfChildren: 0 } },
        checkInDate: checkIn, checkOutDate: checkOut, cityId,
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Agoda API 오류 ${res.status}`);
  const data = await res.json();
  return (data.results || []) as AgodaHotel[];
}

async function getBloggerTokenAdmin(userId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: row } = await supabase.from('bossai_blogger_tokens').select('*').eq('user_id', userId).single();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() > Date.now() + 300000) return row.access_token;
  if (!row.refresh_token) return null;
  const refreshed = await refreshBloggerToken(row.refresh_token);
  if (!refreshed) return null;
  await supabase.from('bossai_blogger_tokens').update({ access_token: refreshed.access_token, expires_at: refreshed.expires_at, updated_at: new Date().toISOString() }).eq('user_id', userId);
  return refreshed.access_token;
}

async function publishToBlogger(accessToken: string, blogId: string, title: string, content: string, labels: string[]): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content, labels, kind: 'blogger#post' }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || `Blogger 오류 ${res.status}`); }
  const d = await res.json();
  return d.url || '';
}

async function publishToWordPress(wpUrl: string, username: string, password: string, title: string, content: string): Promise<string> {
  const creds = Buffer.from(`${username}:${password}`).toString('base64');
  const res = await fetch(`${wpUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content, status: 'publish' }),
  });
  if (!res.ok) throw new Error(`WordPress API 오류 ${res.status}`);
  const d = await res.json();
  return d.link || '';
}

export async function runAgodaAuto(schedule: Schedule): Promise<{ city: string; url: string; title: string }> {
  const config = schedule.config as AgodaAutoConfig;
  if (!config.cities?.length) throw new Error('도시가 설정되지 않았습니다');

  const idx = schedule.keyword_index % config.cities.length;
  const city = config.city_mode === 'random'
    ? config.cities[Math.floor(Math.random() * config.cities.length)]
    : config.cities[idx];

  const hotels = await fetchAgodaHotels(city.id);
  if (!hotels.length) throw new Error(`${city.name} 호텔 데이터를 가져오지 못했습니다`);

  const travelStyle = config.travel_style || '커플';
  const top5 = hotels.slice(0, 5);
  const hotelList = top5.map((h, i) =>
    `${i + 1}. ${h.hotelName} — 리뷰 ${h.reviewScore}/10, 1박 ${Math.round(h.dailyRate).toLocaleString('ko-KR')}원${h.discountPercentage > 0 ? ` (-${Math.round(h.discountPercentage)}%)` : ''}\n   예약: ${h.landingURL}`
  ).join('\n');

  const prompt = `너는 여행 블로그 전문 작가야. "${city.name}" ${travelStyle} 여행자를 위한 호텔 추천 블로그 글을 써줘.

[호텔 데이터]
${hotelList}

작성 규칙:
- 제목: "${city.name} 호텔 추천 TOP 5" 형식의 SEO 제목
- 본문: 최소 1500자, HTML 형식(h2/h3/p/ul/a 사용)
- 각 호텔마다 장점 2-3가지 + 아고다 예약 링크 포함
- <a href="링크" target="_blank" rel="noopener noreferrer">호텔명</a> 형식으로 링크 삽입
- 마지막에 "아고다에서 최저가 예약하기" CTA

반드시 아래 구분자 형식으로만 출력:
[[[TITLE]]]
SEO 제목 (60자 이내)
[[[META]]]
메타 설명 (150자 이내)
[[[LABELS]]]
태그1,태그2,태그3
[[[CONTENT]]]
HTML 본문 전체`;

  const aiText = await generateText(prompt, 'qwen3');

  const getSection = (tag: string) => {
    const ALL = ['TITLE', 'META', 'LABELS', 'CONTENT'];
    const marker = `[[[${tag}]]]`;
    const start = aiText.indexOf(marker);
    if (start < 0) return '';
    const from = start + marker.length;
    let end = aiText.length;
    for (const t of ALL) {
      if (t === tag) continue;
      const pos = aiText.indexOf(`[[[${t}]]]`, from);
      if (pos >= 0 && pos < end) end = pos;
    }
    return aiText.slice(from, end).trim();
  };

  const title = getSection('TITLE') || `${city.name} 호텔 추천 TOP 5`;
  const content = getSection('CONTENT');
  const labels = getSection('LABELS').split(',').map(s => s.trim()).filter(Boolean);

  if (!content) throw new Error('AI 블로그 생성 실패');

  let publishedUrl = '';
  if (config.blog_platform === 'blogger') {
    const token = await getBloggerTokenAdmin(schedule.user_id);
    if (!token) throw new Error('Blogger 계정이 연결되지 않았습니다');
    publishedUrl = await publishToBlogger(token, config.blogger_blog_id || '7951763866955162015', title, content, labels);
  } else if (config.blog_platform === 'wordpress') {
    if (!config.wp_url || !config.wp_username || !config.wp_app_password) throw new Error('WordPress 설정이 불완전합니다');
    publishedUrl = await publishToWordPress(config.wp_url, config.wp_username, config.wp_app_password, title, content);
  }

  // 도시 인덱스 업데이트
  if (config.city_mode === 'rotate') {
    const supabase = createAdminClient();
    await supabase.from('bossai_schedules').update({ keyword_index: (idx + 1) % config.cities.length }).eq('id', schedule.id);
  }

  return { city: city.name, url: publishedUrl, title };
}
