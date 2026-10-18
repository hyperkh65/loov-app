import { createAdminClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';
import { getSetting } from '@/lib/get-setting';
import { getSection } from '@/lib/sns/sections';
import { THREADS_HOOK_GUIDE, scrubThreads } from '@/lib/sns/hook-style';
import { postToPlatformWithMedia, postCommentOnOwnPost } from '@/lib/sns/platforms-server';
import { composeModelScene, AI_IMAGE_NOTE } from '@/lib/travel-model';
import { TRAVEL_TOPICS, TRAVEL_KINDS, type TravelKind } from '@/lib/travel-topics';
import { publishToWordPress, getWpCredentials } from './blog-runner';
import { PERSONA, DISCLOSURE, AGODA_SNS_ACCOUNTS, getSnsConnections, buildAffiliateWidgetHtml, stripMarkerArtifacts } from './agoda-runner';
import type { Platform } from '@/lib/sns/platforms';
import type { AgodaAutoConfig } from './index';

const BLOG = 'https://blog.2days.kr';
const KIND_LABEL: Record<TravelKind, string> = { world: '세계 여행지', korea: '국내 여행지', food: '맛집' };
const KIND_SCENE: Record<TravelKind, string[]> = {
  world: ['walking through a famous street or landmark of {p}', 'sitting at a scenic viewpoint or cafe in {p}'],
  korea: ['strolling at a famous scenic spot of {p}, Korea', 'relaxing at a local cafe or market in {p}, Korea'],
  food: ['sitting at a local restaurant table in {p} about to eat a signature local dish', 'standing in front of a popular street food stall or market in {p}'],
};

async function alreadyPosted(title: string, place: string): Promise<boolean> {
  try {
    const r = await fetch(`${BLOG}/wp-json/wp/v2/posts?per_page=3&_fields=id&search=${encodeURIComponent(title)}`, { signal: AbortSignal.timeout(10_000) });
    return !r.ok || (await r.json()).length > 0 || !place;
  } catch { return true; }
}

// 네이버 블로그 검색으로 모은 참고 자료(제목+요약) — 문장은 베끼지 않고 사실만 재구성하게 함
async function gatherSources(query: string): Promise<string> {
  const [id, secret] = await Promise.all([getSetting('NAVER_CLIENT_ID'), getSetting('NAVER_CLIENT_SECRET')]);
  if (!id || !secret) return '';
  try {
    const r = await fetch(`https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}&display=10&sort=sim`, { headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return '';
    const items = ((await r.json()).items || []) as { title: string; description: string }[];
    return items.map((i, n) => `${n + 1}. ${i.title} — ${i.description}`.replace(/<[^>]+>/g, '')).join('\n');
  } catch { return ''; }
}

export async function runTravelFeature(): Promise<{ ok: boolean; title?: string; url?: string; results: string[]; skipped?: string }> {
  const results: string[] = [];
  const supabase = createAdminClient();
  const { data: sch } = await supabase.from('bossai_schedules').select('user_id, config').ilike('type', '%agoda%').limit(1).maybeSingle();
  if (!sch) return { ok: false, results, skipped: '아고다 스케줄 없음' };
  const cfg = sch.config as AgodaAutoConfig;

  // 종류는 6시간 단위로 돌려 쓰고, 해당 종류에서 아직 안 쓴 첫 주제를 고름
  const start = Math.floor(Date.now() / (6 * 3600e3));
  let kind: TravelKind | null = null; let topic: { place: string; title: string } | null = null;
  for (let k = 0; k < TRAVEL_KINDS.length && !topic; k++) {
    const kk = TRAVEL_KINDS[(start + k) % TRAVEL_KINDS.length];
    for (const t of TRAVEL_TOPICS[kk]) if (!(await alreadyPosted(t.title, t.place))) { kind = kk; topic = t; break; }
  }
  if (!kind || !topic) return { ok: false, results, skipped: '남은 주제 없음' };

  const sources = await gatherSources(`${topic.place} ${kind === 'food' ? '맛집' : '여행 코스'}`);
  const prompt = `너는 20~30대 여성 여행 블로거야. 친근한 존댓말(~해요)로 "${topic.title}" 블로그 글을 써줘.
${sources ? `[참고 자료 — 여러 블로그의 제목과 요약. 문장을 베끼지 말고, 여러 곳에서 공통으로 확인되는 사실만 네 말로 재구성]\n${sources}\n` : ''}
작성 규칙:
- 본문 1800자 이상, HTML(h2/h3/p/ul). a 태그·이미지 태그 금지(이미지는 코드가 넣음)
- 구성: 도입 → 핵심 코스/메뉴 5~7개를 h2/h3로 → 가성비 팁(교통·예산·시간대) → 마무리
- 참고 자료에 없는 가격·영업시간·주소 같은 구체 수치는 쓰지 마라(불확실하면 "방문 전 확인"으로)
- 내가 직접 다녀왔다는 식의 구체적 체험 날조 금지, "~가 유명해요/~로 알려져 있어요" 식으로
- h2 제목은 정확히 3개 이상 넣어라
반드시 아래 형식으로만 출력:
[[[TITLE]]]
SEO 제목 (20~32자)
[[[META]]]
메타 설명 (150자 이내)
[[[LABELS]]]
태그1,태그2,태그3
[[[CONTENT]]]
HTML 본문`;
  const TAGS = ['TITLE', 'META', 'LABELS', 'CONTENT'];
  const ai = await generateText(prompt, 'groq');
  let title = stripMarkerArtifacts(getSection(ai, 'TITLE', TAGS) || '') || topic.title;
  if (title.length > 80 || /<[a-z]/i.test(title)) title = topic.title;
  let content = stripMarkerArtifacts(getSection(ai, 'CONTENT', TAGS));
  if (content.length < 800) return { ok: false, results, skipped: 'AI 본문 생성 실패' };

  // 고정 모델이 현지에 있는 사진 — 병렬 생성
  const scenes = KIND_SCENE[kind].map(s => s.replace('{p}', topic!.place));
  const [hero, inline] = await Promise.all([composeModelScene(scenes[0]), composeModelScene(scenes[1])]);
  const fig = (u: string, alt: string) => `<figure style="margin:20px 0"><img src="${u}" alt="${alt}" style="width:100%;border-radius:12px"/></figure>`;
  if (inline) { const i = content.indexOf('</h2>', content.indexOf('</h2>') + 5); content = i > 0 ? content.slice(0, i + 5) + fig(inline, `${topic.place} 여행 사진`) + content.slice(i + 5) : content + fig(inline, topic.place); }
  if (hero) content = fig(hero, `${topic.place} ${KIND_LABEL[kind]}`) + content;
  if (hero || inline) content += `<p style="font-size:12px;color:#888">${AI_IMAGE_NOTE}</p>`;

  // 아고다 설정 도시와 맞으면 숙소 위젯 + 제휴 고지
  const city = (cfg.cities || []).find(c => topic!.place.includes(c.name));
  if (city && kind !== 'food') content += `<h2>${topic.place} 숙소 최저가 보기</h2>${buildAffiliateWidgetHtml(city.id, String(Date.now()).slice(-9))}<p style="font-size:12px;color:#888">${DISCLOSURE}</p>`;

  let url = '';
  try {
    const siteId = cfg.wp_site_id || (await supabase.from('wordpress_sites').select('id').eq('site_url', BLOG).single()).data?.id;
    const c = await getWpCredentials(siteId);
    url = (await publishToWordPress(c.url, c.username, c.appPassword, title, content, hero || inline || null)).link;
    results.push(`blog: ${url}`);
  } catch (e) { return { ok: false, title, results: [...results, `blog 실패: ${String(e).slice(0, 100)}`] }; }

  // SNS — 여행 전용 계정에만
  try {
    const sns = await generateText(`너는 20~30대 여성 여행 크리에이터야. "${title}" (${KIND_LABEL[kind]}, ${topic.place}) 글을 소개하는 Threads 글 1개를 써줘. 한국어만.\n\n${THREADS_HOOK_GUIDE}\n\n${PERSONA}\n- 주어진 정보에 없는 가격·후기·방문 경험은 지어내지 마라.\n\n구분자 형식으로만 출력:\n[[[THREADS]]]\n스레드용 텍스트`, 'sns');
    const text = scrubThreads(getSection(sns, 'THREADS', ['THREADS']));
    const img = hero || inline;
    if (text) for (const conn of (await getSnsConnections(sch.user_id)).filter(x => ['threads', 'instagram'].includes(x.platform) && AGODA_SNS_ACCOUNTS.includes(x.platform_username || ''))) {
      try {
        const r = await postToPlatformWithMedia(conn.platform as Platform, conn.access_token, conn.platform_user_id, text, img ? [img] : undefined);
        try { await postCommentOnOwnPost(conn.platform as Platform, conn.access_token, conn.platform_user_id, r.id, `📍 코스·정보 자세히 보기 👉 ${url}`); } catch { /* 댓글 실패 무시 */ }
        results.push(`${conn.platform}(${conn.platform_username}): 발행 완료`);
      } catch (e) { results.push(`${conn.platform}: ${String(e).slice(0, 60)}`); }
    }
  } catch (e) { results.push(`sns: ${String(e).slice(0, 60)}`); }
  return { ok: true, title, url, results };
}
