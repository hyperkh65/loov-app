import { createClient } from '@/lib/supabase-server';

export async function getBloggerToken(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: tokenRow } = await supabase
    .from('bossai_blogger_tokens')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!tokenRow) return null;

  // 만료 확인 (5분 여유)
  const expiresAt = new Date(tokenRow.expires_at).getTime();
  const now = Date.now();
  if (expiresAt > now + 5 * 60 * 1000) {
    return tokenRow.access_token;
  }

  // 만료됐으면 refresh
  if (!tokenRow.refresh_token) return null;
  const refreshed = await refreshBloggerToken(tokenRow.refresh_token);
  if (!refreshed) return null;

  await supabase
    .from('bossai_blogger_tokens')
    .update({
      access_token: refreshed.access_token,
      expires_at: refreshed.expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);

  return refreshed.access_token;
}

export async function refreshBloggerToken(
  refreshToken: string
): Promise<{ access_token: string; expires_at: string } | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!data.access_token) return null;

  return {
    access_token: data.access_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}
