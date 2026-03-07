/**
 * 네이버 블로그 내부 API 클라이언트
 * NID_AUT + NID_SES 쿠키 기반 인증
 */

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

// 에러 분류
function classifyError(status: number): NaverPostResult['errorCode'] {
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 429) return 'RATE_LIMIT';
  if (status === 400 || status === 422) return 'CONTENT';
  return 'UNKNOWN';
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

// ── 글쓰기 폼에서 CSRF 토큰 추출 ────────────────────────────────────────────

async function getWriteFormHidden(blogId: string, cookie: string, ua: string): Promise<Record<string, string>> {
  try {
    const res = await fetch(`https://blog.naver.com/PostWriteForm.naver?blogId=${blogId}`, {
      headers: { Cookie: cookie, 'User-Agent': ua, 'Accept-Language': 'ko-KR,ko;q=0.9' },
      redirect: 'follow',
      cache: 'no-store',
    });
    if (!res.ok) return {};
    const html = await res.text();
    const fields: Record<string, string> = {};
    for (const m of html.matchAll(/<input\b[^>]+type=["']hidden["'][^>]*>/gi)) {
      const nameM = m[0].match(/name=["']([^"']+)["']/i);
      const valM  = m[0].match(/value=["']([^"']*)["']/i);
      if (nameM?.[1]) fields[nameM[1]] = valM?.[1] ?? '';
    }
    return fields;
  } catch {
    return {};
  }
}

// ── 블로그 포스팅 ─────────────────────────────────────────────────────────────

export async function postToNaverBlog(params: NaverPostParams): Promise<NaverPostResult> {
  const { blogId, nidAut, nidSes, title, content, tags, categoryNo, isPublish } = params;
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const cookie = `NID_AUT=${nidAut}; NID_SES=${nidSes}`;
  const errors: string[] = [];

  // ── Step 1: PostWriteFormsave.naver (CSRF 토큰 포함) ─────────────────────
  try {
    const hiddenFields = await getWriteFormHidden(blogId, cookie, ua);
    const form = new URLSearchParams({
      ...hiddenFields,
      blogId, title,
      body: content,
      tag: tags.slice(0, 30).join(','),
      categoryNo: String(categoryNo),
      isPublish: isPublish ? '1' : '0',
      publishType: isPublish ? 'A' : 'B',
      postWriteRootPath: 'BLOG',
      logNo: '0',
      postWriteFormType: 'default',
    });
    const res = await fetch('https://blog.naver.com/PostWriteFormsave.naver', {
      method: 'POST',
      headers: {
        Cookie: cookie, 'User-Agent': ua,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `https://blog.naver.com/PostWriteForm.naver?blogId=${blogId}`,
        Origin: 'https://blog.naver.com',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      body: form.toString(),
      redirect: 'follow',
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) {
      return { error: `인증 실패 (${res.status}) - 쿠키를 새로 발급해 주세요.`, errorCode: 'AUTH' };
    }
    if (res.ok) {
      const finalUrl = res.url || '';
      const bodyText = await res.text().catch(() => '');
      const m = finalUrl.match(/logNo=(\d+)/) || finalUrl.match(/\/(\d{5,})(?:[^/?#]|$)/);
      if (m?.[1]) return { postId: m[1], postUrl: `https://blog.naver.com/${blogId}/${m[1]}` };
      const bm = bodyText.match(/logNo[=:]["'\s]*(\d{5,})/) ||
                 bodyText.match(/"(?:logNo|postNo)"\s*:\s*"?(\d{5,})"?/);
      if (bm?.[1]) return { postId: bm[1], postUrl: `https://blog.naver.com/${blogId}/${bm[1]}` };
      errors.push(`Formsave ok | url:${finalUrl.slice(0, 120)} | body:${bodyText.slice(0, 200)}`);
    } else {
      const t = await res.text().catch(() => '');
      errors.push(`Formsave ${res.status}: ${t.slice(0, 150)}`);
    }
  } catch (e) {
    errors.push(`Formsave network: ${String(e)}`);
  }

  // ── Step 2: REST API JSON ─────────────────────────────────────────────────
  const jsonHeaders = {
    Cookie: cookie,
    'Content-Type': 'application/json;charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': ua,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    Referer: `https://blog.naver.com/${blogId}`,
    Origin: 'https://blog.naver.com',
  };
  for (const url of [
    `https://blog.naver.com/api/v1/blogs/${blogId}/posts`,
    `https://blog.naver.com/api/v2/blogs/${blogId}/posts`,
    `https://m.blog.naver.com/api/v1/blogs/${blogId}/posts`,
  ]) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ title, contents: content, tags: tags.slice(0, 30), isPublish, categoryNo, isOpen: true }),
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        const postId = String(data.logNo ?? data.postId ?? data.id ?? data.no ?? '');
        return { postId, postUrl: postId ? `https://blog.naver.com/${blogId}/${postId}` : `https://blog.naver.com/${blogId}` };
      }
      if (res.status === 401 || res.status === 403) return { error: `인증 실패 (${res.status})`, errorCode: 'AUTH' };
      if (res.status === 429) return { error: '요청 횟수 초과', errorCode: 'RATE_LIMIT' };
      const t = await res.text().catch(() => '');
      errors.push(`REST ${res.status} ${url.split('naver.com')[1]}: ${t.slice(0, 100)}`);
    } catch (e) {
      errors.push(`REST network: ${String(e)}`);
    }
  }

  // ── Step 3: BlogPost.naver (구형) ─────────────────────────────────────────
  try {
    const form = new URLSearchParams({
      action: 'write', blogId, title, body: content,
      tag: tags.slice(0, 30).join(','),
      categoryNo: String(categoryNo),
      isPublish: isPublish ? 'Y' : 'N',
      publishType: isPublish ? 'A' : 'B',
      postNo: '0',
    });
    const res = await fetch('https://blog.naver.com/BlogPost.naver', {
      method: 'POST',
      headers: { Cookie: cookie, 'User-Agent': ua, 'Content-Type': 'application/x-www-form-urlencoded', Referer: `https://blog.naver.com/${blogId}` },
      body: form.toString(), redirect: 'follow', cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) return { error: `인증 실패 (${res.status})`, errorCode: 'AUTH' };
    if (res.ok) {
      const finalUrl = res.url || '';
      const m = finalUrl.match(/logNo=(\d+)/) || finalUrl.match(/\/(\d{5,})(?:[^/?#]|$)/);
      if (m?.[1]) return { postId: m[1], postUrl: `https://blog.naver.com/${blogId}/${m[1]}` };
      const t = await res.text().catch(() => '');
      errors.push(`BlogPost ok | url:${finalUrl.slice(0, 100)} | body:${t.slice(0, 100)}`);
    } else {
      const t = await res.text().catch(() => '');
      errors.push(`BlogPost ${res.status}: ${t.slice(0, 100)}`);
    }
  } catch (e) {
    errors.push(`BlogPost network: ${String(e)}`);
  }

  return { error: `발행 실패: ${errors.join(' || ')}`, errorCode: 'UNKNOWN' };
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
