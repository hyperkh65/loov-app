import { NextRequest, NextResponse } from 'next/server';
import {
  sendMessage,
  sendTyping,
  editMessage,
  answerCallback,
  sendInlineKeyboard,
  isAllowedUser,
  type TgUpdate,
  type TgMessage,
  type TgCallbackQuery,
} from '@/lib/telegram';
import { callAISimple } from '@/lib/ai-call';

export const maxDuration = 60;

// ─── Internal fetch helper ───────────────────────────────────────────────────

function internalFetch(
  path: string,
  options: RequestInit & { searchParams?: Record<string, string> } = {}
): Promise<Response> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const { searchParams, ...rest } = options;
  const url = new URL(`${appUrl}${path}`);
  if (searchParams) {
    Object.entries(searchParams).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  return fetch(url.toString(), {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': secret,
      ...(rest.headers ?? {}),
    },
  });
}

// ─── Response formatting ─────────────────────────────────────────────────────

function truncate(text: string, max = 4000): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 10) + '\n…(생략)';
}

// ─── Gemini AI Router ────────────────────────────────────────────────────────

interface RouterResult {
  action:
    | 'keyword_analyze'
    | 'blog_generate'
    | 'chat'
    | 'sme_search'
    | 'schedule'
    | 'insights'
    | 'shorts'
    | 'naver_publish'
    | 'sns_post'
    | 'coupang_search'
    | 'unknown';
  params: Record<string, string>;
  direct_reply?: string;
}

const ROUTER_SYSTEM_PROMPT = `당신은 LOOV(루브) 1인 기업가 AI 비서의 메시지 라우터입니다.
사용자의 한국어 메시지를 분석하여 어떤 LOOV 기능을 호출해야 하는지 JSON으로만 반환합니다.

[LOOV 기능 목록]
1. keyword_analyze - 키워드 분석/검색량/경쟁도 조사 (params: keyword)
   예: "강남 맛집 키워드 분석해줘", "AI 스타트업 검색량 알려줘"

2. blog_generate - 블로그 글 자동 생성/작성 (params: topic)
   예: "블로그 글 써줘", "워드프레스 포스트 만들어줘", "콘텐츠 생성"

3. chat - 일반 AI 대화/질문 답변 (params: message)
   예: 위 카테고리에 해당하지 않는 일반 질문/대화

4. sme_search - 중소기업 지원사업/정부 지원금 검색 (params: keyword)
   예: "창업 지원금", "정부 지원사업 검색", "소상공인 지원 프로그램"

5. schedule - 오늘 일정/스케줄 조회 (params: date - YYYY-MM-DD, 오늘이면 today)
   예: "오늘 일정", "스케줄 알려줘", "내 캘린더"

6. insights - 비즈니스 인사이트/트렌드 조회 (params: category)
   예: "인사이트 보여줘", "비즈니스 트렌드", "AI 동향"

7. shorts - 유튜브 쇼츠/숏폼 스크립트 생성 (params: topic)
   예: "쇼츠 스크립트", "숏폼 영상 대본", "틱톡 콘텐츠"

8. naver_publish - 네이버 블로그 포스팅 (params: title, content)
   예: "네이버 블로그에 올려줘", "네이버 포스팅"

9. sns_post - SNS(인스타그램/X/스레드) 게시물 발행 (params: platform, content)
   예: "인스타에 올려줘", "X에 포스팅해줘", "SNS에 공유"

10. coupang_search - 쿠팡 상품 검색 (params: keyword)
    예: "쿠팡에서 찾아줘", "상품 검색", "최저가 알려줘"

11. unknown - 위 카테고리에 명확히 해당하지 않거나, 간단한 인사/감사 등
    direct_reply 필드에 직접 답변 텍스트를 넣어주세요.

[출력 형식 - 반드시 이 JSON만 출력]
{
  "action": "위 액션 중 하나",
  "params": { "key": "value" },
  "direct_reply": "action이 unknown일 때만 사용"
}`;

async function routeWithAI(userMessage: string): Promise<RouterResult> {
  try {
    const text = await callAISimple(userMessage, ROUTER_SYSTEM_PROMPT);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { action: 'chat', params: { message: userMessage } };
    return JSON.parse(jsonMatch[0]) as RouterResult;
  } catch {
    return { action: 'chat', params: { message: userMessage } };
  }
}

// ─── Command handlers ────────────────────────────────────────────────────────

