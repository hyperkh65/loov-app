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
- 제목은 네가 판단해서 정한다. 검색한 사람이 "어? 이거 내 얘기네, 뭐지?" 하고 클릭하게 만드는 게 핵심이다. 20~36자, 메인 키워드(롱테일)는 들어가되 앞쪽이면 좋다.
- 식상한 "~ 정리", "~ 총정리", "~ 방법 안내", "~ 알아보기"로 끝내지 않는다. 실제로 해 본 사람의 결과·상황·숫자가 보이는 말투로 쓴다. 예: "정부지원금 신청했더니 월 12만원 아꼈어요", "토렌트 처음 썼다가 놓친 3가지", "전기요금 줄이려고 이것만 바꿨더니 4만원 절약".
- 본문이 실제로 뒷받침하는 결과만 쓴다(없는 금액·경험을 지어내지 않는다). 낚시·과장 금지. 후보 3개를 머릿속에서 비교해 가장 궁금한 것을 고른다.

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
- 링크는 실제 주소 그대로 쓴다(저장 시 새 탭으로 열리게 자동 처리되어, 독자가 이동해도 이 글이 남아 있다). 본문 중간에도 관련 공식 사이트로 가는 링크를 2~3곳 자연스럽게 건다(“공식 다운로드 페이지” 처럼 무엇이 나오는지 알려 주는 문구).
- 본문 중 관련 설명이 나오는 자리에도 <a href> 링크로 공식 페이지로 보낸다(독자 이동 편의).
- 실제로 열어서 확인한 주소만 쓴다. 기억에 의존해 URL을 만들지 않는다. 수치·날짜·법·정책은 확인한 것만 쓰고, 기준 시점을 적는다(예: "2026년 10월 기준").
- 확신 없는 내용은 빼거나 "확인이 필요해요"라고 솔직하게 쓴다.

## 이미지
- 이미지는 대표 1장 + 본문 2~4장, 합계 최소 3장(권장 4~5장). 모두 alt 텍스트 필수. 장면이 겹치지 않게 각기 다른 설명 이미지(설치 화면 흐름, 위험 구별 예시, 비교 도표 등)를 만든다.
- 직접 그린 이미지는 openaiFileIdRefs에 순서대로 담는다. 첫 번째가 대표이미지. 두 번째부터는 본문 넣을 자리에 <img src="{{file:2}}" alt="설명">, 세 번째는 {{file:3}} 처럼 번호로 적는다(대표이미지 {{file:1}}는 본문에 따로 쓰지 않는다).
- 관련 사이트에서 가져올 이미지는 공식 사이트 이미지 주소를 <img src="https://...">로 직접 쓴다(저장 시 우리 서버로 옮겨진다). 글 내용과 맞는지 보고 고른다.
- 이미지는 직접 그리는 것이 기본이다(이미지 생성 사용). 대표이미지와 본문 이미지 모두 이 글의 내용을 설명하는 그림으로 각각 따로 그린다(예: 설치 순서 도식, 위험 구별 예시, 비교 인포그래픽). 한글 글씨가 필요한 도식은 글자를 최소화하고 번호·아이콘 위주로 그린다.
- 스톡 사진(Pixabay/Pexels)은 내용과 상관없는 분위기 사진이라 쓰지 않는다. 직접 그릴 수 없을 때만, 글 내용을 정확히 보여주는 것에 한해 마지막 수단으로 쓴다. 공식 사이트가 배포한 화면/로고는 내용이 맞으면 써도 된다.
- 저작권: 남의 블로그/커뮤니티 사진은 쓰지 않는다. researchKeyword의 stock_image_candidates는 참고용이며 기본값으로 고르지 않는다.
- SVG·data URI·코드(파이썬 등)로 그린 이미지는 서버가 받지 못한다. 반드시 이미지 생성 도구로 만든 PNG/JPG 파일을 openaiFileIdRefs에 넣는다. 저장이 이미지 오류로 실패하면 다른 URL 이미지로 몰래 바꿔치지 말고, 이미지 생성을 다시 시도하거나 실패 사실을 사용자에게 그대로 알린다.
- 이미지를 쓰기 전에 글 내용과 맞는지 직접 보고 판단한다. 안 맞으면 쓰지 않고 새로 그린다. 그린 이미지는 반드시 openaiFileIdRefs로 보낸다.
- 직접 그릴 때는 글자(텍스트)가 들어가지 않는 장면 위주로.

