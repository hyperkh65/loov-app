/**
 * 네이버 경제 블로그(생활경제: 연금·복지·금리·세금) 자동발행 러너
 *
 * 글감 = 정책브리핑(korea.kr) 부처 보도자료(공식 1차 자료). 본문에 없는 사실은 쓰지 않고,
 * ① 금액·%·기간 숫자가 원문에 실제로 있는지 코드로 대조 ② 별도 AI 검수 — 둘 다 통과해야 발행.
 * 통과 못하면 발행하지 않고 건너뜀(근거 부족 글 = 발행 안 함).
 * 발행 큐는 전자제품 블로그와 같은 Playwright 워커를 쓰되 계정만 다르다(notion_page_id='__auto_econ__').
 */
import { tightTitle } from '@/lib/html-gate';
import { createAdminClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';
import { getSetting } from '@/lib/get-setting';
import { searchInlineImages } from '@/lib/blog-content-generator';
import { sanitizeForNaver } from '@/lib/naver-blog';
import { dispatchNaverPublishJob, insertImages } from '@/lib/scheduler/naver-tech-runner';

const UA = { 'User-Agent': 'Mozilla/5.0' };
const RELEVANT = /연금|복지|급여|수당|지원금|장려금|금리|대출|예금|적금|이자|물가|세금|세제|세액|연말정산|퇴직|생활비|청약|전세|월세|보험|의료비|환급|소득|근로|실업|최저임금|바우처|감면|공제|돌봄|부양|주거/;
const SKIP = /정례브리핑|전체회의|국방부|합참|일일 정례/;

interface Item { url: string; title: string }

async function fetchList(): Promise<Item[]> {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const page of [1, 2, 3]) {
    const res = await fetch(`https://www.korea.kr/briefing/policyBriefingList.do?pageIndex=${page}`, { headers: UA, signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (!res?.ok) continue;
    for (const m of (await res.text()).matchAll(/href="(\/briefing\/policyBriefingView\.do\?newsId=\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g)) {
      const title = m[2].replace(/<[^>]+>|\s+/g, ' ').trim();
      const url = `https://www.korea.kr${m[1]}`;
      if (seen.has(url) || title.length < 8) continue;
      seen.add(url);
      out.push({ url, title });
    }
  }
  return out;
}

async function fetchBody(url: string): Promise<{ text: string; date: string }> {
  const html = await (await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) })).text();
  const t = html.replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, ' ').replace(/&middot;/g, '·').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
  const start = t.indexOf('내려받기');
  const body = (start > 0 ? t.slice(start) : t).replace(/^.*?(?:내려받기\s*)+/, '');
  return { text: body.slice(0, 7000), date: t.match(/20\d\d\.\d\d\.\d\d/)?.[0] || '' };
}

// 본문 글의 금액·%·기간 숫자는 전부 원문에 있어야 한다(지어낸 수치 차단)
export function unsupportedNumbers(article: string, source: string): string[] {
  const src = source.replace(/,/g, '');
  const text = article.replace(/<[^>]+>/g, ' ').replace(/,/g, '');
  const bad = new Set<string>();
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(원|%|%p|만원|억원|조원|천원|세|년|개월|명|가구|배|일|회)/g)) {
    if (!src.includes(m[1])) bad.add(`${m[1]}${m[2]}`);
  }
  return [...bad];
}

