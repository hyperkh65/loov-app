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

// ── 블로그 포스팅 ─────────────────────────────────────────────────────────────

export async function postToNaverBlog(params: NaverPostParams): Promise<NaverPostResult> {
  const { blogId, nidAut, nidSes, title, content, tags, categoryNo, isPublish } = params;
  const headers = buildHeaders(nidAut, nidSes, blogId, {
    'Content-Type': 'application/json;charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
  });

  // ── 시도 1: REST API (contents 필드) ────────────────────────────────────
  const errors: string[] = [];

  for (const [url, origin] of [
    [`https://blog.naver.com/api/blogs/${blogId}/posts`, 'https://blog.naver.com'],
    [`https://m.blog.naver.com/api/blogs/${blogId}/posts`, 'https://m.blog.naver.com'],
  ] as [string, string][]) {
    for (const bodyVariant of [
      // variant A: contents 필드 (SmartEditor ONE)
      JSON.stringify({
        title,
        contents: content,
        tags: tags.slice(0, 30),
        isPublish,
        categoryNo,
        isOpen: true,
        addContents: [],
      }),
      // variant B: body 필드 (구버전)
      JSON.stringify({
        title,
        body: content,
        tags: tags.slice(0, 30).join(','),
        isPublish,
        categoryNo,
        addContents: [],
      }),
    ]) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { ...headers, Referer: `${origin}/${blogId}`, Origin: origin },
          body: bodyVariant,
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
            error: `쿠키 만료 또는 인증 실패 (${res.status}). 설정 탭에서 NID_AUT, NID_SES를 새로 입력해 주세요.`,
            errorCode: 'AUTH',
          };
        }

        if (res.status === 429) {
          return { error: '요청 횟수 초과 (429). 잠시 후 다시 시도해주세요.', errorCode: 'RATE_LIMIT' };
        }

        const errText = await res.text().catch(() => '');
        const msg = `${url.includes('m.blog') ? '[mobile]' : '[pc]'} ${res.status}: ${errText.slice(0, 120)}`;
        errors.push(msg);
        console.warn('[Naver]', msg);
      } catch (e) {
        errors.push(`네트워크 오류: ${String(e).slice(0, 80)}`);
      }
    }
  }

  // ── 시도 2: form-based legacy (PostWriteFormsave) ────────────────────────
  try {
    const formData = new URLSearchParams({
      blogId,
      title,
      body: content,
      tag: tags.join(','),
      categoryNo: String(categoryNo),
      isPublish: isPublish ? '1' : '0',
      postWriteRootPath: 'BLOG',
    });

    const res = await fetch('https://blog.naver.com/PostWriteFormsave.naver', {
      method: 'POST',
      headers: {
        ...buildHeaders(nidAut, nidSes, blogId),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
      redirect: 'manual',
    });

    if (res.ok || res.status === 302 || res.status === 301) {
      const location = res.headers.get('location') || res.url || '';
      const match = location.match(/\/(\d{5,})/);
      const postId = match?.[1] || '';
      return {
        postId,
        postUrl: postId ? `https://blog.naver.com/${blogId}/${postId}` : `https://blog.naver.com/${blogId}`,
      };
    }
    const errText = await res.text().catch(() => '');
    errors.push(`[form] ${res.status}: ${errText.slice(0, 120)}`);
  } catch (e) {
    errors.push(`[form] 네트워크 오류: ${String(e).slice(0, 80)}`);
  }

  return {
    error: `발행 실패. 상세: ${errors.slice(0, 2).join(' / ')}`,
    errorCode: 'UNKNOWN',
  };
}
