import { NextRequest, NextResponse } from 'next/server';
import { callAISimple } from '@/lib/ai-call';
import type { PatternScript, VariationLevel } from '@/lib/shorts/pattern-types';
import { CLIP_COUNT } from '@/lib/shorts/pattern-types';

export const maxDuration = 60;

const SYSTEM_PROMPT = `너는 영어 표현 학습 Shorts 채널의 스크립트 기획자다.
채널 포맷: 하나의 핵심 영어 표현(target expression)을 여러 화자가 서로 다른 상황/문장으로
말하는 clip들을 이어붙여, 시청자가 설명 없이 반복 노출로 표현을 익히게 한다.
설명형(뜻→문법→예문) 강의 포맷이 아니다.

반드시 JSON 객체 하나만 출력한다(마크다운 코드블록, 설명 텍스트 금지).
스키마:
{
  "coreMeaning": "표현의 핵심 의미를 한국어 한 문장으로",
  "targetChunk": "문장 안에서 반복 강조할 핵심 chunk (target expression과 같거나 그 핵심 부분)",
  "microGrammarPattern": "예: \\"couldn't help + V-ing\\" 같은 패턴 표기 + 한국어 짧은 뜻",
  "koreanRecallPrompt": "마지막 recall 장면에 쓸 한국어 상황 문장 (예: '웃음을 참을 수가 없었어.')",
  "contextSuggestions": ["office", "cafe", "street", "home" 등 3~5개 상황 라벨],
  "variations": [
    { "sentence": "실제 화자가 말할 법한 완전한 영어 문장 (targetChunk를 반드시 포함)", "level": 0, "context": "상황 라벨" },
    ...
  ]
}

variations 규칙:
- level 0: target expression과 거의 동일한 문장
- level 1: 짧은 modifier만 추가 (just, seriously, honestly 등)
- level 2: 같은 문법 패턴 + 앞뒤 상황 문맥 추가
- level 3: 의미는 같지만 표현이 살짝 다른 natural alternative (최대 1개만 만들 것)
- 각 variation의 sentence는 targetChunk 문자열을 반드시 포함해야 한다 (level 3은 예외 가능)
- 문장 길이를 억지로 통일하지 않는다
- 최소 5개, 최대 6개의 variation을 만든다 (실제 렌더에는 일부만 선택될 수 있음)`;

interface RawVariation { sentence?: string; level?: number; context?: string }
interface RawScript {
  coreMeaning?: string;
  targetChunk?: string;
  microGrammarPattern?: string;
  koreanRecallPrompt?: string;
  contextSuggestions?: string[];
  variations?: RawVariation[];
}

function stripCodeFence(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : text).trim();
}

function clampLevel(n: unknown): VariationLevel {
  const v = Math.round(Number(n));
  return (v >= 0 && v <= 3 ? v : 0) as VariationLevel;
}

export async function POST(req: NextRequest) {
  const { targetExpression, provider } = await req.json() as { targetExpression?: string; provider?: string };
  const expression = targetExpression?.trim();
  if (!expression) {
    return NextResponse.json({ error: 'targetExpression이 필요합니다' }, { status: 400 });
  }

  let raw: RawScript;
  try {
    const text = await callAISimple(
      `Target expression: "${expression}"\n\n위 표현으로 위 스키마의 JSON을 만들어줘.`,
      SYSTEM_PROMPT,
      provider,
    );
    raw = JSON.parse(stripCodeFence(text)) as RawScript;
  } catch (e) {
    return NextResponse.json(
      { error: 'AI 분석 실패: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 502 },
    );
  }

  if (!raw.targetChunk || !Array.isArray(raw.variations) || raw.variations.length === 0) {
    return NextResponse.json({ error: 'AI 응답이 예상 형식과 다릅니다 (targetChunk/variations 누락)' }, { status: 502 });
  }

  const script: PatternScript = {
    targetExpression: expression,
    coreMeaning: raw.coreMeaning?.trim() || '',
    targetChunk: raw.targetChunk.trim(),
    microGrammarPattern: raw.microGrammarPattern?.trim() || '',
    koreanRecallPrompt: raw.koreanRecallPrompt?.trim() || '',
    contextSuggestions: (raw.contextSuggestions || []).filter(Boolean).slice(0, 5),
    variations: raw.variations
      .filter((v): v is RawVariation & { sentence: string } => !!v.sentence?.trim())
      .slice(0, CLIP_COUNT.max + 2)
      .map(v => ({
        sentence: v.sentence.trim(),
        level: clampLevel(v.level),
        context: v.context?.trim() || '',
      })),
  };

  return NextResponse.json({ script });
}