function writerPrompt(title: string, date: string, source: string, fixes: string[]): string {
  return `당신은 한국 독자를 위한 생활경제 편집자다. 아래 정부 공식 보도자료만 근거로, '내 돈과 선택에 어떤 차이가 생기는지'를 쉽게 설명하는 네이버 블로그 글을 쓴다.

[보도자료] ${title} (${date})
${source}

[규칙]
1. 보도자료에 있는 사실만 쓴다. 금액·비율·기간·대상·시행일 등 숫자와 조건을 새로 만들거나 추정하지 않는다.
2. 근거가 부족해 독자에게 도움 되는 글이 안 되면 첫 줄에 STATUS: needs_evidence 만 쓰고 끝낸다. 충분하면 첫 줄에 STATUS: draft.
3. 개인 경험·상담·전화·인터뷰를 지어내지 않는다("제가 받아봤다" 금지). 예시는 반드시 "가정" 표시.
4. 개인별 수급 가능 여부·세액·이자 손익을 확정하지 않는다. 투자·종목 추천 금지. 겁주거나 과장하지 않는다.
5. 시행 예정과 시행 중을 구분한다. 서로 다른 제도(예: 국민연금/기초연금)는 먼저 구분한다.
6. 구성: 상황 3~5문장 → 직접 답 2~3문장 → 원인·조건 2~3개 → 예외 → 독자가 오늘 할 행동 → 마무리. 문단은 1~3문장.
   문체: 친구한테 카톡하듯 가벼운 반말(~했어, ~거든, ~래, ~더라고). 존댓말·보도자료체·'~하겠습니다' 금지. 재밌게 — 공감 가는 상황, 의외의 반전, 가벼운 드립 1~2개. 단 드립 때문에 숫자·조건이 바뀌면 안 되고, 내가 직접 겪은 척하는 표현은 금지. 처음부터 끝까지 반말로 통일, 영어·외국어 단어 섞지 말 것, 뜻이 안 통하는 억지 비유 금지, 쉬운 말로.
7. 분량 공백 포함 900~1,500자. 금액·기간·연도는 아라비아 숫자. HTML은 h2·p·ul·li·table·strong만(script/iframe/외부링크 금지).
${fixes.length ? `8. 이전 초안의 문제를 반드시 고친다:\n${fixes.map(f => `- ${f}`).join('\n')}\n` : ''}
[출력 — STATUS 줄 다음 줄에 제목 주석, 그 다음 HTML만]
STATUS: draft
<!--TITLE: (독자 질문 + 답의 범위, 20~32자, 반말도 OK, 선정적 낚시 금지)-->
<h2>...</h2><p>...</p>`;
}

function checkerPrompt(article: string, source: string, date: string): string {
  return `당신은 경제 콘텐츠 검수자다. 초안을 보도자료 원문과 문장별로 대조한다.
보도자료 날짜는 ${date}이며 이 연도·날짜는 사실로 인정한다. 용어 풀이·일반적 설명은 위반이 아니다. 반말·구어체·가벼운 드립도 위반이 아니다.
위반으로 지적할 것은 오직 다음뿐이다: 원문에 없거나 원문과 다른 숫자·금액·비율·기간·대상·조건, 증가/감소·상승/하락 방향 오류, 시행 예정/시행 중 혼동, 지어낸 개인 경험, 개인별 수급·세액 확정 판정, 특정 상품·종목 투자 권유.
원문과 일치하면 pass다. 사소한 표현 차이는 지적하지 않는다.
JSON 하나만 출력: {"result":"pass|revise|block","issues":["..."]}
pass=위반 없음, revise=고치면 가능, block=근본적으로 근거 부족·위험.

[원문]
${source}

[초안]
${article.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000)}`;
}

const ai = (p: string) => generateText(p, 'groq', undefined, undefined, undefined, undefined, { ollamaOnly: true }); // Groq → Gemini


function polishPrompt(html: string): string {
  return `아래 블로그 글 HTML을 교정해라. 고칠 것: 맞춤법·오타, 한국어에 섞인 영어·외국어 단어(한국어로), 존댓말 섞임(전부 가벼운 반말로 통일), 뜻이 안 통하거나 억지스러운 비유·문장(삭제하거나 평이하게), 어색한 조사·어순.
절대 바꾸지 말 것: 모든 숫자·금액·비율·기간·고유명사, 사실 관계, HTML 구조(태그 종류·순서), 글 길이(±10%). 새 내용 추가 금지.
교정된 HTML만 출력(설명·코드펜스 금지).

${html}`;
}

const LATIN = /[A-Za-z]{4,}/;
async function polish(html: string, srcText: string): Promise<string> {
  const out = (await ai(polishPrompt(html))).replace(/```html?\n?|\n?```/gi, '').trim();
  const ok = out.length > html.length * 0.7 && out.length < html.length * 1.3 && /<h2/i.test(out) && !unsupportedNumbers(out, srcText).length;
  return ok ? out : html;
}

