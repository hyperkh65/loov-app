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

async function publishToNaver({ blogId, nidAut, nidSes, title, content, tags, categoryNo, isPublish }) {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const cookie = `NID_AUT=${nidAut}; NID_SES=${nidSes}`;
  const errors = [];

  console.log(`[Naver] Publishing: "${title}" → blog.naver.com/${blogId}`);

  // ── Step 1: writePost 엔드포인트 시도 ──────────────────────────────────────
  for (const baseUrl of [
    'https://blog.naver.com/blog/writePost',
    'https://apis.naver.com/blog/writePost',
    'https://blog.naver.com/BlogWritePost.naver',
  ]) {
    try {
      const form = new URLSearchParams({
        blogId, title, body: content, contents: content,
        tag: tags.slice(0, 30).join(','),
        categoryNo: String(categoryNo),
        isPublish: isPublish ? 'true' : 'false',
        publishType: isPublish ? 'A' : 'B',
      });
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
      });
      if (res.status === 401 || res.status === 403) {
        return { error: `인증 실패 (${res.status}) - 쿠키 갱신 필요`, errorCode: 'AUTH' };
      }
      if (res.ok) {
        const finalUrl = res.url || '';
        const mu = finalUrl.match(/logNo=(\d+)/) || finalUrl.match(/\/(\d{5,})(?:[^/]|$)/);
        if (mu?.[1]) {
          console.log(`[Naver] Success via writePost: ${mu[1]}`);
          return { postId: mu[1], postUrl: `https://blog.naver.com/${blogId}/${mu[1]}` };
        }
        const bodyText = await res.text().catch(() => '');
        try {
          const data = JSON.parse(bodyText);
          const nested = data.result ?? data.data ?? data.post ?? data;
          const pid = String(
            nested.logNo ?? nested.postNo ?? nested.postId ?? nested.id ??
            data.logNo ?? data.postNo ?? data.postId ?? data.id ?? ''
          );
          if (pid && /^\d+$/.test(pid)) {
            console.log(`[Naver] Success via writePost body JSON: ${pid}`);
            return { postId: pid, postUrl: `https://blog.naver.com/${blogId}/${pid}` };
          }
        } catch { }
        const bm = bodyText.match(/"(?:logNo|postNo|postId|id)"\s*:\s*"?(\d{5,})"?/);
        if (bm?.[1]) {
          return { postId: bm[1], postUrl: `https://blog.naver.com/${blogId}/${bm[1]}` };
        }
        errors.push(`writePost(${baseUrl.split('/').pop()}) ok but no postId | ${bodyText.slice(0, 200)}`);
      } else if (res.status !== 404) {
        const t = await res.text().catch(() => '');
        errors.push(`writePost ${res.status}: ${t.slice(0, 100)}`);
      }
    } catch (e) {
      errors.push(`writePost network: ${e.message}`);
    }
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
    { title, content, tags: tags.slice(0, 30).join(','), isPublish, categoryNo },
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
        if (res.status !== 404) {
          const t = await res.text().catch(() => '');
          errors.push(`REST ${res.status} ${url.split('/api')[1]}: ${t.slice(0, 80)}`);
        }
      } catch (e) { }
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
    if (res.ok) {
      const finalUrl = res.url || '';
      const m = finalUrl.match(/logNo=(\d+)/) || finalUrl.match(/\/(\d{5,})(?:[^/]|$)/);
      if (m?.[1]) {
        console.log(`[Naver] Success via BlogPost.naver: ${m[1]}`);
        return { postId: m[1], postUrl: `https://blog.naver.com/${blogId}/${m[1]}` };
      }
      errors.push(`BlogPost.naver ok no postId (${finalUrl.slice(0, 80)})`);
    }
  } catch (e) {
    errors.push(`BlogPost.naver network: ${e.message}`);
  }

  // ── Step 4: PostWriteFormsave.naver ──────────────────────────────────────
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
      body: form.toString(), redirect: 'follow',
    });
    if (res.ok) {
      const finalUrl = res.url || '';
      const m = finalUrl.match(/logNo=(\d+)/) || finalUrl.match(/\/(\d{5,})(?:[^/]|$)/);
      if (m?.[1]) {
        console.log(`[Naver] Success via PostWriteFormsave: ${m[1]}`);
        return { postId: m[1], postUrl: `https://blog.naver.com/${blogId}/${m[1]}` };
      }
      errors.push(`PostWriteFormsave ok no postId (${finalUrl.slice(0, 80)})`);
    }
  } catch (e) {
    errors.push(`PostWriteFormsave network: ${e.message}`);
  }

  const errSummary = errors.length > 0 ? errors.slice(0, 3).join(' | ') : '모든 엔드포인트 차단됨';
  console.error(`[Naver] All methods failed: ${errSummary}`);
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