async function handleStart(chatId: number, from: { first_name: string }) {
  const text = `안녕하세요, <b>${from.first_name}</b>님! 👋

🤖 <b>LOOV AI 비서</b>에 오신 걸 환영합니다.

저는 자연어로 말씀하시면 알아서 처리해드립니다.
아래 명령어를 사용하거나, 그냥 말씀하셔도 됩니다!

<b>📌 주요 명령어</b>
/help - 전체 명령어 목록
/chat - AI 대화
/keyword - 키워드 분석
/blog - 블로그 글 생성
/naver - 네이버 블로그 포스팅
/insights - 비즈니스 인사이트
/sme - 중소기업 지원사업 검색
/schedule - 오늘 일정
/shorts - 유튜브 쇼츠 스크립트
/publish - SNS 포스팅
/status - SNS 연결 상태
/coupang - 쿠팡 상품 검색`;

  return sendInlineKeyboard(chatId, text, [
    [
      { text: '💡 인사이트', callback_data: 'cmd:insights' },
      { text: '📅 오늘 일정', callback_data: 'cmd:schedule' },
    ],
    [
      { text: '🔍 키워드 분석', callback_data: 'cmd:keyword_help' },
      { text: '✍️ 블로그 글', callback_data: 'cmd:blog_help' },
    ],
  ]);
}

async function handleHelp(chatId: number) {
  const text = `<b>📖 LOOV Bot 전체 명령어</b>

<b>🤖 AI 대화</b>
/chat [질문] - AI와 대화하기

<b>📝 콘텐츠 생성</b>
/blog [주제] - 블로그 글 자동 생성
/naver [주제] - 네이버 블로그 포스팅
/shorts [주제] - 유튜브 쇼츠 스크립트

<b>🔍 리서치</b>
/keyword [키워드] - 키워드 검색량/경쟁도 분석
/coupang [키워드] - 쿠팡 상품 검색
/sme [검색어] - 중소기업 지원사업 검색

<b>📊 인사이트/보고서</b>
/insights - 오늘의 비즈니스 인사이트
/report - 일일 ERP 보고서

<b>📅 일정</b>
/schedule - 오늘 일정 조회

<b>📣 SNS</b>
/publish [플랫폼] [내용] - SNS 즉시 게시
/status - SNS 연결 현황

<b>💬 자연어 사용 예시</b>
• "AI 스타트업 키워드 분석해줘"
• "창업 관련 정부 지원금 찾아줘"
• "오늘 일정 알려줘"
• "유튜브 쇼츠 스크립트 만들어줘"`;

  return sendMessage(chatId, text);
}

async function handleChat(chatId: number, userMessage: string) {
  try {
    const reply = await callAISimple(
      userMessage,
      'LOOV 1인 기업가 AI 비서입니다. 한국어로 친절하고 간결하게 답변해주세요.',
    );
    return sendMessage(chatId, truncate(reply));
  } catch {
    return sendMessage(chatId, '❌ AI API 키가 설정되지 않았습니다. LOOV 대시보드에서 설정해주세요.');
  }
}

