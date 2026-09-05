import { createAdminClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';
import { refreshBloggerToken } from '@/lib/blogger-token';
import { postToPlatformWithMedia, postCommentOnOwnPost } from '@/lib/sns/platforms-server';
import { publishToWordPress, getWpCredentials } from './blog-runner';
import type { Platform } from '@/lib/sns/platforms';
import type { Schedule, AgodaAutoConfig } from './index';

const AGODA_SITE_ID = (process.env.AGODA_SITE_ID || '1959217').trim();
const AGODA_API_KEY = (process.env.AGODA_API_KEY || 'c7ca62e2-55fa-4f42-b691-f949948ecc30').trim();
const DISCLOSURE = '이 포스팅은 아고다 제휴 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

function getSection(text: string, tag: string, allTags: string[]): string {
  const marker = `[[[${tag}]]]`;
  const start = text.indexOf(marker);
  if (start < 0) return '';
  const from = start + marker.length;
  let end = text.length;
  for (const t of allTags) {
    if (t === tag) continue;
    const pos = text.indexOf(`[[[${t}]]]`, from);
    if (pos >= 0 && pos < end) end = pos;
  }
  return text.slice(from, end).trim();
}

function stripMarkerArtifacts(s: string): string {
  return s.replace(/\[\[\[[^\]]{0,40}\]\]\]/g, '').trim();
}

async function getSnsConnections(userId: string): Promise<Array<{ platform: string; platform_user_id: string; platform_username: string; access_token: string; is_active: boolean }>> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('sns_connections')
    .select('platform, platform_user_id, platform_username, access_token, is_active')
    .eq('user_id', userId)
    .eq('is_active', true);
  return (data || []) as typeof data extends null ? [] : NonNullable<typeof data>;
}

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

/** 호텔 이미지·가격 카드 — AI 재량에 맡기지 않고 code가 실데이터(아고다 API)로 직접 그림.
 * 실측 확인(2026-09-05): 발리 발행 결과 AI가 텍스트만 쓰고 이미지·가격을 전혀 안 넣은 사고가
 * 나서, /api/agoda/generate 수동 경로에 이미 있던 이미지 카드 패턴을 자동 스케줄러에도 적용. */
function buildHotelCard(h: AgodaHotel, formatPrice: (p: number) => string): string {
  const stars = '⭐'.repeat(Math.round(h.starRating));
  const discount = h.discountPercentage > 0
    ? `<span style="background:#ef4444;color:#fff;padding:2px 8px;border-radius:4px;font-size:13px;font-weight:bold;margin-left:8px">-${Math.round(h.discountPercentage)}%</span>`
    : '';
  const originalPrice = h.crossedOutRate > 0
    ? `<span style="text-decoration:line-through;color:#999;font-size:13px;margin-right:6px">${formatPrice(h.crossedOutRate)}</span>`
    : '';
  return `
<div style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin:24px 0;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  ${h.imageURL ? `<img src="${h.imageURL}" alt="${h.hotelName}" style="width:100%;height:260px;object-fit:cover;display:block">` : ''}
  <div style="padding:16px">
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
      <span style="font-size:14px">${stars}</span>
      <span style="background:#fef3c7;color:#92400e;padding:2px 10px;border-radius:20px;font-size:13px;font-weight:600">리뷰 ${h.reviewScore}/10</span>
      <span style="color:#6b7280;font-size:12px">(${h.reviewCount.toLocaleString('ko-KR')}개)</span>
    </div>
    <div style="margin-bottom:14px">
      ${originalPrice}
      <span style="font-size:20px;font-weight:bold;color:#1f2937">1박 ${formatPrice(h.dailyRate)}</span>
      ${discount}
    </div>
    <a href="${h.landingURL}" target="_blank" rel="nofollow sponsored noopener"
      style="display:inline-block;background:#f97316;color:#fff;padding:10px 24px;border-radius:8px;font-weight:bold;text-decoration:none;font-size:14px">
      아고다에서 예약하기 →
    </a>
  </div>
</div>`;
}

