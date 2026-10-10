#!/usr/bin/env node
/**
 * 네이버 블로그 로컬 발행 에이전트 (독립 실행 버전)
 *
 * ── 설치 방법 (새 맥북) ──────────────────────────────────────────────
 *   1. Node.js 설치: https://nodejs.org (LTS 버전)
 *   2. 이 파일을 아무 폴더에 저장
 *   3. 터미널에서 해당 폴더로 이동 후:
 *        npm install playwright
 *        npx playwright install chromium
 *   4. 실행:
 *        node naver-agent-standalone.js          # 상시 실행 (10초마다 폴링)
 *        node naver-agent-standalone.js --once   # 대기 중인 작업 한 번만 처리
 * ────────────────────────────────────────────────────────────────────
 */

// ── 설정 (여기만 수정하면 됨) ─────────────────────────────────────────
const CONFIG = {
  SUPABASE_URL: 'https://zzgwizsrgjziwexuxquv.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6Z3dpenNyZ2p6aXdleHV4cXV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTU1MTEzNSwiZXhwIjoyMDg3MTI3MTM1fQ.NhxMJRIvmhELs88yKekBWTuVsykqKDTOETCErnojjFw',
  // ─ 구형 맥(macOS 10.15 등) Chromium 오류 시 아래를 'chrome'으로 변경 ─
  // 'chrome' 사용 시 Google Chrome이 설치되어 있어야 함
  // 'chromium' = Playwright 번들 Chromium (기본값, npx playwright install chromium 필요)
  BROWSER_CHANNEL: 'chrome',
};
// ─────────────────────────────────────────────────────────────────────

const { chromium } = require('playwright');
const fs = require('fs');

const ONCE = process.argv.includes('--once');
const SUPABASE_URL = CONFIG.SUPABASE_URL;
const SUPABASE_KEY = CONFIG.SUPABASE_KEY;

// ── Supabase REST ──────────────────────────────────────────────────────────────

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

// ── 유틸 ──────────────────────────────────────────────────────────────────────

const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const humanWait = (min = 300, max = 900) => new Promise(r => setTimeout(r, rnd(min, max)));

async function humanType(page, text, { typoRate = 0.03 } = {}) {
  for (const ch of text) {
    if (Math.random() < typoRate && /[a-zA-Z가-힣]/.test(ch)) {
      const wrongKeys = 'qwertyuiop';
      await page.keyboard.type(wrongKeys[rnd(0, wrongKeys.length - 1)], { delay: rnd(60, 130) });
      await humanWait(80, 200);
      await page.keyboard.press('Backspace');
      await humanWait(60, 150);
    }
    await page.keyboard.type(ch, { delay: rnd(40, 140) });
    if (ch === ' ' || ch === '\n') await humanWait(50, 180);
  }
}

async function humanClick(page, x, y) {
  const steps = rnd(3, 6);
  const cx = rnd(100, 900), cy = rnd(100, 400);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(cx + (x - cx) * t + rnd(-15, 15), cy + (y - cy) * t + rnd(-10, 10));
    await humanWait(10, 40);
  }
  await page.mouse.move(x, y);
  await humanWait(50, 150);
  await page.mouse.click(x, y);
}

async function humanScroll(page) {
  await page.mouse.wheel(0, rnd(100, 400));
  await humanWait(200, 500);
  await page.mouse.wheel(0, -rnd(50, 200));
  await humanWait(100, 300);
}

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
];

// ── 콘텐츠 파싱 ───────────────────────────────────────────────────────────────

