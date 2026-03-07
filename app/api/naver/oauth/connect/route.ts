export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const clientId = process.env.NAVER_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'NAVER_CLIENT_ID 환경변수가 설정되지 않았습니다' }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://loov.co.kr';
  const redirectUri = `${appUrl}/api/naver/oauth/callback`;

  const { searchParams } = new URL(req.url);
  const blogId = searchParams.get('blog_id') || '';

  // state: base64url(userId + blogId + nonce)
  const stateData = JSON.stringify({ u: user.id, b: blogId, n: Math.random().toString(36).slice(2) });
  const state = btoa(stateData).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const authUrl = new URL('https://nid.naver.com/oauth2.0/authorize');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);

  return NextResponse.redirect(authUrl.toString());
}
