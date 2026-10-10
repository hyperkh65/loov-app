import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import { publishToTumblr } from '@/lib/tumblr-publish';
import crypto from 'crypto';

export const maxDuration = 30;

// OAuth 1.0a HMAC-SHA1 (form body params included in signature)
function buildOAuth1Header(
  method: string,
  url: string,
  consumerKey: string,
  consumerSecret: string,
  token: string,
  tokenSecret: string,
  bodyParams: Record<string, string> = {},
): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: token,
    oauth_version: '1.0',
  };

  // Signature base includes OAuth params + body params (for form-encoded requests)
  const allParams: Record<string, string> = { ...oauthParams, ...bodyParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(paramString),
  ].join('&');

  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams['oauth_signature'] = signature;

  const headerValue = 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ');

  return headerValue;
}

// POST: Tumblr에 링크 포스트 발행 (레거시 API - form-encoded, OAuth 서명에 body params 포함)
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { title, meta_description, keyword, canonical_url } = await req.json() as {
    title: string;
    meta_description: string;
    keyword: string;
    canonical_url: string;
    representative_image_url?: string;
  };

  try {
    const { url } = await publishToTumblr({ title, meta_description, keyword, canonical_url });
    return NextResponse.json({ success: true, url });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// GET: 연결 상태 확인 + ?test=1 시 실제 API 호출 테스트
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const [consumerKey, consumerSecret, accessToken, accessTokenSecret, blogName] = await Promise.all([
    getSetting('TUMBLR_CONSUMER_KEY'),
    getSetting('TUMBLR_CONSUMER_SECRET'),
    getSetting('TUMBLR_ACCESS_TOKEN'),
    getSetting('TUMBLR_ACCESS_TOKEN_SECRET'),
    getSetting('TUMBLR_BLOG_NAME'),
  ]);

  const configured = !!(consumerKey && consumerSecret && accessToken && accessTokenSecret && blogName);

  const doTest = new URL(req.url).searchParams.get('test') === '1';
  if (doTest && configured) {
    const testUrl = `https://api.tumblr.com/v2/blog/${blogName}/info`;
    const authHeader = buildOAuth1Header('GET', testUrl, consumerKey!, consumerSecret!, accessToken!, accessTokenSecret!);
    try {
      const r = await fetch(testUrl, {
        headers: { Authorization: authHeader, 'User-Agent': 'loov-backlink/1.0' },
        signal: AbortSignal.timeout(10_000),
      });
      const body = await r.text();
      if (r.ok) {
        return NextResponse.json({ configured, blog_name: blogName || '', test_ok: true, consumer_key_prefix: consumerKey!.slice(0, 6) });
      }
      let detail = '';
      try { detail = JSON.parse(body)?.errors?.[0]?.detail || JSON.parse(body)?.meta?.msg || body.slice(0, 200); } catch { detail = body.slice(0, 200); }
      return NextResponse.json({ configured, blog_name: blogName || '', test_ok: false, test_error: `${r.status}: ${detail}`, consumer_key_prefix: consumerKey!.slice(0, 6) });
    } catch (e) {
      return NextResponse.json({ configured, blog_name: blogName || '', test_ok: false, test_error: String(e) });
    }
  }

  return NextResponse.json({ configured, blog_name: blogName || '', consumer_key_prefix: consumerKey ? consumerKey.slice(0, 6) : '' });
}