/** 아고다 Sherpa 위젯(사용자가 직접 아고다 파트너 대시보드에서 발급받아 제공한 실제 코드) —
 * 도시별 딜을 보여주는 다이나믹 배너. City 파라미터만 매 포스트마다 실제 도시 id로 교체.
 * 우리 API 크레덴셜(AGODA_SITE_ID=1959217/AGODA_API_KEY)과 Cid·ApiKey가 일치하는 것만 사용 —
 * 사용자가 같이 준 다른 두 개(Cid=1945810)는 이 계정과 안 맞아서(다른 사이트ID로 보임)
 * 확인 전까지는 넣지 않음. */
function buildAffiliateWidgetHtml(cityId: number, divSeed: string): string {
  const divId = `adgshp${divSeed}`;
  return `
<div id="${divId}"></div>
<script type="text/javascript" src="//cdn0.agoda.net/images/sherpa/js/init-dynamic_v8.min.js"></script>
<script type="text/javascript">
var stg = new Object(); stg.crt="5384551278740";stg.version="1.05"; stg.id=stg.name="${divId}"; stg.Width="300px"; stg.Height="300px";stg.RefKey="egGqIV7JzENp0+lIKc8n7A==";stg.AutoScrollSpeed=3000;stg.AutoScrollToggle=true;stg.SearchboxShow=false;stg.DiscountedOnly=false;stg.Layout="squaredynamic"; stg.Language="ko-kr";stg.ApiKey="${AGODA_API_KEY}";stg.Cid="${AGODA_SITE_ID}";  stg.City="${cityId}";stg.Currency="KRW";stg.OverideConf=false; new AgdDynamic('${divId}').initialize(stg);
</script>`;
}

