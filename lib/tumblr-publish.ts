/**
 * Tumblr 발행 공용 로직. app/api/backlink/tumblr(세션 사용자용 HTTP 엔드포인트)와
 * lib/rewrite-publish.ts(자동화 파이프라인, admin 클라이언트 + 고정 userId)가 공유한다.
 */
import { getSetting } from '@/lib/get-setting';
import crypto from 'crypto';

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

  return 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ');
}

export interface TumblrPublishParams {
  title: string;
  meta_description?: string;
  keyword?: string;
  canonical_url: string;
}

export async function publishToTumblr(params: TumblrPublishParams): Promise<{ url?: string }> {
  const { title, meta_description, keyword, canonical_url } = params;
  if (!title || !canonical_url) throw new Error('title, canonical_url 필요');

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
    throw new Error(`Tumblr 설정 누락: ${missing}`);
  }

  const tags = [keyword?.split(' ')[0] || 'korea', 'korea', 'korean-blog', 'news'].filter(Boolean);

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

  const authHeader = buildOAuth1Header('POST', postUrl, consumerKey, consumerSecret, accessToken, accessTokenSecret, formParams);
  const bodyStr = Object.entries(formParams).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

  const res = await fetch(postUrl, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
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
        friendlyError = `Tumblr OAuth 인증 실패 (code:${code}) — 설정 페이지에서 4개 키 다시 저장해주세요`;
      } else if (detail) {
        friendlyError = `Tumblr 오류 (${res.status}): ${detail}`;
      }
    } catch { /* ignore */ }
    throw new Error(friendlyError);
  }

  const data = JSON.parse(responseText);
  const postId = data.response?.id_string || String(data.response?.id || '');
  const resultUrl = postId ? `https://${blogName}.tumblr.com/post/${postId}` : undefined;
  return { url: resultUrl };
}
