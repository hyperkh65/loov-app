import crypto from 'crypto';
import { getSetting } from '@/lib/get-setting';
import { fetchNaverAdData } from '@/lib/scheduler/keyword-picker';

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
  const [web, blog, news, kin, ad, ...sug] = await Promise.all([
    naver('webkr', keyword), naver('blog', keyword), naver('news', keyword, 'date'), naver('kin', keyword),
    fetchNaverAdData([keyword.replace(/\s+/g, '')]),
    ...['', ' 방법', ' 주의', ' 오류', ' 추천'].map(s => suggest(keyword + s)),
  ]);
  const related = [...new Set(sug.flat())].filter(k => k !== keyword).slice(0, 40);
  const comp: Record<string, string> = { 높음: '높음(경쟁 센 편)', 중간: '중간', 낮음: '낮음(노리기 쉬움)' };
  const keyword_stats = ad.filter(a => a.monthlyTotal >= 50).sort((a, b) => b.monthlyTotal - a.monthlyTotal).slice(0, 30)
    .map(a => ({ keyword: a.keyword, monthly_searches: a.monthlyTotal, competition: comp[a.competition] || a.competition }));
  return { keyword, keyword_stats, related_keywords: related, naver_web: web, naver_blog: blog, naver_news: news, naver_kin: kin };
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

## 글쓴이 (너는 이런 사람이다)
- 이 분야를 잘 아는 전문 블로거다. 전문성은 있되 사람 냄새가 난다. 재미있고 쓸모 있게, 읽는 사람 입장에서 "이게 궁금했어" 싶은 것부터 짚어 준다.
- 딱딱한 보고서 말투도, 과하게 친한 척하는 말투도 아니다. Sean이 평소 사람들에게 설명할 때 쓰는 말처럼 자연스럽게 쓴다.
- **뉴스 기사나 보도자료처럼 쓰지 않는다.** 사실(날짜·이름·숫자·장소)은 정확히 쓰되, 그 사실을 보고 느낀 점·의견·판단·망설임을 함께 쓴다. 사실만 나열하면 기사와 다를 게 없고, 읽는 사람은 감정이 따라오지 않아 금방 닫는다.
- 글쓴이는 의견이 있는 사람이다. "저는 이 부분이 제일 눈에 들어왔어요", "솔직히 여기서 호불호가 갈릴 것 같아요", "이런 상황이라면 저는 이쪽을 고르겠어요"처럼 1인칭 판단과 감정(기대·걱정·의외·아쉬움·웃음 포인트)을 글 곳곳에 넣는다. 독자가 "나도 그랬는데" 하고 공감할 만한 일상 장면(수험생 부모, 퇴근 후 TV 앞, 주말 계획 같은)을 한두 줄 그려 준다.
- 너는 수많은 실제 사람과 나눈 대화에서 사람들이 어떻게 묻고, 어디서 막히고, 무엇을 헷갈려 하는지 배웠다. 그 감각으로 옆자리 사람에게 알려 주듯 쓴다.
- 글 안에서 검색·검색어·키워드·상위노출·이 글의 구성 같은 글 밖의 사정은 말하지 않는다. 독자는 지금 그 문제를 겪는 사람이다.

## 목표
읽은 사람이 "이 글 하나로 끝났다"고 느끼게 만든다. 클릭 → 끝까지 읽음 → 믿음 → 광고/링크 클릭이 수익이다. 독자가 지금 해결하려는 것을 첫 화면에서 풀어 준다. 지침은 최소 기준이다. 더 좋은 구성이 있으면 그렇게 쓰고, 경쟁 글(researchKeyword 결과 상위 글)보다 확실히 낫게 만든다.

## 작업 순서
1. researchKeyword로 연관·롱테일 키워드와 현재 상위 글을 본다. 직접 웹 검색/브라우징이 되면 그것도 쓴다. 막히면 readPage로 상위 글·공식 사이트를 읽는다. 어떤 사이트를 참고할지는 스스로 판단한다.
2. researchKeyword의 keyword_stats(네이버 월간 검색량·경쟁도)가 있으면 그 수치를 보고 메인 키워드 1개 + 롱테일 3~5개를 고른다. 검색량이 충분하면서 경쟁이 낮거나 중간인 것을 우선하고, 제목 앞쪽에는 검색량이 가장 큰 핵심어를 둔다. (수치가 없으면 상위 글과 연관어로 판단하고, 수치를 지어내지 않는다.) 그리고 상위 글에 없는 것(빠진 정보, 오래된 정보, 실수하기 쉬운 부분)을 찾는다. 이게 차별점이다.
3. HTML로 쓴다. validateDraft로 검사하고 errors가 0이 될 때까지 고친다. warnings도 가능한 한 없앤다.
4. 통과하면 saveDraft로 저장한다. (발행은 사람이 대시보드에서 검토 후 한다)

