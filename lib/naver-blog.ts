/**
 * 네이버 블로그 내부 API 클라이언트
 * NID_AUT + NID_SES 쿠키 기반 인증 - NAS post.py(SEOne) 경유
 */
import { nasExecWithStdin } from '@/lib/nas-ssh';

export interface NaverPostParams {
  blogId: string;
  nidAut: string;
  nidSes: string;
  title: string;
  content: string; // HTML
  tags: string[];
  categoryNo: number;
  isPublish: boolean;
}

export interface NaverPostResult {
  postId?: string;
  postUrl?: string;
  error?: string;
  errorCode?: 'AUTH' | 'RATE_LIMIT' | 'CONTENT' | 'NETWORK' | 'UNKNOWN';
}

export interface NaverCategory {
  no: number;
  name: string;
  postCount?: number;
}

export interface NaverBlogInfo {
  blogId: string;
  blogName: string;
  blogDescription?: string;
}

// 공통 요청 헤더
function buildHeaders(nidAut: string, nidSes: string, blogId: string, extra?: Record<string, string>) {
  return {
    Cookie: `NID_AUT=${nidAut}; NID_SES=${nidSes}`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'application/json, text/plain, */*',
    Referer: `https://blog.naver.com/${blogId}`,
    Origin: 'https://blog.naver.com',
    ...extra,
  };
}


// HTML에서 <style> 제거 (Naver 호환)
export function sanitizeForNaver(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\s*style="[^"]*"/gi, '')
    .replace(/\s*class="[^"]*"/gi, '')
    .trim();
}

// ── 블로그 정보 조회 ──────────────────────────────────────────────────────────

