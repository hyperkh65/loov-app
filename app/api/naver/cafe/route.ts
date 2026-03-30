import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

async function getAccessToken(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: conn } = await supabase
    .from('naver_connections')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .single();
  return conn?.access_token || null;
}

// GET /api/naver/cafe?clubId=xxx  → 게시판 목록
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const clubId = req.nextUrl.searchParams.get('clubId');
  if (!clubId) return NextResponse.json({ error: 'clubId 파라미터 필요' }, { status: 400 });

  const accessToken = await getAccessToken(supabase, user.id);
  if (!accessToken) return NextResponse.json({ error: '네이버 OAuth 연결 필요' }, { status: 400 });

  const res = await fetch(`https://openapi.naver.com/v1/cafe/${clubId}/menu/`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `게시판 조회 실패 (${res.status}): ${text}` }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}

// POST /api/naver/cafe  → 글 발행
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { clubId, menuId, subject, content, openyn = 'Y' } = await req.json() as {
    clubId: string; menuId: string; subject: string; content: string; openyn?: string;
  };

  if (!clubId || !menuId || !subject?.trim() || !content?.trim()) {
    return NextResponse.json({ error: '필수값 누락 (clubId, menuId, subject, content)' }, { status: 400 });
  }

  const accessToken = await getAccessToken(supabase, user.id);
  if (!accessToken) return NextResponse.json({ error: '네이버 OAuth 연결 필요' }, { status: 400 });

  const res = await fetch(`https://openapi.naver.com/v1/cafe/${clubId}/menu/${menuId}/articles`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subject, content, openyn }),
  });

  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json({ error: data.message || `발행 실패 (${res.status})` }, { status: res.status });
  }

  // 발행 이력 저장
  await supabase.from('naver_cafe_history').insert({
    user_id: user.id,
    club_id: clubId,
    menu_id: menuId,
    article_id: String(data.articleId || data.id || ''),
    subject,
    open_yn: openyn,
  }).catch(() => {});

  return NextResponse.json({ ok: true, articleId: data.articleId || data.id, ...data });
}
