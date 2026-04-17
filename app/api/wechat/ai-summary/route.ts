/**
 * WeChat 대화방 AI 요약
 * POST /api/wechat/ai-summary  { room, messages: [{time,sender,content}] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/get-setting';

interface MsgInput { time: string; sender: string; content: string; }

async function callAI(prompt: string): Promise<string> {
  // 1. Ollama Cloud (우선)
  const ollamaKey = await getSetting('OLLAMA_API_KEY');
  if (ollamaKey) {
    for (const model of ['qwen3.5', 'qwen3', 'llama3.3', 'mistral', 'gemma3', 'deepseek-r1']) {
      try {
        const res = await fetch('https://ollama.com/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ollamaKey}` },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false }),
          signal: AbortSignal.timeout(60000),
        });
        if (res.ok) {
          const d = await res.json() as { message?: { content?: string } };
          const text = d.message?.content;
          if (text) return text;
        }
      } catch { continue; }
    }
  }

  // 2. OpenRouter (fallback)
  const orKey = await getSetting('OPENROUTER_API_KEY');
  if (orKey) {
    for (const model of [
      'qwen/qwen3-235b-a22b:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'google/gemini-2.0-flash-001',
      'openai/gpt-4o-mini',
    ]) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orKey}` },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 600 }),
          signal: AbortSignal.timeout(30000),
        });
        if (res.ok) {
          const d = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
          const text = d.choices?.[0]?.message?.content;
          if (text) return text;
        }
      } catch { continue; }
    }
  }

  // 3. Ollama 로컬 (fallback)
  const ollamaUrl = await getSetting('OLLAMA_BASE_URL');
  if (ollamaUrl) {
    try {
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'qwen3', messages: [{ role: 'user', content: prompt }], stream: false }),
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) {
        const d = await res.json() as { message?: { content?: string } };
        if (d.message?.content) return d.message.content;
      }
    } catch { /* fallthrough */ }
  }

  return '(AI 요약 불가 — LOOV 설정에서 Ollama Cloud 또는 OpenRouter API 키를 확인하세요)';
}

export async function POST(req: NextRequest) {
  try {
    const { room, messages } = await req.json() as { room: string; messages: MsgInput[] };
    if (!messages?.length) return NextResponse.json({ summary: '메시지 없음' });

    // 최근 150개 메시지만 사용
    const recent = messages.slice(-150);
    const msgText = recent.map(m => `[${m.time.slice(5)}] ${m.sender}: ${m.content.slice(0, 200)}`).join('\n');
    const senders = [...new Set(recent.map(m => m.sender).filter(s => s !== '나'))];

    const prompt = `다음은 WeChat 비즈니스 채팅 "${room}"의 최근 대화입니다. (참여자: ${senders.slice(0, 5).join(', ')})

한국어로 간결하게 요약해주세요:
• 주요 논의 주제 (2-3개)
• 중요 결정/합의 사항
• 팔로업 필요 항목
• 핵심 키워드 해시태그

---
${msgText.slice(0, 5000)}
---

3-5줄로 핵심만 요약:`;

    const summary = await callAI(prompt);
    return NextResponse.json({ summary });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
