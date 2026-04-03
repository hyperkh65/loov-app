/**
 * WeChat 백업 데이터를 Notion에 저장하는 API
 * POST /api/wechat/backup
 *
 * - 사용자 Notion 설정(토큰)을 공용으로 사용
 * - WeChat DB ID: 3371f4ff9a0e803e913cebe199fde98e (고정)
 * - AI 요약은 Ollama(로컬) → OpenRouter(free) 순서로 시도
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { Client } from '@notionhq/client';
import { getSetting } from '@/lib/settings';

const WECHAT_NOTION_DB = '3371f4ff9a0e803e913cebe199fde98e';

interface WeChatMessage {
  time: number;
  time_str: string;
  is_other: boolean | null;
  sender: string | null;
  msg: string;
}

interface BackupPayload {
  date: string;
  messages: WeChatMessage[];
  summary?: string;
}

async function generateSummaryWithOllama(messages: WeChatMessage[], date: string): Promise<string> {
  const ollamaUrl = await getSetting('OLLAMA_BASE_URL');
  const ollamaKey = await getSetting('OLLAMA_API_KEY');

  const msgText = messages
    .slice(-100)
    .map((m) => {
      const who = m.is_other === false ? '나' : (m.sender || '상대방');
      return `[${m.time_str}] ${who}: ${m.msg}`;
    })
    .join('\n');

  const prompt = `다음은 ${date} 위챗 비즈니스 대화입니다. 한국어로 요약해주세요.

요약 형식:
• 주요 논의 사항 (3-5개)
• 중요 결정사항
• 팔로업 필요 항목
• 해시태그 (예: #조명 #납기 #샘플)

---
${msgText.slice(0, 6000)}
---`;

  // 1. 로컬 Ollama 시도
  if (ollamaUrl) {
    try {
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen3.5',
          messages: [{ role: 'user', content: prompt }],
          stream: false,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) {
        const data = await res.json() as { message?: { content?: string } };
        if (data.message?.content) return data.message.content;
      }
    } catch { /* fallthrough */ }

    // 로컬 서버 fallback 모델들
    for (const model of ['qwen3', 'llama3.3', 'mistral', 'gemma3', 'phi4']) {
      try {
        const res = await fetch(`${ollamaUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false }),
          signal: AbortSignal.timeout(60000),
        });
        if (res.ok) {
          const data = await res.json() as { message?: { content?: string } };
          if (data.message?.content) return data.message.content;
        }
      } catch { continue; }
    }
  }

  // 2. Ollama Cloud API (키가 있는 경우)
  if (ollamaKey) {
    try {
      const res = await fetch('https://ollama.com/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ollamaKey}` },
        body: JSON.stringify({ model: 'qwen3.5', messages: [{ role: 'user', content: prompt }], stream: false }),
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) {
        const data = await res.json() as { message?: { content?: string } };
        if (data.message?.content) return data.message.content;
      }
    } catch { /* fallthrough */ }
  }

  // 3. OpenRouter Free 시도
  const orKey = await getSetting('OPENROUTER_API_KEY');
  if (orKey) {
    for (const model of ['qwen/qwen3-235b-a22b:free', 'meta-llama/llama-3.3-70b-instruct:free', 'deepseek/deepseek-r1:free', 'google/gemma-3-27b-it:free', 'mistralai/mistral-7b-instruct:free']) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orKey}` },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
          signal: AbortSignal.timeout(30000),
        });
        if (res.ok) {
          const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
          const text = data.choices?.[0]?.message?.content;
          if (text) return text;
        }
      } catch { continue; }
    }
  }

  return `(AI 요약 불가 - 메시지 ${messages.length}개)`;
}

async function saveToNotion(apiKey: string, payload: BackupPayload & { summary: string }) {
  const notion = new Client({ auth: apiKey });

  const msgBlocks = payload.messages.slice(0, 80).map((m) => ({
    object: 'block' as const,
    type: 'paragraph' as const,
    paragraph: {
      rich_text: [{
        type: 'text' as const,
        text: {
          content: `[${m.time_str}] ${m.is_other === false ? '나' : (m.sender || '상대방')}: ${m.msg.slice(0, 500)}`,
        },
      }],
    },
  }));

  await notion.pages.create({
    parent: { database_id: WECHAT_NOTION_DB },
    properties: {
      '이름': { title: [{ text: { content: `WeChat 백업 ${payload.date}` } }] },
      '날짜': { date: { start: payload.date } },
      '메시지수': { number: payload.messages.length },
    },
    children: [
      {
        object: 'block', type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: 'AI 요약' } }] },
      },
      {
        object: 'block', type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: payload.summary.slice(0, 2000) } }] },
      },
      {
        object: 'block', type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: '메시지 로그' } }] },
      },
      ...msgBlocks,
    ],
  });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 사용자의 Notion 설정 가져오기
    const { data: settings } = await supabase
      .from('bossai_company_settings')
      .select('notion_config')
      .eq('user_id', user.id)
      .single();

    const notionApiKey = settings?.notion_config?.apiKey;
    if (!notionApiKey) {
      return NextResponse.json({ error: 'Notion API 키가 설정되지 않았습니다.' }, { status: 400 });
    }

    const payload = await req.json() as BackupPayload;

    // AI 요약 생성 (summary 없으면 자동 생성)
    const summary = payload.summary || await generateSummaryWithOllama(payload.messages, payload.date);

    // Notion 저장
    await saveToNotion(notionApiKey, { ...payload, summary });

    return NextResponse.json({ success: true, summary, messageCount: payload.messages.length });
  } catch (e) {
    console.error('wechat/backup:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    notionDbId: WECHAT_NOTION_DB,
    info: 'POST with { date, messages, summary? } to backup WeChat messages to Notion',
  });
}
