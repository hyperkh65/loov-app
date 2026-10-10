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

    const ollamaKey = clientOllamaKey || await getSetting('OLLAMA_API_KEY');
    if (!ollamaKey) {
      return NextResponse.json(
        { error: '무료AI 메뉴에서 Ollama API 키를 먼저 설정해주세요.' },
        { status: 400 }
      );
    }

    const model = clientModel || await getSetting('AI_GLOBAL_MODEL') || 'qwen3.5';
    const systemPrompt = buildSystemPrompt(language, level, mode, situation);

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

    // 스트리밍으로 읽어서 <think>...</think> 제거 후 전체 텍스트 수집
    const res = await fetch('https://ollama.com/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ollamaKey}`,
      },
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!res.ok || !res.body) {
      const err = await res.text();
      throw new Error(`Ollama Cloud 오류 ${res.status}: ${err}`);
    }

    // 스트림에서 thinking 블록 제거하며 텍스트 수집
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let rawText = '';
    let inThink = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const j = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
          const chunk = j.message?.content || '';
          if (!chunk) continue;

          // thinking 블록 필터링
          if (chunk.includes('<think>')) inThink = true;
          if (inThink) {
            if (chunk.includes('</think>')) {
              inThink = false;
              const after = chunk.split('</think>').slice(1).join('</think>');
              rawText += after;
            }
            // thinking 중이면 skip
          } else {
            rawText += chunk;
          }
        } catch { /* skip malformed */ }
      }
    }

    rawText = rawText.trim();

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
