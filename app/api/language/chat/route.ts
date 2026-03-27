import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/get-setting';

export const maxDuration = 60;

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  zh: 'Chinese (Mandarin)',
  ja: 'Japanese',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  vi: 'Vietnamese',
  th: 'Thai',
};

const MODE_DESCRIPTIONS: Record<string, string> = {
  conversation: 'free conversation practice',
  grammar: 'grammar correction focus - correct all grammar mistakes',
  reading: 'reading practice - provide passages with vocabulary highlights',
  situation: 'situational conversation practice',
};

function buildSystemPrompt(language: string, level: string, mode: string, situation?: string): string {
  const langName = LANGUAGE_NAMES[language] || language;
  const modeDesc = MODE_DESCRIPTIONS[mode] || mode;

  return `You are a ${langName} language tutor helping a Korean speaker.
Student level: ${level}
Mode: ${modeDesc}${situation ? `\nSituation: ${situation}` : ''}

RULES:
1. Reply in ${langName} (appropriate for the level)
2. Mark vocabulary words using this exact format: [[word|한국어번역|발음기호]]
   Examples:
   - English: [[beautiful|아름다운|bjuːtɪfəl]]
   - Chinese: [[美丽|아름답다|měilì]]
   - Japanese: [[綺麗|아름답다|きれい]]
   - French: [[magnifique|아름다운|maɲifik]]
3. Mark 3-5 key vocabulary words per response using the [[]] format
4. After your ${langName} reply, if the user made grammar errors, add on a new line:
   GRAMMAR:{"original":"...","corrected":"...","explanation":"..."}
   (Write the explanation in Korean)
5. Keep the conversation natural and encouraging
6. For beginner level: use simple sentences, common words, short responses
7. For intermediate level: use varied grammar, more vocabulary, moderate complexity
8. For advanced level: use complex grammar, idioms, native expressions, longer responses
9. If mode is "situation", stay in character for the given situation (e.g., waiter, hotel staff)
10. If mode is "reading", provide a short passage appropriate for the level, then ask comprehension questions
11. Do NOT add any text after the GRAMMAR line`;
}

// Ollama Cloud 네이티브 API 호출 (무료AI 메뉴와 동일한 방식)
async function callOllamaCloud(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const res = await fetch('https://ollama.com/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, stream: false }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama Cloud 오류 ${res.status}: ${err}`);
  }

  const data = await res.json() as { message?: { content?: string }; error?: string };
  if (data.error) throw new Error(data.error);
  return data.message?.content?.trim() || '';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      message: string;
      language: string;
      level: 'beginner' | 'intermediate' | 'advanced';
      mode: 'conversation' | 'grammar' | 'reading' | 'situation';
      situation?: string;
      history?: Array<{ role: 'user' | 'model'; content: string }>;
      clientOllamaKey?: string;
      clientModel?: string;
    };

    const {
      message,
      language = 'en',
      level = 'beginner',
      mode = 'conversation',
      situation,
      history = [],
      clientOllamaKey,
      clientModel,
    } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: '메시지가 없습니다' }, { status: 400 });
    }

    // API 키: 클라이언트 전달 → DB 설정 → env var
    const ollamaKey = clientOllamaKey || await getSetting('OLLAMA_API_KEY');
    if (!ollamaKey) {
      return NextResponse.json(
        { error: 'Ollama API 키가 없습니다. 무료AI 메뉴에서 API 키를 설정해주세요.' },
        { status: 400 }
      );
    }

    const systemPrompt = buildSystemPrompt(language, level, mode, situation);

    // Build history (last 10, convert model→assistant)
    let recentHistory = history.slice(-10);
    while (recentHistory.length > 0 && recentHistory[0].role !== 'user') {
      recentHistory = recentHistory.slice(1);
    }
    if (recentHistory.length % 2 !== 0) recentHistory = recentHistory.slice(1);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory.map((msg) => ({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: msg.content,
      })),
      { role: 'user', content: message },
    ];

    // 클라이언트 선택 모델 → DB 설정 → 기본값(qwen3.5)
    const model = clientModel || await getSetting('AI_GLOBAL_MODEL') || 'qwen3.5';

    const rawText = await callOllamaCloud(ollamaKey, model, messages);

    // Extract GRAMMAR correction
    let reply = rawText;
    let grammar: { original: string; corrected: string; explanation: string } | null = null;

    const grammarMatch = rawText.match(/\nGRAMMAR:(\{[\s\S]*?\})\s*$/);
    if (grammarMatch) {
      try {
        grammar = JSON.parse(grammarMatch[1]);
        reply = rawText.slice(0, grammarMatch.index).trim();
      } catch {
        grammar = null;
      }
    }

    return NextResponse.json({ reply, grammar });
  } catch (error) {
    console.error('Language chat error:', error);
    return NextResponse.json(
      { error: `오류가 발생했습니다: ${String(error)}` },
      { status: 500 }
    );
  }
}