function parseContentSegments(html) {
  const segments = [];
  const imgRegex = /<img\s[^>]*>/gi;
  let lastIndex = 0, match;
  while ((match = imgRegex.exec(html)) !== null) {
    const text = html.slice(lastIndex, match.index)
      .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').trim();
    if (text) segments.push({ type: 'text', text });
    const srcMatch = match[0].match(/src=["']([^"']+)["']/i);
    const altMatch = match[0].match(/alt=["']([^"']*)["']/i);
    if (srcMatch) segments.push({ type: 'image', url: srcMatch[1], alt: altMatch?.[1] || '' });
    lastIndex = match.index + match[0].length;
  }
  const tail = html.slice(lastIndex)
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').trim();
  if (tail) segments.push({ type: 'text', text: tail });
  return segments;
}

async function downloadImage(url, index) {
  const ua = USER_AGENTS[rnd(0, USER_AGENTS.length - 1)];
  const res = await fetch(url, { headers: { 'User-Agent': ua } });
  if (!res.ok) throw new Error(`이미지 다운로드 실패: ${res.status} ${url}`);
  const contentType = res.headers.get('content-type') || '';
  const ext = contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif'
    : contentType.includes('webp') ? 'webp' : 'jpg';
  const filePath = `/tmp/naver-img-${index}-${Date.now()}.${ext}`;
  fs.writeFileSync(filePath, Buffer.from(await res.arrayBuffer()));
  console.log(`  → 이미지 다운로드: ${filePath}`);
  return filePath;
}

async function insertImageToSE4(page, filePath) {
  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 8000 });

  const imageButtonSelectors = [
    '[data-name="image"]',
    '[class*="se-toolbar-item-image"]',
    'button[class*="se-image-toolbar-button"]',
  ];
  let btnClicked = false;
  for (const sel of imageButtonSelectors) {
    const btn = page.locator(sel).first();
    if (await btn.count() > 0) {
      await btn.click({ force: true, timeout: 3000 });
      btnClicked = true;
      console.log(`  → SE4 이미지 버튼 클릭 (${sel})`);
      break;
    }
  }
  if (!btnClicked) {
    btnClicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => {
        const label = b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || '';
        return /사진|이미지|image/i.test(label);
      });
      if (btn) { btn.click(); return true; }
      return false;
    });
  }
  if (!btnClicked) throw new Error('SE4 이미지 버튼을 찾을 수 없습니다');

  await humanWait(500, 1000);

  const uploadPanelClicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button, li, a')).find(b => {
      const t = b.textContent.trim();
      return t === '파일' || t === '내 PC' || t === '업로드' || /파일 업로드/i.test(t);
    });
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (uploadPanelClicked) await humanWait(300, 600);

  let fileChooser;
  try {
    fileChooser = await fileChooserPromise;
  } catch {
    throw new Error('fileChooser 이벤트를 받지 못했습니다');
  }
  await fileChooser.setFiles(filePath);
  console.log(`  → 파일 전달: ${filePath}`);
  await humanWait(2500, 4000);

  const confirmClicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => {
      const t = b.textContent.trim();
      return (t === '확인' || t === '삽입' || t === '추가' || t === '완료') && b.offsetParent !== null;
    });
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (confirmClicked) await humanWait(500, 1000);

  await page.keyboard.press('Enter');
  await humanWait(200, 400);
}

// ── AI 파이프라인 ──────────────────────────────────────────────────────────────

async function sbGetAppSettings() {
  try {
    const rows = await sbGet('app_settings', 'id=eq.1&select=settings');
    const s = rows[0]?.settings || {};
    return {
      GEMINI_API_KEY: s.GEMINI_API_KEY || '',
      CLAUDE_API_KEY: s.CLAUDE_API_KEY || '',
      OPENAI_API_KEY: s.OPENAI_API_KEY || '',
    };
  } catch {
    return { GEMINI_API_KEY: '', CLAUDE_API_KEY: '', OPENAI_API_KEY: '' };
  }
}

