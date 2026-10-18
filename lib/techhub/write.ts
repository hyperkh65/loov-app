import { generateText } from '@/lib/auto-blog-ai';
import type { Candidate } from './sources';
import type { TechProfile } from './accounts';

export interface Slide { type: 'point' | 'steps' | 'stat' | 'warn' | 'compare' | 'summary'; label: string; title: string; body?: string; items?: string[]; rows?: Array<[string, string, string]>; heads?: [string, string] }
export interface Article {
  title: string;
  hook: string;
  kicker: string;
  coverPrompt: string;
  coverStock: string;
  summary: string[];
  sections: Array<{ h2: string; paras: string[]; photoPrompt: string; stock: string; alt: string }>;
  faq: Array<{ q: string; a: string }>;
  cards: Slide[];
  tags: string[];
}
export interface Captions { instagram: string; threads: string }

const ask = (prompt: string, model: string) => generateText(prompt, model, undefined, undefined, undefined, undefined, { multilingual: true });

function parseJson<T>(raw: string): T {
  const s = raw.replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('JSON 없음');
  return JSON.parse(s.slice(a, b + 1)) as T;
}

async function askJson<T>(prompt: string, check: (v: T) => string | null): Promise<T> {
  let last = '';
  for (const model of ['gemini', 'openrouter', 'groq']) {
    try {
      const v = parseJson<T>(await ask(prompt, model));
      const bad = check(v);
      if (!bad) return v;
      last = bad;
    } catch (e) { last = e instanceof Error ? e.message : String(e); }
  }
  throw new Error(`AI JSON 생성 실패: ${last}`);
}

/** 후보 상위 N개 중 "한국 20~40대 테크 관심층이 멈춰서 볼 이슈"를 AI가 골라 순서대로 반환 */
export async function judge(cands: Candidate[], topics: string): Promise<Candidate[]> {
  const top = cands.slice(0, 15);
  try {
    const list = top.map((c, i) => `${i}. [${c.source}${c.mentions > 1 ? ` +${c.mentions - 1}곳` : ''}] ${c.title}`).join('\n');
    const v = await askJson<{ rank: number[] }>(
      `당신은 팔로워 100만을 목표로 하는 한국 테크 SNS 편집장입니다. 주제 범위: ${topics}.\n아래 오늘의 후보 중 한국 20~40대가 "헐, 이거 뭐야?" 하고 멈춰서 저장·공유할 이슈를 가장 좋은 순서로 최대 5개 고르세요.\n선호: 신기한 신기술/신제품, 일상에 바로 영향, 숫자·장면으로 놀라움이 설명되는 것, 여러 곳에서 동시에 화제인 것.\n제외: 뻔한 기업 홍보, 단순 투자·인사·소송 뉴스, 너무 전문적이라 설명이 안 되는 것, 주제 범위 밖.\n\n${list}\n\nJSON만 출력: {"rank":[번호,...]}`,
      v => (Array.isArray(v.rank) && v.rank.length ? null : 'rank 없음'),
    );
    const picked = v.rank.map(i => top[i]).filter(Boolean);
    return [...new Set([...picked, ...cands])];
  } catch { return cands; }
}

