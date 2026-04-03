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
import { getSetting } from '@/lib/get-setting';

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

type MsgBlock = {
  object: 'block';
  type: 'paragraph';
  paragraph: { rich_text: [{ type: 'text'; text: { content: string } }] };
};

function makeMsgBlock(m: WeChatMessage): MsgBlock {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{
        type: 'text',
        text: {
          content: `[${m.time_str}] ${m.is_other === false ? '나' : (m.sender || '상대방')}: ${m.msg.slice(0, 1900)}`,
        },
      }],
    },
  };
}

async function saveToNotion(apiKey: string, payload: BackupPayload & { summary: string }) {
  const notion = new Client({ auth: apiKey });

  // DB 프로퍼티 구조 조회해서 title 컬럼명 파악
  const db = await notion.databases.retrieve({ database_id: WECHAT_NOTION_DB });
  const titlePropName = Object.entries(db.properties).find(([, v]) => v.type === 'title')?.[0] ?? 'Name';
  const hasDate = '날짜' in db.properties || 'Date' in db.properties;
  const datePropName = '날짜' in db.properties ? '날짜' : 'Date';
  const hasCount = '메시지수' in db.properties;

  type NotionProps = Parameters<typeof notion.pages.create>[0]['properties'];
  const props: NotionProps = {
    [titlePropName]: { title: [{ text: { content: `WeChat 백업 ${payload.date} (${payload.messages.length}개)` } }] },
  };
  if (hasDate) (props as Record<string, unknown>)[datePropName] = { date: { start: payload.date } };
  if (hasCount) (props as Record<string, unknown>)['메시지수'] = { number: payload.messages.length };

  // 첫 번째 호출: 고정 헤더 3개 + 메시지 최대 97개 (합계 100)
  const firstBatch = payload.messages.slice(0, 97).map(makeMsgBlock);
  const page = await notion.pages.create({
    parent: { database_id: WECHAT_NOTION_DB },
    properties: props,
    children: [
      { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: 'AI 요약' } }] } },
      { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: payload.summary.slice(0, 2000) } }] } },
      { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: '메시지 로그' } }] } },
      ...firstBatch,
    ],
  });

  // 나머지 메시지를 100개씩 append
  const remaining = payload.messages.slice(97);
  for (let i = 0; i < remaining.length; i += 100) {
    const batch = remaining.slice(i, i + 100).map(makeMsgBlock);
    await notion.blocks.children.append({ block_id: page.id, children: batch });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { createAdminClient } = await import('@/lib/supabase-server');
    const admin = createAdminClient();

    // X-Summary-Only: 요약만 반환, Notion 저장 안 함
    const summaryOnly = req.headers.get('x-summary-only') === 'true';

    // X-WeChat-Key 인증 (만료 없는 전용 키)
    const wcKey = req.headers.get('x-wechat-key');
    if (wcKey?.startsWith('wc_')) {
      const { data: row } = await admin
        .from('bossai_company_settings')
        .select('user_id, notion_config')
        .eq('wechat_api_key', wcKey)
        .single();
      if (!row) return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
      const payload = await req.json() as BackupPayload;
      const summary = payload.summary || await generateSummaryWithOllama(payload.messages, payload.date);
      if (summaryOnly) {
        return NextResponse.json({ summary, messageCount: payload.messages.length });
      }
      const notionApiKey = row.notion_config?.apiKey;
      if (!notionApiKey) return NextResponse.json({ error: 'Notion API 키가 설정되지 않았습니다.' }, { status: 400 });
      await saveToNotion(notionApiKey, { ...payload, summary });
      return NextResponse.json({ success: true, summary, messageCount: payload.messages.length });
    }

    // Bearer 토큰 인증 (레거시 - 1시간 만료)
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { data: { user: tokenUser }, error } = await supabase.auth.getUser(token);
      if (error || !tokenUser) return NextResponse.json({ error: 'Token expired. Please regenerate API key in loov settings.' }, { status: 401 });
      const payload = await req.json() as BackupPayload;
      const summary = payload.summary || await generateSummaryWithOllama(payload.messages, payload.date);
      if (summaryOnly) {
        return NextResponse.json({ summary, messageCount: payload.messages.length });
      }
      const { data: settings } = await supabase
        .from('bossai_company_settings')
        .select('notion_config')
        .eq('user_id', tokenUser.id)
        .single();
      const notionApiKey = settings?.notion_config?.apiKey;
      if (!notionApiKey) return NextResponse.json({ error: 'Notion API 키가 설정되지 않았습니다.' }, { status: 400 });
      await saveToNotion(notionApiKey, { ...payload, summary });
      return NextResponse.json({ success: true, summary, messageCount: payload.messages.length });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json() as BackupPayload;
    const summary = payload.summary || await generateSummaryWithOllama(payload.messages, payload.date);
    if (summaryOnly) {
      return NextResponse.json({ summary, messageCount: payload.messages.length });
    }

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
