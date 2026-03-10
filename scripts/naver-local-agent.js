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

// ── 사람처럼 동작하는 유틸 ────────────────────────────────────────────────────

// 범위 내 랜덤 정수
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// 랜덤 대기 (ms)
const humanWait = (min = 300, max = 900) => new Promise(r => setTimeout(r, rnd(min, max)));

// 사람처럼 타이핑 (자연스러운 속도 변화 + 가끔 오타 수정)
async function humanType(page, text, { typoRate = 0.03 } = {}) {
  for (const ch of text) {
    // 가끔 오타 후 백스페이스 수정
    if (Math.random() < typoRate && /[a-zA-Z가-힣]/.test(ch)) {
      const wrongKeys = 'qwertyuiop';
      await page.keyboard.type(wrongKeys[rnd(0, wrongKeys.length - 1)], { delay: rnd(60, 130) });
      await humanWait(80, 200);
      await page.keyboard.press('Backspace');
      await humanWait(60, 150);
    }
    await page.keyboard.type(ch, { delay: rnd(40, 140) });
    // 단어 끝(공백)에서 잠깐 더 쉬기
    if (ch === ' ' || ch === '\n') await humanWait(50, 180);
  }
}

// 자연스러운 마우스 이동 후 클릭
async function humanClick(page, x, y) {
  // 현재 위치에서 목표까지 곡선 이동 (3~5 중간 경유점)
  const steps = rnd(3, 6);
  const cx = rnd(100, 900), cy = rnd(100, 400); // 임의 현재 위치 추정
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mx = cx + (x - cx) * t + rnd(-15, 15);
    const my = cy + (y - cy) * t + rnd(-10, 10);
    await page.mouse.move(mx, my);
    await humanWait(10, 40);
  }
  await page.mouse.move(x, y);
  await humanWait(50, 150);
  await page.mouse.click(x, y);
}

// 랜덤 스크롤 (사람처럼 페이지 훑기)
async function humanScroll(page) {
  const amount = rnd(100, 400);
  await page.mouse.wheel(0, amount);
  await humanWait(200, 500);
  await page.mouse.wheel(0, -rnd(50, 200));
  await humanWait(100, 300);
}

// User-Agent 풀 (실제 Mac Chrome 버전들)
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.130 Safari/537.36',
];

// ── 콘텐츠 파싱 / 이미지 처리 ─────────────────────────────────────────────────

/**
 * HTML을 텍스트/이미지 세그먼트 배열로 파싱
 * @returns {{ type: 'text'|'image', text?: string, url?: string, alt?: string }[]}
 */
function parseContentSegments(html) {
  const segments = [];
  const imgRegex = /<img\s[^>]*>/gi;
  let lastIndex = 0;
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    // img 앞 텍스트 블록
    const textHtml = html.slice(lastIndex, match.index);
    const text = textHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .trim();
    if (text) segments.push({ type: 'text', text });

    // 이미지 블록
    const imgTag = match[0];
    const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
    const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);
    if (srcMatch) {
      segments.push({ type: 'image', url: srcMatch[1], alt: altMatch?.[1] || '' });
    }

    lastIndex = match.index + match[0].length;
  }

  // 마지막 텍스트 블록
  const tailHtml = html.slice(lastIndex);
  const tail = tailHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
  if (tail) segments.push({ type: 'text', text: tail });

  return segments;
}

/**
 * URL에서 이미지를 다운로드해 /tmp에 저장
 * @returns {string} 로컬 파일 경로
 */
async function downloadImage(url, index) {
  const ua = USER_AGENTS[rnd(0, USER_AGENTS.length - 1)];
  const res = await fetch(url, { headers: { 'User-Agent': ua } });
  if (!res.ok) throw new Error(`이미지 다운로드 실패: ${res.status} ${url}`);

  const contentType = res.headers.get('content-type') || '';
  const ext = contentType.includes('png') ? 'png'
    : contentType.includes('gif') ? 'gif'
    : contentType.includes('webp') ? 'webp'
    : 'jpg';

  const filePath = `/tmp/naver-img-${index}-${Date.now()}.${ext}`;
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(filePath, buf);
  console.log(`  → 이미지 다운로드: ${filePath} (${buf.length} bytes)`);
  return filePath;
}

/**
 * SE4 에디터에 이미지 파일 업로드
 */
