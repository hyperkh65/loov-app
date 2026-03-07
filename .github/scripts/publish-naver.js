/**
 * GitHub Actions 환경에서 실행 - Vercel 서버 IP 차단 우회
 * Node.js 20 native fetch 사용 (설치 불필요)
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const JOB_ID = process.env.JOB_ID;

// ── Supabase REST API 헬퍼 ─────────────────────────────────────────────────

async function sbGet(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${table}: ${res.status}`);
  return res.json();
}

async function sbPatch(table, query, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`sbPatch ${table}: ${res.status} ${t}`);
  }
}

async function sbInsert(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    console.warn(`sbInsert ${table} failed: ${res.status} ${t}`);
  }
}

// ── 네이버 블로그 발행 ────────────────────────────────────────────────────────

// PostWriteForm에서 hidden 필드(CSRF 토큰 등) 추출
async function getWriteFormFields(blogId, cookie, ua) {
  try {
    const res = await fetch(`https://blog.naver.com/PostWriteForm.naver?blogId=${blogId}`, {
      headers: { Cookie: cookie, 'User-Agent': ua, 'Accept-Language': 'ko-KR,ko;q=0.9' },
      redirect: 'follow',
    });
    if (!res.ok) { console.warn(`[Naver] PostWriteForm ${res.status}`); return {}; }
    const html = await res.text();
    const fields = {};
    // hidden input 필드 전체 추출
    for (const m of html.matchAll(/<input[^>]+type=["']hidden["'][^>]*>/gi)) {
      const nameM = m[0].match(/name=["']([^"']+)["']/i);
      const valM  = m[0].match(/value=["']([^"']*)["']/i);
      if (nameM) fields[nameM[1]] = valM ? valM[1] : '';
    }
    console.log(`[Naver] WriteForm hidden fields: ${Object.keys(fields).join(', ')}`);
    return fields;
  } catch (e) {
    console.warn(`[Naver] getWriteFormFields error: ${e.message}`);
    return {};
  }
}

async function publishToNaver({ blogId, nidAut, nidSes, title, content, tags, categoryNo, isPublish }) {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const cookie = `NID_AUT=${nidAut}; NID_SES=${nidSes}`;
  const errors = [];

  console.log(`[Naver] Publishing: "${title}" → blog.naver.com/${blogId}`);

  // ── Step 1: PostWriteFormsave.naver (CSRF 토큰 포함) ─────────────────────
  try {
    const hiddenFields = await getWriteFormFields(blogId, cookie, ua);
    const form = new URLSearchParams({
      ...hiddenFields,           // CSRF 토큰 등 hidden 필드 포함
      blogId,
      title,
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
      },
      body: form.toString(),
      redirect: 'follow',
    });
    console.log(`[Naver] PostWriteFormsave status: ${res.status}, url: ${res.url}`);
    if (res.status === 401 || res.status === 403) {
      return { error: `인증 실패 (${res.status}) - 쿠키 갱신 필요`, errorCode: 'AUTH' };
    }
    if (res.ok) {
      const finalUrl = res.url || '';
      const bodyText = await res.text().catch(() => '');
      console.log(`[Naver] PostWriteFormsave response url: ${finalUrl}`);
      console.log(`[Naver] PostWriteFormsave body (first 300): ${bodyText.slice(0, 300)}`);
      const m = finalUrl.match(/logNo=(\d+)/) || finalUrl.match(/\/(\d{5,})(?:[^/?#]|$)/);
      if (m?.[1]) {
        console.log(`[Naver] Success via PostWriteFormsave: ${m[1]}`);
        return { postId: m[1], postUrl: `https://blog.naver.com/${blogId}/${m[1]}` };
      }
      // body에서 postId 탐색
      const bm = bodyText.match(/logNo[=:]["'\s]*(\d{5,})/) ||
                 bodyText.match(/"(?:logNo|postNo|postId)"\s*:\s*"?(\d{5,})"?/);
      if (bm?.[1]) {
        return { postId: bm[1], postUrl: `https://blog.naver.com/${blogId}/${bm[1]}` };
      }
      errors.push(`PostWriteFormsave ok | url:${finalUrl.slice(0, 100)} | body:${bodyText.slice(0, 200)}`);
    } else {
      const t = await res.text().catch(() => '');
      errors.push(`PostWriteFormsave ${res.status}: ${t.slice(0, 150)}`);
    }
  } catch (e) {
    errors.push(`PostWriteFormsave network: ${e.message}`);
  }

  // ── Step 2: REST API (JSON) ───────────────────────────────────────────────
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
  const endpoints = [
    `https://blog.naver.com/api/v1/blogs/${blogId}/posts`,
    `https://blog.naver.com/api/v2/blogs/${blogId}/posts`,
    `https://blog.naver.com/api/blogs/${blogId}/posts`,
    `https://m.blog.naver.com/api/v1/blogs/${blogId}/posts`,
  ];
  const bodyVariants = [
    { title, contents: content, tags: tags.slice(0, 30), isPublish, categoryNo, isOpen: true },
    { title, body: content, tags: tags.slice(0, 30), isPublish, categoryNo },
  ];

  for (const url of endpoints) {
    for (const bodyObj of bodyVariants) {
      try {
        const res = await fetch(url, {
          method: 'POST', headers: jsonHeaders,
          body: JSON.stringify(bodyObj),
        });
        if (res.ok) {
          const data = await res.json();
          const postId = String(data.logNo ?? data.postId ?? data.id ?? data.no ?? '');
          console.log(`[Naver] Success via REST API: ${url}`);
          return { postId, postUrl: postId ? `https://blog.naver.com/${blogId}/${postId}` : `https://blog.naver.com/${blogId}` };
        }
        if (res.status === 401 || res.status === 403) {
          return { error: `인증 실패 (${res.status})`, errorCode: 'AUTH' };
        }
        if (res.status === 429) {
          return { error: '요청 횟수 초과 (429)', errorCode: 'RATE_LIMIT' };
        }
        // 404 포함 모든 실패 로깅
        const t = await res.text().catch(() => '');
        errors.push(`REST ${res.status} ${url.split('blog.naver.com')[1] ?? url}: ${t.slice(0, 80)}`);
      } catch (e) {
        errors.push(`REST network ${url.split('/').pop()}: ${e.message}`);
      }
      break; // 같은 endpoint에서 첫 번째 body variant만 시도
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
      headers: {
        Cookie: cookie, 'User-Agent': ua,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `https://blog.naver.com/${blogId}`,
      },
      body: form.toString(), redirect: 'follow',
    });
    console.log(`[Naver] BlogPost.naver status: ${res.status}, url: ${res.url}`);
    if (res.ok) {
      const finalUrl = res.url || '';
      const m = finalUrl.match(/logNo=(\d+)/) || finalUrl.match(/\/(\d{5,})(?:[^/?#]|$)/);
      if (m?.[1]) {
        console.log(`[Naver] Success via BlogPost.naver: ${m[1]}`);
        return { postId: m[1], postUrl: `https://blog.naver.com/${blogId}/${m[1]}` };
      }
      const bodyText = await res.text().catch(() => '');
      errors.push(`BlogPost.naver ok | url:${finalUrl.slice(0, 100)} | body:${bodyText.slice(0, 150)}`);
    } else {
      const t = await res.text().catch(() => '');
      errors.push(`BlogPost.naver ${res.status}: ${t.slice(0, 100)}`);
    }
  } catch (e) {
    errors.push(`BlogPost.naver network: ${e.message}`);
  }

  const errSummary = errors.join(' || ');
  console.error(`[Naver] All methods failed:\n${errors.map((e, i) => `  ${i+1}. ${e}`).join('\n')}`);
  return { error: `발행 실패: ${errSummary}`, errorCode: 'UNKNOWN' };
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!JOB_ID) { console.error('JOB_ID not set'); process.exit(1); }
  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Supabase env not set'); process.exit(1); }

  console.log(`[Job] Processing: ${JOB_ID}`);

  // 1. 작업 조회
  const jobs = await sbGet('naver_publish_jobs', `id=eq.${JOB_ID}&select=*`);
  const job = jobs[0];
  if (!job) { console.error('Job not found'); process.exit(1); }

  // 2. processing 상태 업데이트
  await sbPatch('naver_publish_jobs', `id=eq.${JOB_ID}`, { status: 'processing' });

  // 3. 네이버 연결 정보 (쿠키) 조회
  const conns = await sbGet('naver_connections', `user_id=eq.${job.user_id}&select=*`);
  const conn = conns[0];
  if (!conn?.nid_aut || !conn?.nid_ses) {
    await sbPatch('naver_publish_jobs', `id=eq.${JOB_ID}`, {
      status: 'failed', error_message: '네이버 쿠키 없음', completed_at: new Date().toISOString(),
    });
    console.error('No Naver cookies'); process.exit(1);
  }

  // 4. 발행 실행
  const result = await publishToNaver({
    blogId: conn.blog_id,
    nidAut: conn.nid_aut,
    nidSes: conn.nid_ses,
    title: job.title,
    content: job.content,
    tags: job.tags || [],
    categoryNo: job.category_no || 0,
    isPublish: job.is_publish !== false,
  });

  // 5. 결과 저장
  const isSuccess = !result.error;
  await sbPatch('naver_publish_jobs', `id=eq.${JOB_ID}`, {
    status: isSuccess ? 'completed' : 'failed',
    post_id: result.postId || null,
    post_url: result.postUrl || null,
    error_message: result.error || null,
    completed_at: new Date().toISOString(),
  });

  // 6. 히스토리 저장 (성공 시)
  if (isSuccess) {
    await sbInsert('naver_publish_history', {
      user_id: job.user_id,
      blog_id: conn.blog_id,
      post_id: result.postId || '',
      post_url: result.postUrl || '',
      title: job.title,
      notion_page_id: job.notion_page_id || '',
      status: 'publish',
    });
  }

  console.log(isSuccess ? `✅ Success: ${result.postUrl}` : `❌ Failed: ${result.error}`);
  process.exit(isSuccess ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
