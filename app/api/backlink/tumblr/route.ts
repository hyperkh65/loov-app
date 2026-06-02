import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import crypto from 'crypto';

export const maxDuration = 30;

function buildOAuth1Header(
  method: string,
  url: string,
  consumerKey: string,
  consumerSecret: string,
  token: string,
  tokenSecret: string,
): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const params: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: token,
    oauth_version: '1.0',
  };

  const paramString = Object.keys(params)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(paramString),
  ].join('&');

  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  params['oauth_signature'] = signature;

  const headerValue = 'OAuth ' + Object.keys(params)
    .sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(params[k])}"`)
    .join(', ');

  return headerValue;
}

// POST: Tumblr에 링크 포스트 발행
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { title, meta_description, keyword, canonical_url, representative_image_url } = await req.json() as {
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
    return NextResponse.json({ error: 'Tumblr OAuth 키 4개 + 블로그명이 모두 필요합니다' }, { status: 400 });
  }

  const tags = [
    keyword?.split(' ')[0] || 'korea',
    'korea',
    'korean-blog',
    'news',
  ].filter(Boolean);

  const postUrl = `https://api.tumblr.com/v2/blog/${blogName}/posts`;

  const body: Record<string, unknown> = {
    content: [
      ...(representative_image_url ? [{
        type: 'image',
        media: [{ type: 'image/jpeg', url: representative_image_url }],
        alt_text: title,
      }] : []),
      { type: 'text', text: title, subtype: 'heading1' },
      { type: 'text', text: meta_description || '' },
      { type: 'link', url: canonical_url, title, description: meta_description || '' },
    ],
    tags,
    state: 'published',
  };

  try {
    const authHeader = buildOAuth1Header('POST', postUrl, consumerKey, consumerSecret, accessToken, accessTokenSecret);

    const res = await fetch(postUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Tumblr 오류: ${err.slice(0, 200)}` }, { status: 500 });
    }

    const data = await res.json();
    const postId = data.response?.id_string || data.response?.id;
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
