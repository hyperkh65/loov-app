export const runtime = 'edge';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://loov.co.kr';
  const failUrl = `${appUrl}/dashboard/naver-cafe?error=oauth_failed`;

  if (error || !code || !state) return NextResponse.redirect(failUrl);

  let userId: string, clubId: string;
  try {
    const padded = state.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(padded + '='.repeat((4 - padded.length % 4) % 4)));
    userId = decoded.u;
    clubId = decoded.c || '';
  } catch {
    return NextResponse.redirect(failUrl);
  }

  const redirectUri = `${appUrl}/api/naver-cafe/oauth/callback`;
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
  };
  if (!tokens.access_token) {
    return NextResponse.redirect(failUrl + `&reason=${tokens.error || 'no_token'}`);
  }

  // 네이버 사용자 정보 조회 (member_id 획득)
  let memberId = '';
  try {
    const meRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (meRes.ok) {
      const me = await meRes.json() as { response?: { id?: string } };
      memberId = me.response?.id || '';
    }
  } catch {
    // ignore
  }

  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
  const supabase = await createAdminClient();
  const { error: dbError } = await supabase.from('naver_cafe_connections').upsert({
    user_id: userId,
    club_id: clubId,
    member_id: memberId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || '',
    token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (dbError) return NextResponse.redirect(failUrl + '&reason=db_error');
  return NextResponse.redirect(`${appUrl}/dashboard/naver-cafe?oauth=success`);
}
