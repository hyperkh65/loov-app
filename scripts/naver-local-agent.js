#!/usr/bin/env node
/**
 * 네이버 블로그 로컬 발행 에이전트
 * Mac에서 실행 (한국 IP → Naver 차단 없음)
 *
 * 사용법:
 *   node scripts/naver-local-agent.js          # 대기 모드 (10초마다 폴링)
 *   node scripts/naver-local-agent.js --once   # 현재 pending 작업만 처리 후 종료
 *
 * 환경변수 (.env.local 또는 export):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (서비스 롤 키 - RLS 우회)
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// ── .env.local 로드 ──────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([^=#\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ONCE = process.argv.includes('--once');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ .env.local에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요');
  process.exit(1);
}

// ── Supabase REST ─────────────────────────────────────────────────────────────

async function sbGet(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${table}: ${res.status} ${await res.text()}`);
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
  if (!res.ok) throw new Error(`sbPatch: ${res.status} ${await res.text()}`);
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

// ── Playwright 발행 ───────────────────────────────────────────────────────────

async function publishWithPlaywright({ blogId, nidAut, nidSes, title, content, tags, categoryNo, isPublish }) {
  const browser = await chromium.launch({
    headless: false,   // Mac에서는 headless: false 권장 (Naver 봇 감지 방지)
    slowMo: 100,
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
    });

    // 네이버 세션 쿠키 설정
    await context.addCookies([
      { name: 'NID_AUT', value: nidAut, domain: '.naver.com', path: '/' },
      { name: 'NID_SES', value: nidSes, domain: '.naver.com', path: '/' },
    ]);

    const page = await context.newPage();

    // 1. 네이버 메인 방문 (쿠키 적용)
    console.log('  → naver.com 방문 중...');
    await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 15000 });

    // 2. 블로그 글쓰기 페이지 이동
    console.log('  → 블로그 글쓰기 페이지로 이동...');
    await page.goto(`https://blog.naver.com/PostWriteForm.naver?blogId=${blogId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    const currentUrl = page.url();
    console.log(`  → 현재 URL: ${currentUrl}`);

    if (currentUrl.includes('nid.naver.com') || currentUrl.includes('/login')) {
      throw new Error('AUTH: 쿠키가 만료되었습니다. 설정 탭에서 새 쿠키를 입력해주세요.');
    }

    // 페이지 완전 로드 대기
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {
      console.warn('  ⚠️ networkidle timeout, 계속 진행...');
    });

    // 3. 제목 입력
    const titleSelectors = [
      'input[name="title"]',
      '#title',
      'input[placeholder*="제목"]',
      '.se-title-input',
    ];
    let titleFilled = false;
    for (const sel of titleSelectors) {
      const el = page.locator(sel).first();
      if (await el.count() > 0) {
        await el.click();
        await el.fill(title);
        console.log(`  → 제목 입력 완료 (${sel})`);
        titleFilled = true;
        break;
      }
    }
    if (!titleFilled) {
      // SE3 Smart Editor 제목 처리
      const titleArea = page.locator('[contenteditable="true"]').first();
      if (await titleArea.count() > 0) {
        await titleArea.click();
        await page.keyboard.type(title);
        console.log('  → 제목 입력 완료 (contenteditable)');
      }
    }

    await page.waitForTimeout(500);

    // 4. 본문 입력 (Smart Editor iframe)
    console.log('  → 본문 입력 시도...');

    // iframe 내부 접근
    const frames = page.frames();
    let contentFilled = false;

    for (const frame of frames) {
      try {
        const frameUrl = frame.url();
        if (frameUrl.includes('editor') || frameUrl.includes('se.') || frameUrl.includes('blog')) {
          // iframe 내부 contenteditable 영역 찾기
          const editorArea = frame.locator('[contenteditable="true"], .se-content, #se_editArea');
          if (await editorArea.count() > 0) {
            await editorArea.first().click();
            // HTML 내용 삽입
            await frame.evaluate((htmlContent) => {
              const el = document.querySelector('[contenteditable="true"], .se-content, #se_editArea');
              if (el) {
                el.focus();
                document.execCommand('insertHTML', false, htmlContent);
              }
            }, content);
            console.log('  → 본문 입력 완료 (iframe contenteditable)');
            contentFilled = true;
            break;
          }
        }
      } catch {
        // 다음 frame 시도
      }
    }

    if (!contentFilled) {
      // 직접 textarea/form 방식 시도
      await page.evaluate(({ content, tags, categoryNo, isPublish }) => {
        // 구형 에디터 textarea
        const bodyEl = document.querySelector('textarea[name="body"], textarea[name="contents"], #contents');
        if (bodyEl) {
          (bodyEl as HTMLTextAreaElement).value = content;
          bodyEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
        // 태그
        const tagEl = document.querySelector('[name="tag"]') as HTMLInputElement;
        if (tagEl) tagEl.value = tags.join(',');
        // 카테고리
        const catEl = document.querySelector('select[name="categoryNo"]') as HTMLSelectElement;
        if (catEl && categoryNo > 0) catEl.value = String(categoryNo);
        // 발행 타입
        const pubEl = document.querySelector('[name="publishType"]') as HTMLInputElement;
        if (pubEl) pubEl.value = isPublish ? 'A' : 'B';
      }, { content, tags, categoryNo, isPublish });
      console.log('  → 본문 입력 완료 (form fallback)');
    }

    await page.waitForTimeout(1000);

    // 5. 카테고리 선택
    if (categoryNo > 0) {
      const catSel = page.locator('select[name="categoryNo"]').first();
      if (await catSel.count() > 0) {
        await catSel.selectOption(String(categoryNo));
        console.log(`  → 카테고리 설정: ${categoryNo}`);
      }
    }

    // 6. 발행 버튼 클릭 또는 폼 제출
    console.log('  → 발행 버튼 클릭...');
    const publishSelectors = [
      'button[id*="publish"]',
      'button:has-text("발행")',
      'button:has-text("등록")',
      'button[type="submit"]',
      'input[value="발행"]',
    ];
    let published = false;
    for (const sel of publishSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.count() > 0) {
        await btn.click();
        console.log(`  → 발행 클릭 (${sel})`);
        published = true;
        break;
      }
    }

    if (!published) {
      // 폼 직접 제출
      await page.evaluate(() => {
        const form = document.querySelector('form') as HTMLFormElement;
        if (form) form.submit();
      });
      console.log('  → 폼 직접 제출');
    }

    // 7. 발행 완료 URL 대기
    await page.waitForURL(
      url => /blog\.naver\.com/.test(url.toString()) && /\d{5,}/.test(url.toString()),
      { timeout: 20000 }
    ).catch(() => {
      console.warn('  ⚠️ URL 변경 대기 timeout');
    });

    const finalUrl = page.url();
    console.log(`  → 최종 URL: ${finalUrl}`);

    const m = finalUrl.match(/logNo=(\d+)/) || finalUrl.match(/\/(\d{5,})(?:[^/?#]|$)/);
    if (m?.[1]) {
      return { postId: m[1], postUrl: `https://blog.naver.com/${blogId}/${m[1]}` };
    }

    // HTML에서 postId 탐색
    const bodyContent = await page.content().catch(() => '');
    const bm = bodyContent.match(/logNo[=:]["'\s]*(\d{5,})/) ||
               bodyContent.match(/"(?:logNo|postNo)"\s*:\s*"?(\d{5,})"?/);
    if (bm?.[1]) {
      return { postId: bm[1], postUrl: `https://blog.naver.com/${blogId}/${bm[1]}` };
    }

    return { postId: '', postUrl: finalUrl };

  } finally {
    await browser.close();
  }
}

// ── 단일 작업 처리 ────────────────────────────────────────────────────────────

async function processJob(job) {
  console.log(`\n📝 작업 처리: ${job.id}`);
  console.log(`   제목: ${job.title}`);

  await sbPatch('naver_publish_jobs', `id=eq.${job.id}`, { status: 'processing' });

  const conns = await sbGet('naver_connections', `user_id=eq.${job.user_id}&select=*`);
  const conn = conns[0];

  if (!conn?.nid_aut || !conn?.nid_ses) {
    await sbPatch('naver_publish_jobs', `id=eq.${job.id}`, {
      status: 'failed',
      error_message: '네이버 쿠키(NID_AUT, NID_SES) 없음',
      completed_at: new Date().toISOString(),
    });
    console.error('  ❌ 쿠키 없음');
    return;
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
    await sbPatch('naver_publish_jobs', `id=eq.${job.id}`, {
      status: 'failed',
      error_message: errMsg,
      completed_at: new Date().toISOString(),
    });
    console.error(`  ❌ 실패: ${errMsg}`);
    return;
  }

  const isSuccess = !!(result.postId || result.postUrl);
  await sbPatch('naver_publish_jobs', `id=eq.${job.id}`, {
    status: isSuccess ? 'completed' : 'failed',
    post_id: result.postId || null,
    post_url: result.postUrl || null,
    error_message: null,
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
    console.log(`  ✅ 발행 완료: ${result.postUrl}`);
  } else {
    console.error(`  ❌ 발행 실패 (postId 없음): ${result.postUrl}`);
  }
}

// ── 메인 루프 ─────────────────────────────────────────────────────────────────

async function run() {
  console.log('🤖 네이버 블로그 로컬 에이전트 시작');
  console.log(`   모드: ${ONCE ? '한 번만 실행' : '연속 실행 (10초마다 폴링)'}`);
  console.log('   종료: Ctrl+C\n');

  do {
    try {
      const jobs = await sbGet(
        'naver_publish_jobs',
        'status=eq.pending&order=created_at.asc&limit=5&select=*'
      );

      if (jobs.length > 0) {
        console.log(`📬 대기 중인 작업 ${jobs.length}개 발견`);
        for (const job of jobs) {
          await processJob(job);
        }
      } else if (!ONCE) {
        process.stdout.write('⏳ 대기 중...\r');
      }
    } catch (e) {
      console.error('오류:', e.message);
    }

    if (ONCE) break;
    await new Promise(r => setTimeout(r, 10000)); // 10초 대기
  } while (true);

  console.log('\n✅ 에이전트 종료');
}

run().catch(e => { console.error(e); process.exit(1); });