async function handleKeyword(chatId: number, keyword: string) {
  const res = await internalFetch('/api/keyword/analyze', {
    method: 'POST',
    body: JSON.stringify({ keywords: [keyword], mode: 'golden' }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    return sendMessage(chatId, `❌ 키워드 분석 오류: ${err.error ?? res.statusText}`);
  }

  const data = await res.json() as { results?: Array<{ keyword: string; monthlyTotal: number; score: number; grade: string; blogCompetition: number }> };
  const results = data.results?.slice(0, 8) ?? [];

  if (!results.length) {
    return sendMessage(chatId, `⚠️ <b>${keyword}</b> 관련 키워드 데이터가 없습니다.`);
  }

  const gradeEmoji: Record<string, string> = {
    diamond: '💎', gold: '🥇', silver: '🥈', bronze: '🥉', normal: '⚪',
  };

  const lines = results.map((r) => {
    const emoji = gradeEmoji[r.grade] ?? '⚪';
    return `${emoji} <b>${r.keyword}</b>\n   월 검색 ${r.monthlyTotal.toLocaleString()}회 | 블로그 경쟁 ${r.blogCompetition.toLocaleString()} | 점수 ${r.score}`;
  });

  const text = `🔍 <b>"${keyword}" 키워드 분석 결과</b>\n\n${lines.join('\n\n')}`;
  return sendMessage(chatId, truncate(text));
}

async function handleBlog(chatId: number, topic: string) {
  // Try auto-service generate first
  const res = await internalFetch('/api/auto-service/generate', {
    method: 'POST',
    body: JSON.stringify({ topic, type: 'blog' }),
  });

  if (res.ok) {
    const data = await res.json() as { title?: string; content?: string; error?: string };
    if (data.title && data.content) {
      const preview = data.content.replace(/<[^>]+>/g, '').slice(0, 500);
      return sendMessage(chatId, `✍️ <b>${data.title}</b>\n\n${truncate(preview, 500)}\n\n<i>블로그 글 생성 완료</i>`);
    }
  }

  // Fallback: use global AI
  try {
    const text = await callAISimple(`다음 주제로 SEO 최적화된 블로그 글을 작성해주세요. 제목과 본문을 포함하세요.\n주제: ${topic}`);
    return sendMessage(chatId, `✍️ <b>블로그 글: ${topic}</b>\n\n${truncate(text, 3500)}`);
  } catch {
    return sendMessage(chatId, '❌ AI API 키가 설정되지 않았습니다.');
  }
}

async function handleInsights(chatId: number) {
  const res = await internalFetch('/api/insights', { method: 'GET', searchParams: { limit: '5' } });

  if (!res.ok) {
    return sendMessage(chatId, '❌ 인사이트를 불러오는 데 실패했습니다.');
  }

  const data = await res.json() as { insights?: Array<{ title: string; summary: string; category: string }> };
  const insights = data.insights ?? [];

  if (!insights.length) {
    return sendMessage(chatId, '📭 저장된 인사이트가 없습니다. LOOV 대시보드에서 인사이트를 먼저 생성해주세요.');
  }

  const categoryEmoji: Record<string, string> = {
    '트렌드': '📈', '전략': '🎯', '마케팅': '📣', '재무': '💰', '도구': '🔧', '사례': '📚',
  };

  const lines = insights.map((ins, i) => {
    const emoji = categoryEmoji[ins.category] ?? '💡';
    return `${emoji} <b>${i + 1}. ${ins.title}</b>\n<i>${ins.category}</i>\n${ins.summary}`;
  });

  return sendMessage(chatId, `💡 <b>오늘의 비즈니스 인사이트</b>\n\n${lines.join('\n\n')}`);
}

async function handleSme(chatId: number, keyword?: string) {
  const params: Record<string, string> = { perPage: '5', status: '신청가능' };
  if (keyword) params.keyword = keyword;

  const res = await internalFetch('/api/sme/programs', { method: 'GET', searchParams: params });

  if (!res.ok) {
    return sendMessage(chatId, '❌ 지원사업 정보를 불러오는 데 실패했습니다.');
  }

  const data = await res.json() as { programs?: Array<{ title: string; agency: string; field: string; endDate?: string; url?: string }>; totalCount?: number };
  const programs = data.programs ?? [];

  if (!programs.length) {
    const msg = keyword
      ? `⚠️ "<b>${keyword}</b>" 관련 신청 가능한 지원사업이 없습니다.`
      : '📭 현재 신청 가능한 지원사업이 없습니다.';
    return sendMessage(chatId, msg);
  }

  const lines = programs.map((p, i) => {
    const deadline = p.endDate ? ` | 마감: ${p.endDate}` : '';
    const link = p.url ? `\n   <a href="${p.url}">상세 보기</a>` : '';
    return `📋 <b>${i + 1}. ${p.title}</b>\n   ${p.agency} | ${p.field}${deadline}${link}`;
  });

  const header = keyword
    ? `🏢 <b>"${keyword}" 중소기업 지원사업 (${data.totalCount ?? programs.length}건)</b>`
    : `🏢 <b>신청 가능 지원사업 (${data.totalCount ?? programs.length}건)</b>`;

  return sendMessage(chatId, truncate(`${header}\n\n${lines.join('\n\n')}`));
}

async function handleSchedule(chatId: number) {
  const today = new Date().toISOString().split('T')[0];
  const res = await internalFetch('/api/schedule/events', {
    method: 'GET',
    searchParams: { date: today },
  });

  if (!res.ok) {
    return sendMessage(chatId, '❌ 일정을 불러오는 데 실패했습니다. 로그인이 필요할 수 있습니다.');
  }

  const data = await res.json() as { events?: Array<{ title: string; time?: string; endTime?: string; type?: string; description?: string }> };
  const events = data.events ?? [];

  if (!events.length) {
    return sendMessage(chatId, `📅 <b>${today} 일정</b>\n\n오늘은 예정된 일정이 없습니다. 😊`);
  }

  const typeEmoji: Record<string, string> = {
    meeting: '🤝', task: '✅', call: '📞', deadline: '⏰', other: '📌',
  };

  const lines = events.map((e) => {
    const emoji = typeEmoji[e.type ?? 'other'] ?? '📌';
    const time = e.time ? ` ${e.time}${e.endTime ? `~${e.endTime}` : ''}` : '';
    const desc = e.description ? `\n   <i>${e.description}</i>` : '';
    return `${emoji}${time} <b>${e.title}</b>${desc}`;
  });

  return sendMessage(chatId, `📅 <b>${today} 일정 (${events.length}건)</b>\n\n${lines.join('\n')}`);
}

async function handleShorts(chatId: number, topic: string) {
  const res = await internalFetch('/api/shorts/generate', {
    method: 'POST',
    body: JSON.stringify({
      topic,
      duration: 60,
      tone: 'info',
      platform: 'youtube',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    return sendMessage(chatId, `❌ 쇼츠 스크립트 생성 오류: ${err.error ?? res.statusText}`);
  }

  const data = await res.json() as {
    title?: string;
    hook?: string;
    scenes?: Array<{ id: number; duration: number; narration: string; subtitle: string }>;
    error?: string;
  };

  if (data.error) {
    return sendMessage(chatId, `❌ ${data.error}`);
  }

  const scenes = (data.scenes ?? []).slice(0, 5);
  const scenesText = scenes.map((s) =>
    `<b>[장면 ${s.id} / ${s.duration}초]</b> ${s.subtitle}\n${s.narration.slice(0, 120)}${s.narration.length > 120 ? '…' : ''}`
  ).join('\n\n');

  const text = `🎬 <b>${data.title ?? topic} (쇼츠 스크립트)</b>

🔥 훅: <i>${data.hook ?? ''}</i>

${scenesText}

<i>전체 스크립트는 LOOV 대시보드에서 확인하세요.</i>`;

  return sendMessage(chatId, truncate(text));
}

async function handlePublish(chatId: number, platform: string, content: string) {
  const platformMap: Record<string, string> = {
    '인스타': 'instagram', '인스타그램': 'instagram',
    'x': 'twitter', '트위터': 'twitter', 'twitter': 'twitter',
    '스레드': 'threads', 'threads': 'threads',
    '페이스북': 'facebook', 'facebook': 'facebook',
  };

  const resolvedPlatform = platformMap[platform.toLowerCase()] ?? platform.toLowerCase();

  const res = await internalFetch('/api/sns/post-now', {
    method: 'POST',
    body: JSON.stringify({ content, platforms: [resolvedPlatform] }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    return sendMessage(chatId, `❌ SNS 포스팅 오류: ${err.error ?? res.statusText}`);
  }

  const data = await res.json() as { results?: Array<{ platform: string; success: boolean; error?: string }> };
  const results = data.results ?? [];
  const success = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  let msg = '';
  if (success.length) msg += `✅ 포스팅 성공: ${success.map((r) => r.platform).join(', ')}\n`;
  if (failed.length) msg += `❌ 포스팅 실패: ${failed.map((r) => `${r.platform}(${r.error})`).join(', ')}`;

  return sendMessage(chatId, msg || '⚠️ 처리 결과가 없습니다.');
}

async function handleStatus(chatId: number) {
  const res = await internalFetch('/api/sns/connections', { method: 'GET' });

  if (!res.ok) {
    return sendMessage(chatId, '❌ SNS 연결 상태를 불러오는 데 실패했습니다.');
  }

  const connections = await res.json() as Array<{ platform: string; platform_username?: string; platform_display_name?: string; is_active: boolean }>;

  if (!connections.length) {
    return sendMessage(chatId, '📱 연결된 SNS 계정이 없습니다.\n\nLOOV 대시보드 > SNS 관리에서 계정을 연결하세요.');
  }

  const platformEmoji: Record<string, string> = {
    instagram: '📸', twitter: '🐦', threads: '🧵', facebook: '👍', youtube: '▶️',
  };

  const lines = connections.map((c) => {
    const emoji = platformEmoji[c.platform] ?? '📱';
    const status = c.is_active ? '✅ 연결됨' : '❌ 연결 해제';
    const name = c.platform_display_name ?? c.platform_username ?? '';
    return `${emoji} <b>${c.platform}</b>${name ? ` (${name})` : ''} — ${status}`;
  });

  return sendMessage(chatId, `📱 <b>SNS 연결 현황</b>\n\n${lines.join('\n')}`);
}

async function handleCoupang(chatId: number, keyword: string) {
  const res = await internalFetch('/api/coupang/search', {
    method: 'GET',
    searchParams: { keyword },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    return sendMessage(chatId, `❌ 쿠팡 검색 오류: ${err.error ?? res.statusText}`);
  }

  const data = await res.json() as {
    products?: Array<{ productName?: string; productPrice?: number; productImage?: string; productUrl?: string }>;
    error?: string;
  };

  if (data.error) {
    return sendMessage(chatId, `❌ ${data.error}`);
  }

  const products = (data.products ?? []).slice(0, 5);

  if (!products.length) {
    return sendMessage(chatId, `⚠️ "<b>${keyword}</b>" 검색 결과가 없습니다.`);
  }

  const lines = products.map((p, i) => {
    const price = p.productPrice ? `${p.productPrice.toLocaleString()}원` : '가격 정보 없음';
    const link = p.productUrl ? ` <a href="${p.productUrl}">보기</a>` : '';
    return `🛒 <b>${i + 1}. ${p.productName ?? '상품명 없음'}</b>\n   💰 ${price}${link}`;
  });

  return sendMessage(chatId, `🛒 <b>"${keyword}" 쿠팡 검색 결과</b>\n\n${lines.join('\n\n')}`);
}

async function handleNaver(chatId: number, topic: string) {
  try {
    const text = await callAISimple(
      `다음 주제로 네이버 블로그에 최적화된 글을 작성해주세요.
제목, 본문(HTML 포맷), 태그 3-5개를 작성하세요.
주제: ${topic}

출력 형식:
제목: [제목]
태그: [태그1, 태그2, 태그3]
본문:
[본문 내용]`
    );
    const titleMatch = text.match(/제목:\s*(.+)/);
    const title = titleMatch?.[1]?.trim() ?? topic;
    return sendMessage(
      chatId,
      `📝 <b>네이버 블로그 초안: ${title}</b>\n\n${truncate(text, 3000)}\n\n<i>실제 네이버 발행은 LOOV 대시보드 > 네이버 블로그에서 진행하세요.</i>`
    );
  } catch {
    return sendMessage(chatId, '❌ AI API 키가 설정되지 않았습니다.');
  }
}

async function handleReport(chatId: number) {
  return handleInsights(chatId);
}

// ─── Natural language router ─────────────────────────────────────────────────

async function handleNaturalLanguage(chatId: number, text: string) {
  const routed = await routeWithAI(text);

  switch (routed.action) {
    case 'keyword_analyze':
      return handleKeyword(chatId, routed.params.keyword ?? text);
    case 'blog_generate':
      return handleBlog(chatId, routed.params.topic ?? text);
    case 'sme_search':
      return handleSme(chatId, routed.params.keyword);
    case 'schedule':
      return handleSchedule(chatId);
    case 'insights':
      return handleInsights(chatId);
    case 'shorts':
      return handleShorts(chatId, routed.params.topic ?? text);
    case 'naver_publish':
      return handleNaver(chatId, routed.params.topic ?? routed.params.title ?? text);
    case 'sns_post':
      return handlePublish(chatId, routed.params.platform ?? 'instagram', routed.params.content ?? text);
    case 'coupang_search':
      return handleCoupang(chatId, routed.params.keyword ?? text);
    case 'chat':
      return handleChat(chatId, routed.params.message ?? text);
    case 'unknown':
    default:
      if (routed.direct_reply) {
        return sendMessage(chatId, routed.direct_reply);
      }
      return handleChat(chatId, text);
  }
}

// ─── Callback query handler ───────────────────────────────────────────────────

async function handleCallbackQuery(query: TgCallbackQuery) {
  const chatId = query.message?.chat.id;
  if (!chatId) return;

  await answerCallback(query.id);

  const data = query.data ?? '';

  switch (data) {
    case 'cmd:insights':
      return handleInsights(chatId);
    case 'cmd:schedule':
      return handleSchedule(chatId);
    case 'cmd:keyword_help':
      return sendMessage(chatId, '🔍 키워드를 입력하세요.\n예: <code>/keyword AI 마케팅</code>');
    case 'cmd:blog_help':
      return sendMessage(chatId, '✍️ 주제를 입력하세요.\n예: <code>/blog 1인 기업 운영 노하우</code>');
    default:
      if (data.startsWith('cmd:')) {
        return sendMessage(chatId, `⚠️ 알 수 없는 명령: ${data}`);
      }
  }
}

// ─── Message dispatcher ───────────────────────────────────────────────────────

async function handleMessage(msg: TgMessage) {
  const chatId = msg.chat.id;
  const text = msg.text ?? '';
  const from = msg.from;

  if (!from) return;
  if (!isAllowedUser(from.id)) {
    return sendMessage(chatId, '⛔ 이 봇은 허가된 사용자만 사용할 수 있습니다.');
  }

  // Slash commands
  if (text.startsWith('/')) {
    const [rawCmd, ...args] = text.split(' ');
    const cmd = rawCmd.replace(/^\//, '').toLowerCase().split('@')[0]; // strip bot username if any
    const arg = args.join(' ').trim();

    await sendTyping(chatId);

    switch (cmd) {
      case 'start':
        return handleStart(chatId, from);
      case 'help':
        return handleHelp(chatId);
      case 'chat':
        if (!arg) return sendMessage(chatId, '💬 사용법: <code>/chat [질문 내용]</code>');
        return handleChat(chatId, arg);
      case 'keyword':
        if (!arg) return sendMessage(chatId, '🔍 사용법: <code>/keyword [키워드]</code>\n예: <code>/keyword AI 마케팅</code>');
        return handleKeyword(chatId, arg);
      case 'blog':
        if (!arg) return sendMessage(chatId, '✍️ 사용법: <code>/blog [주제]</code>\n예: <code>/blog 1인 기업 마케팅 전략</code>');
        return handleBlog(chatId, arg);
      case 'naver':
        if (!arg) return sendMessage(chatId, '📝 사용법: <code>/naver [주제]</code>\n예: <code>/naver 소상공인 SNS 활용법</code>');
        return handleNaver(chatId, arg);
      case 'insights':
        return handleInsights(chatId);
      case 'sme':
        return handleSme(chatId, arg || undefined);
      case 'schedule':
        return handleSchedule(chatId);
      case 'shorts':
        if (!arg) return sendMessage(chatId, '🎬 사용법: <code>/shorts [주제]</code>\n예: <code>/shorts AI로 돈 버는 방법</code>');
        return handleShorts(chatId, arg);
      case 'publish': {
        const parts = arg.split(' ');
        const platform = parts[0] ?? '';
        const content = parts.slice(1).join(' ');
        if (!platform || !content)
          return sendMessage(chatId, '📣 사용법: <code>/publish [플랫폼] [내용]</code>\n예: <code>/publish 인스타 오늘의 창업 팁 🚀</code>');
        return handlePublish(chatId, platform, content);
      }
      case 'status':
        return handleStatus(chatId);
      case 'report':
        return handleReport(chatId);
      case 'coupang':
        if (!arg) return sendMessage(chatId, '🛒 사용법: <code>/coupang [키워드]</code>\n예: <code>/coupang 무선 이어폰</code>');
        return handleCoupang(chatId, arg);
      default:
        return sendMessage(chatId, `❓ 알 수 없는 명령어: <code>/${cmd}</code>\n/help 를 입력하면 전체 명령어를 볼 수 있습니다.`);
    }
  }

  // Non-command text → natural language routing
  await sendTyping(chatId);
  return handleNaturalLanguage(chatId, text);
}

// ─── Process update (fire-and-forget safe) ───────────────────────────────────

async function processUpdate(update: TgUpdate) {
  try {
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    } else if (update.message) {
      await handleMessage(update.message);
    }
  } catch (err) {
    console.error('[telegram/webhook] processUpdate error:', err);
    // Try to notify user if we know the chat ID
    const chatId =
      update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    if (chatId) {
      await sendMessage(chatId, `⚠️ 처리 중 오류가 발생했습니다: ${String(err).slice(0, 200)}`).catch(() => {});
    }
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Verify webhook secret
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  if (secret) {
    const incomingSecret = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
    if (incomingSecret !== secret) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Respond 200 immediately, process in background
  // Using waitUntil pattern: fire-and-forget via an unresolved promise
  processUpdate(update).catch(console.error);

  return NextResponse.json({ ok: true });
}