async function insertImageToSE4(page, filePath) {
  // filechooser 이벤트 리스너를 먼저 등록
  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 8000 });

  // SE4 이미지 버튼 클릭 (다중 셀렉터 시도)
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
    // aria-label/title에 "사진"/"이미지" 포함 버튼 탐색
    btnClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => {
        const label = (b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || '');
        return /사진|이미지|image/i.test(label);
      });
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (btnClicked) console.log('  → SE4 이미지 버튼 클릭 (aria-label/title)');
  }

  if (!btnClicked) throw new Error('SE4 이미지 버튼을 찾을 수 없습니다');

  await humanWait(500, 1000);

  // 서브패널의 "파일"/"내 PC"/"업로드" 버튼 클릭
  const uploadPanelClicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, li, a'));
    const btn = btns.find(b => {
      const t = b.textContent.trim();
      return t === '파일' || t === '내 PC' || t === '업로드' || /파일 업로드/i.test(t);
    });
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (uploadPanelClicked) {
    console.log('  → 파일 업로드 패널 버튼 클릭');
    await humanWait(300, 600);
  }

  // fileChooser로 파일 전달
  let fileChooser;
  try {
    fileChooser = await fileChooserPromise;
  } catch {
    // 서브패널 없이 바로 fileChooser가 열리는 경우도 있음 - 재시도
    throw new Error('fileChooser 이벤트를 받지 못했습니다 (이미지 버튼 클릭 실패 가능)');
  }

  await fileChooser.setFiles(filePath);
  console.log(`  → 파일 전달: ${filePath}`);

  // 업로드 완료 대기
  await humanWait(2500, 4000);

  // 확인/삽입 버튼 클릭 (있으면)
  const confirmClicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => {
      const t = b.textContent.trim();
      return t === '확인' || t === '삽입' || t === '추가' || t === '완료';
    });
    if (btn && btn.offsetParent !== null) { btn.click(); return true; }
    return false;
  });
  if (confirmClicked) {
    console.log('  → 이미지 삽입 확인 버튼 클릭');
    await humanWait(500, 1000);
  }

  // Enter 키로 커서를 이미지 아래에 위치
  await page.keyboard.press('Enter');
  await humanWait(200, 400);
}

// ── AI 전처리 파이프라인 ──────────────────────────────────────────────────────

/**
 * app_settings 테이블에서 API 키 로드 (id=1 row의 settings JSON)
 * 없으면 process.env 폴백
 */
async function sbGetAppSettings() {
  try {
    const rows = await sbGet('app_settings', 'id=eq.1&select=settings');
    const settings = rows[0]?.settings || {};
    return {
      GEMINI_API_KEY: settings.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '',
      CLAUDE_API_KEY: settings.CLAUDE_API_KEY || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || '',
      OPENAI_API_KEY: settings.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '',
    };
  } catch {
    return {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
      CLAUDE_API_KEY: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || '',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    };
  }
}

/**
 * AI API 호출 (gemini / claude / gpt4o / gpt4 / gpt35)
 */
