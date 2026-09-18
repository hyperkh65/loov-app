import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'GOOGLE_CLIENT_ID 환경변수가 없습니다' }, { status: 500 });
  }

  // req.nextUrl.origin은 리버스 프록시 뒤에서 도커 컨테이너 내부 호스트명(예:
  // cf8972e170a3:3000)으로 잘못 해석되는 게 실측 확인됨 — 구글이 공개 도메인이
  // 아니라며 "invalid_request"로 막아버림. 반드시 공개 도메인 env로 고정.
  const redirectUri = process.env.GOOGLE_YOUTUBE_REDIRECT_URI || `${req.nextUrl.origin}/api/youtube/callback`;

  const returnPath = req.nextUrl.searchParams.get('return') || '/dashboard/insta-service';
  const stateData = `${user.id}:${returnPath}`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: stateData,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  return NextResponse.redirect(authUrl);
}