## 양식·자료 파일 (있으면 꼭 챙긴다)
- 주제와 관련된 신청서·서식·체크리스트·공식 안내문 같은 내려받을 파일(PDF, HWP, DOCX, XLSX 등)이 있으면 찾아서 saveDraft의 attachments로 보낸다(파일당 15MB 이하). 독자에게 큰 도움이 된다.
- 올려도 되는지는 네가 해당 페이지를 직접 열어 판단한다. 공공누리·공공데이터처럼 자유 이용이 명시됐거나 공공기관이 일반에 배포하는 서식은 가능. 저작권 표기가 있거나 유료·회원 전용·재배포 금지, 출처 불명, 개인정보가 든 파일은 올리지 않고 원본 링크만 본문에 건다.
- 각 파일마다 permission_note에 "어디서 확인했고(예: 공공누리 1유형, 기관 배포 서식) 왜 올려도 되는지"를 한 줄로 쓰고, source_page_url에 파일이 있던 페이지 주소를 넣는다. 본문에 "양식 내려받기" 섹션은 서버가 자동으로 붙인다.

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
export interface DraftIn { title?: string; meta_description?: string; content_html?: string; keyword?: string; featured_image_url?: string; hasFileImages?: boolean; fileCount?: number }

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
  const fileCount = d.fileCount || 0, placed = imgs.filter(i => /\{\{file:\d+\}\}/.test(i));
  const total = imgs.length + (d.featured_image_url ? 1 : 0) + Math.max(0, fileCount - placed.length);
  if (!total) errors.push('대표이미지가 필요 (featured_image_url 또는 생성한 이미지 파일)');
  else if (total < 3) errors.push(`이미지 ${total}장 — 대표 1장 + 본문 2장 이상(합계 3장 이상) 필요`);
  if (placed.some(i => Number(i.match(/\{\{file:(\d+)\}\}/)![1]) > fileCount)) errors.push('{{file:N}} 번호가 openaiFileIdRefs 개수보다 큼');
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
  const tells = ['시사하는 바', '주목할 만', '결론적으로', '정리하자면', '종합하면', '첫째,', '둘째,', '에 있어서', '살펴보겠습니다', '알아보겠습니다', '중요한 역할을 합니다'].filter(p => text.includes(p));
  if (tells.length >= 3) errors.push(`AI 티 표현 ${tells.length}개(${tells.join(', ')}) — 사람이 쓴 말투로 고쳐 쓰기`);
  else if (tells.length) warnings.push(`AI 티 표현: ${tells.join(', ')}`);
  const conj = (text.match(/또한|더불어|아울러|뿐만 아니라/g) || []).length;
  if (conj > 5) errors.push(`"또한/더불어/아울러" ${conj}회 — 3회 이하로`);
  else if (conj > 3) warnings.push('"또한/더불어/아울러" 과다');
  if (/^\s*#{1,6}\s|\*\*[^*]+\*\*/m.test(html)) errors.push('마크다운(##, **) 금지 — HTML 태그로');
  if (/\{\{|\[(소제목|제목|내용|키워드)/.test(html)) errors.push('대괄호/템플릿 지시문이 남아 있음');
  if (/[぀-ヿ一-鿿]/.test(text + title)) errors.push('한자/일본어 문자 금지');
  if (/<script|<iframe|\son\w+\s*=|javascript:/i.test(html)) errors.push('script/iframe/이벤트 속성 금지');
  if (/<(html|body|h1)\b/i.test(html)) errors.push('<html>/<body>/<h1> 금지 — 본문 조각만');

  return { pass: !errors.length, score: Math.max(0, 100 - errors.length * 15 - warnings.length * 4), errors, warnings, stats: { text_chars: text.length, h2, tables, images: imgs.length, external_hosts: [...hosts], keyword_count: kwCount } };
}

// ── 저장 전 정리: 위험 태그 제거 + 블로그 공통 스타일 ───────────────────────
const LINK_STYLE = 'display:inline-block;padding:3px 12px;margin:0 2px;border-radius:999px;background:linear-gradient(110deg,#1a73e8 30%,#6db3ff 50%,#1a73e8 70%);background-size:200% 100%;color:#fff;font-weight:700;text-decoration:none;box-shadow:0 2px 10px rgba(26,115,232,.45);';
const LINK_CSS = '<style>@keyframes loovShine{0%{background-position:200% 0}100%{background-position:-200% 0}}@keyframes loovGlow{0%,100%{box-shadow:0 2px 8px rgba(26,115,232,.35)}50%{box-shadow:0 2px 16px rgba(109,179,255,.9)}}a.loov-link{animation:loovShine 2.8s linear infinite,loovGlow 2s ease-in-out infinite}a.loov-link:hover{filter:brightness(1.1);transform:translateY(-1px)}@media(prefers-reduced-motion:reduce){a.loov-link{animation:none}}</style>';
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
    .replace(/<a\s+([^>]*href=["']https?:[^>]*)>/gi, (m, a) => /\bclass=["'][^"']*loov-link/i.test(a) ? m : `<a ${a.replace(/\s?(target|rel|style|class)=("[^"]*"|'[^']*')/gi, '')} class="loov-link" target="_blank" rel="noopener noreferrer" style="${LINK_STYLE}">`)
    + LINK_CSS;
}
