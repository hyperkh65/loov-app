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
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const cookie = `NID_AUT=${nidAut}; NID_SES=${nidSes}`;
  const errors: string[] = [];

  // ── Step -1: /blog/writePost 엔드포인트 (신규 발견) ──────────────────────
  for (const baseUrl of [
    'https://blog.naver.com/blog/writePost',
    'https://apis.naver.com/blog/writePost',
    'https://blog.naver.com/BlogWritePost.naver',
  ]) {
    try {
      const form = new URLSearchParams({
        blogId,
        title,
        body: content,
        contents: content,
        tag: tags.slice(0, 30).join(','),
        categoryNo: String(categoryNo),
        isPublish: isPublish ? 'true' : 'false',
        publishType: isPublish ? 'A' : 'B',
      });
      // redirect:follow 로 최종 URL 확인 (Edge Runtime에서 manual 시 location 헤더 차단됨)
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': ua,
          Referer: `https://blog.naver.com/${blogId}`,
          Origin: 'https://blog.naver.com',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: form.toString(),
        redirect: 'follow',
        cache: 'no-store',
      });

      if (res.status === 401 || res.status === 403) {
        return { error: `인증 실패 (${res.status}) - 쿠키를 새로 발급해 주세요.`, errorCode: 'AUTH' };
      }
      if (res.ok) {
        // 최종 URL (리다이렉트 후) 에서 postId 추출
        const finalUrl = res.url || '';
        const mu = finalUrl.match(/logNo=(\d+)/) || finalUrl.match(/\/(\d{5,})(?:[^/]|$)/);
        if (mu?.[1]) {
          return { postId: mu[1], postUrl: `https://blog.naver.com/${blogId}/${mu[1]}` };
        }
        // JSON body에서 postId 시도
        try {
          const data = await res.clone().json() as Record<string, unknown>;
          const pid = String(data.logNo ?? data.postId ?? data.id ?? '');
          if (pid && /^\d+$/.test(pid)) {
            return { postId: pid, postUrl: `https://blog.naver.com/${blogId}/${pid}` };
          }
        } catch { /* JSON 아님 */ }
        errors.push(`writePost ok but no postId (finalUrl: ${finalUrl.slice(0, 100)})`);
      } else if (res.status !== 404) {
        const t = await res.text().catch(() => '');
        errors.push(`writePost ${res.status}: ${t.slice(0, 100)}`);
      }
    } catch (e) {
      // 계속
    }
  }

  // ── Step 0: 블로그 메인 페이지에서 blogNo 추출 ────────────────────────────
  let blogNo = blogId;
  try {
    const pageRes = await fetch(`https://blog.naver.com/${blogId}`, {
      headers: { 'User-Agent': ua, Cookie: cookie },
      cache: 'no-store',
    });
    const html = await pageRes.text();
    const m = html.match(/"blogNo"\s*:\s*"?(\d+)"?/) ||
              html.match(/blogNo[=:]["'\s]*(\d+)/) ||
              html.match(/blog_no["'\s:=]+(\d+)/i);
    if (m?.[1]) blogNo = m[1];
  } catch (e) {
    console.warn('[Naver] blogNo fetch failed:', e);
  }

  const jsonHeaders = {
    Cookie: cookie,
    'Content-Type': 'application/json;charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': ua,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'ko-KR,ko;q=0.9',
  };

  // ── Step 1: REST API (v1/v2, blogId + blogNo 모두 시도) ───────────────────
  const endpoints = [
    `https://blog.naver.com/api/v1/blogs/${blogId}/posts`,
    `https://blog.naver.com/api/v1/blogs/${blogNo}/posts`,
    `https://blog.naver.com/api/v2/blogs/${blogId}/posts`,
    `https://blog.naver.com/api/blogs/${blogId}/posts`,
    `https://m.blog.naver.com/api/v1/blogs/${blogId}/posts`,
    `https://m.blog.naver.com/api/blogs/${blogId}/posts`,
  ].filter((v, i, arr) => arr.indexOf(v) === i); // 중복 제거

  const bodyVariants = [
    JSON.stringify({ title, contents: content, tags: tags.slice(0, 30), isPublish, categoryNo, isOpen: true }),
    JSON.stringify({ title, body: content, tags: tags.slice(0, 30), isPublish, categoryNo }),
    JSON.stringify({ title, content, tags: tags.slice(0, 30).join(','), isPublish, categoryNo }),
  ];

  for (const url of endpoints) {
    for (const bodyStr of bodyVariants) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { ...jsonHeaders, Referer: `https://blog.naver.com/${blogId}`, Origin: 'https://blog.naver.com' },
          body: bodyStr,
          cache: 'no-store',
        });

        if (res.ok) {
          const data = await res.json() as Record<string, unknown>;
          const postId = String(data.logNo ?? data.postId ?? data.id ?? data.no ?? '');
          return {
            postId,
            postUrl: postId ? `https://blog.naver.com/${blogId}/${postId}` : `https://blog.naver.com/${blogId}`,
          };
        }
        if (res.status === 401 || res.status === 403) {
          return { error: `인증 실패 (${res.status}) - 쿠키를 새로 발급해 주세요.`, errorCode: 'AUTH' };
        }
        if (res.status === 429) {
          return { error: '요청 횟수 초과 (429). 잠시 후 재시도하세요.', errorCode: 'RATE_LIMIT' };
        }
        if (res.status !== 404) {
          // 404 아닌 실제 오류는 기록
          const t = await res.text().catch(() => '');
          errors.push(`${url.split('/api')[1] ?? url} ${res.status}: ${t.slice(0, 80)}`);
        }
      } catch (e) {
        // 네트워크 오류는 계속 진행
      }
    }
  }

  // ── Step 2: BlogPost.naver (구형 API) ────────────────────────────────────
  try {
    const form = new URLSearchParams({
      action: 'write',
      blogId,
      title,
      body: content,
      tag: tags.slice(0, 30).join(','),
      categoryNo: String(categoryNo),
      isPublish: isPublish ? 'Y' : 'N',
      publishType: isPublish ? 'A' : 'B',
      postNo: '0',
    });
    const res = await fetch('https://blog.naver.com/BlogPost.naver', {
      method: 'POST',
      headers: {
        Cookie: cookie, 'User-Agent': ua,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `https://blog.naver.com/${blogId}`,
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
      const m = finalUrl.match(/logNo=(\d+)/) || finalUrl.match(/\/(\d{5,})(?:[^/]|$)/);
      const postId = m?.[1] || '';
      if (postId) return { postId, postUrl: `https://blog.naver.com/${blogId}/${postId}` };
      errors.push(`BlogPost.naver ok no postId (${finalUrl.slice(0, 80)})`);
    } else if (res.status !== 404) {
      const t = await res.text().catch(() => '');
      errors.push(`BlogPost.naver ${res.status}: ${t.slice(0, 80)}`);
    }
  } catch (e) {
    errors.push(`BlogPost.naver 네트워크 오류`);
  }

  // ── Step 3: PostWriteFormsave.naver ──────────────────────────────────────
  try {
    const form = new URLSearchParams({
      blogId, title, body: content,
      tag: tags.join(','),
      categoryNo: String(categoryNo),
      isPublish: isPublish ? '1' : '0',
      postWriteRootPath: 'BLOG',
      logNo: '0',
    });
    const res = await fetch('https://blog.naver.com/PostWriteFormsave.naver', {
      method: 'POST',
      headers: {
        Cookie: cookie, 'User-Agent': ua,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `https://blog.naver.com/PostWriteForm.naver?blogId=${blogId}`,
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
      const m = finalUrl.match(/logNo=(\d+)/) || finalUrl.match(/\/(\d{5,})(?:[^/]|$)/);
      const postId = m?.[1] || '';
      if (postId) return { postId, postUrl: `https://blog.naver.com/${blogId}/${postId}` };
      errors.push(`PostWriteFormsave ok no postId (${finalUrl.slice(0, 80)})`);
    } else if (res.status !== 404) {
      const t = await res.text().catch(() => '');
      errors.push(`PostWriteFormsave ${res.status}: ${t.slice(0, 80)}`);
    }
  } catch (e) {
    errors.push(`PostWriteFormsave 네트워크 오류`);
  }

  const errSummary = errors.length > 0 ? errors.slice(0, 3).join(' | ') : '모든 API가 404 반환 (Naver 서버에서 외부 IP 차단 가능성)';
  return { error: `발행 실패: ${errSummary}`, errorCode: 'UNKNOWN' };
}