export async function draftArticle(srcTitle: string, date: string, text: string): Promise<{ title: string; html: string; reason: string }> {
  let title = '', html = '', fixes: string[] = [], reason = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = (await ai(writerPrompt(srcTitle, date, text, fixes))).replace(/```html?\n?|\n?```/gi, '').trim();
    if (/^STATUS:\s*needs_evidence/i.test(out)) return { title, html: '', reason: '근거 부족(작성 모델 판정)' };
    const body = out.replace(/^STATUS:\s*\w+\s*/i, '');
    title = tightTitle((body.match(/^<!--\s*TITLE:\s*(.+?)\s*-->/i)?.[1] || srcTitle).trim());
    html = body.replace(/^<!--\s*TITLE:.*?-->\s*/i, '');
    if (html.length < 400) return { title, html: '', reason: '본문 너무 짧음' };

    const bad = unsupportedNumbers(html, text);
    if (bad.length) { fixes = [`원문에 없는 숫자 삭제 또는 원문 값으로 교체: ${bad.join(', ')}`]; reason = `원문에 없는 숫자: ${bad.join(', ')}`; continue; }
    const raw = await ai(checkerPrompt(html, text, date));
    const v = (() => { try { return JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}'); } catch { return {}; } })() as { result?: string; issues?: string[] };
    if (v.result === 'pass') {
      html = await polish(html, text);
      if (LATIN.test(html.replace(/<[^>]+>/g, ''))) html = await polish(html, text);
      return { title, html, reason: '' };
    }
    fixes = v.issues || [];
    reason = `검수 ${v.result || '판정불가'}: ${fixes.join(' / ').slice(0, 120)}`;
    if (v.result === 'block' || !v.result) break;
  }
  return { title, html: '', reason };
}

export interface NaverEconResult { summary: string; sourceUrl?: string; title?: string }

export async function runNaverEconAuto(userId: string): Promise<NaverEconResult> {
  const blogId = await getSetting('NAVER_ECON_BLOG_ID');
  if (!blogId) return { summary: '경제 블로그 ID 미설정 — 대기(NAVER_ECON_BLOG_ID)' };

  const admin = createAdminClient();
  const { data: used } = await admin.from('bossai_naver_tech_posts').select('source_url').like('source_name', 'econ%').order('created_at', { ascending: false }).limit(500);
  const usedSet = new Set((used || []).map((r: { source_url: string }) => r.source_url));
  const mark = (url: string, srcTitle: string, title: string, note: string) =>
    admin.from('bossai_naver_tech_posts').insert({ user_id: userId, source_url: url, source_name: 'econ-korea.kr', source_title: srcTitle, title, post_url: note });

  const candidates = (await fetchList()).filter(i => RELEVANT.test(i.title) && !SKIP.test(i.title) && !usedSet.has(i.url));
  if (!candidates.length) return { summary: '새로 쓸 경제·복지 관련 공식 보도자료 없음 — 건너뜀' };

  for (const item of candidates.slice(0, 3)) {
    const { text, date } = await fetchBody(item.url).catch(() => ({ text: '', date: '' }));
    if (text.length < 600) { await mark(item.url, item.title, '', 'skipped:본문 짧음'); continue; }

    const d = await draftArticle(item.title, date, text);
    if (!d.html) { await mark(item.url, item.title, d.title, `skipped:${d.reason.slice(0, 150)}`); continue; }
    const title = d.title;
    let html = d.html;

    const { displayUrls, thumbUrl } = await searchInlineImages(title, 0, { aiThumb: true, noInline: true, keepExternal: true });
    html = insertImages(html, [...new Set([thumbUrl, ...displayUrls].filter((u): u is string => !!u))]);

    const { data: job, error } = await admin.from('naver_publish_jobs').insert({
      user_id: userId, title, content: sanitizeForNaver(html), tags: [], category_no: 0, is_publish: true,
      job_type: 'scrape', source_url: item.url, notion_page_id: '__auto_econ__', status: 'pending',
    }).select('id').single();
    if (error || !job) throw new Error(`naver_publish_jobs 등록 실패: ${error?.message}`);
    await dispatchNaverPublishJob(job.id);
    await mark(item.url, item.title, title, '');
    return { summary: `${title} → 발행 큐 등록(job ${job.id})`, sourceUrl: item.url, title };
  }
  return { summary: `후보 ${candidates.slice(0, 3).length}건 모두 근거·검수 미통과로 발행 안 함` };
}