async function callAI(prompt, provider = 'gemini', apiKeys = {}) {
  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKeys.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.content?.[0]?.text || '';
  }

  if (provider === 'gpt4o' || provider === 'gpt4' || provider === 'gpt35') {
    const modelMap = { gpt4o: 'gpt-4o', gpt4: 'gpt-4', gpt35: 'gpt-3.5-turbo' };
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKeys.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelMap[provider],
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // gemini (default)
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKeys.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * HTML 초안을 AI로 리라이팅 → 네이버 블로그용 HTML 반환
 */
async function rewriteContent(title, rawHtml, aiPrompt, provider, apiKeys) {
  const plainText = rawHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .trim();

  const prompt = `다음 초안을 네이버 블로그 포스팅 형식으로 리라이팅해주세요.
제목: ${title}
규칙:
- <p> 태그를 사용해 단락 구분
- 2000자 내외 (한국어 기준)
- 자연스럽고 친근한 블로그 문체
- HTML만 출력 (다른 설명 없이)
${aiPrompt ? `추가 지시사항: ${aiPrompt}` : ''}

초안:
${plainText}`;

  const result = await callAI(prompt, provider, apiKeys);
  // 코드블록 감싸기 제거
  return result.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();
}

/**
 * Gemini image generation으로 썸네일 생성 → /tmp에 저장
 * @returns {string} 로컬 파일 경로
 */
async function generateThumbnail(jobId, title, thumbnailPrompt, geminiApiKey) {
  const prompt = thumbnailPrompt || `"${title}" 블로그 대표이미지, 깔끔한 일러스트, 16:9 비율, 고화질`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini 이미지 생성 실패: ${res.status} ${await res.text()}`);

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imgPart) throw new Error('Gemini 이미지 응답 없음');

  const ext = imgPart.inlineData.mimeType.includes('png') ? 'png' : 'jpg';
  const filePath = `/tmp/naver-thumb-${jobId}-${Date.now()}.${ext}`;
  const buf = Buffer.from(imgPart.inlineData.data, 'base64');
  fs.writeFileSync(filePath, buf);
  console.log(`  → 썸네일 생성: ${filePath} (${buf.length} bytes)`);
  return filePath;
}

/**
 * Playwright로 URL 스크랩 → { title, bodyHtml, imageUrls }
 */
async function scrapeSourceUrl(url) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: USER_AGENTS[rnd(0, USER_AGENTS.length - 1)],
      locale: 'ko-KR',
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const result = await page.evaluate(() => {
      // 제목 추출
      const title = document.querySelector('h1')?.textContent?.trim()
        || document.title?.trim()
        || '';

      // 본문 컨테이너 탐색
      const container = document.querySelector('article')
        || document.querySelector('.content')
        || document.querySelector('main')
        || document.body;

      // h1~h3, p 태그만 추출
      const bodyParts = [];
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            const tag = node.tagName?.toLowerCase();
            if (['h1', 'h2', 'h3', 'p'].includes(tag)) return NodeFilter.FILTER_ACCEPT;
            return NodeFilter.FILTER_SKIP;
          },
        }
      );
      let node;
      while ((node = walker.nextNode())) {
        const tag = node.tagName.toLowerCase();
        const text = node.textContent?.trim();
        if (text) bodyParts.push(`<${tag}>${text}</${tag}>`);
      }

      // 이미지 URL 수집 (http(s) 시작, 너비 ≥ 100px)
      const imageUrls = [];
      document.querySelectorAll('img[src]').forEach(img => {
        const src = img.getAttribute('src') || '';
        if (/^https?:\/\//i.test(src) && (img.naturalWidth >= 100 || img.width >= 100)) {
          imageUrls.push(src);
        }
      });

      return { title, bodyHtml: bodyParts.join('\n'), imageUrls };
    });

    return result;
  } finally {
    await browser.close();
  }
}

/**
 * 리라이팅된 HTML에 스크랩 이미지를 균등 배분
 */
function mixContentWithImages(rewrittenHtml, imageUrls) {
  if (!imageUrls || imageUrls.length === 0) return rewrittenHtml;

  // <p> 태그 기준 단락 분리
  const paragraphRegex = /(<p[^>]*>[\s\S]*?<\/p>)/gi;
  const paragraphs = [];
  let match;
  let lastIndex = 0;

  while ((match = paragraphRegex.exec(rewrittenHtml)) !== null) {
    paragraphs.push(match[1]);
    lastIndex = match.index + match[0].length;
  }

  // p 태그가 없으면 원본 반환
  if (paragraphs.length === 0) {
    const imgTags = imageUrls.map(url => `<p><img src="${url}" /></p>`).join('\n');
    return rewrittenHtml + '\n' + imgTags;
  }

  const M = imageUrls.length;
  const N = paragraphs.length;
  // 이미지 삽입 위치: 단락 사이에 균등 배분
  const interval = N / (M + 1);
  const result = [];

  paragraphs.forEach((para, i) => {
    result.push(para);
    // 이미지 삽입 여부 확인
    for (let j = 0; j < M; j++) {
      const insertPos = Math.round(interval * (j + 1));
      if (i + 1 === insertPos) {
        result.push(`<p><img src="${imageUrls[j]}" /></p>`);
      }
    }
  });

  return result.join('\n');
}

/**
 * job_type에 따라 content 전처리
 * @returns {{ ...job, content: string, _thumbnailLocalPath?: string }}
 */
async function prepareContent(job) {
  const jobType = job.job_type || 'draft';

  if (jobType === 'draft') {
    // 대표이미지 URL이 있으면 다운로드해서 썸네일로 사용
    if (job.thumbnail_prompt?.startsWith('__url__:')) {
      const imgUrl = job.thumbnail_prompt.replace('__url__:', '');
      console.log(`  → [draft] 대표이미지 다운로드: ${imgUrl}`);
      const thumbPath = await downloadImage(imgUrl, `thumb-${job.id}`);
      return { ...job, _thumbnailLocalPath: thumbPath };
    }
    return job;
  }

  const apiKeys = await sbGetAppSettings();
  const provider = job.ai_provider || 'gemini';

  if (jobType === 'rewrite') {
    console.log('  → [rewrite] AI 리라이팅 시작...');
    const rewrittenHtml = await rewriteContent(
      job.title, job.content, job.ai_prompt, provider, apiKeys
    );
    console.log('  → [rewrite] 리라이팅 완료');

    console.log('  → [rewrite] 썸네일 생성 시작...');
    const thumbPath = await generateThumbnail(
      job.id, job.title, job.thumbnail_prompt, apiKeys.GEMINI_API_KEY
    );

    return { ...job, content: rewrittenHtml, _thumbnailLocalPath: thumbPath };
  }

  if (jobType === 'scrape') {
    console.log(`  → [scrape] 스크랩 시작: ${job.source_url}`);
    const scraped = await scrapeSourceUrl(job.source_url);
    console.log(`  → [scrape] 스크랩 완료 - 이미지 ${scraped.imageUrls.length}개`);

    // 스크랩 원본 DB 저장
    await sbPatch('naver_publish_jobs', `id=eq.${job.id}`, { raw_content: scraped.bodyHtml });

    // 제목이 비어있으면 스크랩 제목 사용
    const finalTitle = job.title?.trim() || scraped.title;

    console.log('  → [scrape] AI 리라이팅 시작...');
    const rewrittenHtml = await rewriteContent(
      finalTitle, scraped.bodyHtml, job.ai_prompt, provider, apiKeys
    );
    console.log('  → [scrape] 리라이팅 완료');

    const mixedHtml = mixContentWithImages(rewrittenHtml, scraped.imageUrls);

    console.log('  → [scrape] 썸네일 생성 시작...');
    const thumbPath = await generateThumbnail(
      job.id, finalTitle, job.thumbnail_prompt, apiKeys.GEMINI_API_KEY
    );

    return { ...job, title: finalTitle, content: mixedHtml, _thumbnailLocalPath: thumbPath };
  }

  return job;
}

// ── Playwright 발행 ───────────────────────────────────────────────────────────

async function publishWithPlaywright({ blogId, nidAut, nidSes, title, content, tags, categoryNo, isPublish, thumbnailLocalPath, scheduledAt }) {
  const browser = await chromium.launch({
    headless: false,
    slowMo: rnd(30, 80), // 랜덤 slowMo
    args: ['--disable-blink-features=AutomationControlled'], // navigator.webdriver 숨기기
  });

  try {
    // 랜덤 뷰포트 (일반적인 맥 해상도)
    const viewports = [
      { width: 1440, height: 900 }, { width: 1280, height: 800 },
      { width: 1512, height: 982 }, { width: 1920, height: 1080 },
    ];
    const viewport = viewports[rnd(0, viewports.length - 1)];

    const context = await browser.newContext({
      userAgent: USER_AGENTS[rnd(0, USER_AGENTS.length - 1)],
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
      viewport,
      // 웹드라이버 감지 회피
      extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7' },
    });

    // navigator.webdriver 프로퍼티 숨기기
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });

    // 네이버 세션 쿠키 설정
    await context.addCookies([
      { name: 'NID_AUT', value: nidAut, domain: '.naver.com', path: '/' },
      { name: 'NID_SES', value: nidSes, domain: '.naver.com', path: '/' },
    ]);

    const page = await context.newPage();

    // 1. 네이버 메인 방문 + 자연스러운 대기
    console.log('  → naver.com 방문 중...');
    await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await humanWait(800, 2000); // 사람처럼 페이지 로드 후 잠깐 보기
    await humanScroll(page);   // 스크롤 조금

    // 2. 블로그 글쓰기 페이지 이동
    console.log('  → 블로그 글쓰기 페이지로 이동...');
    await humanWait(500, 1500);
    await page.goto(`https://blog.naver.com/PostWriteForm.naver?blogId=${blogId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    const currentUrl = page.url();
    console.log(`  → 현재 URL: ${currentUrl}`);

    if (currentUrl.includes('nid.naver.com') || currentUrl.includes('/login')) {
      throw new Error('AUTH: 쿠키가 만료되었습니다. 설정 탭에서 새 쿠키를 입력해주세요.');
    }

    // SE4 에디터 로드 대기 - 툴바 버튼이 나타날 때까지
    console.log('  → SE4 에디터 로드 대기...');
    await page.locator('button[class*="se-image-toolbar-button"]').first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => console.warn('  ⚠️ SE4 toolbar 대기 timeout'));
    await page.waitForTimeout(1000);

    // 초기 상태 스크린샷 (다이얼로그 확인용)
    await page.screenshot({ path: '/tmp/naver-initial.png', fullPage: false }).catch(() => {});

    // 임시저장 복원 다이얼로그 처리 ("작성 중인 글이 있습니다")
    // Playwright locator로 직접 클릭 (더 신뢰성 있음)
    try {
      // 정확히 "취소" 텍스트인 버튼 ("취소선" 등 부분 매칭 방지)
      const draftCancelBtn = page.locator('button').filter({ hasText: /^취소$/ }).first();
      if (await draftCancelBtn.count() > 0) {
        await draftCancelBtn.click({ timeout: 3000 });
        console.log('  → 임시저장 다이얼로그 닫기 (취소 클릭)');
        await page.waitForTimeout(1000);
      } else {
        console.log('  → 임시저장 다이얼로그 없음');
      }
    } catch (e) {
      console.warn('  ⚠️ 다이얼로그 처리 실패:', e.message?.slice(0, 50));
    }

    // ESC로 혹시 남은 팝업 닫기
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // ── 제목 입력 (독립 전략) ─────────────────────────────────────────────────
    const vp = page.viewportSize() || { width: 1280, height: 900 };
    console.log('  → 제목 입력...');
    await humanWait(400, 800);

    const titleStrategies = [
      async () => {
        const el = page.locator('.se-title-text').first();
        if (await el.count() === 0) return false;
        await el.click({ force: true, timeout: 3000 });
        await humanWait(200, 500);
        await humanType(page, title);
        return true;
      },
      async () => {
        const ce = page.locator('[contenteditable]').first();
        if (await ce.count() === 0) return false;
        await ce.click({ force: true, timeout: 3000 });
        await humanWait(200, 500);
        await humanType(page, title);
        return true;
      },
      async () => {
        await humanClick(page, vp.width / 2, 200);
        await humanWait(300, 600);
        await humanType(page, title);
        return true;
      },
    ];

    let titleFilled = false;
    for (const fn of titleStrategies) {
      try { if (await fn()) { titleFilled = true; break; } } catch {}
    }
    console.log(titleFilled ? '  → 제목 입력 완료' : '  ⚠️ 제목 입력 실패');

    // ── 썸네일 삽입 (rewrite/scrape 모드) ────────────────────────────────────
    if (thumbnailLocalPath && fs.existsSync(thumbnailLocalPath)) {
      console.log('  → 썸네일 삽입 시작...');
      // 본문 영역 포커스 (첫 번째 삽입)
      const bodyFocusForThumb = [
        async () => {
          const ces = page.locator('[contenteditable="true"]');
          const count = await ces.count();
          for (let i = 1; i < count; i++) {
            try { await ces.nth(i).click({ force: true, timeout: 3000 }); return true; } catch {}
          }
          return false;
        },
        async () => {
          for (const sel of ['.se-main-section', '.se-document', '[class*="content_body"]']) {
            const el = page.locator(sel).first();
            if (await el.count() > 0) {
              await el.click({ force: true, timeout: 3000 }); return true;
            }
          }
          return false;
        },
        async () => { await humanClick(page, vp.width / 2, 450); return true; },
      ];
      for (const fn of bodyFocusForThumb) {
        try { if (await fn()) break; } catch {}
      }
      try {
        await insertImageToSE4(page, thumbnailLocalPath);
        console.log('  → 썸네일 삽입 완료');
        // 임시파일 삭제
        fs.unlinkSync(thumbnailLocalPath);
        console.log(`  → 썸네일 임시파일 삭제: ${thumbnailLocalPath}`);
      } catch (e) {
        console.warn(`  ⚠️ 썸네일 삽입 실패: ${e.message}`);
      }
    }

    // ── 본문 입력 (세그먼트 기반: 텍스트 + 이미지) ───────────────────────────
    console.log('  → 본문 입력...');
    await humanWait(500, 1000); // 제목 쓰고 잠깐 쉬기

    const segments = parseContentSegments(content);
    console.log(`  → 세그먼트: ${segments.map(s => s.type === 'image' ? '[IMG]' : '[TXT]').join(' ')}`);

    // 본문 영역 포커스
    let bodyFocused = false;
    const bodyFocusStrategies = [
      async () => {
        const ces = page.locator('[contenteditable="true"]');
        const count = await ces.count();
        for (let i = 1; i < count; i++) {
          try {
            await ces.nth(i).click({ force: true, timeout: 3000 });
            await humanWait(300, 600);
            return true;
          } catch {}
        }
        return false;
      },
      async () => {
        for (const sel of ['.se-main-section', '.se-document', '[class*="content_body"]', '.se-section-text']) {
          const el = page.locator(sel).first();
          if (await el.count() > 0) {
            await el.click({ force: true, timeout: 3000 });
            await humanWait(300, 600);
            return true;
          }
        }
        return false;
      },
      async () => {
        await humanClick(page, vp.width / 2, 450);
        await humanWait(800, 1500);
        return true;
      },
    ];
    for (const fn of bodyFocusStrategies) {
      try { if (await fn()) { bodyFocused = true; break; } } catch {}
    }
    if (!bodyFocused) console.warn('  ⚠️ 본문 영역 포커스 실패');

    // ── 본문 가운데 정렬 ──────────────────────────────────────────────────────
    await humanWait(300, 500);
    const alignSet = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
      const btn = candidates.find(el => {
        const label = (
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          el.getAttribute('data-name') ||
          el.textContent || ''
        ).toLowerCase();
        return label.includes('가운데') || label.includes('center') || label.includes('중앙');
      });
      if (btn) { btn.click(); return btn.getAttribute('aria-label') || btn.getAttribute('title') || 'center'; }
      return null;
    });
    if (alignSet) console.log(`  → 가운데 정렬 설정: "${alignSet}"`);
    else console.warn('  ⚠️ 가운데 정렬 버튼 못 찾음 (SE4 구조 변경 가능성)');
    await humanWait(200, 400);

    // 전체 선택 후 가운데 정렬 단축키도 시도 (Ctrl+E)
    if (!alignSet) {
      await page.keyboard.press('Control+a');
      await humanWait(100, 200);
      await page.keyboard.press('Control+e');
      await humanWait(200, 300);
      console.log('  → 가운데 정렬 단축키(Ctrl+E) 시도');
    }

    // 세그먼트 순회 입력
    let imgIndex = 0;
    let lastType = null;
    let bodyFilled = false;
    for (const seg of segments) {
      if (seg.type === 'text') {
        if (lastType === 'image') {
          // 이미지 다음에 텍스트: body 영역 재포커스 후 Enter 삽입
          for (const fn of bodyFocusStrategies) {
            try { if (await fn()) break; } catch {}
          }
          await page.keyboard.press('Enter');
          await humanWait(200, 400);
          // 재포커스 후 가운데 정렬 재적용
          await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button, [role="button"]')).find(el => {
              const label = (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('data-name') || '').toLowerCase();
              return label.includes('가운데') || label.includes('center');
            });
            if (btn) btn.click();
          });
          await humanWait(100, 200);
        }
        await humanType(page, seg.text);
        bodyFilled = true;
      } else if (seg.type === 'image') {
        if (lastType === 'text') {
          await page.keyboard.press('Enter');
          await humanWait(200, 400);
        }
        let tmpPath = null;
        try {
          tmpPath = await downloadImage(seg.url, imgIndex++);
          await insertImageToSE4(page, tmpPath);
          bodyFilled = true;
        } catch (e) {
          console.warn(`  ⚠️ 이미지 삽입 실패: ${e.message}`);
        } finally {
          if (tmpPath && fs.existsSync(tmpPath)) {
            fs.unlinkSync(tmpPath);
            console.log(`  → 임시파일 삭제: ${tmpPath}`);
          }
        }
      }
      lastType = seg.type;
    }
    console.log(bodyFilled ? '  → 본문 입력 완료' : '  ⚠️ 본문 입력 실패');

    // ── 태그 입력 (SE4: 본문에 #태그명 직접 입력 방식) ──────────────────────
    if (tags && tags.length > 0) {
      console.log(`  → 태그 입력: ${tags.join(', ')}`);
      await humanWait(400, 800);

      // 본문 마지막에 커서 위치 (본문 영역 재포커스)
      for (const fn of bodyFocusStrategies) {
        try { if (await fn()) break; } catch {}
      }
      // 본문 끝으로 이동
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await humanWait(200, 400);

      // 각 태그를 #태그명 형식으로 입력 후 Enter (자동 태그 변환)
      for (const tag of tags) {
        const tagText = '#' + tag.replace(/^#/, '');
        await humanType(page, tagText);
        await page.keyboard.press('Enter');
        await humanWait(300, 600);
      }
      console.log('  → 태그 입력 완료');
    }

    // 스크린샷 저장 (디버깅용)
    await page.screenshot({ path: '/tmp/naver-after-input.png', fullPage: false }).catch(() => {});
    console.log('  → 스크린샷: /tmp/naver-after-input.png');

    await page.waitForTimeout(1000);

    // 5. 카테고리 선택
    if (categoryNo > 0) {
      const catSel = page.locator('select[name="categoryNo"]').first();
      if (await catSel.count() > 0) {
        await catSel.selectOption(String(categoryNo));
        console.log(`  → 카테고리 설정: ${categoryNo}`);
      }
    }

    // 6. 발행 버튼 클릭
    console.log('  → 발행 버튼 클릭...');

    // 팝업/오버레이 닫기 (se-popup-dim이 클릭을 막을 수 있음)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    // se-popup-dim이 사라질 때까지 대기 (최대 3초)
    await page.locator('.se-popup-dim').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});

    // JS 직접 클릭 (오버레이 무시)
    let published = await page.evaluate(() => {
      const btn = document.querySelector('button.publish_btn__m9KHH') ||
        Array.from(document.querySelectorAll('button')).find(b =>
          b.textContent.trim() === '발행' && !b.className.includes('reserve')
        );
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (published) console.log('  → 발행 버튼 클릭 (JS)');

    if (published) {
      // 발행 설정 패널 열릴 때까지 대기
      await page.waitForTimeout(1500);

      // 패널 내 버튼 덤프 (디버깅)
      const panelBtns = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null)
          .map(b => ({ txt: b.textContent.trim().slice(0, 20), cls: b.className.slice(0, 50) }))
      );
      console.log('  [패널 버튼]:', panelBtns.map(b => `"${b.txt}"`).join(' | '));

      // ── 예약 발행 처리 ──────────────────────────────────────────────────────
      if (scheduledAt) {
        const schedDate = new Date(scheduledAt);
        console.log(`  → 예약 발행 설정: ${schedDate.toLocaleString('ko-KR')}`);

        // "예약" 관련 버튼/라디오 클릭
        const schedToggled = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('button, label, input[type="radio"], li'));
          const el = els.find(e => {
            const t = (e.textContent || e.getAttribute('aria-label') || e.getAttribute('value') || '').trim();
            return /예약/.test(t);
          });
          if (el) { el.click(); return true; }
          return false;
        });

        if (schedToggled) {
          console.log('  → 예약 발행 옵션 클릭');
          await humanWait(500, 1000);

          // 날짜 입력 (YYYY.MM.DD 또는 YYYY-MM-DD 형식)
          const yy = schedDate.getFullYear();
          const mm = String(schedDate.getMonth() + 1).padStart(2, '0');
          const dd = String(schedDate.getDate()).padStart(2, '0');
          const hh = String(schedDate.getHours()).padStart(2, '0');
          const min = String(schedDate.getMinutes()).padStart(2, '0');

          // 날짜 input 탐색 및 입력
          const dateSet = await page.evaluate((y, mo, d) => {
            const inputs = Array.from(document.querySelectorAll('input'));
            const dateInput = inputs.find(i =>
              i.type === 'date' || i.placeholder?.includes('날짜') ||
              i.className.includes('date') || i.name?.includes('date')
            );
            if (dateInput) {
              dateInput.value = `${y}-${mo}-${d}`;
              dateInput.dispatchEvent(new Event('input', { bubbles: true }));
              dateInput.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
          }, yy, mm, dd);
          if (dateSet) console.log(`  → 날짜 입력: ${yy}-${mm}-${dd}`);

          // 시간 input 탐색 및 입력
          const timeSet = await page.evaluate((h, mi) => {
            const inputs = Array.from(document.querySelectorAll('input'));
            const timeInput = inputs.find(i =>
              i.type === 'time' || i.placeholder?.includes('시간') ||
              i.className.includes('time') || i.name?.includes('time')
            );
            if (timeInput) {
              timeInput.value = `${h}:${mi}`;
              timeInput.dispatchEvent(new Event('input', { bubbles: true }));
              timeInput.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
          }, hh, min);
          if (timeSet) console.log(`  → 시간 입력: ${hh}:${min}`);

          await humanWait(400, 700);
        } else {
          console.warn('  ⚠️ 예약 발행 옵션을 찾지 못했습니다 — 즉시 발행으로 진행합니다');
        }
      }

      // 발행하기 확인 클릭 - 마지막 "발행" 버튼 (패널 내 확인 버튼)
      const confirmed = await page.evaluate(() => {
        const visibleBtns = Array.from(document.querySelectorAll('button'))
          .filter(b => b.offsetParent !== null);
        const btn = [...visibleBtns].reverse().find(b => {
          const t = b.textContent.trim();
          return t === '발행하기' || t === '발행' || t === '예약 발행';
        });
        if (btn) { btn.click(); return btn.textContent.trim(); }
        return null;
      });
      if (confirmed) console.log(`  → 발행 확인 클릭: "${confirmed}"`);
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

    // URL이 글쓰기 폼 그대로면 실패
    if (finalUrl.includes('PostWriteForm')) {
      return { postId: '', postUrl: '' };
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

  // 전처리 (rewrite/scrape 모드)
  let prepared;
  try {
    prepared = await prepareContent(job);
  } catch (e) {
    const errMsg = e.message || String(e);
    await sbPatch('naver_publish_jobs', `id=eq.${job.id}`, {
      status: 'failed',
      error_message: `[전처리 실패] ${errMsg}`,
      completed_at: new Date().toISOString(),
    });
    console.error(`  ❌ 전처리 실패: ${errMsg}`);
    return;
  }

  let result;
  try {
    result = await publishWithPlaywright({
      blogId: conn.blog_id,
      nidAut: conn.nid_aut,
      nidSes: conn.nid_ses,
      title: prepared.title,
      content: prepared.content,
      tags: prepared.tags || [],
      categoryNo: prepared.category_no || 0,
      isPublish: prepared.is_publish !== false,
      thumbnailLocalPath: prepared._thumbnailLocalPath || null,
      scheduledAt: prepared.scheduled_at || null,
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
    thumbnail_url: prepared._thumbnailLocalPath ? `[local:${prepared._thumbnailLocalPath}]` : null,
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

  let failCount = 0;
  const MAX_FAIL = 5;

  do {
    try {
      const jobs = await sbGet(
        'naver_publish_jobs',
        'status=eq.pending&order=created_at.asc&limit=5&select=*'
      );
      failCount = 0; // 성공 시 초기화

      if (jobs.length > 0) {
        console.log(`📬 대기 중인 작업 ${jobs.length}개 발견`);
        for (const job of jobs) {
          await processJob(job);
        }
      } else if (!ONCE) {
        process.stdout.write('⏳ 대기 중...\r');
      }
    } catch (e) {
      failCount++;
      console.error(`오류 (${failCount}/${MAX_FAIL}): ${e.message}`);
      if (failCount >= MAX_FAIL) {
        console.error('❌ 연속 오류로 종료. 네트워크/Supabase 설정을 확인하세요.');
        process.exit(1);
      }
    }

    if (ONCE) break;
    await new Promise(r => setTimeout(r, 10000)); // 10초 대기
  } while (true);

  console.log('\n✅ 에이전트 종료');
}

run().catch(e => { console.error(e); process.exit(1); });
