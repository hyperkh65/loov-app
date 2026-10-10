import crypto from 'crypto';
import { getSetting } from '@/lib/get-setting';
import { FRIENDLY_TONE_RULES } from '@/lib/auto-blog-prompt';

export async function authorized(req: Request): Promise<boolean> {
  const key = await getSetting('GPT_ACTION_KEY');
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return !!key && got.length === key.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(key));
}

export function safeUrl(u: string): URL | null {
  try {
    const x = new URL(u);
    const h = x.hostname;
    if (!/^https?:$/.test(x.protocol) || !h.includes('.') || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h)) return null;
    return x;
  } catch { return null; }
}

// ── 리서치(수집이 막힐 때 쓰는 백업) ─────────────────────────────────────
async function naver(type: 'webkr' | 'blog' | 'news' | 'kin', q: string, sort: 'sim' | 'date' = 'sim') {
  const [id, secret] = await Promise.all([getSetting('NAVER_CLIENT_ID'), getSetting('NAVER_CLIENT_SECRET')]);
  if (!id || !secret) return [];
  try {
    const r = await fetch(`https://openapi.naver.com/v1/search/${type}.json?query=${encodeURIComponent(q)}&display=8&sort=${sort}`,
      { headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const strip = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    return ((await r.json()).items || []).map((i: { title: string; description: string; link: string }) =>
      ({ title: strip(i.title), description: strip(i.description).slice(0, 160), link: i.link }));
  } catch { return []; }
}

async function suggest(q: string): Promise<string[]> {
  const get = async (url: string, pick: (j: any) => string[]) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    try { return pick(await (await fetch(url, { signal: AbortSignal.timeout(5000) })).json()); } catch { return []; }
  };
  const e = encodeURIComponent(q);
  const [n, g] = await Promise.all([
    get(`https://ac.search.naver.com/nx/ac?q=${e}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100`, j => (j.items?.[0] || []).map((x: string[]) => x[0])),
    get(`https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&q=${e}`, j => j[1] || []),
  ]);
  return [...n, ...g];
}

export async function research(keyword: string) {
  const [web, blog, news, kin, ...sug] = await Promise.all([
    naver('webkr', keyword), naver('blog', keyword), naver('news', keyword, 'date'), naver('kin', keyword),
    ...['', ' 방법', ' 주의', ' 오류', ' 추천'].map(s => suggest(keyword + s)),
  ]);
  const related = [...new Set(sug.flat())].filter(k => k !== keyword).slice(0, 40);
  return { keyword, related_keywords: related, naver_web: web, naver_blog: blog, naver_news: news, naver_kin: kin };
}

// ── 키워드별 안전 메모 ───────────────────────────────────────────────────
const RISKY = /토렌트|torrent|크랙|crack|불법|무료\s?다운|다운로드 사이트|영화 다운|웹하드/i;
export const RISK_NOTES = `【이 키워드는 법·정책 주의 주제】
- 기술 자체(예: 토렌트 프로토콜)는 합법이다. 설명은 "합법적으로 쓰는 법 + 위험을 피하는 법" 관점으로 쓴다. (리눅스 ISO, 오픈소스, 공개 라이선스 자료 등 합법 예시)
- 저작권 있는 영화·드라마·게임·소프트웨어의 불법 다운로드 사이트 이름·주소·링크를 소개/추천/순위화하지 않는다. 링크는 공식 사이트(클라이언트 배포처, 정부·기관, 공식 문서)만 건다.
- 위험을 구체적으로 알려 준다: 악성코드·랜섬웨어, 가짜 실행파일, 광고 팝업 사기, IP 노출, 업로드(시딩)로 인한 저작권법 책임(형사·민사), ISP 경고, 개인정보 유출.
- 구글 애드센스 정책상 불법 다운로드를 조장하는 글은 광고 제한·계정 정지 위험이 있다. "안전하게 쓰는 법·피해야 할 사이트의 특징" 으로 쓰면 정책 안전 + 신뢰도 높은 글이 된다.`;
export const needsRiskNotes = (keyword: string) => RISKY.test(keyword);

// ── 작성 지침 ────────────────────────────────────────────────────────────
export const GUIDE = `# LOOV 블로그 작성 지침 (네이버·다음 상위노출 + 롱테일 수익형)

## 목표
검색한 사람이 "이 글 하나로 끝났다"고 느끼게 만든다. 클릭 → 끝까지 읽음 → 믿음 → 광고/링크 클릭이 수익이다. 검색 의도(무엇을 하려고 검색했나)를 첫 화면에서 해결한다. 지침은 최소 기준이다. 더 좋은 구성이 있으면 그렇게 쓰고, 경쟁 글(researchKeyword 결과 상위 글)보다 확실히 낫게 만든다.

## 작업 순서
1. researchKeyword로 연관·롱테일 키워드와 현재 상위 글을 본다. 직접 웹 검색/브라우징이 되면 그것도 쓴다. 막히면 readPage로 상위 글·공식 사이트를 읽는다. 어떤 사이트를 참고할지는 스스로 판단한다.
2. 메인 키워드 1개 + 롱테일 3~5개를 정하고, 상위 글에 없는 것(빠진 정보, 오래된 정보, 실수하기 쉬운 부분)을 찾는다. 이게 차별점이다.
3. HTML로 쓴다. validateDraft로 검사하고 errors가 0이 될 때까지 고친다. warnings도 가능한 한 없앤다.
4. 통과하면 saveDraft로 저장한다. (발행은 사람이 대시보드에서 검토 후 한다)

## 제목 (title)
- 20~32자. 메인 키워드를 앞쪽에. 숫자·상황·결과 중 하나로 클릭 이유를 준다. 낚시·과장 금지. (예: "토렌트 처음 쓰는 법, 설치부터 안전 설정까지 3단계")

## 메타 설명 (meta_description)
- 100~160자. 키워드 포함, 읽으면 얻을 것을 한 줄로.

## 도입부 (첫 화면)
- 3~5문장. 첫 문장에 독자의 상황/고민을 짚고, 둘째 문장에 이 글이 해결해 줄 결론을 먼저 말한다(두괄식). 키워드를 자연스럽게 1회. "알아보겠습니다" 금지.
- 도입부 뒤에 "이 글에서 볼 것"을 2~3줄로 짧게 예고해도 좋다.

## 본문
- H2 5~8개. 소제목은 독자가 실제로 검색할 법한 말(롱테일)로. 각 H2 아래 단락 2~3개, 단락은 2~4문장(모바일에서 읽기 쉽게).
- 총 순수 텍스트 3,500~6,000자.
- 단계가 있으면 <ol>, 체크리스트는 <ul>. 실수/주의는 "이렇게 하면 이런 일이 생겨요"처럼 구체적으로.
- 키워드는 본문에 5~15회 자연스럽게. 억지 반복 금지.

## 표 (필수, 1개 이상)
- 비교·요약·체크표 중 독자에게 진짜 도움이 되는 표 1~2개. <table><thead><tr><th>…</th></tr></thead><tbody>…</tbody></table>. 스타일은 서버가 입혀 준다.

## 출처·링크·신뢰성 (필수)
- 글 끝에 <h2>출처와 참고한 곳</h2> + <ul><li><a href="URL">사이트명</a> — 무엇을 참고했는지 한 줄</li></ul>. 서로 다른 사이트 2곳 이상, 가능하면 공식 사이트·공공기관·원문 위주.
- 링크는 실제 주소 그대로 쓴다. 저장할 때 시스템이 자동으로 LOOV 이동 페이지(광고 노출)를 거치도록 바꾼다. 본문 중간에도 관련 공식 사이트로 가는 링크를 2~3곳 자연스럽게 건다(“공식 다운로드 페이지” 처럼 무엇이 나오는지 알려 주는 문구).
- 본문 중 관련 설명이 나오는 자리에도 <a href> 링크로 공식 페이지로 보낸다(독자 이동 편의).
- 실제로 열어서 확인한 주소만 쓴다. 기억에 의존해 URL을 만들지 않는다. 수치·날짜·법·정책은 확인한 것만 쓰고, 기준 시점을 적는다(예: "2026년 10월 기준").
- 확신 없는 내용은 빼거나 "확인이 필요해요"라고 솔직하게 쓴다.

## 이미지
- 대표이미지 1장 필수 (featured_image_url 또는 직접 만든 이미지 파일). 본문 이미지는 2~4장 권장, 모두 alt 텍스트 필수.
- 저작권: 남의 블로그/커뮤니티 사진은 쓰지 않는다. 직접 생성한 그림, 공식 사이트가 배포한 화면/로고, 라이선스가 확실한 무료 이미지(Pexels/Pixabay/Wikimedia Commons)를 쓴다. researchKeyword의 image_query_en 에 영어 검색어를 주면 스톡 후보를 준다.
- 이미지를 쓰기 전에 글 내용과 맞는지 직접 보고 판단한다. 안 맞으면 쓰지 않고 새로 그린다.
- 직접 그릴 때는 글자(텍스트)가 들어가지 않는 장면 위주로.

## 차별점
- 상위 글이 안 다룬 것 1가지 이상: 흔한 실수, 최신 변경점, 비교표, 직접 해 본 순서, 상황별 선택 가이드 등. 본문 안에 분명히 드러나게 쓴다.

## FAQ
- 끝부분에 <h2>자주 묻는 질문</h2> + 질문 3~5개. 질문은 <p><b>Q. …</b></p>, 답은 <p>…</p> 일반 문단. 박스/카드 금지.

## 형식 규칙
- 결과물은 HTML 조각만. <html>/<body>/<h1> 없음(제목은 title 필드). 마크다운(**, ##) 금지. [대괄호 지시문] 남기지 않기. <script>/<iframe> 금지. 한국어만(한자·일본어 금지).
- <h2>는 소제목, 필요하면 <h3>. 번호·박스 없이 자연스러운 문장형.

${FRIENDLY_TONE_RULES}

## 최종 자기 점검
"이 글 하나만 읽고 다른 탭을 안 열어도 되는가? 상위 글보다 확실히 나은 점이 있는가? 틀린 정보·지어낸 URL은 없는가?" 셋 중 하나라도 아니면 고쳐서 다시 검사한다.`;

// ── 형태 검사 ────────────────────────────────────────────────────────────
export interface DraftIn { title?: string; meta_description?: string; content_html?: string; keyword?: string; featured_image_url?: string; hasFileImages?: boolean }

export function validateDraft(d: DraftIn) {
  const errors: string[] = [], warnings: string[] = [];
  const html = d.content_html || '', title = (d.title || '').trim(), meta = (d.meta_description || '').trim();
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const kw = (d.keyword || '').trim(), kwTokens = kw.split(/\s+/).filter(Boolean);
  const h2 = (html.match(/<h2\b/gi) || []).length;
  const tables = (html.match(/<table\b/gi) || []).length;
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
  const hosts = new Set<string>();
  for (const m of html.matchAll(/<a\s[^>]*href=["'](https?:\/\/[^"']+)["']/gi)) { try { hosts.add(new URL(m[1]).hostname.replace(/^www\./, '')); } catch { /* skip */ } }
  const firstH2 = html.search(/<h2\b/i);
  const intro = (firstH2 > 0 ? html.slice(0, firstH2) : '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const kwCount = kw ? text.split(kw).length - 1 : 0;

  if (title.length < 10 || title.length > 60) errors.push(`제목 길이 ${title.length}자 — 20~32자로`); else if (title.length < 18 || title.length > 36) warnings.push(`제목 ${title.length}자 — 20~32자 권장`);
  if (kwTokens.length && !kwTokens.every(t => title.includes(t))) errors.push('제목에 메인 키워드가 모두 들어가야 함');
  if (meta.length < 90 || meta.length > 175) warnings.push(`메타 설명 ${meta.length}자 — 100~160자 권장`);
  if (kw && meta && !kwTokens.every(t => meta.includes(t))) warnings.push('메타 설명에 키워드 포함 권장');
  if (text.length < 2500) errors.push(`본문 ${text.length}자 — 최소 2500자(권장 3500~6000)`); else if (text.length < 3500) warnings.push(`본문 ${text.length}자 — 3500자 이상 권장`); else if (text.length > 10000) warnings.push('본문이 너무 김(10000자 초과)');
  if (h2 < 4) errors.push(`H2 소제목 ${h2}개 — 최소 4개(권장 5~8)`);
  if (!tables) errors.push('표(<table>)가 최소 1개 필요');
  else if (!/<th\b/i.test(html)) warnings.push('표에 제목 행(<th>) 권장');
  if (!d.featured_image_url && !d.hasFileImages && !imgs.length) errors.push('대표이미지가 필요 (featured_image_url 또는 생성한 이미지 파일)');
  if (imgs.some(i => !/\balt=["'][^"']+/i.test(i))) warnings.push('alt 없는 이미지가 있음');
  if (hosts.size < 1) errors.push('외부 링크(<a href>)가 필요 — 출처/공식 사이트 2곳 이상'); else if (hosts.size < 2) warnings.push('서로 다른 사이트 링크 2곳 이상 권장');
  if (!/출처|참고\s?자료|참고한 곳|참조/.test(text)) errors.push('"출처와 참고한 곳" 섹션이 필요');
  if (!/20\d\d년|기준|업데이트/.test(text)) warnings.push('기준 시점(예: 2026년 10월 기준) 표기 권장');
  if (!/자주 묻는|FAQ|Q\./i.test(text)) warnings.push('FAQ 섹션 권장 (질문 3~5개)');
  if (intro.length < 60) warnings.push('도입부(첫 H2 이전)가 너무 짧거나 없음 — 3~5문장'); else if (intro.length > 600) warnings.push('도입부가 너무 김 — 3~5문장');
  if (kw && intro && !kwTokens.some(t => intro.includes(t))) warnings.push('도입부에 키워드가 자연스럽게 들어가면 좋음');
  if (!/직접|제가|저는|해보니|써보니|실제로|경험|흔한 실수|많이 하는 실수/.test(text)) warnings.push('차별점/경험 신호(직접 해 본 순서, 흔한 실수 등)가 안 보임');
  if (!/<(ul|ol)\b/i.test(html)) warnings.push('목록(<ul>/<ol>) 없음 — 체크리스트/단계 권장');
  if (kw && kwCount < 3) warnings.push(`키워드 "${kw}" ${kwCount}회 — 5~15회 권장`); else if (kwCount > 25) warnings.push(`키워드 ${kwCount}회 — 과다(스터핑)`);
  if ([...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].some(m => m[1].replace(/<[^>]+>/g, '').length > 450)) warnings.push('450자 넘는 긴 단락이 있음 — 2~4문장으로 쪼개기');
  const bad = ['참고자료에 따르면', '보도에 따르면', '자료에 따르면', '로 알려졌다', '것으로 전해진다', '로 확인됐다'].filter(p => text.includes(p));
  if (bad.length) errors.push(`출처 말투 금지 표현: ${bad.join(', ')}`);
  const tells = ['시사하는 바', '주목할 만', '결론적으로', '정리하자면', '종합하면', '첫째,', '둘째,', '에 있어서'].filter(p => text.includes(p));
  if (tells.length) warnings.push(`AI 티 표현: ${tells.join(', ')}`);
  if ((text.match(/또한|더불어|아울러|뿐만 아니라/g) || []).length > 3) warnings.push('"또한/더불어/아울러" 과다');
  if (/^\s*#{1,6}\s|\*\*[^*]+\*\*/m.test(html)) errors.push('마크다운(##, **) 금지 — HTML 태그로');
  if (/\{\{|\[(소제목|제목|내용|키워드)/.test(html)) errors.push('대괄호/템플릿 지시문이 남아 있음');
  if (/[぀-ヿ一-鿿]/.test(text + title)) errors.push('한자/일본어 문자 금지');
  if (/<script|<iframe|\son\w+\s*=|javascript:/i.test(html)) errors.push('script/iframe/이벤트 속성 금지');
  if (/<(html|body|h1)\b/i.test(html)) errors.push('<html>/<body>/<h1> 금지 — 본문 조각만');

  return { pass: !errors.length, score: Math.max(0, 100 - errors.length * 15 - warnings.length * 4), errors, warnings, stats: { text_chars: text.length, h2, tables, images: imgs.length, external_hosts: [...hosts], keyword_count: kwCount } };
}

// ── 저장 전 정리: 위험 태그 제거 + 블로그 공통 스타일 ───────────────────────
export function normalizeHtml(html: string): string {
  const th = 'border:1px solid #d0d7de;padding:10px;background:#eaf2ff;text-align:left;', td = 'border:1px solid #d0d7de;padding:10px;';
  return html
    .replace(/<(script|iframe|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<h2(?![^>]*\bstyle=)([^>]*)>/gi, '<h2$1 style="font-size:22px;color:#1a73e8;margin:34px 0 12px;font-weight:bold;" data-ke-size="size26">')
    .replace(/<table(?![^>]*\bstyle=)([^>]*)>([\s\S]*?)<\/table>/gi, '<div style="overflow-x:auto;"><table$1 style="width:100%;border-collapse:collapse;margin:18px 0;font-size:15px;">$2</table></div>')
    .replace(/<th(?![^>]*\bstyle=)([^>]*)>/gi, `<th$1 style="${th}">`)
    .replace(/<td(?![^>]*\bstyle=)([^>]*)>/gi, `<td$1 style="${td}">`)
    .replace(/<a\s+([^>]*?)href=(["'])(https?:[^"']+)\2([^>]*)>/gi, (_m, pre, q, u, post) => {
      const href = /^https?:\/\/(www\.)?loov\.co\.kr\//i.test(u) ? u : `https://loov.co.kr/out?u=${encodeURIComponent(u.replace(/&amp;/g, '&'))}`;
      return `<a ${pre.replace(/\s?(target|rel)=("[^"]*"|'[^']*')/gi, "")}href=${q}${href}${q}${post.replace(/\s(target|rel)=("[^"]*"|'[^']*')/gi, '')} target="_blank" rel="nofollow noopener noreferrer">`;
    });
}
