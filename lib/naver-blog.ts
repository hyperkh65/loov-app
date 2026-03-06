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

// ── 카테고리 조회 ─────────────────────────────────────────────────────────────

export async function getNaverCategories(
  blogId: string, nidAut: string, nidSes: string
): Promise<{ categories?: NaverCategory[]; error?: string }> {
  try {
    // Method 1: JSON API
    const res1 = await fetch(`https://blog.naver.com/api/blogs/${blogId}/categories`, {
      headers: buildHeaders(nidAut, nidSes, blogId),
      cache: 'no-store',
    });
    if (res1.ok) {
      const data = await res1.json() as unknown;
      const items = (Array.isArray(data) ? data : (data as Record<string, unknown>)?.categories) as Record<string, unknown>[] | undefined;
      if (Array.isArray(items)) {
        return {
          categories: items.map((c) => ({
            no: Number(c.categoryNo ?? c.no ?? 0),
            name: String(c.categoryName ?? c.name ?? ''),
            postCount: Number(c.postCount ?? 0),
          })),
        };
      }
    }

    // Method 2: XML API (legacy)
    const res2 = await fetch(`https://blog.naver.com/CategoryList.naver?blogId=${blogId}`, {
      headers: buildHeaders(nidAut, nidSes, blogId, { Accept: 'text/xml, */*' }),
      cache: 'no-store',
    });
    if (res2.ok) {
      const xml = await res2.text();
      const categories: NaverCategory[] = [];
      const matches = xml.matchAll(/<category[^>]*categoryNo="(\d+)"[^>]*>([\s\S]*?)<\/category>/gi);
      for (const m of matches) {
        const nameMatch = m[2].match(/<name>(.*?)<\/name>/i);
        if (nameMatch) {
          categories.push({ no: parseInt(m[1]), name: nameMatch[1] });
        }
      }
      if (categories.length > 0) return { categories };
    }

    // 실패시 빈 배열 반환 (카테고리 없이도 발행 가능)
    return { categories: [] };
  } catch (e) {
    return { categories: [], error: '카테고리 로드 실패: ' + String(e) };
  }
}

// ── 블로그 포스팅 ─────────────────────────────────────────────────────────────

export async function postToNaverBlog(params: NaverPostParams): Promise<NaverPostResult> {
  const { blogId, nidAut, nidSes, title, content, tags, categoryNo, isPublish } = params;
  const headers = buildHeaders(nidAut, nidSes, blogId, {
    'Content-Type': 'application/json;charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
  });

  const body = JSON.stringify({
    title,
    body: content,
    tags: tags.slice(0, 30).join(','), // 네이버 태그 최대 30개
    isPublish,
    categoryNo,
    addContents: [],
    publishedAt: isPublish ? null : undefined,
  });

  // ── 시도 1: 최신 내부 REST API ──────────────────────────────────────────
  try {
    const res = await fetch(`https://blog.naver.com/api/blogs/${blogId}/posts`, {
      method: 'POST',
      headers,
      body,
    });

    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      const postId = String(data.logNo ?? data.postId ?? data.id ?? '');
      return {
        postId,
        postUrl: postId ? `https://blog.naver.com/${blogId}/${postId}` : `https://blog.naver.com/${blogId}`,
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        error: `쿠키 만료 또는 인증 실패 (${res.status}). 브라우저에서 새 쿠키를 복사해 주세요.`,
        errorCode: 'AUTH',
      };
    }

    if (res.status === 429) {
      return { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', errorCode: 'RATE_LIMIT' };
    }

    const errText = await res.text().catch(() => '');
    // 다른 방법 시도
    console.warn(`[Naver] Method1 failed (${res.status}):`, errText.slice(0, 200));
  } catch (e) {
    console.warn('[Naver] Method1 network error:', e);
  }

  // ── 시도 2: mobile API ───────────────────────────────────────────────────
  try {
    const mobileHeaders = {
      ...headers,
      Referer: `https://m.blog.naver.com/${blogId}`,
      Origin: 'https://m.blog.naver.com',
    };
    const res = await fetch(`https://m.blog.naver.com/api/blogs/${blogId}/posts`, {
      method: 'POST',
      headers: mobileHeaders,
      body,
    });

    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      const postId = String(data.logNo ?? data.postId ?? data.id ?? '');
      return {
        postId,
        postUrl: postId ? `https://blog.naver.com/${blogId}/${postId}` : `https://blog.naver.com/${blogId}`,
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        error: `쿠키 만료 또는 인증 실패. 브라우저에서 새 쿠키를 복사해 주세요.`,
        errorCode: 'AUTH',
      };
    }

    const errText = await res.text().catch(() => '');
    console.warn(`[Naver] Method2 failed (${res.status}):`, errText.slice(0, 200));
  } catch (e) {
    console.warn('[Naver] Method2 network error:', e);
  }

  // ── 시도 3: form-based legacy API ───────────────────────────────────────
  try {
    const formData = new URLSearchParams({
      blog_id: blogId,
      title,
      body: content,
      tag: tags.join(','),
      categoryNo: String(categoryNo),
      publishType: isPublish ? 'publish' : 'draft',
    });

    const res = await fetch('https://blog.naver.com/PostWriteFormsave.naver', {
      method: 'POST',
      headers: {
        ...buildHeaders(nidAut, nidSes, blogId),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (res.ok || res.redirected) {
      // 폼 기반 API는 성공시 리다이렉트
      const url = res.url || '';
      const match = url.match(/\/(\d+)(?:\?|$)/);
      const postId = match?.[1] || '';
      return {
        postId,
        postUrl: postId ? `https://blog.naver.com/${blogId}/${postId}` : `https://blog.naver.com/${blogId}`,
      };
    }
  } catch (e) {
    console.warn('[Naver] Method3 network error:', e);
  }

  return {
    error: '모든 발행 방법이 실패했습니다. 쿠키를 갱신하거나 잠시 후 다시 시도해주세요.',
    errorCode: 'UNKNOWN',
  };
}