## 제목 (title) — 가장 중요, 대충 쓰면 저장이 거부된다
- 독자가 검색창에 실제로 칠 핵심 키워드를 **제목 앞 15자 안**에 둔다. 이어서 의도어(신청·조건·기준·비용·비교·주의 등) + 독자가 얻는 구체적인 것 **한 가지**를 붙인다. 은유·감성 문구·질문형·과장은 쓰지 않는다.
- **"검색자를 위한", "검색하는 분을 위한", "~를 찾는 분들을 위한", "독자를 위한"처럼 독자를 부르는 말은 제목에 쓰지 않는다.** 주제를 바로 말한다. (저장이 거부된다)
- 목표는 **검색에 걸리는 롱테일 제목**이다. 사람이 실제로 검색창에 칠 법한 말("주제 + 대상 + 상황/지역/시기")로 쓰고, 숫자는 롱테일을 만드는 여러 재료 중 하나일 뿐 필수가 아니다.
- 24~40자. 메인 키워드는 앞쪽에 두고, 뒤에 **구체적인 롱테일 조건**(누구 / 어떤 상황 / 어느 지역·시기·금액)을 붙인다. 막연한 말("바로 잡기", "먼저 볼 것", "꼭 알아야 할")만으로 끝내지 않는다.
- **제목에는 글 전체를 대표하는 키워드를 담는다.** 메인 키워드 + 본문의 큰 소제목 2~3개가 다루는 핵심어(일정·장소·신청·비용 등)를 골라 한 덩어리로 쓴다. 한 가지 세부(예: "신청 차이")만 뽑아 제목 뒤에 붙이지 않는다. 글을 읽을 사람이 검색할 말이 제목에 다 들어가야 한다.
- 제목은 쉼표로 이어 붙인 두 조각이 아니라 자연스러운 한 구절이다. "A와 B 신청 차이"처럼 대상이 모호하거나, 명사만 줄줄이 나열해 뜻이 안 읽히면 실패다. 소리 내어 읽어서 어색하면 다시 쓴다. 조각난 말·주어 없는 말·낯선 줄임말 금지.
- 제목 끝을 "~해요/~돼요/~있어요" 같은 말투로 끝내지 않는다. 명사나 구체어(날짜·조건 등)로 끝낸다.
- 숫자(금액·기간·개수·나이·%)는 **본문에 실제로 있는 값일 때만, 자연스러울 때만** 넣는다. 숫자를 억지로 끼우지 않는다. 제목에 쓴 두 자리 이상 숫자가 본문에 없으면 저장이 거부된다(사상자·금액 합산·추정치를 새로 만들어 쓰기 금지, 본문과 똑같은 값만).
- 클릭하고 싶게 만드는 궁금증 포인트(손해·반전·의외의 결과·빠지기 쉬운 함정) 1개를 넣되, 사건·뉴스 글은 자극적 과장 없이 사실 그대로(사망·부상 등은 본문 수치와 동일하게).
- "~ 정리", "~ 총정리", "~ 방법", "~ 안내", "~ 알아보기"로 끝내지 않는다.
- 나쁜 예: "대기환경보존법 검색자를 위한 배출시설 허가와 자가측정 기준"(독자를 부르는 말), "이태원참사 4주기 2026년 추모 일정, 시민추모대회와 기억식 신청 차이"(쉼표로 조각남, 글 전체 키워드가 아니라 신청 차이만 부각), "춘천가볼만한곳 10개, 동선까지 바로 잡기", "실속보장치아보험, 보험료보다 먼저 볼 것", "사우디공항 피격 321명 사상, 취소 전 3가지"(무엇을 취소하는지 없음, 321명은 본문 수치와 다름)
- 좋은 예: "이태원참사 4주기 추모행사 일정, 24일 서울광장과 29일 기억식 신청 마감"(키워드: 추모행사·일정·장소·신청), "춘천 당일치기 가볼만한곳 10곳 뚜벅이 동선과 점심 코스, 주차 정보까지", "치아보험 가입 전 확인할 면책기간 90일, 임플란트 보장 못 받는 경우 3가지", "50대 부모님 치아보험 월 3만원대 비교, 보장 줄어드는 갱신 조건"
- 본문이 실제로 뒷받침하는 내용만 쓴다(없는 금액·경험 지어내지 않기). 낚시·과장 금지. 후보 5개를 머릿속에서 비교해 가장 궁금한 것을 고른다.

## 메타 설명 (meta_description)
- 100~160자. 키워드 포함, 읽으면 얻을 것을 한 줄로.

## 도입부 (첫 화면)
- 3~5문장. 첫 문장에 독자의 상황/고민을 짚고, 둘째 문장에 이 글이 해결해 줄 결론을 먼저 말한다(두괄식). 키워드를 자연스럽게 1회. "알아보겠습니다" 금지.
- 도입부 뒤에 "이 글에서 볼 것"을 2~3줄로 짧게 예고해도 좋다.
- **글 밖의 말로 시작하지 않는다.** 아래는 금지다(저장 시 걸린다).
  · "~를 검색하셨다면 / 찾고 있었다면 / 찾아보셨다면 / 궁금하셨다면" 식 도입
  · "아래 내용은 ○년 ○월 ○일 현재 시행 법령을 기준으로 …" 식 안내·면책 문단
  · "정식 명칭은 …입니다" 식으로 용어부터 바로잡는 서두, "이 글에서는 ~를 모았습니다/정리했습니다" 식 글 자체 설명
