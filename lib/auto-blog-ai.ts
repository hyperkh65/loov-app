/**
 * 블로그 자동화용 AI 텍스트 생성 (non-streaming)
 * 우선순위: Ollama Cloud → OpenRouter → Gemini → OpenAI
 * 각각 localStorage 키(무료AI 페이지) 또는 DB/env 설정값 사용
 */
import { getSetting } from './get-setting';

// 한국어 강제 지시문 — 모든 프롬프트 뒤에 추가
const KOREAN_ONLY_SUFFIX = `

[언어 규칙 - 절대 준수]
반드시 한국어로만 작성하세요.
중국어(漢字·简体·繁體), 일본어(ひらがな·カタカナ·漢字), 러시아어(Кириллица), 아랍어 등
어떤 외국어 문자도 절대 포함하지 마세요.

【영어 단어 사용 절대 금지 — 한국어 동의어로 반드시 대체】
한국어 표현이 있는 영어 단어는 어떤 상황에서도 절대 영어로 쓰지 마세요.
- marketing → 마케팅 | system → 시스템 | feedback → 피드백 | update → 업데이트
- design → 디자인 | performance → 성능 | platform → 플랫폼 | service → 서비스
- brand → 브랜드 | business → 비즈니스 | strategy → 전략 | process → 프로세스
- trend → 트렌드 | channel → 채널 | online → 온라인 | offline → 오프라인
- quality → 품질 | review → 리뷰 | experience → 경험 | customer → 고객
- solution → 솔루션 | global → 글로벌 | network → 네트워크 | digital → 디지털
- traffic → 트래픽 | algorithm → 알고리즘 | share → 공유 | app → 앱
- homepage → 홈페이지 | search → 검색 | escalation → 에스컬레이션
- broadcasting → 방송 | humanitarian → 인도주의 | universal → 다양한
- Israel → 이스라엘 | Palestinian → 팔레스타인

예외: iPhone, Netflix, Google, YouTube, Amazon 등 고유 브랜드명·제품명은 영어 그대로 사용 가능.
단, ===TITLE===, ===META===, ===CONTENT===, ===KEYWORDS=== 같은 출력 마커는 반드시 영문 그대로 유지.
위 규칙을 어기면 응답 전체가 무효 처리됩니다.`.trim();

// CJK 한자·일본어 가나·키릴 등 외국어 제거 (한글·라틴·숫자·일반기호 보존)
function stripForeignChars(text: string): string {
  return text
    .replace(/[⺀-⻿]/g, '')   // CJK Radicals Supplement
    .replace(/[⼀-⿟]/g, '')   // Kangxi Radicals
    .replace(/[぀-ヿ]/g, '')   // Hiragana + Katakana
    .replace(/[㄀-ㄯ]/g, '')   // Bopomofo
    .replace(/[㐀-䶿]/g, '')   // CJK Extension A
    .replace(/[一-鿿]/g, '')   // CJK Unified Ideographs (한자)
    .replace(/[豈-﫿]/g, '')   // CJK Compatibility Ideographs
    .replace(/[Ѐ-ӿ]/g, '')   // Cyrillic (러시아어 등)
    .replace(/[؀-ۿ]/g, '')   // Arabic
    .replace(/ {2,}/g, ' ')            // 연속 공백 정리
    .trim();
}

// 한국어 동의어가 있는 영어 단어를 강제 치환
// ※ content/data/post/image/video는 HTML 속성·출력 마커와 충돌하므로 제외
const ENGLISH_TO_KOREAN_MAP: [RegExp, string][] = [
  [/\bmarketing\b/gi, '마케팅'],
  [/\bsystem(s)?\b/gi, '시스템'],
  [/\bfeedback\b/gi, '피드백'],
  [/\bupdate(s)?\b/gi, '업데이트'],
  [/\bdesign(s)?\b/gi, '디자인'],
  [/\bperformance\b/gi, '성능'],
  [/\bplatform(s)?\b/gi, '플랫폼'],
  [/\bservice(s)?\b/gi, '서비스'],
  [/\bbrand(s)?\b/gi, '브랜드'],
  [/\bbusiness(es)?\b/gi, '비즈니스'],
  [/\bstrateg(y|ies)\b/gi, '전략'],
  [/\bprocess(es)?\b/gi, '프로세스'],
  [/\btrend(s)?\b/gi, '트렌드'],
  [/\bchannel(s)?\b/gi, '채널'],
  [/\bonline\b/gi, '온라인'],
  [/\boffline\b/gi, '오프라인'],
  [/\bquality\b/gi, '품질'],
  [/\breview(s)?\b/gi, '리뷰'],
  [/\bexperience(s)?\b/gi, '경험'],
  [/\bcustomer(s)?\b/gi, '고객'],
  [/\bsolution(s)?\b/gi, '솔루션'],
  [/\bglobal\b/gi, '글로벌'],
  [/\bnetwork(s)?\b/gi, '네트워크'],
  [/\bdigital\b/gi, '디지털'],
  [/\btraffic\b/gi, '트래픽'],
  [/\balgorithm(s)?\b/gi, '알고리즘'],
  [/\bshare(s)?\b/gi, '공유'],
  [/\bescalation\b/gi, '에스컬레이션'],
  [/\bbroadcast(ing)?\b/gi, '방송'],
  [/\bhumanitarian\b/gi, '인도주의'],
  [/\buniversal\b/gi, '다양한'],
  [/\bversatile\b/gi, '다재다능한'],
  [/\bIsrael\b/g, '이스라엘'],
  [/\bPalestinian(s)?\b/gi, '팔레스타인'],
];

