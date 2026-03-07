/**
 * GitHub Actions 환경에서 Playwright로 네이버 블로그 발행
 * - 실제 브라우저 사용 → IP 차단 완전 우회
 * - 쿠키(NID_AUT, NID_SES)로 로그인 상태 복원
 */

const { chromium } = require('playwright');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const JOB_ID = process.env.JOB_ID;

// ── Supabase REST API ──────────────────────────────────────────────────────────

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
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`sbPatch: ${res.status} ${t}`); }
}

async function sbInsert(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.warn(`sbInsert ${table} failed: ${res.status}`);
}

// ── Playwright로 네이버 블로그 발행 ───────────────────────────────────────────

async function publishWithPlaywright({ blogId, nidAut, nidSes, title, content, tags, categoryNo, isPublish }) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
    });

    // 네이버 로그인 쿠키 설정
    await context.addCookies([
      { name: 'NID_AUT', value: nidAut, domain: '.naver.com', path: '/' },
      { name: 'NID_SES', value: nidSes, domain: '.naver.com', path: '/' },
    ]);

    const page = await context.newPage();

    // 1. 네이버 메인 먼저 방문 (쿠키 적용 확인)
    console.log(`[Playwright] Visiting naver.com to apply cookies...`);
    await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const naverTitle = await page.title();
    console.log(`[Playwright] Naver main title: ${naverTitle}`);

    // 로그인 상태 확인
    const isLoggedIn = await page.evaluate(() => {
      const el = document.querySelector('.MyView-module__link_login___HpHMW, .link_login, [class*="login"]');
      const nickEl = document.querySelector('.MyView-module__text_nick___WQbe6, .nick, [class*="nick"]');
      return { hasLoginLink: !!el, hasNick: !!nickEl, bodyText: document.body.innerText.slice(0, 200) };
    });
    console.log(`[Playwright] Login status:`, JSON.stringify(isLoggedIn));

    // 2. 네이버 블로그 글쓰기 페이지 이동
    console.log(`[Playwright] Navigating to write form...`);
    await page.goto(`https://blog.naver.com/PostWriteForm.naver?blogId=${blogId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // 정확한 URL 로깅
    const currentUrl = page.url();
    const pageTitle = await page.title();
    console.log(`[Playwright] After navigation URL: ${currentUrl}`);
    console.log(`[Playwright] After navigation Title: ${pageTitle}`);

    if (currentUrl.includes('nid.naver.com') || currentUrl.includes('/login') || pageTitle.includes('로그인')) {
      // 스크린샷 저장 (디버그용)
      await page.screenshot({ path: '/tmp/naver-auth-fail.png' });
      throw new Error(`AUTH: 쿠키가 만료되었거나 해외 IP 차단. URL=${currentUrl}`);
    }

    // 페이지 로딩 대기
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {
      console.warn('[Playwright] networkidle timeout, continuing...');
    });

    // 2. 제목 입력
    const titleSelectors = [
      'input[name="title"]',
      '#title',
      '.se-title-input',
      'input[placeholder*="제목"]',
      '[contenteditable][class*="title"]',
    ];
    let titleFilled = false;
    for (const sel of titleSelectors) {
      const el = page.locator(sel).first();
      if (await el.count() > 0) {
        await el.click();
        await el.fill(title);
        console.log(`[Playwright] Title filled via: ${sel}`);
        titleFilled = true;
        break;
      }
    }
    if (!titleFilled) {
      // JavaScript로 직접 시도
      await page.evaluate((t) => {
        const el = document.querySelector('input[name="title"], #title, [name="title"]');
        if (el) { el.value = t; el.dispatchEvent(new Event('input', { bubbles: true })); }
      }, title);
      console.warn('[Playwright] Title filled via JS fallback');
    }

    // 3. 카테고리 선택
    if (categoryNo > 0) {
      const catSel = page.locator('select[name="categoryNo"]').first();
      if (await catSel.count() > 0) {
        await catSel.selectOption(String(categoryNo));
        console.log(`[Playwright] Category set: ${categoryNo}`);
      }
    }

    // 4. 폼 정보 수집 + body/태그 설정
    const formInfo = await page.evaluate(({ content, tags, categoryNo, isPublish }) => {
      // 폼 찾기
      const form = document.querySelector('form[action*="Formsave"]') ||
                   document.querySelector('form[action*="writePost"]') ||
                   document.querySelector('form[name*="write"]') ||
                   document.querySelector('form[id*="write"]') ||
                   document.forms[0];

      if (!form) {
        const allForms = Array.from(document.forms).map(f => `id:${f.id} name:${f.name} action:${f.action}`);
        return { ok: false, error: 'form not found', allForms };
      }

      // body 설정
      const bodyNames = ['body', 'contents', 'postContent', 'content', 'postBody'];
      for (const name of bodyNames) {
        const el = form.querySelector(`[name="${name}"]`) || document.querySelector(`textarea[name="${name}"], input[name="${name}"]`);
        if (el) {
          el.value = content;
          break;
        }
      }

      // 태그 설정
      const tagEl = form.querySelector('[name="tag"]') || document.querySelector('[name="tag"]');
      if (tagEl) tagEl.value = tags.join(',');

      // 카테고리 설정
      const catEl = form.querySelector('select[name="categoryNo"]');
      if (catEl && categoryNo > 0) catEl.value = String(categoryNo);

      // 발행 타입 설정
      const pubEl = form.querySelector('[name="publishType"]');
      if (pubEl) pubEl.value = isPublish ? 'A' : 'B';

      return {
        ok: true,
        formAction: form.action,
        formId: form.id,
        fieldNames: Array.from(form.querySelectorAll('[name]')).map(el => el.getAttribute('name')).slice(0, 30),
      };
    }, { content, tags, categoryNo, isPublish });

    console.log('[Playwright] Form info:', JSON.stringify(formInfo, null, 2));

    if (!formInfo.ok) {
      // 디버그용 스크린샷
      await page.screenshot({ path: '/tmp/naver-debug.png', fullPage: true });
      throw new Error(`폼을 찾지 못했습니다. allForms: ${JSON.stringify(formInfo.allForms)}`);
    }

    // 5. 폼 제출
    console.log('[Playwright] Submitting form...');
    await page.evaluate(({ isPublish }) => {
      const form = document.querySelector('form[action*="Formsave"]') ||
                   document.querySelector('form[action*="writePost"]') ||
                   document.querySelector('form[name*="write"]') ||
                   document.querySelector('form[id*="write"]') ||
                   document.forms[0];
      if (form) {
        // 발행 버튼이 있으면 클릭, 없으면 submit
        const publishBtn = form.querySelector('button[type="submit"]') ||
                           document.querySelector('button:not([type="button"])[id*="publish"]');
        if (publishBtn) {
          publishBtn.click();
        } else {
          form.submit();
        }
      }
    }, { isPublish });

    // 6. 발행 완료 후 URL 확인
    await page.waitForURL(
      url => /blog\.naver\.com/.test(url.toString()) && /\d{5,}/.test(url.toString()),
      { timeout: 20000 }
    ).catch(async () => {
      console.warn('[Playwright] waitForURL timeout, checking current URL...');
    });

    const finalUrl = page.url();
    console.log(`[Playwright] Final URL: ${finalUrl}`);

    const m = finalUrl.match(/logNo=(\d+)/) || finalUrl.match(/\/(\d{5,})(?:[^/?#]|$)/);
    if (m?.[1]) {
      return { postId: m[1], postUrl: `https://blog.naver.com/${blogId}/${m[1]}` };
    }

    // body에서 postId 탐색
    const bodyContent = await page.content().catch(() => '');
    const bm = bodyContent.match(/logNo[=:]["'\s]*(\d{5,})/) ||
               bodyContent.match(/"(?:logNo|postNo)"\s*:\s*"?(\d{5,})"?/);
    if (bm?.[1]) {
      return { postId: bm[1], postUrl: `https://blog.naver.com/${blogId}/${bm[1]}` };
    }

    // 발행은 됐을 수 있지만 postId 불명확
    return { postId: '', postUrl: finalUrl };

  } finally {
    await browser.close();
  }
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!JOB_ID) { console.error('JOB_ID not set'); process.exit(1); }
  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Supabase env not set'); process.exit(1); }

  console.log(`[Job] Processing: ${JOB_ID}`);

  const jobs = await sbGet('naver_publish_jobs', `id=eq.${JOB_ID}&select=*`);
  const job = jobs[0];
  if (!job) { console.error('Job not found'); process.exit(1); }

  await sbPatch('naver_publish_jobs', `id=eq.${JOB_ID}`, { status: 'processing' });

  const conns = await sbGet('naver_connections', `user_id=eq.${job.user_id}&select=*`);
  const conn = conns[0];
  if (!conn?.nid_aut || !conn?.nid_ses) {
    await sbPatch('naver_publish_jobs', `id=eq.${JOB_ID}`, {
      status: 'failed', error_message: '네이버 쿠키 없음', completed_at: new Date().toISOString(),
    });
    process.exit(1);
  }

  let result;
  try {
    result = await publishWithPlaywright({
      blogId: conn.blog_id,
      nidAut: conn.nid_aut,
      nidSes: conn.nid_ses,
      title: job.title,
      content: job.content,
      tags: job.tags || [],
      categoryNo: job.category_no || 0,
      isPublish: job.is_publish !== false,
    });
  } catch (e) {
    const errMsg = e.message || String(e);
    const isAuth = errMsg.startsWith('AUTH:');
    await sbPatch('naver_publish_jobs', `id=eq.${JOB_ID}`, {
      status: 'failed',
      error_message: errMsg,
      completed_at: new Date().toISOString(),
    });
    console.error(`[Job] Failed: ${errMsg}`);
    process.exit(1);
  }

  const isSuccess = !result.error || result.postId;
  await sbPatch('naver_publish_jobs', `id=eq.${JOB_ID}`, {
    status: isSuccess ? 'completed' : 'failed',
    post_id: result.postId || null,
    post_url: result.postUrl || null,
    error_message: result.error || null,
    completed_at: new Date().toISOString(),
  });

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
    console.log(`✅ Published: ${result.postUrl}`);
  } else {
    console.error(`❌ Failed: ${result.error}`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
