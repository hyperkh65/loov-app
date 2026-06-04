import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
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

  if (!title || !canonical_url) return NextResponse.json({ error: 'title, canonical_url 필요' }, { status: 400 });

  const [consumerKey, consumerSecret, accessToken, accessTokenSecret, blogName] = await Promise.all([
    getSetting('TUMBLR_CONSUMER_KEY'),
    getSetting('TUMBLR_CONSUMER_SECRET'),
    getSetting('TUMBLR_ACCESS_TOKEN'),
    getSetting('TUMBLR_ACCESS_TOKEN_SECRET'),
    getSetting('TUMBLR_BLOG_NAME'),
  ]);

  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret || !blogName) {
    const missing = [
      !consumerKey && 'Consumer Key',
      !consumerSecret && 'Consumer Secret',
      !accessToken && 'Access Token',
      !accessTokenSecret && 'Access Token Secret',
      !blogName && '블로그 이름',
    ].filter(Boolean).join(', ');
    return NextResponse.json({ error: `Tumblr 설정 누락: ${missing}` }, { status: 400 });
  }

  const tags = [
    keyword?.split(' ')[0] || 'korea',
    'korea',
    'korean-blog',
    'news',
  ].filter(Boolean);

  // 레거시 API endpoint (form-encoded, OAuth 1.0a 호환성 최고)
  const postUrl = `https://api.tumblr.com/v2/blog/${blogName}/post`;

  const formParams: Record<string, string> = {
    type: 'link',
    url: canonical_url,
    title: title.slice(0, 250),
    description: (meta_description || '').slice(0, 500),
    tags: tags.join(','),
    state: 'published',
  };

  try {
    // form body params를 OAuth 서명에 포함 (레거시 API 필수)
    const authHeader = buildOAuth1Header(
      'POST', postUrl,
      consumerKey, consumerSecret,
      accessToken, accessTokenSecret,
      formParams,
    );

    // body도 동일한 인코딩 사용
    const bodyStr = Object.entries(formParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const res = await fetch(postUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyStr,
      signal: AbortSignal.timeout(20_000),
    });

    const responseText = await res.text();

    if (!res.ok) {
      let friendlyError = `Tumblr 오류 (${res.status}): ${responseText.slice(0, 300)}`;
      try {
        const errJson = JSON.parse(responseText);
        const code = errJson?.errors?.[0]?.code;
        const detail = errJson?.errors?.[0]?.detail || errJson?.meta?.msg;
        if (code === 1008 || detail?.includes('authorize') || detail?.includes('Unauthorized')) {
          friendlyError = `Tumblr OAuth 인증 실패 (code:${code}) — Consumer Key로 시작하는 값: ${consumerKey.slice(0,6)}... 설정 페이지에서 4개 키 다시 저장해주세요`;
        } else if (detail) {
          friendlyError = `Tumblr 오류 (${res.status}): ${detail}`;
        }
      } catch { /* ignore */ }
      return NextResponse.json({ error: friendlyError }, { status: 500 });
    }

    const data = JSON.parse(responseText);
    const postId = data.response?.id_string || String(data.response?.id || '');
    const resultUrl = postId ? `https://${blogName}.tumblr.com/post/${postId}` : undefined;
    return NextResponse.json({ success: true, url: resultUrl });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// GET: 연결 상태 확인
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const [consumerKey, accessToken, blogName] = await Promise.all([
    getSetting('TUMBLR_CONSUMER_KEY'),
    getSetting('TUMBLR_ACCESS_TOKEN'),
    getSetting('TUMBLR_BLOG_NAME'),
  ]);

  return NextResponse.json({ configured: !!(consumerKey && accessToken && blogName), blog_name: blogName || '' });
}
