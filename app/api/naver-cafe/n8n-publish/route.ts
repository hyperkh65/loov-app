/**
 * n8n → 네이버 카페 자동발행 엔드포인트
 * POST /api/naver-cafe/n8n-publish
 * Header: x-api-key: {N8N_CAFE_API_KEY}
 * Body: { title, content, menu_id?, notion_page_id? }
 *
 * 처리 순서:
 * 1. API 키 인증
 * 2. Ollama(qwen3)로 본문 다듬기
 * 3. 네이버 카페 발행 (club_id=30929054, menu_id=21)
 * 4. 이력 저장
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const DEFAULT_CLUB_ID = '30929054';
const DEFAULT_MENU_ID = '21';

// Ollama Cloud로 본문 다듬기 (없으면 원문 그대로)
async function refineWithAI(title: string, content: string): Promise<string> {
  const ollamaKey = process.env.OLLAMA_KEY || process.env.OLLAMA_API_KEY || '';
  const geminiKey = process.env.GEMINI_API_KEY || '';

  const prompt = `다음 AI 뉴스 기사를 네이버 카페 독자에게 적합하게 다듬어 주세요.

제목: ${title}

원문:
${content.slice(0, 3000)}

다듬기 규칙:
- 반말 사용 금지, 1인칭(나/우리) 사용 금지
- 과장된 표현 제거 (예: "혁명적", "놀라운" 등)
- 핵심 내용은 유지하되 자연스러운 한국어로 정리
- 소제목 구조 유지 (<h3> 또는 **소제목** 형태)
- 마지막에 해시태그 3~5개 추가
- HTML 태그 사용 가능

다듬어진 본문만 출력하세요.`;

  // Ollama Cloud 시도
  if (ollamaKey) {
    try {
      const res = await fetch('https://ollama.com/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ollamaKey}` },
        body: JSON.stringify({
          model: 'qwen3',
          messages: [{ role: 'user', content: prompt }],
          stream: false,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const data = await res.json() as { message?: { content?: string } };
        const text = data.message?.content?.trim();
        if (text && text.length > 100) return text;
      }
    } catch { /* fallthrough */ }
  }

  // Gemini 폴백
  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: AbortSignal.timeout(20000),
        }
      );
      if (res.ok) {
        const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text && text.length > 100) return text;
      }
    } catch { /* fallthrough */ }
  }

  // AI 없으면 원문 반환
  return content;
}

async function refreshNaverToken(refreshToken: string) {
  try {
    const res = await fetch('https://nid.naver.com/oauth2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.NAVER_CLIENT_ID!,
        client_secret: process.env.NAVER_CLIENT_SECRET!,
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) return null;
    const d = await res.json() as { access_token?: string; expires_in?: number };
    return d.access_token ? d : null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  // ── 1. API 키 인증 ────────────────────────────────────────────────────────
  const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '');
  const expectedKey = process.env.N8N_CAFE_API_KEY;
  if (!expectedKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'API 키 인증 실패' }, { status: 401 });
  }

  const body = await req.json() as {
    title: string;
    content: string;
    menu_id?: string;
    notion_page_id?: string;
    skip_refine?: boolean;
  };
  const { title, content, menu_id, notion_page_id, skip_refine = false } = body;

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'title, content 필요' }, { status: 400 });
  }

  // ── 2. 사용자 naver_cafe_connections 조회 (admin) ────────────────────────
  const supabase = await createAdminClient();
  // N8N_CAFE_USER_ID env로 특정 유저 지정, 없으면 첫 번째 연결 사용
  const userId = process.env.N8N_CAFE_USER_ID || '';
  let query = supabase.from('naver_cafe_connections').select('*').limit(1);
  if (userId) query = query.eq('user_id', userId);
  const { data: conn } = await query.single();

  if (!conn?.access_token) {
    return NextResponse.json({ error: '네이버 카페 OAuth 연결이 없습니다. /dashboard/naver-cafe에서 연결하세요.' }, { status: 400 });
  }

  // ── 3. Ollama로 본문 다듬기 ───────────────────────────────────────────────
  const refinedContent = skip_refine ? content : await refineWithAI(title, content);

  // ── 4. 토큰 만료 체크 / 갱신 ─────────────────────────────────────────────
  let accessToken: string = conn.access_token;
  if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date(Date.now() + 60_000) && conn.refresh_token) {
    const refreshed = await refreshNaverToken(conn.refresh_token);
    if (refreshed?.access_token) {
      accessToken = refreshed.access_token;
      await supabase.from('naver_cafe_connections').update({
        access_token: refreshed.access_token,
        token_expires_at: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString(),
      }).eq('user_id', conn.user_id);
    }
  }

  // ── 5. 네이버 카페 발행 ───────────────────────────────────────────────────
  const clubId = conn.club_id || DEFAULT_CLUB_ID;
  const targetMenuId = menu_id || DEFAULT_MENU_ID;

  const form = new FormData();
  form.append('subject', title);
  form.append('content', refinedContent);
  form.append('openYn', 'Y');

  const cafeRes = await fetch(
    `https://openapi.naver.com/v1/cafe/${clubId}/menu/${targetMenuId}/articles`,
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form }
  );

  const cafeData = await cafeRes.json() as {
    message?: { result?: { articleId?: number } };
    errorCode?: string;
    errorMessage?: string;
  };

  if (!cafeRes.ok || cafeData.errorCode) {
    return NextResponse.json({
      error: `카페 발행 실패: ${cafeData.errorMessage || `HTTP ${cafeRes.status}`}`,
      detail: cafeData,
    }, { status: 400 });
  }

  const articleId = cafeData.message?.result?.articleId;
  const articleUrl = articleId ? `https://cafe.naver.com/f-e/articles/${articleId}` : undefined;

  // ── 6. 이력 저장 ─────────────────────────────────────────────────────────
  await supabase.from('naver_cafe_history').insert({
    user_id: conn.user_id,
    club_id: clubId,
    article_id: articleId ? String(articleId) : null,
    article_url: articleUrl || null,
    title,
    menu_id: targetMenuId,
    menu_name: 'AI 뉴스',
    open_yn: 'Y',
    notion_page_id: notion_page_id || null,
  });

  return NextResponse.json({ ok: true, article_id: articleId, url: articleUrl, refined: !skip_refine });
}
