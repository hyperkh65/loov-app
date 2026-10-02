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

// AI think 블록 제거 (qwen3 등 COT 모델)
function stripThinkBlocks(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\[THINK\][\s\S]*?\[\/THINK\]/gi, '')
    .replace(/^Thinking:[\s\S]*?\n\n/m, '')
    .trim();
}

// 이스케이프된 따옴표 복원 (AI가 JSON 형식으로 출력할 때)
function unescapeQuotes(text: string): string {
  return text
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
}

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

// 허용 영어 패턴 (약어·브랜드·단위)
const ALLOWED_LATIN = /^(AI|SEO|IT|CEO|MOU|GDP|PC|TV|DNA|GPU|CPU|RAM|API|SDK|LED|GPS|SNS|PR|QR|VR|AR|NFT|ETF|IPO|vs|No|Dr|Mr|Mrs|[0-9]+[a-zA-Z]{1,3}|[A-Z]{1,5})$/;

// 한국어 문장 속 비-영어 유럽어 단어 제거 (포르투갈어·폴란드어·스페인어 등)
function removeEuropeanWords(text: string): string {
  return text.replace(/(<[^>]*>)|([^<]+)/g, (match, tag, textNode) => {
    if (tag) return tag;
    if (!textNode) return match;
    return (textNode as string).replace(/\b[a-zA-ZÀ-ɏ]{5,}\b/g, (word: string) => {
      if (ALLOWED_LATIN.test(word)) return word;
      if (/[À-ɏ]/.test(word)) return ''; // 악센트 문자 → 유럽어
      if (/[bcdfghjklmnpqrstvwxyz]{4,}/i.test(word)) return ''; // 자음 4연속 → 비영어 패턴
      return word;
    });
  });
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
  [/\bgovernance\b/gi, '거버넌스'],
  [/\bopcon\b/gi, '전작권'],
  [/\bconsensus\b/gi, '합의'],
  [/\bsanction(s)?\b/gi, '제재'],
  [/\bsummit\b/gi, '정상회담'],
  [/\bdiplomacy\b/gi, '외교'],
  [/\bsovereignty\b/gi, '주권'],
  [/\balliance\b/gi, '동맹'],
  [/\bdetente\b/gi, '데탕트'],
  [/\bproposal\b/gi, '제안'],
  [/\bframework\b/gi, '프레임워크'],
  [/\binitiative\b/gi, '이니셔티브'],
  [/\bbilateral\b/gi, '양자'],
  [/\bmultilateral\b/gi, '다자'],
  [/\binfrastructure\b/gi, '인프라'],
  [/\btransparency\b/gi, '투명성'],
  [/\baccountability\b/gi, '책임성'],
  [/\bsustainable\b/gi, '지속가능한'],
  [/\binnovation\b/gi, '혁신'],
  [/\bstartup(s)?\b/gi, '스타트업'],
  [/\bcontent(s)?\b/gi, '콘텐츠'],
  [/\bportfolio\b/gi, '포트폴리오'],
  [/\bwebsite\b/gi, '웹사이트'],
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

// 2026-08 기준 활성 무료 모델 (삭제된 모델: qwen3-next-80b, meta-llama/llama-3.3-70b, hermes-3-llama-405b)
const OPENROUTER_MODELS = [
  'openrouter/free',                         // 자동 최적 무료 모델 선택 (항상 최우선)
  'nvidia/nemotron-3-ultra-550b-a55b:free', // 550B, 1M ctx — 안정적
  'openai/gpt-oss-120b:free',              // OpenAI OSS 120B
  'nvidia/nemotron-3-super-120b-a12b:free', // 120B, 1M ctx
  'moonshotai/kimi-k2.6:free',              // 한국어 강함, 262K ctx
  'z-ai/glm-4.5-air:free',                 // GLM 4.5
  'google/gemma-4-31b-it:free',             // Gemma 4 31B, 262K ctx
  'openai/gpt-oss-20b:free',               // OpenAI OSS 20B (빠름)
];

const exhaustedOllamaKeys = new Map<string, number>();

async function callOllama(apiKey: string, model: string, prompt: string): Promise<string> {
  const res = await fetch('https://ollama.com/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      options: {
        num_predict: 8192,  // 출력 토큰 최대 8K (Cloud API는 -1 미지원)
        num_ctx: 8192,      // 컨텍스트 윈도우 8K
        repeat_penalty: 1.15, // 같은 단어 반복 루프 억제
        temperature: 0.7,
      },
    }),
    // 80s였던 걸 30s로 축소 — 키가 9개까지 등록돼있는데 응답 없이 멈추는 키/모델
    // 조합 하나가 80s를 다 잡아먹으면 전체 100s 예산 안에서 남은 키를 거의
    // 못 시도해보고 폴백으로 넘어가버리는 게 실사용 중 확인됨(429/402 같은 실제
    // 거부 응답은 항상 즉시 옴 — 정상 생성도 대부분 30s 안에 끝나는 걸 확인)
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.message?.content || '';
  if (!text) throw new Error('Ollama 빈 응답');
  return text;
}