export async function runAgodaAuto(schedule: Schedule): Promise<{ city: string; url: string; title: string; results: string[] }> {
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

[호텔 데이터 — 순서대로 1번부터 ${top5.length}번]
${hotelList}

작성 규칙:
- 제목: "${city.name} 호텔 추천 TOP 5" 형식의 SEO 제목
- 본문: 최소 1500자, HTML 형식(h2/h3/p/ul 사용, a 태그는 쓰지 마라 — 예약 링크는 코드가 자동으로 이미지·가격 카드로 삽입한다)
- 각 호텔은 반드시 <h3 id="hotel-1">호텔명</h3> ~ <h3 id="hotel-${top5.length}">호텔명</h3> 형식으로 위 순서 그대로 소제목을 달고, 그 아래에 장점 2-3가지를 구체적인 여행 장면과 함께 서술(가격·평점 숫자는 언급하지 마라 — 카드에 이미 자동으로 표시된다)
- 예약 링크나 이미지 태그를 직접 넣지 마라(자동 삽입됨)
- 마지막 문단은 짧은 마무리 인사

반드시 아래 구분자 형식으로만 출력:
[[[TITLE]]]
SEO 제목 (60자 이내)
[[[META]]]
메타 설명 (150자 이내)
[[[LABELS]]]
태그1,태그2,태그3
[[[CONTENT]]]
HTML 본문 전체`;

  // 실측(coupang-runner에서 이미 확인됨): qwen3 기본값이 Ollama 무료 모델로 라우팅되면서
  // 마커 형식을 아예 무시하고 엉뚱한 텍스트를 내놓는 경우가 있어 빈 본문으로 전체 실행이
  // 실패하는 사고가 났다 — claude로 기본값을 올려 같은 문제를 방지.
  const aiText = await generateText(prompt, config.ai_model || 'claude');
  const BLOG_TAGS = ['TITLE', 'META', 'LABELS', 'CONTENT'];

  let title = stripMarkerArtifacts(getSection(aiText, 'TITLE', BLOG_TAGS) || '');
  let content = getSection(aiText, 'CONTENT', BLOG_TAGS);
  const labels = getSection(aiText, 'LABELS', BLOG_TAGS).split(',').map(s => s.trim()).filter(Boolean);

  // 마커를 AI가 안 지켰을 때 곧바로 실패시키지 않고, "첫 줄=제목, 나머지=본문"으로 복구
  // 시도 — coupang-runner에서 실측으로 검증된 동일 폴백.
  if (!content || title.length > 80 || /<[a-z]/i.test(title)) {
    const lines = (title || aiText).split('\n').map(l => l.trim()).filter(Boolean);
    title = stripMarkerArtifacts(lines[0] || `${city.name} 호텔 추천 TOP 5`);
    content = lines.slice(1).join('\n') || content || aiText;
  }
  if (!title) title = `${city.name} 호텔 추천 TOP 5`;
  content = stripMarkerArtifacts(content);

  if (!content) throw new Error('AI 블로그 생성 실패');

  // 호텔별 이미지·가격 카드 삽입 — id="hotel-N" 우선, 없으면 호텔명 매칭, 그래도 안 되면
  // 마지막에 통째로 이어붙임(카드 자체가 절대 누락되지 않게).
  const formatPrice = (p: number) => p > 0 ? `${Math.round(p).toLocaleString('ko-KR')}원` : '';
  top5.forEach((h, i) => {
    const card = buildHotelCard(h, formatPrice);
    const idPattern = new RegExp(`(<h3[^>]*id=["']hotel-${i + 1}["'][^>]*>.*?</h3>)`, 'i');
    if (idPattern.test(content)) {
      content = content.replace(idPattern, `$1${card}`);
      return;
    }
    const namePattern = new RegExp(`(<h3[^>]*>${h.hotelName.slice(0, 15).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^<]*</h3>)`, 'i');
    if (namePattern.test(content)) {
      content = content.replace(namePattern, `$1${card}`);
      return;
    }
    content += card;
  });

  // 아고다 제휴 배너 위젯(사용자 파트너 대시보드에서 발급된 실제 코드) — 글 도입부 뒤에 1개.
  const widget = buildAffiliateWidgetHtml(city.id, String(Date.now()).slice(-9));
  const firstH2End = content.indexOf('</h2>');
  content = firstH2End !== -1
    ? content.slice(0, firstH2End + 5) + widget + content.slice(firstH2End + 5)
    : widget + content;

  let publishedUrl = '';
  if (config.blog_platform === 'blogger') {
    const token = await getBloggerTokenAdmin(schedule.user_id);
    if (!token) throw new Error('Blogger 계정이 연결되지 않았습니다');
    publishedUrl = await publishToBlogger(token, config.blogger_blog_id || '7951763866955162015', title, content, labels);
  } else if (config.blog_platform === 'wordpress') {
    let wpUrl: string, wpUser: string, wpPass: string;
    if (config.wp_site_id) {
      const creds = await getWpCredentials(config.wp_site_id);
      wpUrl = creds.url; wpUser = creds.username; wpPass = creds.appPassword;
    } else if (config.wp_url && config.wp_username && config.wp_app_password) {
      wpUrl = config.wp_url; wpUser = config.wp_username; wpPass = config.wp_app_password;
    } else {
      throw new Error('WordPress 사이트를 선택해주세요');
    }
    publishedUrl = await publishToWordPress(wpUrl, wpUser, wpPass, title, content, top5[0]?.imageURL || null);
  }

  // SNS 발행 — 블로그 발행 성공/실패와 무관하게 별도로 시도(부분 실패 허용)
  const results: string[] = [];
  const snsPlatforms = (config.sns_platforms || []).filter(p => ['threads', 'twitter', 'facebook', 'instagram'].includes(p));
  const topHotel = top5[0];
  if (snsPlatforms.length && topHotel) {
    const TAGS = ['THREADS', 'TWITTER', 'FACEBOOK', 'INSTAGRAM'];
    const snsPrompt = `너는 SNS 마케팅 전문가야. 아고다 제휴 호텔 추천을 각 SNS 플랫폼에 맞는 후킹성 멘트로 작성해줘.
반드시 한국어로만 작성하고, 중국어·일본어 등 외국 문자 절대 사용 금지.

도시: ${city.name}
추천 호텔: ${topHotel.hotelName} — 리뷰 ${topHotel.reviewScore}/10, 1박 ${Math.round(topHotel.dailyRate).toLocaleString('ko-KR')}원${topHotel.discountPercentage > 0 ? ` (-${Math.round(topHotel.discountPercentage)}%)` : ''}
여행 스타일: ${travelStyle}

[플랫폼별 작성 규칙]
- THREADS: 줄바꿈으로 리듬감. 2~4줄 짧은 문장. 이모지 1~2개. URL 없이 (댓글로 추가)
- TWITTER: 한 방에 꽂히는 문장 + 해시태그 2~3개. 240자 이내. URL 없이 (댓글로 추가)
- FACEBOOK: 친근하게 250자 내외. 이모지 적당히. URL 없이
- INSTAGRAM: 감성적, 이모지 풍부, 해시태그 10개. URL 없이

반드시 아래 구분자 형식으로만 출력 (설명/코드블록 없이):
[[[THREADS]]]
스레드용 텍스트
[[[TWITTER]]]
트위터용 텍스트
[[[FACEBOOK]]]
페이스북용 텍스트
[[[INSTAGRAM]]]
인스타그램용 텍스트`;

    try {
      const aiText = await generateText(snsPrompt, 'qwen3');
      const textMap: Record<string, string> = {
        threads: getSection(aiText, 'THREADS', TAGS),
        twitter: getSection(aiText, 'TWITTER', TAGS),
        facebook: getSection(aiText, 'FACEBOOK', TAGS),
        instagram: getSection(aiText, 'INSTAGRAM', TAGS),
      };
      // 링크는 아고다 직링크가 아니라 블로그 글 주소로 — 후기·가격비교·다른 호텔 정보까지
      // 다 보여준 뒤 그 안의 예약 버튼으로 넘어가게 유도.
      const linkUrl = publishedUrl || topHotel.landingURL;
      const comment = `🔗 자세히 보기: ${linkUrl}\n\n${DISCLOSURE}`;
      const connections = await getSnsConnections(schedule.user_id);

      for (const platform of snsPlatforms) {
        const conns = connections.filter(c => c.platform === platform);
        if (!conns.length) { results.push(`${platform}: 계정 미연결`); continue; }
        const text = textMap[platform];
        if (!text) { results.push(`${platform}: 텍스트 생성 실패`); continue; }

        for (const conn of conns) {
          const label = `${platform}(${conn.platform_username || conn.platform_user_id})`;
          try {
            const postResult = await postToPlatformWithMedia(
              platform as Platform,
              conn.access_token,
              conn.platform_user_id,
              text,
              topHotel.imageURL ? [topHotel.imageURL] : undefined,
            );
            try {
              await postCommentOnOwnPost(platform as Platform, conn.access_token, conn.platform_user_id, postResult.id, comment);
            } catch { /* 댓글 실패 시 무시 */ }
            results.push(`${label}: 발행 완료`);
          } catch (err) {
            results.push(`${label}: ${(err as Error).message?.slice(0, 50) || '실패'}`);
          }
        }
      }
    } catch (err) {
      console.error('[agoda-runner] SNS 발행 실패:', err);
      results.push(`sns: ${(err as Error).message?.slice(0, 80) || '실패'}`);
    }
  }

  // 도시 인덱스 업데이트
  if (config.city_mode === 'rotate') {
    const supabase = createAdminClient();
    await supabase.from('bossai_schedules').update({ keyword_index: (idx + 1) % config.cities.length }).eq('id', schedule.id);
  }

  return { city: city.name, url: publishedUrl, title, results };
}
