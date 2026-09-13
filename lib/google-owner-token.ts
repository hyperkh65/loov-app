/**
 * 세션 유저가 아니라 OWNER_USER_ID 기준으로 Google 액세스 토큰을 가져온다.
 * wp-auto 같은 크론/서버 라우트는 로그인 세션이 없어서 lib/blogger-token.ts류의
 * createClient() 기반 헬퍼를 못 쓴다 — createAdminClient()로 직접 조회.
 */
import { createAdminClient } from '@/lib/supabase-server';

export async function getOwnerGoogleAccessToken(): Promise<string | null> {
  const ownerId = process.env.OWNER_USER_ID;
  if (!ownerId) return null;

  const supabase = createAdminClient();
  const { data: tokenRow } = await supabase
    .from('bossai_google_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', ownerId)
    .single();

  if (!tokenRow?.access_token) return null;

  const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 5 * 60 * 1000) {
    return tokenRow.access_token;
  }

  if (!tokenRow.refresh_token) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: tokenRow.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) return null;

  await supabase.from('bossai_google_tokens').update({
    access_token: data.access_token,
    expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', ownerId);

  return data.access_token as string;
}