async function callAI(prompt, provider = 'gemini', apiKeys = {}) {
  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKeys.CLAUDE_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
    return (await res.json()).content?.[0]?.text || '';
  }
  if (provider === 'gpt4o' || provider === 'gpt4' || provider === 'gpt35') {
    const modelMap = { gpt4o: 'gpt-4o', gpt4: 'gpt-4', gpt35: 'gpt-3.5-turbo' };
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKeys.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelMap[provider], messages: [{ role: 'user', content: prompt }], max_tokens: 4096 }),
    });
    if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
    return (await res.json()).choices?.[0]?.message?.content || '';
  }
  // gemini (default)
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKeys.GEMINI_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
  );
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  return (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function rewriteContent(title, rawHtml, aiPrompt, provider, apiKeys) {
  const plainText = rawHtml
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  const prompt = `다음 초안을 네이버 블로그 포스팅 형식으로 리라이팅해주세요.\n제목: ${title}\n규칙:\n- <p> 태그를 사용해 단락 구분\n- 2000자 내외 (한국어 기준)\n- 자연스럽고 친근한 블로그 문체\n- HTML만 출력 (다른 설명 없이)\n${aiPrompt ? `추가 지시사항: ${aiPrompt}` : ''}\n\n초안:\n${plainText}`;
  const result = await callAI(prompt, provider, apiKeys);
  return result.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();
}

async function generateThumbnail(jobId, title, thumbnailPrompt, geminiApiKey) {
  const prompt = thumbnailPrompt || `"${title}" 블로그 대표이미지, 깔끔한 일러스트, 16:9 비율, 고화질`;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }),
    }
  );
  if (!res.ok) throw new Error(`Gemini 이미지 생성 실패: ${res.status}`);
  const parts = (await res.json()).candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imgPart) throw new Error('Gemini 이미지 응답 없음');
  const ext = imgPart.inlineData.mimeType.includes('png') ? 'png' : 'jpg';
  const filePath = `/tmp/naver-thumb-${jobId}-${Date.now()}.${ext}`;
  fs.writeFileSync(filePath, Buffer.from(imgPart.inlineData.data, 'base64'));
  console.log(`  → 썸네일 생성: ${filePath}`);
  return filePath;
}

async function scrapeSourceUrl(url) {
  const launchOpts = CONFIG.BROWSER_CHANNEL === 'chrome'
    ? { headless: true, channel: 'chrome' }
    : { headless: true };
  const browser = await chromium.launch(launchOpts);
  try {
    const page = await (await browser.newContext({ userAgent: USER_AGENTS[rnd(0, USER_AGENTS.length - 1)], locale: 'ko-KR' })).newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    return await page.evaluate(() => {
      const title = document.querySelector('h1')?.textContent?.trim() || document.title?.trim() || '';
      const container = document.querySelector('article') || document.querySelector('.content') || document.querySelector('main') || document.body;
      const bodyParts = [];
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
        acceptNode: n => ['h1','h2','h3','p'].includes(n.tagName?.toLowerCase()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
      });
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent?.trim();
        if (text) bodyParts.push(`<${node.tagName.toLowerCase()}>${text}</${node.tagName.toLowerCase()}>`);
      }
      const imageUrls = [];
      document.querySelectorAll('img[src]').forEach(img => {
        const src = img.getAttribute('src') || '';
        if (/^https?:\/\//i.test(src) && (img.naturalWidth >= 100 || img.width >= 100)) imageUrls.push(src);
      });
      return { title, bodyHtml: bodyParts.join('\n'), imageUrls };
    });
  } finally { await browser.close(); }
}

function mixContentWithImages(rewrittenHtml, imageUrls) {
  if (!imageUrls || imageUrls.length === 0) return rewrittenHtml;
  const paragraphRegex = /(<p[^>]*>[\s\S]*?<\/p>)/gi;
  const paragraphs = [];
  let match;
  while ((match = paragraphRegex.exec(rewrittenHtml)) !== null) paragraphs.push(match[1]);
  if (paragraphs.length === 0) return rewrittenHtml + '\n' + imageUrls.map(u => `<p><img src="${u}" /></p>`).join('\n');
  const M = imageUrls.length, N = paragraphs.length;
  const interval = N / (M + 1);
  const result = [];
  paragraphs.forEach((para, i) => {
    result.push(para);
    for (let j = 0; j < M; j++) {
      if (i + 1 === Math.round(interval * (j + 1))) result.push(`<p><img src="${imageUrls[j]}" /></p>`);
    }
  });
  return result.join('\n');
}

