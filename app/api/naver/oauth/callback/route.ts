export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://loov.co.kr';
  const failUrl = `${appUrl}/dashboard/naver?tab=settings&error=oauth_failed`;

  if (error || !code || !state) {
    return NextResponse.redirect(failUrl);
  }

  // state 디코딩
  let userId: string, blogId: string;
  try {
    const padded = state.replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - padded.length % 4) % 4;
    const decoded = JSON.parse(atob(padded + '='.repeat(padLength)));
    userId = decoded.u;
    blogId = decoded.b || '';
  } catch {
    return NextResponse.redirect(failUrl);
  }

  // 코드 → 토큰 교환
  const redirectUri = `${appUrl}/api/naver/oauth/callback`;
  const tokenRes = await fetch('https://nid.naver.com/oauth2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.NAVER_CLIENT_ID!,
      client_secret: process.env.NAVER_CLIENT_SECRET!,
      code,
      state,
      redirect_uri: redirectUri,
    }),
  });

  const tokens = await tokenRes.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!tokens.access_token) {
    console.error('[NaverOAuth] Token exchange failed:', tokens);
    return NextResponse.redirect(failUrl + `&reason=${encodeURIComponent(tokens.error || 'no_token')}`);
  }

  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

  // DB에 저장 (admin client 사용 - 콜백에는 세션 없음)
  const supabase = await createAdminClient();
  const upsertData: Record<string, unknown> = {
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || '',
    token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };
  if (blogId) {
    upsertData.blog_id = blogId;
    upsertData.blog_name = blogId;
  }

  const { error: dbError } = await supabase
    .from('naver_connections')
    .upsert(upsertData, { onConflict: 'user_id' });

  if (dbError) {
    console.error('[NaverOAuth] DB upsert failed:', dbError);
    return NextResponse.redirect(failUrl + `&reason=db_error`);
  }

  return NextResponse.redirect(`${appUrl}/dashboard/naver?tab=settings&oauth=success`);
}