- 나쁜 도입: "대기환경보존법 배출시설 허가를 찾고 있었다면 잘 오셨습니다. 아래 내용은 2026년 10월 14일 현재 시행 법령을 기준으로 정리했습니다."
- 좋은 도입: "공장이나 작업장에서 도장·용접·보일러를 돌린다면 배출시설 설치 허가나 신고 대상인지부터 갈립니다. 대상이면 가동 전에 신고하고 이후 자가측정을 해야 하고, 빠뜨리면 과태료가 나옵니다." (이처럼 독자의 상황과 답으로 바로 시작)

## 본문
- H2 5~8개. 소제목은 독자가 실제로 검색할 법한 말(롱테일)로. 각 H2 아래 단락 2~3개, 단락은 2~4문장(모바일에서 읽기 쉽게).
- 총 순수 텍스트 3,500~6,000자.
- 단계가 있으면 <ol>, 체크리스트는 <ul>. 실수/주의는 "이렇게 하면 이런 일이 생겨요"처럼 구체적으로.
- 키워드는 본문에 3~6회. 검색어가 붙여 쓴 형태(예: 남양주가볼만한곳)여도 본문에서는 "남양주 가볼 만한 곳"처럼 띄어 쓰거나 "이 코스", "이곳"으로 바꿔 쓴다. 검색어를 문장에 그대로 끼워 넣지 않는다.
- 독자가 찾는 사실 정보를 비워 두지 않는다. 장소·여행: 주소, 운영시간, 입장료, 주차, 소요시간, 코스 간 이동 시간, 휴무일. 신청·제도: 대상, 기간, 금액, 신청처. 제품: 가격, 규격, 차이점. 공식 사이트에서 확인한 값만 쓰고 기준일을 적는다. 확인 못 한 항목은 지어내지 말고 "공식 사이트에서 확인한 값이 없어요"라고 한 번만 쓴다. "확인하세요"로 끝나는 문장은 글 전체에서 2번 이하, 쓸 때는 어디서 확인하는지 링크나 이름을 붙인다.

## 표 (필수, 1개 이상)
- 비교·요약·체크표 중 독자에게 진짜 도움이 되는 표 1~2개. <table><thead><tr><th>…</th></tr></thead><tbody>…</tbody></table>. 스타일은 서버가 입혀 준다.

## 출처·링크·신뢰성 (필수)
- 글 끝에 <h2>출처와 참고한 곳</h2> + <ul><li><a href="URL">사이트명</a> — 무엇을 참고했는지 한 줄</li></ul>. 서로 다른 사이트 2곳 이상, 가능하면 공식 사이트·공공기관·원문 위주.
- 링크는 실제 주소 그대로 쓴다(저장 시 새 탭으로 열리게 자동 처리되어, 독자가 이동해도 이 글이 남아 있다). 본문 중간에도 관련 공식 사이트로 가는 링크를 2~3곳 자연스럽게 건다(“공식 다운로드 페이지” 처럼 무엇이 나오는지 알려 주는 문구).
- 본문 중 관련 설명이 나오는 자리에도 <a href> 링크로 공식 페이지로 보낸다(독자 이동 편의).
- 실제로 열어서 확인한 주소만 쓴다. 기억에 의존해 URL을 만들지 않는다. 수치·날짜·법·정책은 확인한 것만 쓴다. 기준 시점은 해당 사실 문장 안에 짧게 한 번 넣는다(예: "2026년 10월 기준 과태료는 …"). 글 앞머리에 "이 글은 ○○ 기준으로 작성했다"는 안내 문단은 쓰지 않는다.
- 확신 없는 내용은 빼거나 "확인이 필요해요"라고 솔직하게 쓴다.