const exhaustedNvidia = { until: 0 };

// NVIDIA NIM(build.nvidia.com) 무료 호출 — Ollama와 같은 nemotron-3-super 계열이라 블로그 본문에도 동일 품질로 쓴다.
async function callNvidia(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'nvidia/nemotron-3-super-120b-a12b', messages: [{ role: 'user', content: prompt }], max_tokens: 8192, temperature: 0.7 }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`NVIDIA ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const text = (await res.json()).choices?.[0]?.message?.content || '';
  if (!text) throw new Error('NVIDIA 빈 응답');
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
      max_tokens: 8192,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('OpenRouter 빈 응답');
  return text;
}

async function callGemini(apiKeys: string[], prompt: string): Promise<string> {
  // 기존 gemini-2.0-flash-lite/gemini-2.0-flash/gemini-1.5-flash가 전부 구글 쪽에서
  // 폐기(404)된 걸 실제 API 응답으로 확인 — "-latest" 별칭은 구글이 알아서 최신
  // 모델로 갱신해주므로 이런 폐기 이슈가 재발하지 않음
  // gemini-2.5-flash-lite는 구글 쪽에서 404(폐기)로 확인됨. gemini-2.5-flash는
  // "신규 계정에는 더 이상 제공 안 함"(구글 응답: new users는 gemini-3.8-flash 쓰라고
  // 안내) — 계속 새 계정을 등록해서 키를 늘릴 계획이라 신규 계정에서도 되는
  // gemini-3.8-flash/gemini-3.5-flash를 앞에 두고, 기존 계정에서만 되는 2.5-flash를
  // 다음 시도로 유지. 3.x 모델은 실사용 중 503(혼잡)이 자주 나서 키 하나에 여러
  // 모델을 두는 게 곧 재시도 효과도 겸함.
  const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash'];
  const allErrors: string[] = [];
  // 키를 계속 늘려갈 예정이라(등록 계정 다수) 키 바깥/모델 안쪽으로 순회 —
  // 한 키가 쿼터 소진이면 그 키만 건너뛰고 바로 다음 키로 넘어간다.
  for (const apiKey of apiKeys) {
    for (const model of GEMINI_MODELS) {
      // 새로 발급되는 구글 API 키 포맷("AQ."로 시작)은 URL 쿼리파라미터(?key=)로
      // 인증이 안 되고 x-goog-api-key 헤더로만 동작하는 게 실제 응답으로 확인됨
      // (기존 "AIzaSy" 포맷은 헤더 방식으로도 그대로 동작하므로 헤더 방식 하나로 통일).
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 16384, temperature: 0.7 },
          }),
          signal: AbortSignal.timeout(120_000),
        }
      );
      if (!res.ok) {
        // 원인 추적 불가 문제(모델별 상세 에러가 안 남아 디버깅 불가)였던 것을 수정 —
        // 상태코드/본문 일부를 모아서 최종 실패 메시지에 포함
        allErrors.push(`${model}:${res.status} ${(await res.text()).slice(0, 100)}`);
        continue;
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (text) return text;
      allErrors.push(`${model}:빈 응답`);
    }
  }
  throw new Error(`Gemini 모든 키/모델 실패 (${allErrors.join(' | ')})`);
}

async function callOpenAI(apiKey: string, prompt: string, model = 'gpt-4o-mini'): Promise<string> {
  const RETRY_DELAYS = [3000, 8000, 15000];
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 8192,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (res.status === 429 && attempt < RETRY_DELAYS.length) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      continue;
    }
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    if (!text) throw new Error('OpenAI 빈 응답');
    return text;
  }
  throw new Error('OpenAI 429: 재시도 횟수 초과');
}

// Groq(OpenAI 호환 API) — 멀티키 풀 순회, 에러 시 다음 키로 자동 순환
async function callGroq(apiKeys: string[], prompt: string, model = 'qwen/qwen3.8-27b'): Promise<string> {
  if (!apiKeys.length) throw new Error('Groq: API 키 미설정');
  let lastErr: Error = new Error('Groq: 사용 가능한 API 키가 없습니다.');
  for (const apiKey of apiKeys) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 8192,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) { lastErr = new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`); continue; }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      if (!text) { lastErr = new Error('Groq 빈 응답'); continue; }
      return text;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      continue;
    }
  }
  throw lastErr;
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
    signal: AbortSignal.timeout(120_000),
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
  clientGlobalAIKey?: string,
  clientGlobalAIModel?: string,
  options?: { multilingual?: boolean; ollamaOnly?: boolean }, // multilingual: 한국어 강제 규칙·문자 정제 생략 / ollamaOnly: 블로그 본문용 — 실패 시 다른 provider로 폴백하지 않음
): Promise<string> {
  // 한국어 강제 지시문 추가 (중복 방지, 다국어 모드 제외)
  if (!options?.multilingual && !prompt.includes('[언어 규칙 - 절대 준수]')) {
    prompt = prompt + '\n\n' + KOREAN_ONLY_SUFFIX;
  }

  const errors: string[] = [];

  // preferModel이 Ollama 모델인지 판단
  const NON_OLLAMA = ['gemini', 'claude', 'openai', 'gpt', 'openrouter', 'groq'];
  const isOllamaPreferred = options?.ollamaOnly || !NON_OLLAMA.some(p => preferModel.toLowerCase().startsWith(p));

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

  const tryNvidia = async (): Promise<string | false> => {
    const key = await getSetting('NVIDIA_API_KEY');
    if (!key || exhaustedNvidia.until > Date.now()) return false;
    try { return await callNvidia(key, prompt); }
    catch (e) {
      errors.push(String(e).slice(0, 120));
      if (/NVIDIA (402|429)/.test(String(e))) exhaustedNvidia.until = Date.now() + 3600_000;
      return false;
    }
  };

  // ── Ollama Cloud ────────────────────────────────────────
  const tryOllama = async (mainModel: string) => {
    if (ollamaKeys.length === 0) { errors.push('Ollama: API 키 미설정'); return false; }
    // 폴백 순서: 검증된 중간 크기 모델만 (전체 순회 금지 — 300s maxDuration 초과 방지)
    const OLLAMA_FALLBACKS = [
      // Ollama Cloud 활성 모델 기준 (2026-08 / 한국어 안정성 우선)
      'nemotron-3-super',
      'deepseek-v4-flash', 'nemotron-3-ultra', 'gpt-oss',
      'qwen3.5', 'gemma4', 'nemotron-3-nano',
      // 외국어 혼입 위험 → 후순위 (mistral은 유럽어, kimi/minimax/glm은 중국어 섞여나오는 게
      // 실사용 중 실제로 확인됨 — replaceEnglishWords/removeEuropeanWords 사전에 없는
      // 단어는 그대로 새어나감)
      'mistral-large-3', 'kimi-k2.7-code', 'minimax-m3', 'glm-5.2', 'kimi-k2.6',
    ];
    // 개별 호출은 80s 타임아웃이 있지만 모델을 6개까지 순차 시도하면 480s까지
    // 걸릴 수 있어 maxDuration(300s)을 넘긴다 — 전체 예산을 100s로 캡핑해서
    // 그 안에서만 시도하고 나머지는 다른 provider(Gemini 등) 폴백으로 넘긴다.
    const deadline = Date.now() + 100_000;
    const firstErrors: string[] = [];
    for (const key of ollamaKeys) {
      if (Date.now() > deadline) break;
      // 월 한도 소진(429) 키는 1시간 동안 건너뜀 — 소진된 키가 예산(100s)을 다 먹어 살아있는 키까지 못 가던 문제
      if ((exhaustedOllamaKeys.get(key) || 0) > Date.now()) continue;
      const available = await getAvailableOllamaModels(key);
      let toTry: string[];
      if (available.length > 0) {
        // 100B 초과 모델 또는 1T 모델은 구독 필요 → 제외
        const isFreeModel = (name: string) => {
          const m = name.match(/:(\d+)([bt])$/i);
          if (!m) return true;
          const size = parseInt(m[1]);
          const unit = m[2].toLowerCase();
          if (unit === 't') return false; // 1T+ = 구독 필요
          if (unit === 'b' && size > 100) return false; // 100B+ = 구독 필요
          return true;
        };
        // 선택 모델 우선, 폴백은 OLLAMA_FALLBACKS 순서대로 available에 있는 것만 최대 4개
        const priority = available.filter(m => m === mainModel || m.startsWith(mainModel + ':'));
        const fallbackOrdered = OLLAMA_FALLBACKS
          .flatMap(fb => available.filter(m => (m === fb || m.startsWith(fb + ':') || m.startsWith(fb + '.')) && isFreeModel(m)))
          .filter(m => !priority.includes(m))
          .slice(0, 3);
        toTry = [...priority, ...fallbackOrdered];
      } else {
        // 모델 목록 조회 실패 시 :cloud 접미사도 함께 시도 (최대 6개)
        const withCloud = [mainModel + ':cloud', mainModel,
          ...OLLAMA_FALLBACKS.slice(0, 3).flatMap(m => [m + ':cloud', m])
        ];
        toTry = [...new Set(withCloud)].slice(0, 6);
      }
      for (const model of toTry) {
        if (Date.now() > deadline) break;
        try { return await callOllama(key, model, prompt); }
        catch (e) {
          // 캡을 3개로 걸어두면 키 하나가 여러 모델에서 실패할 때 로그가 거기서
          // 잘려서 나머지 8개 키가 실제로 시도됐는지조차 알 수 없었음 — 캡 제거
          firstErrors.push(`key${ollamaKeys.indexOf(key) + 1}/${model}: ${String(e).slice(0, 60)}`);
          // Ollama Cloud가 계정 동시요청 슬롯 대기로 응답 없이 물고 있다가 타임아웃
          // 나는 경우(429/402처럼 즉시 오는 거부와 다름)가 실사용 중 확인됨 — 이런
          // 키는 다른 모델로 재시도해봤자 또 타임아웃 날 뿐이니 그 키는 바로 포기하고
          // 다음 키로 넘어가서 9개 키를 예산 안에서 최대한 많이 시도
          if ((e as Error).name === 'TimeoutError') break;
          if (/Ollama 429[\s\S]*usage limit/.test(String(e))) { exhaustedOllamaKeys.set(key, Date.now() + 3600_000); break; }
          continue;
        }
      }
    }
    errors.push(`Ollama: 모든 키/모델 실패${firstErrors.length ? ` (${firstErrors.join(' | ')})` : ''}`);
    return false;
  };

  // ── 나머지 provider 헬퍼 ────────────────────────────────
  const tryGemini = async () => {
    // 다중 키 수집 (GEMINI_API_KEYS 배열 + 레거시 단일 키) — 계정을 계속 늘릴 예정이라
    // Groq/OpenRouter와 동일하게 여러 키를 등록해두고 순환.
    const geminiKeys: string[] = [];
    try {
      const raw = await getSetting('GEMINI_API_KEYS');
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        if (Array.isArray(arr)) geminiKeys.push(...arr.filter(Boolean));
      }
    } catch { /* ignore */ }
    const legacyGeminiKey = await getSetting('GEMINI_API_KEY');
    if (legacyGeminiKey && !geminiKeys.includes(legacyGeminiKey)) geminiKeys.push(legacyGeminiKey);

    if (geminiKeys.length === 0) { errors.push('Gemini: API 키 미설정'); return false; }
    try { return await callGemini(geminiKeys, prompt); }
    catch (e) { errors.push(`Gemini: ${e}`); return false; }
  };
  const tryOpenRouter = async () => {
    // 다중 키 수집 (OPENROUTER_API_KEYS 배열 + 레거시 단일 키)
    const orKeys: string[] = [];
    if (clientOpenrouterKey) orKeys.push(clientOpenrouterKey);
    try {
      const raw = await getSetting('OPENROUTER_API_KEYS');
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        if (Array.isArray(arr)) orKeys.push(...arr.filter(Boolean));
      }
    } catch { /* ignore */ }
    const legacyOrKey = await getSetting('OPENROUTER_API_KEY');
    if (legacyOrKey && !orKeys.includes(legacyOrKey)) orKeys.push(legacyOrKey);

    if (orKeys.length === 0) { errors.push('OpenRouter: API 키 미설정'); return false; }

    const firstErrors: string[] = [];
    for (const key of orKeys) {
      for (const model of OPENROUTER_MODELS) {
        try { return await callOpenRouter(key, model, prompt); }
        catch (e) {
          const msg = String(e);
          // 429(한도 초과) → 다음 키로, 그 외 오류 → 다음 모델로
          if (msg.includes('429')) break;
          if (firstErrors.length < 3) firstErrors.push(`key${orKeys.indexOf(key)+1}/${model}: ${msg.slice(0,50)}`);
          continue;
        }
      }
    }
    errors.push(`OpenRouter: 모든 키/모델 실패${firstErrors.length ? ` (${firstErrors.join(' | ')})` : ''}`);
    return false;
  };
  const tryOpenAI = async () => {
    const key = await getSetting('OPENAI_API_KEY');
    if (!key) { errors.push('OpenAI: API 키 미설정'); return false; }
    try { return await callOpenAI(key, prompt); }
    catch (e) { errors.push(`OpenAI: ${e}`); return false; }
  };
  // AI 직원 기본 설정 키 (localStorage → 클라이언트에서 전달)
  const tryGlobalAI = async () => {
    if (!clientGlobalAIKey) return false;
    const model = clientGlobalAIModel || 'gpt-4o';
    try { return await callOpenAI(clientGlobalAIKey, prompt, model); }
    catch (e) { errors.push(`GlobalAI(${model}): ${e}`); return false; }
  };
  const tryClaude = async (model?: string) => {
    const key = await getSetting('CLAUDE_API_KEY');
    if (!key) { errors.push('Claude: API 키 미설정'); return false; }
    try { return await callClaude(key, prompt, model); }
    catch (e) { errors.push(`Claude: ${e}`); return false; }
  };
  const tryGroq = async () => {
    const groqKeys: string[] = [];
    try {
      const raw = await getSetting('GROQ_API_KEYS');
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        if (Array.isArray(arr)) groqKeys.push(...arr.filter(Boolean));
      }
    } catch { /* ignore */ }
    if (groqKeys.length === 0) { errors.push('Groq: API 키 미설정'); return false; }
    try { return await callGroq(groqKeys, prompt); }
    catch (e) { errors.push(`Groq: ${e}`); return false; }
  };

  // ── 결과 정제: think 블록 → 이스케이프 복원 → 외국어 제거 → 유럽어 제거 → 영어 치환 ──
  // 다국어 모드는 외국어 문자 제거 생략 (영어/일본어/스페인어 캡션 보존)
  const clean = (r: string | false) =>
    r ? (options?.multilingual
      ? unescapeQuotes(stripThinkBlocks(r))
      : replaceEnglishWords(removeEuropeanWords(stripForeignChars(unescapeQuotes(stripThinkBlocks(r)))))
    ) : false;

  // Groq 우선 모드 — 쿠팡/아고다처럼 매시간 도는 제휴 러너는 고갈된 Ollama/Gemini 등을
  // 먼저 두드리며 시간을 낭비하지 않도록 Groq부터 시도한다. 단 Groq가 실패(429/키 문제)하면
  // 예전처럼 나머지 provider로 이어서 폴백(전용 모드일 땐 그대로 발행 실패로 끝나 성공률이 떨어졌음).
  let groqTried = false;
  if (preferModel === 'groq' && !options?.ollamaOnly) {
    groqTried = true;
    const r = clean(await tryGroq());
    if (r) return r;
  }

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
    result = clean((await tryNvidia()) || (await tryOllama(preferModel)));
  }
  if (result) return result;

  if (options?.ollamaOnly) {
    throw new Error(`Ollama Cloud 전용 생성 실패 (다른 AI로 폴백 안 함)\n${errors.join(' | ')}`);
  }

  // ── 나머지 provider 순서대로 fallback ─────────────────────
  const fallbacks: Array<() => Promise<string | false>> = [];

  // Groq을 다른 fallback들보다 먼저: 나머지 provider(Ollama/Gemini/Claude/OpenRouter/OpenAI)가
  // 전부 동시에 죽었을 때(쿼터 소진 등, 실제로 발생했던 상황) 유일하게 살아있는 경로였다.
  if (!groqTried) fallbacks.push(tryGroq);
  if (!isOllamaPreferred) fallbacks.push(() => tryOllama('qwen3.5'));
  if (!preferModel.startsWith('gemini') && preferModel !== 'gemini') fallbacks.push(tryGemini);
  if (!preferModel.startsWith('claude')) fallbacks.push(() => tryClaude());
  if (preferModel !== 'openrouter') fallbacks.push(tryOpenRouter);
  fallbacks.push(tryGlobalAI);
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
