/**
 * AI 워터마크 감지 및 제거 유틸리티
 * - 유니코드 워터마크 (제로폭 문자 등)
 * - HTML 엔티티
 * - 특수 패턴
 * - GPT 점수 추정
 */

// 제로폭/보이지 않는 유니코드 문자들
const ZERO_WIDTH_CHARS = [
  '\u200B', // Zero Width Space
  '\u200C', // Zero Width Non-Joiner
  '\u200D', // Zero Width Joiner
  '\u200E', // Left-to-Right Mark
  '\u200F', // Right-to-Left Mark
  '\uFEFF', // Zero Width No-Break Space (BOM)
  '\u00AD', // Soft Hyphen
  '\u034F', // Combining Grapheme Joiner
  '\u2028', // Line Separator
  '\u2029', // Paragraph Separator
  '\u180E', // Mongolian Vowel Separator
  '\u2060', // Word Joiner
  '\u2061', // Function Application
  '\u2062', // Invisible Times
  '\u2063', // Invisible Separator
  '\u2064', // Invisible Plus
  '\uE000', // Private Use Area start
];

const ZERO_WIDTH_REGEX = new RegExp(
  `[${ZERO_WIDTH_CHARS.map(c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`).join('')}\uE000-\uF8FF]`,
  'g'
);

// HTML 엔티티 패턴
const HTML_ENTITY_REGEX = /&(?:#\d+|#x[\da-fA-F]+|[a-zA-Z]+);/g;

// AI 특유 한국어 패턴 (GPT 점수 계산용)
const AI_PATTERNS_KO = [
  /또한[,\s]/g,
  /더불어[,\s]/g,
  /아울러[,\s]/g,
  /뿐만 아니라/g,
  /특히[,\s]/g,
  /무엇보다/g,
  /결론적으로/g,
  /종합하면/g,
  /정리하자면/g,
  /살펴보면/g,
  /알아보겠습니다/g,
  /중요합니다[.。]/g,
  /필요합니다[.。]/g,
  /있습니다[.。]/g,
  /됩니다[.。]/g,
];

export interface WatermarkAnalysis {
  totalChars: number;
  watermarkCount: number;
  emojiCount: number;
  gptScore: number; // 0-100, 높을수록 AI 작성 가능성
  unicodeWatermarks: number;
  htmlEntities: number;
  specialPatterns: number;
  watermarkPositions: Array<{ index: number; char: string; code: string }>;
  cleanedText: string;
}

export function analyzeWatermarks(text: string): WatermarkAnalysis {
  const totalChars = text.length;

  // 유니코드 워터마크 감지
  const unicodeMatches: Array<{ index: number; char: string; code: string }> = [];
  let match;
  const zwRegex = new RegExp(ZERO_WIDTH_REGEX.source, 'g');
  while ((match = zwRegex.exec(text)) !== null) {
    unicodeMatches.push({
      index: match.index,
      char: match[0],
      code: `U+${match[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
    });
  }

  // HTML 엔티티 감지
  const htmlMatches = text.match(HTML_ENTITY_REGEX) || [];

  // 이모지 감지
  const emojiRegex = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;
  const emojiMatches = text.match(emojiRegex) || [];

  // GPT 점수 추정 (패턴 기반 휴리스틱)
  let patternHits = 0;
  for (const pattern of AI_PATTERNS_KO) {
    const hits = (text.match(pattern) || []).length;
    patternHits += hits;
  }
  // 1000자당 패턴 빈도로 정규화, 최대 100점
  const densityPer1000 = (patternHits / Math.max(totalChars, 1)) * 1000;
  const gptScore = Math.min(Math.round(densityPer1000 * 8), 100);

  // 정제된 텍스트 생성
  const cleanedText = cleanWatermarks(text);

  const watermarkCount = unicodeMatches.length + htmlMatches.length;

  return {
    totalChars,
    watermarkCount,
    emojiCount: emojiMatches.length,
    gptScore,
    unicodeWatermarks: unicodeMatches.length,
    htmlEntities: htmlMatches.length,
    specialPatterns: 0,
    watermarkPositions: unicodeMatches,
    cleanedText,
  };
}

export function cleanWatermarks(text: string): string {
  // 1. 제로폭 유니코드 문자 제거
  let cleaned = text.replace(ZERO_WIDTH_REGEX, '');

  // 2. HTML 엔티티 디코딩 (일반적인 것들만)
  cleaned = cleaned
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([\da-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));

  // 3. 연속 공백 정리
  cleaned = cleaned.replace(/\s{3,}/g, '\n\n');

  return cleaned;
}

/**
 * AI 글쓰기 프롬프트에 워터마크 방지 + 자연문체 강화 지시문
 */
export const ANTI_WATERMARK_PROMPT = `
[워터마크·AI 문체 절대 금지 — 위반 시 글 전체 무효]

■ 기술적 워터마크 금지
- 제로폭 공백(U+200B, U+200C, U+200D 등) 삽입 절대 금지
- HTML 엔티티(&amp;, &lt;, &nbsp; 등) 사용 금지 — 일반 텍스트로 작성
- 숨겨진 유니코드 문자, AI 탐지 회피용 특수 패턴 사용 금지

■ AI 티 나는 문체 패턴 절대 금지
- "또한", "더불어", "아울러", "뿐만 아니라" — 한 글에 각 1회 이하
- "알아보겠습니다", "살펴보겠습니다", "중요합니다", "필요합니다" — 사용 금지
- "결론적으로", "정리하자면", "종합하면", "이처럼" — 사용 금지
- "~습니다. ~입니다. ~됩니다." 3연속 동일 어미 금지
- 단락마다 비슷한 길이의 문장 5개 이상 나열 금지
- "X의 핵심 특징", "X에 대해 자세히", "X를 통해 알 수 있듯이" 형식 금지

■ 반드시 지켜야 할 자연스러운 문체
- 짧은 문장(10-20자)과 긴 문장(40-60자)을 교대로 배치
- 단락의 첫 문장: 결론/사실 직접 명시 (서론식 유도 금지)
- 독자에게 말 거는 표현 가끔 사용: "그거 알아?", "솔직히 말하면", "이건 진짜"
- 구체적 수치·사례·비유 필수 포함 (추상적 표현 최소화)
- 자연스러운 구어체와 문어체 혼용
`.trim();