function replaceInText(text: string): string {
  let result = text;
  for (const [pattern, replacement] of ENGLISH_TO_KOREAN_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function replaceEnglishWords(text: string): string {
  return text.split('\n').map(line => {
    if (/^===\w/.test(line.trim())) return line; // ===MARKER=== 줄 보호
    // HTML 줄도 태그 사이 텍스트만 치환 (속성값 보호)
    return line.replace(/(<[^>]*>)|([^<]+)/g, (match, tag, textContent) => {
      if (tag) return tag; // <태그 ...> 는 그대로
      return textContent ? replaceInText(textContent) : match;
    });
  }).join('\n');
}

const OPENROUTER_MODELS = [
  'qwen/qwen3-235b-a22b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-r1:free',
  'google/gemma-3-27b-it:free',
  'mistralai/mistral-7b-instruct:free',
];

async function callOllama(apiKey: string, model: string, prompt: string): Promise<string> {
  const res = await fetch('https://ollama.com/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    }),
    signal: AbortSignal.timeout(540_000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.message?.content || '';
  if (!text) throw new Error('Ollama 빈 응답');
  return text;
}

async function callOpenRouter(apiKey: string, model: string, prompt: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://loov.co.kr',
      'X-Title': 'LOOV Blog Automation',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    }),
    signal: AbortSignal.timeout(540_000),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('OpenRouter 빈 응답');
  return text;
}

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const GEMINI_MODELS = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  for (const model of GEMINI_MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(540_000),
      }
    );
    if (!res.ok) continue;
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (text) return text;
  }
  throw new Error('Gemini 모든 모델 실패');
}

async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(540_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('OpenAI 빈 응답');
  return text;
}

// Ollama 가용 모델 캐시 (키별, 1시간)
const _ollamaModelCache = new Map<string, { models: string[]; ts: number }>();