async function prepareContent(job) {
  const jobType = job.job_type || 'draft';
  if (jobType === 'draft') {
    if (job.thumbnail_prompt?.startsWith('__url__:')) {
      const imgUrl = job.thumbnail_prompt.replace('__url__:', '');
      const thumbPath = await downloadImage(imgUrl, `thumb-${job.id}`);
      return { ...job, _thumbnailLocalPath: thumbPath };
    }
    return job;
  }
  const apiKeys = await sbGetAppSettings();
  const provider = job.ai_provider || 'gemini';
  if (jobType === 'rewrite') {
    console.log('  → [rewrite] AI 리라이팅...');
    const rewrittenHtml = await rewriteContent(job.title, job.content, job.ai_prompt, provider, apiKeys);
    console.log('  → [rewrite] 썸네일 생성...');
    const thumbPath = await generateThumbnail(job.id, job.title, job.thumbnail_prompt, apiKeys.GEMINI_API_KEY);
    return { ...job, content: rewrittenHtml, _thumbnailLocalPath: thumbPath };
  }
  if (jobType === 'scrape') {
    console.log(`  → [scrape] 스크랩: ${job.source_url}`);
    const scraped = await scrapeSourceUrl(job.source_url);
    await sbPatch('naver_publish_jobs', `id=eq.${job.id}`, { raw_content: scraped.bodyHtml });
    const finalTitle = job.title?.trim() || scraped.title;
    console.log('  → [scrape] AI 리라이팅...');
    const rewrittenHtml = await rewriteContent(finalTitle, scraped.bodyHtml, job.ai_prompt, provider, apiKeys);
    const mixedHtml = mixContentWithImages(rewrittenHtml, scraped.imageUrls);
    console.log('  → [scrape] 썸네일 생성...');
    const thumbPath = await generateThumbnail(job.id, finalTitle, job.thumbnail_prompt, apiKeys.GEMINI_API_KEY);
    return { ...job, title: finalTitle, content: mixedHtml, _thumbnailLocalPath: thumbPath };
  }
  return job;
}

// ── Playwright 발행 ────────────────────────────────────────────────────────────

