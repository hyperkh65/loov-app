/**
 * "패턴 반복" 영어 쇼츠 포맷 — 같은 핵심 표현을 여러 화자/상황/변형으로
 * 반복 노출시켜 시청자가 감각적으로 익히게 하는 포맷의 공용 타입/상수.
 * (tradeos English Shorts의 렌더 파이프라인을 참고해 loov용으로 재구성)
 */

export const CLIP_COUNT = { min: 3, default: 4, max: 6 } as const;
export const CLIP_DURATION_SEC = { min: 1.5, max: 4.0, default: 3.0 } as const;
export const MAX_LEVEL3_CLIPS = 1;

export const PATTERN_COLORS = {
  primary: '#F7F7F5',
  accent: '#D8FF3E',
  secondary: '#C8CAC6',
  korean: '#D5D6D3',
  bg: '#0B0B0A',
} as const;

export type VariationLevel = 0 | 1 | 2 | 3;

export interface PatternVariation {
  sentence: string;
  level: VariationLevel;
  context: string; // 예: "office", "cafe" — Person 카드 배경/상황 라벨
}

export interface PatternScript {
  targetExpression: string;
  coreMeaning: string;
  targetChunk: string;
  microGrammarPattern: string;
  koreanRecallPrompt: string;
  contextSuggestions: string[];
  variations: PatternVariation[];
}

export type TextPosition = 'upper' | 'lower';

export interface PatternClip {
  id: string;
  videoUrl: string;
  sentence: string;
  targetChunk: string;
  variationLevel: VariationLevel;
  contextLabel: string;
  startAt: number;
  duration: number;
  textPosition: TextPosition;
}

/** 렌더 전 마지막 방어선 — 포맷 규칙(#9, #33, #7)을 어긴 조합을 서버가 거부한다. */
export function validatePatternClips(clips: PatternClip[]): string | null {
  if (clips.length < CLIP_COUNT.min) return `클립은 최소 ${CLIP_COUNT.min}개 필요합니다 (현재 ${clips.length}개)`;
  if (clips.length > CLIP_COUNT.max) return `클립은 최대 ${CLIP_COUNT.max}개까지입니다 (현재 ${clips.length}개)`;

  const level3Count = clips.filter(c => c.variationLevel === 3).length;
  if (level3Count > MAX_LEVEL3_CLIPS) {
    return `Level 3(자연스러운 변형)은 최대 ${MAX_LEVEL3_CLIPS}개까지만 허용됩니다 (현재 ${level3Count}개)`;
  }

  for (const c of clips) {
    if (!c.sentence.trim()) return '모든 클립에 문장을 입력해야 합니다';
    if (!c.targetChunk.trim()) return '모든 클립에 타겟 청크를 입력해야 합니다';
    if (!c.sentence.toLowerCase().includes(c.targetChunk.toLowerCase())) {
      return `"${c.sentence}" 문장에 타겟 청크 "${c.targetChunk}"가 포함되어 있지 않습니다`;
    }
    if (c.duration < CLIP_DURATION_SEC.min || c.duration > CLIP_DURATION_SEC.max) {
      return `클립 길이는 ${CLIP_DURATION_SEC.min}~${CLIP_DURATION_SEC.max}초 사이여야 합니다 ("${c.sentence}")`;
    }
  }
  return null;
}
