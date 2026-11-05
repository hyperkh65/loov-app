/**
 * 인포데믹 참고 → 미라쿨 글쓰기. 소스는 "주제·사실 확인용"으로만 쓰고 문장은 새로 쓴다.
 * 사실은 여러 출처로 확인된 것만 쓰고, 쓴 뒤 한 번 더 "근거 없는 주장"을 찾아 지운다.
 */
import { generateText } from '@/lib/auto-blog-ai';
import { findForeignWords } from '@/lib/html-gate';


/** JSON 답을 받는다. 모델을 바꿔 가며 시도하고, 실패하면 어느 단계·모델에서 무슨 답이 왔는지 남긴다. */
export async function askJson<T>(prompt: string, check: (v: T) => string | null, stage = 'ai'): Promise<T> {
  const log: string[] = [];
  for (const model of ['claude', 'gemini', 'openrouter', 'groq']) {
    try {
      const raw = await generateText(prompt, model, undefined, undefined, undefined, undefined, { multilingual: true });
      const s = raw.replace(/```(?:json)?/gi, '');
      const a = s.indexOf('{'), b = s.lastIndexOf('}');
      if (a < 0 || b <= a) { log.push(`${model}: JSON 없음(${raw.length}자 "${raw.slice(0, 60).replace(/\s+/g, ' ')}")`); continue; }
      let v: T;
      try { v = JSON.parse(s.slice(a, b + 1)) as T; } catch (e) { log.push(`${model}: JSON 깨짐 ${(e as Error).message.slice(0, 40)} (${raw.length}자)`); continue; }
      const bad = check(v);
      if (!bad) return v;
      log.push(`${model}: ${bad}`);
    } catch (e) { log.push(`${model}: ${String(e).slice(0, 80)}`); }
  }
  throw new Error(`[${stage}] AI JSON 실패 — ${log.join(' / ')}`.slice(0, 600));
}

export interface Source { n: number; url: string; host: string; title: string; text: string; external: boolean }
export interface InfoCard { kicker: string; headline: string; rows: Array<{ k: string; v: string }> }
export interface Draft {
  title: string;
  answer: string;
  sections: Array<{ h2: string; paras: string[]; bullets?: string[]; table?: { head: [string, string]; rows: Array<[string, string]> } }>;
  faq: Array<{ q: string; a: string }>;
  card: InfoCard;
  tags: string[];
}

const SENSITIVE = /불륜|성폭|성추행|성범죄|몰카|사망|별세|자살|극단적|마약|구속|기소|재판|소송|의혹|열애설|파경|혼외|폭행|학폭|논란/;
export const isSensitive = (s: string) => SENSITIVE.test(s);

const srcBlock = (srcs: Source[]) => srcs.map(s => `[출처 ${s.n}] ${s.host} — ${s.title}\n${s.text.slice(0, 3200)}`).join('\n\n');

const RULES = `[작성 규칙]
- 아래 [출처]들은 사실 확인용 자료다. 문장·표현을 베끼지 말고 전부 새 문장으로 쓴다(같은 어구를 이어 쓰지 말 것).
- 글에 쓰는 사실(이름, 날짜, 시간, 나이, 숫자, 관계, 방송사)은 [출처]에 실제로 있는 것만 쓴다. 출처에 없으면 쓰지 않는다. 출처끼리 다르면 쓰지 않거나 "보도마다 다르다"고 적는다.
- 추측·의혹·루머·사생활 단정·비방·감정적 평가 금지. 확인된 공개 정보만. 인물을 깎아내리는 표현 금지.
- 첫 문단(answer)에서 독자가 검색한 질문에 바로 답한다(2~3문장, 결론 먼저).
- 한국어 ~요/~입니다 체를 섞어 자연스럽게. 같은 어미 반복·"단정한/차분한" 같은 무난한 형용사 반복·추상적인 감성 문장 금지.
- 외국어·특수문자·이모지 금지(고유명사 제외). 낚시 제목 금지.`;

/** 줄 단위 태그 형식(JSON보다 따옴표·길이에 강하다)을 읽는다 */
function parseDraft(raw: string): Draft | string {
  const d: Draft = { title: '', answer: '', sections: [], faq: [], card: { kicker: '', headline: '', rows: [] }, tags: [] };
  let cur: Draft['sections'][number] | null = null, q = '';
  const pair = (v: string): [string, string] => { const i = v.indexOf('|'); return i < 0 ? [v.trim(), ''] : [v.slice(0, i).trim(), v.slice(i + 1).trim()]; };
  for (const line of raw.replace(/```[a-z]*/gi, '').split('\n')) {
    const l = line.trim(); const m = l.match(/^([A-Z0-9_]+)\s*[:：]\s*(.*)$/); if (!m) continue;
    const k = m[1], v = m[2].trim(); if (!v && k !== 'TH') continue;
    if (k === 'TITLE') d.title = v;
    else if (k === 'ANSWER') d.answer = v;
    else if (k === 'H2') { cur = { h2: v, paras: [] }; d.sections.push(cur); }
    else if (k === 'P' && cur) cur.paras.push(v);
    else if (k === 'BULLET' && cur) (cur.bullets ||= []).push(v);
    else if (k === 'TH' && cur) { const [x, y] = pair(v); cur.table = { head: [x || '항목', y || '내용'], rows: [] }; }
    else if (k === 'TR' && cur?.table) cur.table.rows.push(pair(v));
    else if (k === 'Q') q = v;
    else if (k === 'A' && q) { d.faq.push({ q, a: v }); q = ''; }
    else if (k === 'CARD_KICKER') d.card.kicker = v;
    else if (k === 'CARD_HEADLINE') d.card.headline = v;
    else if (k === 'CARD_ROW') { const [x, y] = pair(v); if (x && y) d.card.rows.push({ k: x, v: y }); }
    else if (k === 'TAGS') d.tags = v.split(/[,，]/).map(t => t.trim()).filter(Boolean).slice(0, 8);
  }
  d.sections.forEach(sec => { if (sec.table && sec.table.rows.length < 2) delete sec.table; });
  if (d.title.length < 12 || d.title.length > 60) return 'title 길이';
  if (d.answer.length < 40) return 'answer 짧음';
  if (d.sections.length < 3) return `sections 부족(${d.sections.length})`;
  if (d.sections.some(x => x.paras.length < 2)) return '섹션 문단 부족';
  if (d.faq.length < 2) return 'faq 부족';
  if (d.card.rows.length < 3) return 'card 행 부족';
  if (!d.card.headline) d.card.headline = d.title.slice(0, 18);
  return d;
}

/** 텍스트 답을 받아 파서로 검증한다. 모델을 바꿔 가며 시도하고 실패 이유를 모두 남긴다. */
async function askParsed<T>(prompt: string, parse: (raw: string) => T | string, stage: string): Promise<T> {
  const log: string[] = [];
  for (const model of ['claude', 'gemini', 'openrouter', 'groq']) {
    try {
      const raw = await generateText(prompt, model, undefined, undefined, undefined, undefined, { multilingual: true });
      const r = parse(raw);
      if (typeof r !== 'string') return r;
      log.push(`${model}: ${r}(${raw.length}자)`);
    } catch (e) { log.push(`${model}: ${String(e).slice(0, 80)}`); }
  }
  throw new Error(`[${stage}] AI 답 실패 — ${log.join(' / ')}`.slice(0, 600));
}

export async function writeDraft(topic: { title: string; entity: string; query: string }, srcs: Source[], forbid: string[] = []): Promise<Draft> {
  const prompt = `당신은 사실 확인을 철저히 하는 한국 정보 블로그 에디터입니다. "${topic.query}"를 검색한 독자를 위한 글을 씁니다.
${RULES}
${forbid.length ? `- 아래 문장/주장은 근거가 없다고 확인됐으니 절대 쓰지 않는다:\n${forbid.map(f => '  · ' + f).join('\n')}\n` : ''}
[주제] ${topic.title} (핵심 대상: ${topic.entity})
[출처]
${srcBlock(srcs)}

아래 "줄 형식"으로만 출력하세요(JSON·마크다운 금지). 각 줄은 "키: 내용" 한 줄입니다. 내용 안에 줄바꿈을 넣지 마세요.
TITLE: 제목 28~40자, 핵심 검색어 포함, 낚시·과장 금지
ANSWER: 직답 2~3문장
H2: 소제목 (질문형 또는 명확한 명사구)
P: 문단(60~140자)
P: 문단
BULLET: (선택) 짧은 항목
TH: 항목 | 내용        ← 표가 필요한 섹션에만(1~2곳), 이어서 TR 줄 3~5개
TR: 값1 | 값2
(H2는 3~4개, 각 H2마다 P 2~3개)
Q: 독자가 실제로 궁금해할 질문
A: 출처로 확인되는 답 1~2문장
(Q/A 3쌍)
CARD_KICKER: 정보카드 위 작은 문구 (예: 방송 정보)
CARD_HEADLINE: 카드 제목 18자 이내
CARD_ROW: 항목(6자 이내) | 값(출처로 확인된 것만, 22자 이내)
(CARD_ROW 4~6줄)
TAGS: 태그1, 태그2, 태그3, 태그4, 태그5, 태그6`;
  return askParsed<Draft>(prompt, parseDraft, '글 쓰기');
}

const flat = (d: Draft) => [d.title, d.answer, ...d.sections.flatMap(s => [s.h2, ...s.paras, ...(s.bullets || []), ...(s.table ? s.table.rows.flat() : [])]), ...d.faq.flatMap(f => [f.q, f.a]), ...d.card.rows.map(r => `${r.k} ${r.v}`)].join('\n');
export const draftText = flat;

/** 쓴 글의 사실 주장 중 출처로 확인되지 않는 것을 찾는다 */
export async function findUnsupported(d: Draft, srcs: Source[]): Promise<string[]> {
  return askParsed<string[]>(
    `당신은 엄격한 팩트체커입니다. 아래 [글]의 사실 주장(이름·날짜·시간·나이·숫자·관계·방송사·사건)을 하나씩 [출처]와 대조하세요.\n출처 어디에도 없거나 출처와 다른 주장만 골라 "UNSUPPORTED: 문장 일부" 형식으로 한 줄씩 적으세요. 모두 확인되면 "NONE" 한 줄만 쓰세요.\n의견·일반론은 제외하고 사실 주장만 봅니다. 다른 설명은 쓰지 마세요.\n\n[글]\n${flat(d)}\n\n[출처]\n${srcBlock(srcs)}`,
    raw => {
      const lines = raw.split('\n').map(l => l.trim());
      const bad = lines.filter(l => /^UNSUPPORTED\s*[:：]/.test(l)).map(l => l.replace(/^UNSUPPORTED\s*[:：]\s*/, '')).filter(Boolean).slice(0, 12);
      if (bad.length) return bad;
      return lines.some(l => /^NONE\b/.test(l)) ? [] : '형식 못 읽음';
    },
    '사실 대조',
  );
}

const shingles = (s: string, n = 12) => { const t = s.replace(/\s+/g, ''); const out = new Set<string>(); for (let i = 0; i + n <= t.length; i += 2) out.add(t.slice(i, i + n)); return out; };

/** 품질 게이트: 문제가 있으면 이유를 돌려준다(null이면 통과) */
export function lint(d: Draft, srcs: Source[]): string | null {
  const text = flat(d), body = d.sections.flatMap(s => s.paras).join(' ');
  if (body.replace(/\s/g, '').length < 700) return '본문이 짧아요';
  if (findForeignWords(text).length) return '외국어 단어 섞임: ' + findForeignWords(text).slice(0, 4).join(',');
  if (/[฀-๿Ѐ-ӿ؀-ۿ぀-ヿऀ-ॿ]/.test(text)) return '외국 문자 섞임';
  if (d.sections.some(s => !s.h2.trim() || /(^|\s),|\(\s*\)/.test(s.h2))) return '깨진 소제목';
  if (/\*\*|^#{1,3}\s|```/m.test(text)) return '마크다운 기호 남음';
  if (/충격|경악|난리|발칵|헉|대박/.test(d.title)) return '낚시성 제목';
  const mine = shingles(text);
  for (const s of srcs) {
    const theirs = shingles(s.text);
    let hit = 0; mine.forEach(h => { if (theirs.has(h)) hit++; });
    if (mine.size && hit / mine.size > 0.1) return `출처와 문장이 너무 비슷해요(${s.host} ${Math.round(hit / mine.size * 100)}%)`;
  }
  return null;
}
