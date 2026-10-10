import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { getSetting, invalidateSettingsCache } from '@/lib/get-setting';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://loov.co.kr';

  if (error || !code) {
    return NextResponse.redirect(`${baseUrl}/dashboard?wordpress_com_error=${error || 'cancelled'}`);
  }

  try {
    const clientId = await getSetting('WORDPRESS_COM_CLIENT_ID');
    const clientSecret = await getSetting('WORDPRESS_COM_CLIENT_SECRET');
    const redirectUri = `${baseUrl}/api/wordpress-com/callback`;

    const tokenRes = await fetch('https://public-api.wordpress.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error_description || 'Token exchange failed');

    // 연결된 사이트 중 진짜 워드프레스닷컴 무료 블로그(*.wordpress.com)를 우선
    // 선택 — 계정에 Jetpack으로 연결된 다른 외부 사이트가 섞여 있으면 그게
    // 먼저 잡히는 문제가 실사용 중 확인됨(위성 블로그 용도라 자체 도메인 필요)
    const sitesRes = await fetch('https://public-api.wordpress.com/rest/v1.1/me/sites', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const sitesData = await sitesRes.json() as { sites?: { ID: number; URL: string }[] };
    const site = sitesData.sites?.find(s => s.URL.includes('.wordpress.com')) || sitesData.sites?.[0];
    if (!site) throw new Error('연결된 WordPress.com 사이트를 찾을 수 없습니다');

    const admin = createAdminClient();
    const { data: row } = await admin.from('app_settings').select('settings').eq('id', 1).single();
    const settings = (row?.settings as Record<string, string>) || {};
    settings.WORDPRESS_COM_ACCESS_TOKEN = tokenData.access_token;
    if (tokenData.refresh_token) settings.WORDPRESS_COM_REFRESH_TOKEN = tokenData.refresh_token;
    settings.WORDPRESS_COM_SITE = String(site.ID);
    settings.WORDPRESS_COM_SITE_URL = site.URL;
    await admin.from('app_settings').update({ settings }).eq('id', 1);
    invalidateSettingsCache();

    return NextResponse.redirect(`${baseUrl}/dashboard?wordpress_com_connected=1`);
  } catch (e) {
    return NextResponse.redirect(`${baseUrl}/dashboard?wordpress_com_error=${encodeURIComponent(String(e))}`);
  }
}