async function getAvailableOllamaModels(apiKey: string): Promise<string[]> {
  const CACHE_TTL = 3_600_000;
  const cached = _ollamaModelCache.get(apiKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.models;
  try {
    const res = await fetch('https://ollama.com/api/tags', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      _ollamaModelCache.set(apiKey, { models: [], ts: Date.now() });
      return [];
    }
    const data = await res.json() as { models?: Array<{ name: string }> };
    // 전체 이름 그대로 보존 (kimi-k2.6:cloud, llama3.3:cloud 등 — split 금지)
    const models = (data.models || []).map(m => m.name).filter(Boolean);
    _ollamaModelCache.set(apiKey, { models, ts: Date.now() });
    return models;
  } catch {
    return [];
  }
}

// Claude 모델 캐시 (프로세스 내 1시간)
let _claudeModelCache: { models: string[]; ts: number } | null = null;

async function getLatestClaudeHaiku(apiKey: string): Promise<string> {
  const FALLBACK = 'claude-haiku-4-5-20251001';
  try {
    const now = Date.now();
    if (_claudeModelCache && now - _claudeModelCache.ts < 3_600_000) {
      const haiku = _claudeModelCache.models.find((m) => m.includes('haiku'));
      return haiku || FALLBACK;
    }
    const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return FALLBACK;
    const data = await res.json() as { data: Array<{ id: string; created_at: string }> };
    const models = (data.data || [])
      .filter((m) => m.id.startsWith('claude-'))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((m) => m.id);
    _claudeModelCache = { models, ts: now };
    return models.find((m) => m.includes('haiku')) || FALLBACK;
  } catch {
    return FALLBACK;
  }
}

async function callClaude(apiKey: string, prompt: string, model?: string): Promise<string> {
  const resolvedModel = model || await getLatestClaudeHaiku(apiKey);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: resolvedModel,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(540_000),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  if (!text) throw new Error('Claude 빈 응답');
  return text;
}

export async function generateText(
  prompt: string,
  preferModel: string = 'qwen3',
  clientOllamaKey?: string,
  clientOpenrouterKey?: string,
): Promise<string> {
  // 한국어 강제 지시문 추가 (중복 방지)
  if (!prompt.includes('[언어 규칙 - 절대 준수]')) {
    prompt = prompt + '\n\n' + KOREAN_ONLY_SUFFIX;
  }

  const errors: string[] = [];

  // preferModel이 Ollama 모델인지 판단
  const NON_OLLAMA = ['gemini', 'claude', 'openai', 'gpt', 'openrouter'];
  const isOllamaPreferred = !NON_OLLAMA.some(p => preferModel.toLowerCase().startsWith(p));

  // Ollama 키 수집
  const ollamaKeys: string[] = [];
  if (clientOllamaKey) ollamaKeys.push(clientOllamaKey);
  try {
    const raw = await getSetting('OLLAMA_API_KEYS');
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      if (Array.isArray(arr)) ollamaKeys.push(...arr.filter(Boolean));
    }
  } catch { /* ignore */ }
  const legacyKey = await getSetting('OLLAMA_API_KEY');
  if (legacyKey && !ollamaKeys.includes(legacyKey)) ollamaKeys.push(legacyKey);

  // ── Ollama Cloud ────────────────────────────────────────
  const tryOllama = async (mainModel: string) => {
    if (ollamaKeys.length === 0) return false;
    const OLLAMA_FALLBACKS = [
      'qwen3.5', 'qwen3', 'qwen3-coder', 'llama3.3', 'llama3.2',
      'mistral', 'mistral-small3.1', 'gemma3', 'deepseek-r1',
      'phi4', 'phi4-mini', 'ministral-3',
    ];
    for (const key of ollamaKeys) {
      const available = await getAvailableOllamaModels(key);
      let toTry: string[];
      if (available.length > 0) {
        // available에는 전체 이름(kimi-k2.6:cloud, llama3.3:cloud 등) 포함
        // mainModel 기준으로 우선순위: 정확히 일치 또는 baseModel: prefix 일치
        const priority = available.filter(m => m === mainModel || m.startsWith(mainModel + ':'));
        const rest = available.filter(m => !priority.includes(m));
        toTry = [...priority, ...rest];
      } else {
        toTry = [mainModel, ...OLLAMA_FALLBACKS.filter(m => m !== mainModel)];
      }
      if (toTry.length === 0) continue;
      for (const model of toTry) {
        try { return await callOllama(key, model, prompt); } catch { continue; }
      }
    }
    errors.push('Ollama: 모든 키/모델 실패');
    return false;
  };

  // ── 나머지 provider 헬퍼 ────────────────────────────────
  const tryGemini = async () => {
    const key = await getSetting('GEMINI_API_KEY');
    if (!key) { errors.push('Gemini: API 키 미설정'); return false; }
    try { return await callGemini(key, prompt); }
    catch (e) { errors.push(`Gemini: ${e}`); return false; }
  };
  const tryOpenRouter = async () => {
    const key = clientOpenrouterKey || await getSetting('OPENROUTER_API_KEY');
    if (!key) { errors.push('OpenRouter: API 키 미설정'); return false; }
    for (const model of OPENROUTER_MODELS) {
      try { return await callOpenRouter(key, model, prompt); } catch { continue; }
    }
    errors.push('OpenRouter: 모든 모델 실패');
    return false;
  };
  const tryOpenAI = async () => {
    const key = await getSetting('OPENAI_API_KEY');
    if (!key) { errors.push('OpenAI: API 키 미설정'); return false; }
    try { return await callOpenAI(key, prompt); }
    catch (e) { errors.push(`OpenAI: ${e}`); return false; }
  };
  const tryClaude = async (model?: string) => {
    const key = await getSetting('CLAUDE_API_KEY');
    if (!key) { errors.push('Claude: API 키 미설정'); return false; }
    try { return await callClaude(key, prompt, model); }
    catch (e) { errors.push(`Claude: ${e}`); return false; }
  };

  // ── 결과에서 외국어 문자 제거 + 영어 단어 한국어 치환 ──────────
  const clean = (r: string | false) => r ? replaceEnglishWords(stripForeignChars(r)) : false;

  // ── preferModel에 따라 해당 provider를 먼저 시도 ──────────
  let result: string | false = false;

  if (preferModel.startsWith('claude-')) {
    result = clean(await tryClaude(preferModel));
  } else if (preferModel === 'claude') {
    result = clean(await tryClaude());
  } else if (preferModel === 'gemini') {
    result = clean(await tryGemini());
  } else if (preferModel === 'openrouter') {
    result = clean(await tryOpenRouter());
  } else if (preferModel.startsWith('gpt') || preferModel === 'openai') {
    result = clean(await tryOpenAI());
  } else if (isOllamaPreferred) {
    result = clean(await tryOllama(preferModel));
  }
  if (result) return result;

  // ── 나머지 provider 순서대로 fallback ─────────────────────
  const fallbacks: Array<() => Promise<string | false>> = [];

  if (!isOllamaPreferred) fallbacks.push(() => tryOllama('qwen3'));
  if (!preferModel.startsWith('gemini') && preferModel !== 'gemini') fallbacks.push(tryGemini);
  if (!preferModel.startsWith('claude')) fallbacks.push(() => tryClaude());
  if (preferModel !== 'openrouter') fallbacks.push(tryOpenRouter);
  if (!preferModel.startsWith('gpt') && preferModel !== 'openai') fallbacks.push(tryOpenAI);

  for (const fn of fallbacks) {
    const r = clean(await fn());
    if (r) return r;
  }

  throw new Error(
    `사용 가능한 AI 없음\n` +
    (errors.length ? `오류: ${errors.join(' | ')}\n` : '') +
    '설정 페이지에서 Gemini, Claude, OpenAI, OpenRouter API 키 중 하나를 저장하세요.'
  );
}