export async function writeArticle(c: Candidate, text: string, topics: string): Promise<Article> {
  const prompt = `당신은 한국 최고의 테크 블로거 겸 카드뉴스 에디터입니다. 아래 원문(외국어일 수 있음)을 완전히 이해한 뒤, 한국 독자가 쉽고 재밌게 읽는 글로 재구성하세요. 직역·번역투 금지.\n주제 범위: ${topics}\n\n[원문 제목] ${c.title}\n[출처] ${c.source}\n[원문]\n${text.slice(0, 7000)}\n\n[규칙]\n- 한국어만 사용(고유 제품명·브랜드명·약어만 예외). 원문에 없는 사실·수치·인물·회사를 지어내지 말 것.\n- 어려운 용어는 일상 비유로 풀어쓰고, "그래서 나한테 뭐가 달라지는데"를 꼭 포함.\n- 모든 이미지 프롬프트(영문)는 실제 사진처럼 보이는 구체적 장면. 글의 내용을 시각화할 것(예: 컴퓨터 설치 이야기면 메인보드에 부품을 꽂는 손 클로즈업). 글자·로고·화면 속 문자 금지. 사진 스타일 단서 포함(photorealistic, DSLR, natural light 등).\n- coverPrompt는 한눈에 시선을 끄는 극적인 구도(강한 대비, 클로즈업, 선명한 색).\n\n[출력 — 순수 JSON 하나만]\n{\n "title": "블로그 제목, 검색 키워드로 시작 20~32자",\n "hook": "대표이미지에 박을 헤드라인 12~22자. 가장 강한 핵심어 1~2개를 **이렇게** 감싸 강조",\n "kicker": "대표이미지 상단 라벨 2~8자(예: AI, 우주, 반도체)",\n "coverPrompt": "영문 40~60단어",\n "coverStock": "무료 스톡사진 검색용 영어 2~4단어",\n "summary": ["핵심 요약 문장 3개(각 40자 이내)"],\n "sections": [ {"h2": "소제목", "paras": ["단락(4~6문장)", "단락(4~6문장)"], "photoPrompt": "영문 장면 프롬프트", "stock": "영어 2~4단어", "alt": "한국어 이미지 설명"} ×4 ],\n "faq": [ {"q": "", "a": "2~3문장"} ×3 ],\n "cards": [ 카드뉴스 중간 슬라이드 정확히 7장. 글의 핵심을 빠짐없이, 구체적으로 담을 것(숫자·이름·원리·비교). 공통 필드: "label"(상단 라벨 2~6자), "title"(제목 12~28자, 핵심어 **강조**), "body"(2~3문장 90~130자, 쉬운 설명), "items"(보충 불릿 2~3개, 각 30~45자, 핵심어 **강조**).
   순서와 type: 1)point 무슨 일인지 2)stat title에 큰 수치 하나(예 "**3배**")+body+items 3)steps 원리/방법 — items 3~4개 각 35~50자 4)compare 기존 vs 이번 비교 — "heads":["기존","이번"], "rows":[["항목","기존값","이번값"] ×3~4] (body/items 없이) 5)point 그래서 나에게 뭐가 달라지나 6)warn 한계/주의/아직 모르는 점 7)summary "한눈에 정리" — items 5개 체크리스트(각 30~40자). ],
 "tags": ["해시태그용 단어 8개(# 없이)"]\n}`;
  return askJson<Article>(prompt, v => {
    if (!v.title || !v.hook || !v.coverPrompt) return '필수 필드 누락';
    if (!Array.isArray(v.sections) || v.sections.length < 3 || v.sections.some(s => !s.h2 || !s.paras?.length || !s.photoPrompt)) return 'sections 부족';
    if (!Array.isArray(v.cards)) return 'cards 부족';
    const clean = (x: unknown) => String(x ?? '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim();
    for (const k of v.cards) {
      if (!k) continue;
      k.items = (Array.isArray(k.items) ? k.items : []).map(clean).filter(Boolean);
      k.rows = (Array.isArray(k.rows) ? k.rows : [])
        .map(r => (Array.isArray(r) ? r : r && typeof r === 'object' ? Object.values(r) : []).map(clean))
        .filter(r => r.length >= 3 && r[0] && r[1] && r[2]).map(r => [r[0], r[1], r[2]] as [string, string, string]);
      if (k.type === 'compare' && k.rows.length < 2) k.type = 'point';
    }
    v.cards = v.cards.filter(k => k?.title && (k.body || k.items?.length || k.rows?.length));
    if (v.cards.length < 5) return 'cards 부족';
    if (!Array.isArray(v.summary) || !v.summary.length) return 'summary 없음';
    v.faq = Array.isArray(v.faq) ? v.faq.filter(f => f?.q && f?.a) : [];
    v.tags = Array.isArray(v.tags) ? v.tags : [];
    v.kicker = v.kicker || 'TECH';
    v.coverStock = v.coverStock || '';
    return null;
  });
}

/** 계정(persona)별 캡션 — 같은 글이라도 계정 성격에 맞게 따로 쓴다 */
export async function writeCaptions(a: Article, p: TechProfile): Promise<Captions> {
  const facts = `${a.title}\n${a.summary.join('\n')}\n${a.cards.map(c => `${c.title}: ${c.body || (c.items || []).join(', ')}`).join('\n')}`;
  const v = await askJson<Captions>(
    `당신은 ${p.handle} 계정의 운영자입니다. 주제: ${p.topics}. 말투/성격: ${p.persona}\n아래 내용으로 카드뉴스 게시물 캡션 2종을 쓰세요. 사실은 아래 내용 안에서만, 지어내기 금지. 링크/URL은 넣지 말 것(링크는 댓글로 따로 답니다).\n\n${facts}\n\n- instagram: 첫 줄은 스크롤을 멈추게 하는 한 문장(질문 또는 놀라운 사실), 이어서 핵심 3~4줄(줄바꿈), 마지막에 "저장해두고 나중에 다시 보세요" 류의 행동 유도 한 줄, 그 뒤 빈 줄 후 해시태그 8~10개. 전체 1500자 이내.\n- threads: 대화체, 첫 문장이 후킹, 핵심 2~3개, 마지막은 댓글을 부르는 질문. 해시태그 최대 1개. 400자 이내.\n\nJSON만 출력: {"instagram":"","threads":""}`,
    v => (v.instagram && v.threads ? null : '캡션 누락'),
  );
  return { instagram: v.instagram.trim().slice(0, 2000), threads: v.threads.trim().slice(0, 480) };
}
