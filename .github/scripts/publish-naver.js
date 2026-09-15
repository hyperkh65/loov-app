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

    // 지금 네이버 블로그는 옛날 form 기반 에디터가 아니라 "스마트에디터 ONE" —
    // 본문 영역은 form이 아니라 iframe(name="mainFrame") 안의 contenteditable
    // 리치텍스트 컴포넌트임(실사용 중 확인: 상위 문서엔 document.forms가 아예 0개).
    await page.waitForTimeout(1500);

    const mainFrame = page.frame({ name: 'mainFrame' }) || page.frames().find(f => /PostWriteFormV3|PostWriteForm/.test(f.url()));
    const frameList = page.frames().map(f => ({ name: f.name(), url: f.url() }));
    console.log('[Playwright] Frames:', JSON.stringify(frameList));

    if (!mainFrame) {
      await page.screenshot({ path: '/tmp/naver-debug.png', fullPage: true });
      throw new Error(`에디터 프레임(mainFrame)을 찾지 못했습니다. frames: ${JSON.stringify(frameList)}`);
    }

    // "이어서 작성하시겠습니까?" 등 se-popup 확인창은 최상위 문서가 아니라
    // mainFrame 안에서 뜬다(실사용 중 확인 — 상위 document에서 찾던 이전 시도가
    // 안 먹혔던 이유). 정확한 버튼 문구를 모르니 팝업 안 아무 버튼이나 눌러서
    // 우선 닫고, 어느 쪽을 골랐든 이후 로직이 title/body를 채우거나 덮어씀.
    const dismissPopup = async () => {
      const popup = mainFrame.locator('.se-popup-alert-confirm, .se-popup-alert, [data-group="popupLayer"]').first();
      if (await popup.count() > 0 && await popup.isVisible().catch(() => false)) {
        const btn = popup.locator('button').first();
        if (await btn.count() > 0) {
          await btn.click({ force: true }).catch(() => {});
          console.log('[Playwright] Dismissed a se-popup');
          await mainFrame.page().waitForTimeout(500);
          return true;
        }
      }
      return false;
    };
    await dismissPopup();
    await page.keyboard.press('Escape').catch(() => {});

    // 2. 제목 입력 — 스마트에디터 ONE은 제목도 프레임 안 contenteditable(.se-title-text)
    const titleSelectors = ['.se-title-text', '.se-placeholder-focused .se-title-text', 'input[name="title"]', '#title'];
    let titleFilled = false;
    for (const sel of titleSelectors) {
      const el = mainFrame.locator(sel).first();
      if (await el.count() > 0) {
        await dismissPopup(); // 클릭 직전에 한 번 더 — 팝업이 뒤늦게 뜨는 경우 대비
        await el.click({ force: true });
        const tag = await el.evaluate(n => n.tagName).catch(() => '');
        if (tag === 'INPUT' || tag === 'TEXTAREA') await el.fill(title);
        else if (typeof el.pressSequentially === 'function') await el.pressSequentially(title);
        else await page.keyboard.type(title);
        console.log(`[Playwright] Title filled via: ${sel}`);
        titleFilled = true;
        break;
      }
    }
    if (!titleFilled) console.warn('[Playwright] Title selector not found — 아래 진단 정보 참고');

    // 3. 본문 입력 — contenteditable에 HTML을 그대로 넣을 수 있는 input 이벤트가
    // 없으므로, 클립보드 paste 이벤트를 흉내내서 HTML을 그대로 붙여넣기(스마트
    // 에디터가 내부적으로 paste의 text/html을 파싱해서 블록으로 변환해줌).
    const bodySelectors = ['.se-component-content .se-text-paragraph', '.se-main-container [contenteditable="true"]', '[contenteditable="true"]'];
    let bodyFilled = false;
    for (const sel of bodySelectors) {
      const el = mainFrame.locator(sel).first();
      if (await el.count() > 0) {
        await dismissPopup();
        await el.click({ force: true });
        await mainFrame.evaluate(({ selector, html }) => {
          const target = document.querySelector(selector);
          if (!target) return;
          target.focus();
          const dt = new DataTransfer();
          dt.setData('text/html', html);
          dt.setData('text/plain', target.textContent || '');
          const evt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
          target.dispatchEvent(evt);
        }, { selector: sel, html: content }).catch(e => console.warn('[Playwright] paste evaluate failed:', e.message));
        console.log(`[Playwright] Body paste attempted via: ${sel}`);
        bodyFilled = true;
        break;
      }
    }
    if (!bodyFilled) console.warn('[Playwright] Body selector not found — 아래 진단 정보 참고');

    // 진단 정보 — 실패 시 다음 수정에 바로 쓸 수 있게 항상 남김
    const diag = await mainFrame.evaluate(() => ({
      contentEditableCount: document.querySelectorAll('[contenteditable="true"]').length,
      seTitleTextExists: !!document.querySelector('.se-title-text'),
      seComponentCount: document.querySelectorAll('.se-component').length,
      bodyTextSample: document.body.innerText.slice(0, 300),
    })).catch(e => ({ error: e.message }));
    console.log('[Playwright] Editor diagnostics:', JSON.stringify(diag));
    await page.screenshot({ path: '/tmp/naver-debug.png', fullPage: true }).catch(() => {});

    if (!titleFilled && !bodyFilled) {
      throw new Error(`제목/본문 입력 영역을 둘 다 못 찾았습니다. diag: ${JSON.stringify(diag)}`);
    }

    await page.waitForTimeout(1500); // 스마트에디터가 붙여넣은 내용을 내부 상태로 반영할 시간

    // 4. 발행 버튼(최상위 문서, 우측 상단) — 클래스명이 해시라 안 바뀌는 한글
    // 텍스트로 찾음. 클릭하면 카테고리/태그/공개설정 있는 발행 레이어가 뜸.
    // 실사용 중 확인: 편집기 진입 시 뜨는 "도움말" 툴팁이 이 버튼을 가려서 일반
    // 클릭이 막힘(intercepts pointer events) — Escape로 먼저 닫아보고, 그래도
    // 남아있으면 force 클릭으로 우회(툴팁일 뿐 실제 모달 차단이 아니라 안전함).
    const publishOpenBtn = page.getByRole('button', { name: '발행', exact: true }).first();
    if (await publishOpenBtn.count() === 0) {
      throw new Error('발행 버튼을 찾지 못했습니다.');
    }
    await dismissPopup();
    await page.keyboard.press('Escape').catch(() => {});
    const helpClose = page.locator('.se-help-panel button, .se-help-title').first();
    if (await helpClose.count() > 0) {
      await page.mouse.click(5, 5).catch(() => {}); // 도움말 패널 밖 클릭으로 닫기 시도
      await page.waitForTimeout(300);
    }
    await publishOpenBtn.click({ force: true, timeout: 10000 });
    await page.waitForTimeout(1000);

    // 5. 발행 레이어 — 카테고리 선택(있으면), 태그 입력(있으면)
    if (categoryNo > 0) {
      const catDropdown = page.locator('select[name="categoryNo"], select.selectbox_category').first();
      if (await catDropdown.count() > 0) {
        await catDropdown.selectOption(String(categoryNo)).catch(() => {});
        console.log(`[Playwright] Category set via select: ${categoryNo}`);
      }
    }
    if (tags.length) {
      const tagInput = page.locator('input[placeholder*="태그"], .tag_input').first();
      if (await tagInput.count() > 0) {
        await tagInput.click().catch(() => {});
        await tagInput.type(tags.join(', ')).catch(() => {});
        await page.keyboard.press('Enter').catch(() => {});
      }
    }

    // 6. 발행 레이어 안의 최종 확인 버튼 (레이어 안에 또 "발행" 버튼이 있는 게
    // 스마트에디터 ONE의 2단계 발행 방식) — 임시저장(isPublish=false)이면 안 누름
    if (isPublish) {
      const confirmBtn = page.locator('button:has-text("발행")').last();
      if (await confirmBtn.count() > 0) {
        await confirmBtn.click({ force: true, timeout: 10000 });
        console.log('[Playwright] Final publish confirm clicked');
      }
    } else {
      console.log('[Playwright] isPublish=false — 발행 확정 단계 건너뜀(임시저장만)');
    }

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