async function publishWithPlaywright({ blogId, nidAut, nidSes, title, content, tags, categoryNo, isPublish, thumbnailLocalPath, scheduledAt }) {
  const browser = await chromium.launch({
    headless: false,
    slowMo: rnd(30, 80),
    args: ['--disable-blink-features=AutomationControlled'],
    ...(CONFIG.BROWSER_CHANNEL === 'chrome' ? { channel: 'chrome' } : {}),
  });
  try {
    const viewport = [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1512, height: 982 }][rnd(0, 2)];
    const context = await browser.newContext({
      userAgent: USER_AGENTS[rnd(0, USER_AGENTS.length - 1)],
      locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport,
      extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8' },
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });
    await context.addCookies([
      { name: 'NID_AUT', value: nidAut, domain: '.naver.com', path: '/' },
      { name: 'NID_SES', value: nidSes, domain: '.naver.com', path: '/' },
    ]);
    const page = await context.newPage();
    const vp = viewport;

    // 1. 네이버 메인 방문
    console.log('  → naver.com 방문...');
    await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await humanWait(800, 2000);
    await humanScroll(page);

    // 2. 블로그 글쓰기 페이지
    console.log('  → 블로그 글쓰기 페이지 이동...');
    await humanWait(500, 1500);
    await page.goto(`https://blog.naver.com/PostWriteForm.naver?blogId=${blogId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const currentUrl = page.url();
    if (currentUrl.includes('nid.naver.com') || currentUrl.includes('/login')) {
      throw new Error('AUTH: 쿠키 만료. 설정 탭에서 새 쿠키를 입력해주세요.');
    }

    // SE4 에디터 로드 대기
    console.log('  → SE4 에디터 로드 대기...');
    await page.locator('button[class*="se-image-toolbar-button"]').first()
      .waitFor({ state: 'visible', timeout: 15000 }).catch(() => console.warn('  ⚠️ SE4 toolbar 대기 timeout'));
    await page.waitForTimeout(1000);

    await page.screenshot({ path: '/tmp/naver-initial.png', fullPage: false }).catch(() => {});

    // 임시저장 복원 다이얼로그 처리
    try {
      const draftCancelBtn = page.locator('button').filter({ hasText: /^취소$/ }).first();
      if (await draftCancelBtn.count() > 0) {
        await draftCancelBtn.click({ timeout: 3000 });
        console.log('  → 임시저장 다이얼로그 닫기');
        await page.waitForTimeout(1000);
      }
    } catch {}
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 3. 제목 입력
    console.log('  → 제목 입력...');
    await humanWait(400, 800);
    const titleStrategies = [
      async () => {
        const el = page.locator('.se-title-text').first();
        if (await el.count() === 0) return false;
        await el.click({ force: true, timeout: 3000 }); await humanWait(200, 500); await humanType(page, title); return true;
      },
      async () => {
        const ce = page.locator('[contenteditable]').first();
        if (await ce.count() === 0) return false;
        await ce.click({ force: true, timeout: 3000 }); await humanWait(200, 500); await humanType(page, title); return true;
      },
      async () => { await humanClick(page, vp.width / 2, 200); await humanWait(300, 600); await humanType(page, title); return true; },
    ];
    let titleFilled = false;
    for (const fn of titleStrategies) { try { if (await fn()) { titleFilled = true; break; } } catch {} }
    console.log(titleFilled ? '  → 제목 입력 완료' : '  ⚠️ 제목 입력 실패');

    // 4. 썸네일 삽입 (대표이미지)
    let thumbnailInserted = false;
    if (thumbnailLocalPath && fs.existsSync(thumbnailLocalPath)) {
      console.log('  → 썸네일 삽입...');
      let thumbFocused = false;
      for (const sel of ['.se-main-section', '.se-document', '[class*="content_body"]']) {
        const el = page.locator(sel).first();
        if (await el.count() > 0) { try { await el.click({ force: true, timeout: 3000 }); thumbFocused = true; break; } catch {} }
      }
      if (!thumbFocused) await humanClick(page, vp.width / 2, 450);
      await humanWait(300, 600);
      try {
        await insertImageToSE4(page, thumbnailLocalPath);
        thumbnailInserted = true;
        console.log('  → 썸네일 삽입 완료');
        fs.unlinkSync(thumbnailLocalPath);
      } catch (e) { console.warn(`  ⚠️ 썸네일 삽입 실패: ${e.message}`); }
    }

    // 5. 본문 입력
    console.log('  → 본문 입력...');
    await humanWait(300, 600);
    const segments = parseContentSegments(content);
    console.log(`  → 세그먼트: ${segments.map(s => s.type === 'image' ? '[IMG]' : '[TXT]').join(' ')}`);

    // 본문 포커스 (썸네일 삽입 후엔 클릭 금지 — 커서 위치 틀어짐)
    let bodyFocused = false;
    if (thumbnailInserted) {
      await page.keyboard.press('Control+End');
      await humanWait(200, 400);
      bodyFocused = true;
    } else {
      const focusStrategies = [
        async () => {
          const ces = page.locator('[contenteditable="true"]');
          const count = await ces.count();
          for (let i = 1; i < count; i++) { try { await ces.nth(i).click({ force: true, timeout: 3000 }); await humanWait(300, 600); return true; } catch {} }
          return false;
        },
        async () => {
          for (const sel of ['.se-main-section', '.se-document', '[class*="content_body"]', '.se-section-text']) {
            const el = page.locator(sel).first();
            if (await el.count() > 0) { await el.click({ force: true, timeout: 3000 }); await humanWait(300, 600); return true; }
          }
          return false;
        },
        async () => { await humanClick(page, vp.width / 2, 450); await humanWait(800, 1500); return true; },
      ];
      for (const fn of focusStrategies) { try { if (await fn()) { bodyFocused = true; break; } } catch {} }
    }
    if (!bodyFocused) console.warn('  ⚠️ 본문 포커스 실패');

    // 세그먼트 순회
    let imgIndex = 0, lastType = null, bodyFilled = false;
    for (const seg of segments) {
      if (seg.type === 'text') {
        if (lastType === 'image') {
          // 이미지 다음 텍스트: 클릭 금지, End 키만 사용
          await page.keyboard.press('End');
          await humanWait(100, 200);
        }
        await humanType(page, seg.text);
        bodyFilled = true;
      } else if (seg.type === 'image') {
        if (lastType === 'text') { await page.keyboard.press('Enter'); await humanWait(200, 400); }
        let tmpPath = null;
        try {
          tmpPath = await downloadImage(seg.url, imgIndex++);
          await insertImageToSE4(page, tmpPath);
          bodyFilled = true;
        } catch (e) { console.warn(`  ⚠️ 이미지 삽입 실패: ${e.message}`); }
        finally { if (tmpPath && fs.existsSync(tmpPath)) { fs.unlinkSync(tmpPath); } }
      }
      lastType = seg.type;
    }
    console.log(bodyFilled ? '  → 본문 입력 완료' : '  ⚠️ 본문 입력 실패');

    // 6. 태그 입력
    if (tags && tags.length > 0) {
      console.log(`  → 태그 입력: ${tags.join(', ')}`);
      await humanWait(400, 800);
      await page.keyboard.press('Control+End');
      await humanWait(200, 300);
      await page.keyboard.press('Enter');
      await humanWait(200, 400);
      for (const tag of tags) {
        await humanType(page, '#' + tag.replace(/^#/, ''));
        await page.keyboard.press('Enter');
        await humanWait(300, 600);
      }
      console.log('  → 태그 입력 완료');
    }

    await page.screenshot({ path: '/tmp/naver-after-input.png', fullPage: false }).catch(() => {});
    console.log('  → 스크린샷: /tmp/naver-after-input.png');
    await page.waitForTimeout(1000);

    // 7. 카테고리
    if (categoryNo > 0) {
      const catSel = page.locator('select[name="categoryNo"]').first();
      if (await catSel.count() > 0) { await catSel.selectOption(String(categoryNo)); console.log(`  → 카테고리: ${categoryNo}`); }
    }

    // 8. 발행 / 임시저장
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.locator('.se-popup-dim').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});

    // ── 임시저장 ──
    if (!isPublish) {
      console.log('  → 임시저장 처리...');
      const draftsaved = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => {
          if (!b.offsetParent) return false;
          const korOnly = b.textContent.replace(/[^\uAC00-\uD7A3]/g, '').trim();
          return korOnly === '저장' || korOnly === '임시저장';
        });
        if (btn) { btn.click(); return btn.textContent.trim(); }
        return null;
      });
      if (draftsaved) {
        console.log(`  → 임시저장 클릭: "${draftsaved}"`);
        await page.waitForTimeout(2000);
      } else {
        console.warn('  ⚠️ 임시저장 버튼 못 찾음 → Ctrl+S 시도');
        await page.keyboard.press('Control+s');
        await page.waitForTimeout(2000);
      }
      return { postId: '', postUrl: '' };
    }

    // ── 발행 버튼 ──
    console.log('  → 발행 버튼 클릭...');
    const published = await page.evaluate(() => {
      const btn = document.querySelector('button.publish_btn__m9KHH') ||
        Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '발행' && b.offsetParent !== null);
      if (btn) { btn.click(); return true; }
      return false;
    });

    if (published) {
      await page.waitForTimeout(1500);
      const panelBtns = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null)
          .map(b => `"${b.textContent.trim().slice(0, 20)}"`)
      );
      console.log('  [패널 버튼]:', panelBtns.join(' | '));

      if (scheduledAt) {
        // ── 예약 발행 ──
        const schedDate = new Date(scheduledAt);
        console.log(`  → 예약 발행: ${schedDate.toLocaleString('ko-KR')}`);
        await page.evaluate(() => {
          const el = Array.from(document.querySelectorAll('label, input[type="radio"]'))
            .find(e => /예약/.test(e.textContent || e.getAttribute('value') || ''));
          if (el) el.click();
        });
        await humanWait(500, 800);
        const yy = String(schedDate.getFullYear());
        const mo = String(schedDate.getMonth() + 1).padStart(2, '0');
        const dd = String(schedDate.getDate()).padStart(2, '0');
        const hh = String(schedDate.getHours()).padStart(2, '0');
        const mi = String(schedDate.getMinutes()).padStart(2, '0');
        for (let idx = 0; idx < [yy, mo, dd, hh, mi].length; idx++) {
          await page.evaluate(i => {
            const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"]')).filter(el => el.offsetParent !== null);
            if (inputs[i]) inputs[i].click();
          }, idx);
          await humanWait(100, 200);
          await page.keyboard.press('Control+a');
          await page.keyboard.type([yy, mo, dd, hh, mi][idx]);
          await page.keyboard.press('Tab');
          await humanWait(150, 300);
        }
        console.log(`  → 예약 날짜 입력: ${yy}.${mo}.${dd} ${hh}:${mi}`);
        await humanWait(400, 600);
      } else {
        // ── 즉시 발행 ──
        await page.evaluate(() => {
          const el = Array.from(document.querySelectorAll('label, input[type="radio"]'))
            .find(e => /현재/.test(e.textContent || e.getAttribute('value') || ''));
          if (el) el.click();
        });
        console.log('  → 즉시 발행(현재) 선택');
        await humanWait(200, 400);
      }

      // 최종 발행 확인
      const confirmed = await page.evaluate(() => {
        const btn = [...Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null)]
          .reverse().find(b => /^발행$|^발행하기$/.test(b.textContent.trim()));
        if (btn) { btn.click(); return btn.textContent.trim(); }
        return null;
      });
      if (confirmed) console.log(`  → 발행 확인 클릭: "${confirmed}"`);
    }

    // 9. 발행 완료 URL 대기
    await page.waitForURL(
      url => /blog\.naver\.com/.test(url.toString()) && /\d{5,}/.test(url.toString()),
      { timeout: 20000 }
    ).catch(() => console.warn('  ⚠️ URL 변경 대기 timeout'));

    const finalUrl = page.url();
    console.log(`  → 최종 URL: ${finalUrl}`);
    const m = finalUrl.match(/logNo=(\d+)/) || finalUrl.match(/\/(\d{5,})(?:[^/?#]|$)/);
    if (m?.[1]) return { postId: m[1], postUrl: `https://blog.naver.com/${blogId}/${m[1]}` };

    const bodyContent = await page.content().catch(() => '');
    const bm = bodyContent.match(/logNo[=:]["'\s]*(\d{5,})/) || bodyContent.match(/"(?:logNo|postNo)"\s*:\s*"?(\d{5,})"?/);
    if (bm?.[1]) return { postId: bm[1], postUrl: `https://blog.naver.com/${blogId}/${bm[1]}` };
    if (finalUrl.includes('PostWriteForm')) return { postId: '', postUrl: '' };
    return { postId: '', postUrl: finalUrl };

  } finally { await browser.close(); }
}

// ── 단일 작업 처리 ─────────────────────────────────────────────────────────────

async function processJob(job) {
  console.log(`\n📝 작업 처리: ${job.id}`);
  console.log(`   제목: ${job.title}`);
  await sbPatch('naver_publish_jobs', `id=eq.${job.id}`, { status: 'processing' });

  const conns = await sbGet('naver_connections', `user_id=eq.${job.user_id}&select=*`);
  const conn = conns[0];
  if (!conn?.nid_aut || !conn?.nid_ses) {
    await sbPatch('naver_publish_jobs', `id=eq.${job.id}`, { status: 'failed', error_message: '네이버 쿠키 없음', completed_at: new Date().toISOString() });
    console.error('  ❌ 쿠키 없음'); return;
  }

  let prepared;
  try { prepared = await prepareContent(job); }
  catch (e) {
    await sbPatch('naver_publish_jobs', `id=eq.${job.id}`, { status: 'failed', error_message: `[전처리 실패] ${e.message}`, completed_at: new Date().toISOString() });
    console.error(`  ❌ 전처리 실패: ${e.message}`); return;
  }

  let result;
  try {
    result = await publishWithPlaywright({
      blogId: conn.blog_id, nidAut: conn.nid_aut, nidSes: conn.nid_ses,
      title: prepared.title, content: prepared.content,
      tags: prepared.tags || [], categoryNo: prepared.category_no || 0,
      isPublish: prepared.is_publish !== false,
      thumbnailLocalPath: prepared._thumbnailLocalPath || null,
      scheduledAt: prepared.scheduled_at || null,
    });
  } catch (e) {
    await sbPatch('naver_publish_jobs', `id=eq.${job.id}`, { status: 'failed', error_message: e.message, completed_at: new Date().toISOString() });
    console.error(`  ❌ 실패: ${e.message}`); return;
  }

  const isSuccess = !!(result.postId || result.postUrl);
  await sbPatch('naver_publish_jobs', `id=eq.${job.id}`, {
    status: isSuccess ? 'completed' : 'failed',
    post_id: result.postId || null, post_url: result.postUrl || null,
    error_message: null, completed_at: new Date().toISOString(),
  });

  if (isSuccess) {
    await sbInsert('naver_publish_history', {
      user_id: job.user_id, blog_id: conn.blog_id,
      post_id: result.postId || '', post_url: result.postUrl || '',
      title: job.title, notion_page_id: job.notion_page_id || '', status: 'publish',
    });
    console.log(`  ✅ 발행 완료: ${result.postUrl}`);
  } else {
    console.error(`  ❌ 발행 실패: ${result.postUrl}`);
  }
}

// ── 메인 루프 ──────────────────────────────────────────────────────────────────

async function run() {
  console.log('🤖 네이버 블로그 로컬 에이전트 시작');
  console.log(`   모드: ${ONCE ? '한 번만 실행' : '연속 실행 (10초마다 폴링)'}`);
  console.log('   종료: Ctrl+C\n');

  let failCount = 0;
  do {
    try {
      const jobs = await sbGet('naver_publish_jobs', 'status=eq.pending&order=created_at.asc&limit=5&select=*');
      failCount = 0;
      if (jobs.length > 0) {
        console.log(`📬 대기 중인 작업 ${jobs.length}개 발견`);
        for (const job of jobs) await processJob(job);
      } else if (!ONCE) {
        process.stdout.write('⏳ 대기 중...\r');
      }
    } catch (e) {
      failCount++;
      console.error(`오류 (${failCount}/5): ${e.message}`);
      if (failCount >= 5) { console.error('❌ 연속 오류로 종료'); process.exit(1); }
    }
    if (ONCE) break;
    await new Promise(r => setTimeout(r, 10000));
  } while (true);

  console.log('\n✅ 에이전트 종료');
}

run().catch(e => { console.error(e); process.exit(1); });
