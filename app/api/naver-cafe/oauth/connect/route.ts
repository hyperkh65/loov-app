export const runtime = 'edge';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const clientId = process.env.NAVER_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: 'NAVER_CLIENT_ID 미설정' }, { status: 500 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://loov.co.kr';
  const redirectUri = `${appUrl}/api/naver-cafe/oauth/callback`;
  const { searchParams } = new URL(req.url);
  const clubId = searchParams.get('club_id') || '';

  const stateData = JSON.stringify({ u: user.id, c: clubId, n: Math.random().toString(36).slice(2) });
  const state = btoa(stateData).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const authUrl = new URL('https://nid.naver.com/oauth2.0/authorize');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', 'profile email cafe');

  return NextResponse.redirect(authUrl.toString());
}