## 이미지
- 이미지는 대표 1장 + 본문 2~4장, 합계 최소 3장(권장 4~5장). 모두 alt 텍스트 필수. 장면이 겹치지 않게 각기 다른 설명 이미지(설치 화면 흐름, 위험 구별 예시, 비교 도표 등)를 만든다.
- 직접 그린 이미지는 openaiFileIdRefs에 순서대로 담는다. 첫 번째가 대표이미지. 두 번째부터는 본문 넣을 자리에 <img src="{{file:2}}" alt="설명">, 세 번째는 {{file:3}} 처럼 번호로 적는다(대표이미지 {{file:1}}는 본문에 따로 쓰지 않는다).
- 관련 사이트에서 가져올 이미지는 공식 사이트 이미지 주소를 <img src="https://...">로 직접 쓴다(저장 시 우리 서버로 옮겨진다). 글 내용과 맞는지 보고 고른다.
- 이미지는 직접 그리는 것이 기본이다(이미지 생성 사용). 대표이미지와 본문 이미지 모두 이 글의 내용을 설명하는 그림으로 각각 따로 그린다(예: 설치 순서 도식, 위험 구별 예시, 비교 장면).
- 그림 안에는 글자·숫자·주소·운영시간·가격·상호를 넣지 않는다(AI가 틀리게 그리고, 틀려도 독자가 믿는다). 정보는 본문 텍스트와 표로 전한다.
- 실제 장소·상품·인물을 소개하는 글에서 AI 그림을 "그 장소의 사진"처럼 쓰지 않는다. 그런 글은 공식 기관이 배포한 실제 사진을 우선 쓰고, 그림은 분위기를 보여주는 한 장면으로만 쓴다. 장소마다 비슷한 풍경을 반복해 그리지 않는다.
- 그림은 가로 3:2 한 장면, 핵심은 가운데에 둔다(가장자리는 잘릴 수 있다). 세로로 긴 인포그래픽·여러 칸으로 나눈 그림은 만들지 않는다.
- 스톡 사진(Pixabay/Pexels)은 내용과 상관없는 분위기 사진이라 쓰지 않는다. 직접 그릴 수 없을 때만, 글 내용을 정확히 보여주는 것에 한해 마지막 수단으로 쓴다. 공식 사이트가 배포한 화면/로고는 내용이 맞으면 써도 된다.
- 저작권: 남의 블로그/커뮤니티 사진은 쓰지 않는다. researchKeyword의 stock_image_candidates는 참고용이며 기본값으로 고르지 않는다.
- SVG·data URI·코드(파이썬 등)로 그린 이미지는 서버가 받지 못한다. 반드시 이미지 생성 도구로 만든 PNG/JPG 파일을 openaiFileIdRefs에 넣는다. 저장이 이미지 오류로 실패하면 다른 URL 이미지로 몰래 바꿔치지 말고, 이미지 생성을 다시 시도하거나 실패 사실을 사용자에게 그대로 알린다.
- 이미지 오류로 저장이 실패하면 이전에 만든 파일 참조·링크를 재사용하지 않는다(몇 분 뒤 만료됨). 이미지를 새로 생성한 직후 그 결과의 openaiFileIdRefs를 그대로 담아 saveDraft를 다시 호출한다. 경로 문자열(sandbox:/mnt/data/...)이나 파일 이름만 보내지 않는다.
- 이미지를 쓰기 전에 글 내용과 맞는지 직접 보고 판단한다. 안 맞으면 쓰지 않고 새로 그린다. 그린 이미지는 반드시 openaiFileIdRefs로 보낸다.
- **본문은 독자가 읽는 글이다. 글쓴이·편집자에게 하는 말은 본문에 한 글자도 쓰지 않는다.** 아래는 금지다(저장 시 걸린다).
  · 그림 설명·고지 문장: "위 그림은 실제 사진이 아닌 일러스트이며…", "대표 이미지와 같은 원본을 다시 사용했습니다"
  · 교체·검수 권유: "발행 전 다른 그림으로 교체하는 것이 좋습니다", "발행 전에 확인하세요"
  · 이미지 문제(같은 그림 재사용, 장면 부족 등)가 있으면 본문에 적지 말고, 고쳐서 다시 그리거나 답변(채팅)에서 사용자에게 말한다. 그림 설명은 alt 속성에만 쓴다.

## 양식·자료 파일 (있으면 꼭 챙긴다)
- 주제와 관련된 신청서·서식·체크리스트·공식 안내문 같은 내려받을 파일(PDF, HWP, DOCX, XLSX 등)이 있으면 찾아서 saveDraft의 attachments로 보낸다(파일당 15MB 이하). 독자에게 큰 도움이 된다.
- 올려도 되는지는 네가 해당 페이지를 직접 열어 판단한다. 공공누리·공공데이터처럼 자유 이용이 명시됐거나 공공기관이 일반에 배포하는 서식은 가능. 저작권 표기가 있거나 유료·회원 전용·재배포 금지, 출처 불명, 개인정보가 든 파일은 올리지 않고 원본 링크만 본문에 건다.
- 각 파일마다 permission_note에 "어디서 확인했고(예: 공공누리 1유형, 기관 배포 서식) 왜 올려도 되는지"를 한 줄로 쓰고, source_page_url에 파일이 있던 페이지 주소를 넣는다. 본문에 "양식 내려받기" 섹션은 서버가 자동으로 붙인다.

## 차별점
- 상위 글이 안 다룬 것 1가지 이상: 흔한 실수, 최신 변경점, 비교표, 코스·옵션 비교표, 상황별 선택 가이드 등. 실제로 가 보거나 써 본 적 없는 일을 겪은 것처럼 지어내지 않는다("제가 가 보니 주차장이…", "써 봤더니 …", "다녀왔는데" 금지 — 확인할 수 없는 경험담은 거짓 정보다). 대신 **의견·느낌·상상·공감은 얼마든지 쓴다**: "이 코스는 아이가 중간에 지칠 것 같아요", "방송 보면서 제일 궁금한 건 이거였어요", "이 조건이면 저는 망설일 것 같아요". 사실은 공식 자료와 확인한 값으로 대고, 그 위에 글쓴이의 판단과 감정을 얹는다. 본문 안에 분명히 드러나게 쓴다.

## FAQ
- 끝부분에 <h2>자주 묻는 질문</h2> + 질문 3~5개. 질문은 <p><b>Q. …</b></p>, 답은 <p>…</p> 일반 문단. 박스/카드 금지.