export async function getNaverBlogInfo(
  blogId: string, nidAut: string, nidSes: string
): Promise<{ info?: NaverBlogInfo; error?: string }> {
  try {
    const res = await fetch(`https://blog.naver.com/api/blogs/${blogId}`, {
      headers: buildHeaders(nidAut, nidSes, blogId),
      cache: 'no-store',
    });

    if (res.status === 401 || res.status === 403) {
      return { error: '쿠키가 만료되었거나 잘못된 블로그 ID입니다.' };
    }
    if (!res.ok) {
      // 공개 API로 fallback (쿠키 없이 블로그 존재 확인)
      const fallback = await fetch(`https://blog.naver.com/BlogInfo.naver?blogId=${blogId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!fallback.ok) return { error: `블로그를 찾을 수 없습니다 (${blogId})` };
      return { info: { blogId, blogName: blogId } };
    }

    const data = await res.json() as Record<string, unknown>;
    return {
      info: {
        blogId,
        blogName: (data.blogName as string) || (data.name as string) || blogId,
        blogDescription: (data.blogDescription as string) || '',
      },
    };
  } catch (e) {
    return { error: '네트워크 오류: ' + String(e) };
  }
}

// HTML 엔티티 디코딩
function decodeEntities(str: string): string {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// XML에서 카테고리 파싱 (self-closing + element 모두 처리)
function parseNaverCategoryXml(xml: string): NaverCategory[] {
  const categories: NaverCategory[] = [];

  // Self-closing 형식: <category categoryNo="1" name="카테고리" ... />
  for (const m of xml.matchAll(/<category\b([^>]+?)\/>/gi)) {
    const noM = m[1].match(/categoryNo="(\d+)"/i);
    const nameM = m[1].match(/name="([^"]+)"/i);
    if (noM && nameM) {
      categories.push({ no: parseInt(noM[1]), name: decodeEntities(nameM[1]) });
    }
  }

  // Element 형식: <category><categoryNo>1</categoryNo><name>카테고리</name></category>
  if (categories.length === 0) {
    for (const m of xml.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)) {
      const noM = m[1].match(/<categoryNo>(\d+)<\/categoryNo>/i);
      const nameM = m[1].match(/<name>([\s\S]*?)<\/name>/i);
      if (noM && nameM) {
        categories.push({ no: parseInt(noM[1]), name: decodeEntities(nameM[1].trim()) });
      }
    }
  }

  return categories;
}

// ── 카테고리 조회 ─────────────────────────────────────────────────────────────

export async function getNaverCategories(
  blogId: string, nidAut: string, nidSes: string
): Promise<{ categories?: NaverCategory[]; error?: string }> {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // ── Method 1: 공개 XML API (인증 불필요, 서버에서도 동작) ──────────────────
  try {
    const res = await fetch(`https://blog.naver.com/CategoryList.naver?blogId=${blogId}`, {
      headers: { 'User-Agent': ua, Accept: 'text/xml, application/xml, */*' },
      cache: 'no-store',
    });
    if (res.ok) {
      const xml = await res.text();
      const categories = parseNaverCategoryXml(xml);
      if (categories.length > 0) return { categories };
    }
  } catch (e) {
    console.warn('[Naver] CategoryList.naver failed:', e);
  }

  // ── Method 2: 쿠키 포함 JSON API ─────────────────────────────────────────
  try {
    const res = await fetch(`https://blog.naver.com/api/blogs/${blogId}/categories`, {
      headers: buildHeaders(nidAut, nidSes, blogId),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json() as unknown;
      const items = (Array.isArray(data) ? data : (data as Record<string, unknown>)?.categories) as Record<string, unknown>[] | undefined;
      if (Array.isArray(items) && items.length > 0) {
        return {
          categories: items.map((c) => ({
            no: Number(c.categoryNo ?? c.no ?? 0),
            name: decodeEntities(String(c.categoryName ?? c.name ?? '')),
            postCount: Number(c.postCount ?? 0),
          })),
        };
      }
    }
  } catch (e) {
    console.warn('[Naver] categories JSON API failed:', e);
  }

  // ── Method 3: 블로그 메인 HTML 파싱 ──────────────────────────────────────
  try {
    const res = await fetch(`https://blog.naver.com/${blogId}`, {
      headers: { 'User-Agent': ua },
      cache: 'no-store',
    });
    if (res.ok) {
      const html = await res.text();
      // 블로그 메인 페이지에서 카테고리 데이터 추출
      const jsonMatch = html.match(/"categoryList"\s*:\s*(\[[\s\S]*?\])/);
      if (jsonMatch) {
        const items = JSON.parse(jsonMatch[1]) as Record<string, unknown>[];
        if (Array.isArray(items) && items.length > 0) {
          return {
            categories: items.map((c) => ({
              no: Number(c.categoryNo ?? c.no ?? 0),
              name: decodeEntities(String(c.categoryName ?? c.name ?? '')),
            })),
          };
        }
      }
    }
  } catch (e) {
    console.warn('[Naver] blog main HTML parse failed:', e);
  }

  return { categories: [], error: '카테고리를 불러올 수 없습니다 (비공개 블로그이거나 카테고리 없음)' };
}


// ── 블로그 포스팅 (NAS post.py / SEOne API 경유) ───────────────────────────────

export async function postToNaverBlog(params: NaverPostParams): Promise<NaverPostResult> {
  const { blogId, nidAut, nidSes, title, content, tags, categoryNo, isPublish } = params;

  const payload = JSON.stringify({
    blogId, nidAut, nidSes, title, content, tags, categoryNo, isPublish,
  });

  try {
    const result = await nasExecWithStdin(
      'python3 /volume1/homes/urjent/naver_publish/post.py',
      payload,
    );

    if (result.code !== 0 && !result.stdout) {
      return { error: `NAS 실행 실패 (code ${result.code}): ${result.stderr.slice(0, 200)}`, errorCode: 'UNKNOWN' };
    }

    const parsed = JSON.parse(result.stdout) as {
      postId?: string; postUrl?: string; error?: string; errorCode?: string;
    };

    if (parsed.error) {
      const ec = parsed.errorCode;
      return {
        error: parsed.error,
        errorCode: (ec === 'AUTH' ? 'AUTH' : ec === 'RATE_LIMIT' ? 'RATE_LIMIT' : 'UNKNOWN'),
      };
    }

    return { postId: parsed.postId, postUrl: parsed.postUrl };
  } catch (e) {
    return { error: `NAS SSH 오류: ${String(e)}`, errorCode: 'NETWORK' };
  }
}

// ── OAuth 기반 블로그 포스팅 ───────────────────────────────────────────────────

export async function postToNaverBlogOAuth(params: {
  accessToken: string;
  blogId: string;
  title: string;
  content: string;
  tags: string[];
  categoryNo: number;
  isPublish: boolean;
}): Promise<NaverPostResult> {
  const { accessToken, blogId, title, content, tags, categoryNo, isPublish } = params;

  const form = new URLSearchParams({
    title: title.trim(),
    contents: content,
    tags: tags.slice(0, 30).join(','),
    categoryNo: String(categoryNo),
    publishType: isPublish ? 'A' : 'B',
  });

  try {
    const res = await fetch('https://openapi.naver.com/blog/writePost.json', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      cache: 'no-store',
    });

    const data = await res.json() as {
      resultcode?: string;
      message?: string;
      blogId?: string;
      logNo?: string;
      postId?: string;
    };

    console.log('[NaverOAuth] writePost response:', res.status, JSON.stringify(data));

    if (!res.ok || data.resultcode !== '00') {
      return {
        error: `OAuth API 오류 (${res.status}): ${data.message || data.resultcode}`,
        errorCode: (res.status === 401 || res.status === 403) ? 'AUTH' : 'UNKNOWN',
      };
    }

    const postId = data.logNo || data.postId || '';
    const actualBlogId = data.blogId || blogId;
    return {
      postId,
      postUrl: postId
        ? `https://blog.naver.com/${actualBlogId}/${postId}`
        : `https://blog.naver.com/${actualBlogId}`,
    };
  } catch (e) {
    return { error: `OAuth 네트워크 오류: ${String(e)}`, errorCode: 'NETWORK' };
  }
}

// ── OAuth 토큰 갱신 ───────────────────────────────────────────────────────────

export async function refreshNaverToken(
  refreshToken: string
): Promise<{ accessToken?: string; expiresAt?: string; error?: string }> {
  try {
    const res = await fetch('https://nid.naver.com/oauth2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.NAVER_CLIENT_ID!,
        client_secret: process.env.NAVER_CLIENT_SECRET!,
        refresh_token: refreshToken,
      }),
    });
    const data = await res.json() as { access_token?: string; expires_in?: number; error?: string };
    if (!data.access_token) return { error: data.error || '토큰 갱신 실패' };
    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
    };
  } catch (e) {
    return { error: String(e) };
  }
}
