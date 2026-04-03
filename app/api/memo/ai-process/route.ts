/**
 * POST /api/memo/ai-process
 * 메모 내용을 AI로 분석 → 태그, 카테고리, 요약 자동 생성
 * 기존 free-ai API 키(Ollama/OpenRouter) 공용 사용
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const CATEGORIES = ['업무', '아이디어', '학습', '개인', '프로젝트', '회의', '일정', '기타'];

async function callAI(prompt: string): Promise<string> {
  // 1. Ollama Cloud
  const ollamaKey = process.env.OLLAMA_API_KEY || process.env.OLLAMA_KEY || '';
  if (ollamaKey) {
    try {
      const res = await fetch('https://ollama.com/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ollamaKey}` },
        body: JSON.stringify({ model: 'qwen3', messages: [{ role: 'user', content: prompt }], stream: false }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const d = await res.json() as { message?: { content?: string } };
        const text = d.message?.content?.trim();
        if (text && text.length > 5) return text;
      }
    } catch {}
  }

  // 2. OpenRouter 무료 폴백
  const orKey = process.env.OPENROUTER_API_KEY || '';
  if (orKey) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${orKey}`,
          'HTTP-Referer': 'https://loov.co.kr',
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.3-70b-instruct:free',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 300,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const d = await res.json() as { choices?: { message?: { content?: string } }[] };
        const text = d.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      }
    } catch {}
  }

  // 3. Gemini 폴백
  const geminiKey = process.env.GEMINI_API_KEY || '';
  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: AbortSignal.timeout(15000),
        }
      );
      if (res.ok) {
        const d = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
      }
    } catch {}
  }

  return '';
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { content, title = '' } = await req.json() as { content: string; title?: string };
  if (!content?.trim()) return NextResponse.json({ error: '내용 필요' }, { status: 400 });

  const prompt = `다음 메모를 분석해서 JSON으로 답하세요. 다른 설명 없이 JSON만 출력하세요.

메모 제목: ${title || '(없음)'}
메모 내용:
${content.slice(0, 1500)}

출력 형식 (JSON만):
{
  "summary": "1~2문장 핵심 요약",
  "tags": ["태그1", "태그2", "태그3"],
  "category": "${CATEGORIES.join('|')}"
}

규칙:
- tags는 3~5개, 한국어 키워드
- category는 위 목록 중 하나만 선택
- summary는 50자 이내`;

  const aiText = await callAI(prompt);

  // JSON 파싱
  let summary = '';
  let tags: string[] = [];
  let category = '기타';

  try {
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { summary?: string; tags?: string[]; category?: string };
      summary = parsed.summary || '';
      tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [];
      category = CATEGORIES.includes(parsed.category || '') ? (parsed.category || '기타') : '기타';
    }
  } catch {}

  // AI 실패시 간단한 fallback
  if (!summary && !tags.length) {
    const words = content.replace(/[^\w가-힣\s]/g, ' ').split(/\s+/).filter(w => w.length > 1);
    tags = [...new Set(words)].slice(0, 3);
    summary = content.slice(0, 60) + (content.length > 60 ? '...' : '');
  }

  return NextResponse.json({ summary, tags, category });
}