## 형식 규칙
- 결과물은 HTML 조각만. <html>/<body>/<h1> 없음(제목은 title 필드). 마크다운(**, ##) 금지. [대괄호 지시문] 남기지 않기. <script>/<iframe> 금지. 한국어만(한자·일본어 금지).
- 모든 문단은 <p>…</p>로 감싼다. <br>로 문단을 나누거나 <p> 없이 글을 이어 쓰지 않는다.
- <h2>는 소제목, 필요하면 <h3>. 번호·박스 없이 자연스러운 문장형.

## 문체 (사람이 쓴 글처럼, 읽기 편하게)
- 기본은 **해요체**지만 "~해요 / ~예요 / ~이에요"만 반복하면 기계처럼 읽힌다. **끝맺음을 의식적으로 섞는다.** 연속 두 문장이 같은 어미로 끝나지 않게 하고, 한 문단 안에서 서로 다른 어미를 3가지 이상 쓴다. 쓸 수 있는 끝맺음 예:
  · 설명: ~거든요 / ~더라고요 / ~던데요 / ~는데요 / ~잖아요 / ~대요 / ~답니다 / ~랍니다
  · 느낌·추측: ~네요 / ~같아요 / ~싶어요 / ~듯해요 / ~ㄹ걸요 / ~ㄹ까요? / ~지 않을까 싶어요
  · 권유·당부: ~보세요 / ~해 보시길요 / ~하세요 / ~ㄴ 편이 좋아요 / ~면 돼요
  · 단정·짧은 끊기: ~다. / ~었다. / ~ㄴ다. (한 문단에 한두 번만) / 명사로 끝내기("딱 이 정도.", "주말엔 오전이 낫다.") / 질문 "~죠?", "~일까요?"
  합니다체(~합니다, ~입니다)만 이어지는 글은 보도자료 같으니 쓰지 않고, 가끔 섞는 건 괜찮다. 같은 어미가 연달아 나오면 문장을 합치거나 순서를 바꾼다.
- 호들갑 없이도 **감정은 드러낸다.** 기대되는 점, 걱정되는 점, 의외였던 점, 웃음 포인트를 짚는다. 단락마다 사실 → 그래서 내 생각/느낌 한 줄이 들어가면 좋다. 같은 구조(주장-설명-당부)를 반복하지 않는다.
- 뉴스·방송·이슈 글은 기사 요약을 하지 않는다. 방송 정보(시간·출연진·규모)는 표 하나로 끝내고, 본문은 "그래서 뭐가 볼 만한가 / 어디서 갈릴까 / 누가 보면 좋을까"를 글쓴이 관점으로 푼다. 보도 문장을 그대로 풀어 쓰지 않는다.
- 한 문장에 한 가지만, 길이는 들쭉날쭉하게. 숫자·시간·거리·이름 같은 구체적인 것으로 쓰고, "중요합니다"처럼 뜬 말은 피한다. 독자에게 던지는 질문은 가끔만.
- **AI 말투 금지** (이게 가장 티가 난다). 아래는 쓰지 않는다. 쓰고 싶으면 사람이 말하는 식으로 바꾼다.
  · "~해서는 안 됩니다 / ~해서는 안 돼요 / ~하면 안 됩니다" 식 훈계 → "~하면 곤란해요", "~는 피하세요", "~하면 후회해요"
  · "~라는 뜻은 아닙니다 / ~를 의미하지는 않습니다 / ~는 서로 다른 정보입니다" 식 부정 반박·해설 → 그냥 결론을 말한다. ("전편이 바로 올라온다는 뜻은 아닙니다" → "OTT엔 보통 한두 주 늦게 올라와요")
  · "~할 필요가 있습니다 / ~하는 것이 바람직합니다 / ~라고 볼 수 있습니다 / ~할 수 있습니다"가 문단마다 반복되는 문장
  · "~하는 것이 중요합니다", "시사하는 바", "결론적으로", "정리하자면", "~에 있어서", "참고자료에 따르면"
- 모르는 건 한 번만 솔직하게 쓰고, "확인하세요" 식 면책 문장을 반복하지 않는다. 이모지 없이, 느낌표는 글 전체에서 1~2번까지.
- 예(참고만, 그대로 베끼지 않는다):
  "물의정원은 건너뛰어도 됩니다. 걷는 구간이 길어서 아이가 먼저 지치거든요."
  "솔직히 이 방송은 정승제가 나온다는 것만으로도 채널을 고정하게 돼요. 수학 때문에 마음 졸이던 부모라면 특히요."
  "24일 서울광장 행사는 누구나 갈 수 있어요. 반면 29일 기억식은 10월 19일까지 신청해야 하니 마감부터 챙기세요."
  "주차장은 작은 편이라 주말엔 오전 10시 전에 차는 경우가 많대요."
- 다 쓰고 소리 내어 읽어서 걸리는 문장, 보도 기사처럼 들리는 문장만 고친다.

## 최종 자기 점검
"이 글 하나만 읽고 다른 탭을 안 열어도 되는가? 상위 글보다 확실히 나은 점이 있는가? 틀린 정보·지어낸 URL은 없는가? 뉴스 기사와 구별되는 글쓴이의 느낌·의견이 있는가?" 넷 중 하나라도 아니면 고쳐서 다시 검사한다.`;

// ── 형태 검사 ────────────────────────────────────────────────────────────
export interface DraftIn { title?: string; meta_description?: string; content_html?: string; keyword?: string; featured_image_url?: string; hasFileImages?: boolean; fileCount?: number }

export function validateDraft(d: DraftIn) {
  const errors: string[] = [], warnings: string[] = [];
  const html = d.content_html || '', title = (d.title || '').trim(), meta = (d.meta_description || '').trim();
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const kw = (d.keyword || '').trim(), kwTokens = kw.split(/\s+/).filter(Boolean);
  const nospace = (x: string) => x.replace(/\s+/g, '');
  const h2 = (html.match(/<h2\b/gi) || []).length;
  const tables = (html.match(/<table\b/gi) || []).length;
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
  const hosts = new Set<string>();
  for (const m of html.matchAll(/<a\s[^>]*href=["'](https?:\/\/[^"']+)["']/gi)) { try { hosts.add(new URL(m[1]).hostname.replace(/^www\./, '')); } catch { /* skip */ } }
  const firstH2 = html.search(/<h2\b/i);
  const intro = (firstH2 > 0 ? html.slice(0, firstH2) : '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const kwCount = kw ? nospace(text).split(nospace(kw)).length - 1 : 0;

  if (title.length < 10 || title.length > 60) errors.push(`제목 길이 ${title.length}자 — 24~40자로`); else if (title.length > 42) warnings.push(`제목 ${title.length}자 — 24~40자 권장`);
  if (kwTokens.length && !kwTokens.every(t => title.includes(t))) errors.push('제목에 메인 키워드가 모두 들어가야 함');
  if (title.length < 24) errors.push(`제목 ${title.length}자 — 너무 짧고 막연함. 24~40자로 구체적인 상황·대상·결과를 넣을 것`);
  const bodyNums = text.replace(/,/g, '');
  const badNums = (title.replace(/,/g, '').match(/\d{2,}/g) || []).filter(n => !bodyNums.includes(n));
  if (badNums.length) errors.push(`제목의 숫자 ${badNums.join(', ')}이(가) 본문에 없음 — 본문에 나온 값만 쓸 것(합산·추정 금지)`);
  if (/(정리|총정리|안내|알아보기|알아보자|방법)$/.test(title.replace(/[?!.…\s]+$/, ''))) errors.push('제목이 "정리/안내/방법"으로 끝남 — 결과·상황이 보이는 말투로');
  if (/검색자|검색하는|찾는 (분|사람)|독자를? 위한/.test(title)) errors.push('제목에 "검색자를 위한/검색하는 분/찾는 분들을 위한" 같은 독자 호칭 금지 — 주제를 바로 말할 것');
  if (/(검색|찾아보|찾고|궁금)[^.?!]{0,12}(했다면|하셨다면|보셨다면|있다면|있었다면|계신다면|하셨나요)/.test(intro.slice(0, 400))) errors.push('도입부가 "~를 검색했다면/찾고 있었다면" 식 메타 문장 — 독자의 상황이나 답으로 바로 시작할 것');
  if (/아래 내용은[^.]{0,50}(기준|현재)|현재 시행\s?(중인\s?)?(법령|법률)을?\s?기준|(법령|법률)을? 기준으로 (작성|정리)/.test(text)) errors.push('"아래 내용은 ○○ 현재 시행 법령을 기준으로…" 식 안내 문단 금지 — 기준 시점은 해당 사실 문장 안에 짧게');
  if (/정식 (법률)?명(칭)?(은|으로는)|이 글(에서는|은)[^.]{0,30}(모았|정리했|담았|다룹니다|다뤘)/.test(intro)) warnings.push('도입부가 용어 바로잡기/글 설명으로 시작함 — 독자의 상황과 답으로 시작');
  if (/(위|아래|이|해당)\s?(그림|이미지|사진|일러스트)(은|는|이|가|의)[^.]{0,60}(일러스트|AI|생성|대표\s?이미지|교체|재사용|다시 사용|실제[^.]{0,12}(아닌|아니))|(발행|게시|업로드)\s?전[^.]{0,30}(교체|바꾸|수정|확인|검수)|(다른|새) (그림|이미지|사진)(으로|를) (교체|바꾸|넣)|대표\s?이미지와 (같은|동일)|원본을 다시 사용/.test(text)) errors.push('본문에 글쓴이·편집자용 메모가 들어감("위 그림은 일러스트이며…", "발행 전 다른 그림으로 교체…", "대표 이미지와 같은 원본 재사용" 등) — 독자가 읽는 문장만 남기고, 이미지 문제는 다시 그리거나 채팅에서 사용자에게 말할 것. 그림 설명은 alt로만');
  if (meta.length < 90 || meta.length > 175) warnings.push(`메타 설명 ${meta.length}자 — 100~160자 권장`);
  if (kw && meta && !nospace(meta).includes(nospace(kw))) warnings.push('메타 설명에 키워드 포함 권장');
  if (text.length < 2500) errors.push(`본문 ${text.length}자 — 최소 2500자(권장 3500~6000)`); else if (text.length < 3500) warnings.push(`본문 ${text.length}자 — 3500자 이상 권장`); else if (text.length > 10000) warnings.push('본문이 너무 김(10000자 초과)');
  if (h2 < 4) errors.push(`H2 소제목 ${h2}개 — 최소 4개(권장 5~8)`);
  if (!tables) errors.push('표(<table>)가 최소 1개 필요');
  else if (!/<th\b/i.test(html)) warnings.push('표에 제목 행(<th>) 권장');
  const fileCount = d.fileCount || 0, placed = imgs.filter(i => /\{\{file:\d+\}\}/.test(i));
  const total = imgs.length + (d.featured_image_url ? 1 : 0) + Math.max(0, fileCount - placed.length);
  if (!fileCount) errors.push('직접 그린 이미지가 첨부되지 않음(openaiFileIdRefs 비어 있음) — 웹/검색 이미지 URL로 대체 금지. 이미지 생성 도구로 만든 파일을 openaiFileIdRefs에 담아 다시 보낼 것');
  else if (!total) errors.push('대표이미지가 필요 (featured_image_url 또는 생성한 이미지 파일)');
  else if (total < 3) errors.push(`이미지 ${total}장 — 대표 1장 + 본문 2장 이상(합계 3장 이상) 필요`);
  const srcs = imgs.map(i => i.match(/\bsrc=["']([^"']+)/i)?.[1]).filter(Boolean) as string[];
  if (new Set(srcs).size < srcs.length || (d.featured_image_url && srcs.includes(d.featured_image_url)) || placed.some(i => /\{\{file:1\}\}/.test(i))) errors.push('같은 이미지가 중복됨 — 본문 <img>의 주소는 모두 달라야 하고, 대표이미지({{file:1}}/featured_image_url)는 본문에 다시 쓰지 않는다');
  if (placed.some(i => Number(i.match(/\{\{file:(\d+)\}\}/)![1]) > fileCount)) errors.push('{{file:N}} 번호가 openaiFileIdRefs 개수보다 큼');
  if (imgs.some(i => !/\balt=["'][^"']+/i.test(i))) warnings.push('alt 없는 이미지가 있음');
  if (hosts.size < 1) errors.push('외부 링크(<a href>)가 필요 — 출처/공식 사이트 2곳 이상'); else if (hosts.size < 2) warnings.push('서로 다른 사이트 링크 2곳 이상 권장');
  if (!/출처|참고\s?자료|참고한 곳|참조/.test(text)) errors.push('"출처와 참고한 곳" 섹션이 필요');
  if (!/20\d\d년|기준|업데이트/.test(text)) warnings.push('기준 시점(예: 2026년 10월 기준) 표기 권장');
  if (!/자주 묻는|FAQ|Q\./i.test(text)) warnings.push('FAQ 섹션 권장 (질문 3~5개)');
  if (intro.length < 60) warnings.push('도입부(첫 H2 이전)가 너무 짧거나 없음 — 3~5문장'); else if (intro.length > 600) warnings.push('도입부가 너무 김 — 3~5문장');
  if (kw && intro && !nospace(intro).includes(nospace(kw))) warnings.push('도입부에 키워드가 자연스럽게 들어가면 좋음');
  if (!/흔한 실수|많이 하는 실수|비교|차이|상황별|추천/.test(text)) warnings.push('차별점(흔한 실수, 비교, 상황별 선택 등)이 안 보임');
  if (/제가 (직접 )?(가|써|해|먹|사용)\S*\s?보니|직접 (가|써|해) ?봤|다녀왔|다녀와 보니/.test(text)) errors.push('직접 경험한 것처럼 쓴 표현 금지(경험담 지어내기)');
  if (!/<(ul|ol)\b/i.test(html)) warnings.push('목록(<ul>/<ol>) 없음 — 체크리스트/단계 권장');
  if (kw && kwCount < 2) warnings.push(`키워드 "${kw}" ${kwCount}회 — 3~6회 권장`); else if (kwCount > 10) warnings.push(`키워드 ${kwCount}회 — 과다(검색어를 문장에 그대로 끼우지 말고 바꿔 쓰기)`);
  if ([...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].some(m => m[1].replace(/<[^>]+>/g, '').length > 450)) warnings.push('450자 넘는 긴 단락이 있음 — 2~4문장으로 쪼개기');
  const aiSpeak = [...text.matchAll(/(해서는|하면|해선|면) 안 (됩니다|돼요|되죠)|(라는|이라는|는|다는) (뜻|의미)(은|이|는)? 아닙니다|를 의미하지는 않|할 필요가 있(습니다|어요)|하는 것이 바람직|(라고|로) (볼|말할) 수 있(습니다|어요)/g)].map(m => m[0]);
  if (aiSpeak.length >= 2) errors.push(`AI 말투 ${aiSpeak.length}곳(${[...new Set(aiSpeak)].slice(0, 4).join(' / ')}) — "~해서는 안 됩니다", "~라는 뜻은 아닙니다" 식 문장을 사람이 말하는 식으로(결론을 바로 말하기, "~하면 곤란해요")`);
  else if (aiSpeak.length) warnings.push(`AI 말투: ${aiSpeak[0]} — 사람이 말하는 식으로 바꾸기`);
  const formal = (text.match(/(합니다|입니다|습니다|됩니다|있습니다)[.?!]/g) || []).length, polite = (text.match(/(해요|예요|이에요|어요|아요|죠|네요|거든요|더라고요)[.?!]/g) || []).length;
  if (formal > 12 && formal > polite * 1.5) errors.push(`합니다체 ${formal}문장 vs 해요체 ${polite}문장 — 보도자료 말투. 해요체(~해요, ~거든요, ~더라고요, ~죠)를 중심으로 쓰기`);
  const ends = (text.match(/[^.!?\n]{4,}?[.!?](?=\s|$)/g) || []).map(t => t.trim().replace(/[.!?]$/, '').slice(-2)), cnt: Record<string, number> = {};
  ends.forEach(e => { cnt[e] = (cnt[e] || 0) + 1; });
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  if (ends.length >= 15 && top) {
    if (top[1] / ends.length >= 0.45) errors.push(`문장 끝이 "~${top[0]}"로 ${top[1]}/${ends.length}문장 — 같은 끝맺음이 반복돼요. ~거든요, ~더라고요, ~네요, ~잖아요, ~ㄹ걸요, ~대요, ~는데요, ~죠?, ~같아요, 명사로 끝내기, ~다 등으로 섞기`);
    else if (top[1] / ends.length >= 0.3 || Object.keys(cnt).length < 6) warnings.push(`끝맺음이 단조로워요("~${top[0]}" ${top[1]}/${ends.length}문장, 종류 ${Object.keys(cnt).length}가지) — 어미를 더 다양하게`);
  }
  if (!/저는|제 생각|제가 보기|솔직히|개인적으로|제 기준|저라면|느낌|아쉬|기대|걱정|의외|웃음/.test(text)) errors.push('글쓴이의 의견·감정이 한 줄도 없음 — 사실만 나열하면 뉴스와 같음. 단락마다 "그래서 내 생각/느낌" 한 줄(예: "솔직히 이 부분이 제일 궁금했어요")을 넣을 것');
  const bad = ['참고자료에 따르면', '보도에 따르면', '자료에 따르면', '로 알려졌다', '것으로 전해진다', '로 확인됐다'].filter(p => text.includes(p));
  if (bad.length) errors.push(`출처 말투 금지 표현: ${bad.join(', ')}`);
  const tells = ['시사하는 바', '주목할 만', '결론적으로', '정리하자면', '종합하면', '첫째,', '둘째,', '에 있어서', '살펴보겠습니다', '알아보겠습니다', '중요한 역할을 합니다'].filter(p => text.includes(p));
  if (tells.length >= 3) errors.push(`AI 티 표현 ${tells.length}개(${tells.join(', ')}) — 사람이 쓴 말투로 고쳐 쓰기`);
  else if (tells.length) warnings.push(`AI 티 표현: ${tells.join(', ')}`);
  const conj = (text.match(/또한|더불어|아울러|뿐만 아니라/g) || []).length;
  if (conj > 5) errors.push(`"또한/더불어/아울러" ${conj}회 — 3회 이하로`);
  else if (conj > 3) warnings.push('"또한/더불어/아울러" 과다');
  const sents = text.split(/(?<=[.?!])\s+/).map(x => x.trim().replace(/[.?!]+$/, '')).filter(x => x.length > 3);
  const endY = (x: string) => /(해요|돼요|있어요|없어요|어요|아요|예요|이에요|네요)$/.test(x);
  let run = 0, maxRun = 0;
  for (const x of sents) { run = endY(x) ? run + 1 : 0; maxRun = Math.max(maxRun, run); }
  if (maxRun >= 5) warnings.push(`같은 어미("~요")가 ${maxRun}문장 연속 — 문장을 합치거나 바꿔서 단조롭지 않게`);
  if ((text.match(/중요(합니다|해요|하죠)|좋습니다|편이 좋/g) || []).length > 3) warnings.push('"중요합니다/편이 좋습니다" 같은 추상 문장이 많음 — 구체적인 숫자·이유로');
  if ((text.match(/확인(하세요|해 보세요|해야 해요|하는 것)/g) || []).length > 2) warnings.push('"확인하세요" 반복 — 어디서 확인하는지 링크와 함께 2번 이하로');
  if ((text.match(/\?/g) || []).length > 7) warnings.push('질문형 문장이 많음 — 가끔만')
  if (/<br\s*\/?>\s*<br\s*\/?>/i.test(html) || (html.match(/<p\b/gi) || []).length < 8) warnings.push('문단이 <p>로 나뉘지 않았거나 너무 적음 — 모든 문단을 <p>로')
  if (/^\s*#{1,6}\s|\*\*[^*]+\*\*/m.test(html)) errors.push('마크다운(##, **) 금지 — HTML 태그로');
  if (/\{\{|\[(소제목|제목|내용|키워드)/.test(html.replace(/\{\{file:\d+\}\}/g, ''))) errors.push('대괄호/템플릿 지시문이 남아 있음');
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
