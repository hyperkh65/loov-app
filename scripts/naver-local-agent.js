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
const FORCE = process.argv.includes('--force'); // server1 alive 무시, 모든 pending 처리

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

/** Primary(오래된 맥북) 에이전트가 살아있는지 확인 (60초 이내 heartbeat) */
async function isPrimaryAlive() {
  try {
    const rows = await sbGet('naver_agent_heartbeat', 'agent_id=eq.primary&select=last_seen');
    if (!rows.length) return false;
    const ageMs = Date.now() - new Date(rows[0].last_seen).getTime();
    return ageMs < 60000; // 60초 이내면 살아있음
  } catch (_) {
    return false; // 테이블 없거나 오류 → fallback 작동
  }
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
 * HTML을 텍스트/이미지 세그먼트 배열로 파싱 — .github/scripts/publish-naver.js의
 * htmlToParagraphs()와 동일 로직(소제목 인식 + 자동 번호매기기 방지 포함)을
 * 그대로 포팅. 예전엔 이 함수가 <h2> 등 소제목 태그를 그냥 다 벗겨서 본문과
 * 구분 없이 타이핑해버렸음 — 그래서 소제목 서식이 하나도 안 먹었던 것.
 * @returns {{ type: 'text'|'image', text?: string, isHeading?: boolean, url?: string, alt?: string }[]}
 */
function parseContentSegments(html) {
  const stripInline = (s) => s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  const stripHeadingNumber = (s) => s.replace(/^\d+[.)]\s*/, '');
  const dodgeAutoNumber = (s) => s.replace(/^(\d+)([.)])/, `$1​$2`);

  const blockRe = /<figure\b[^>]*>[\s\S]*?<img\b[^>]*\bsrc="([^"]+)"[^>]*>[\s\S]*?<\/figure>|<img\b[^>]*\bsrc="([^"]+)"[^>]*>|<(p|h[1-6]|li)\b[^>]*>([\s\S]*?)<\/\3>/gi;
  const results = [];
  let m;
  while ((m = blockRe.exec(html))) {
    if (m[1] || m[2]) {
      results.push({ type: 'image', url: m[1] || m[2] });
      continue;
    }
    const isHeading = /^h[1-6]$/i.test(m[3]);
    for (const line of stripInline(m[4]).split('\n').map((s) => s.trim()).filter(Boolean)) {
      const text = isHeading ? stripHeadingNumber(line) : dodgeAutoNumber(line);
      results.push({ type: 'text', text, isHeading });
    }
  }
  if (results.length > 0) return results;

  // 블록 태그가 하나도 안 잡힌 예외적 입력 — 줄바꿈 기준 폴백
  return stripInline(html.replace(/<\/div>/gi, '\n'))
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .map((text) => ({ type: 'text', text: dodgeAutoNumber(text), isHeading: false }));
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
      NAVER_CLIENT_ID: settings.NAVER_CLIENT_ID || process.env.NAVER_CLIENT_ID || '',
      NAVER_CLIENT_SECRET: settings.NAVER_CLIENT_SECRET || process.env.NAVER_CLIENT_SECRET || '',
      GROQ_API_KEYS: settings.GROQ_API_KEYS || process.env.GROQ_API_KEYS || '',
    };
  } catch {
    return {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
      CLAUDE_API_KEY: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || '',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
      NAVER_CLIENT_ID: process.env.NAVER_CLIENT_ID || '',
      NAVER_CLIENT_SECRET: process.env.NAVER_CLIENT_SECRET || '',
      GROQ_API_KEYS: process.env.GROQ_API_KEYS || '',
    };
  }
}

/**
 * Groq 라운드로빈 호출 (lib/ai-translate.ts의 fetchGroqChat과 동일 패턴 —
 * 무료 티어 키 하나로는 분당 토큰 한도(TPM)에 쉽게 걸려서 4개 키를 돌려씀).
 */
let groqKeyIdx = 0;
async function callGroq(prompt, apiKeys) {
  const keys = (apiKeys.GROQ_API_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean);
  if (!keys.length) throw new Error('GROQ_API_KEYS 설정 없음');

  let lastErr = '';
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[groqKeyIdx % keys.length];
      groqKeyIdx++;
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'qwen/qwen3.8-27b',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 8192,
          }),
          signal: AbortSignal.timeout(90000),
        });
        if (res.status === 429) { lastErr = `429 rate limit (key ${i})`; continue; }
        if (!res.ok) throw new Error(`Groq API ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
      } catch (e) {
        if (e.message?.startsWith('Groq API')) throw e;
        lastErr = e.message;
      }
    }
    if (pass === 0) await new Promise((r) => setTimeout(r, 60000)); // TPM 한도 리셋 대기
  }
  throw new Error(`Groq 호출 실패 — 키 ${keys.length}개 모두 rate limit: ${lastErr}`);
}

/**
 * AI API 호출 (groq / gemini / claude / gpt4o / gpt4 / gpt35)
 */
async function callAI(prompt, provider = 'gemini', apiKeys = {}) {
  if (provider === 'groq') {
    return callGroq(prompt, apiKeys);
  }

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
        max_tokens: 8192, // 4000~5000자 한국어 출력이 잘리지 않도록 여유있게
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
        max_tokens: 8192, // 4000~5000자 한국어 출력이 잘리지 않도록 여유있게
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // gemini (default)
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKeys.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 8192 }, // 4000~5000자 한국어 출력이 잘리지 않도록 여유있게
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * 네이버 뉴스/블로그 검색 (lib/blog-content-generator.ts의 searchNaver와 동일) —
 * 원문 하나만 리라이팅하면 그 글을 그대로 따라 쓴 것처럼 보이므로, 같은 주제의
 * 다른 기사·블로그를 같이 참고자료로 넣어 여러 소스를 종합한 글이 되게 한다.
 */
async function searchNaver(type, query, clientId, clientSecret) {
  if (!clientId || !clientSecret || !query) return [];
  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/${type}.json?query=${encodeURIComponent(query)}&display=10&sort=date`,
      { headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map((item) => ({
      title: item.title.replace(/<[^>]+>/g, ''),
      description: item.description.replace(/<[^>]+>/g, ''),
      link: item.link || '',
    }));
  } catch { return []; }
}

/**
 * HTML 초안을 AI로 리라이팅 → 네이버 블로그용 HTML 반환
 * (lib/blog-content-generator.ts의 buildBlogPrompt와 동일한 규칙/분량 기준 — 블로그자동화 프롬프트와 통일)
 */
async function rewriteContent(title, rawHtml, aiPrompt, provider, apiKeys, refItems = []) {
  const plainText = rawHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .trim();

  const refBlock = refItems.length
    ? `\n참고자료(같은 주제의 다른 기사·블로그 — 맥락 보강 및 다각도 종합용, 베끼지 말고 사실관계만 참고):\n${refItems.map((r, i) => `[참고${i + 1}] ${r.title} — ${r.description}`).join('\n')}\n`
    : '';

  const prompt = `한국어 SEO 블로그 작가입니다. 아래 원문 초안을 리라이팅해 "${title}" 블로그 글을 작성하세요.

원문 초안(리라이팅 대상 — 표절 금지, 사실·정보는 유지하되 문장은 완전히 새롭게 재구성. 원문이 영어 등 외국어라면 단순 직역하지 말고, 그 내용을 완전히 이해한 한국인 전문 블로거가 정성껏 직접 쓴 것처럼 자연스러운 한국어 문장으로 재구성할 것 — 번역투 어색한 문장 금지):
${plainText.slice(0, 6000) || '(본문 없음 — 제목 기반으로 작성)'}
${refBlock}
[규칙]
1. 한국어만 사용. 한국어 동의어가 있는 영어 단어 절대 금지(content→콘텐츠, marketing→마케팅, system→시스템, design→디자인, update→업데이트, feedback→피드백, platform→플랫폼, service→서비스, brand→브랜드, data→데이터, trend→트렌드, user→사용자, review→리뷰 등). 고유 브랜드명만 예외.
2. 존재하지 않는 회사·보고서·연구 절대 지어내지 말 것
3. 전체 분량은 반드시 4000~5000자(한국어 기준, 공백 포함). 짧게 끝내지 말 것.
4. 소제목(h2) 5~6개, 각 소제목 아래 단락 2개, 각 단락 6문장 이상
5. 첫 문단(도입부)은 핵심 결론부터 (서론식 "~에 대해 알아봅니다" 금지), 6문장 이상
6. 친근한 구어체, 독자가 무릎 칠 구체적 사례 포함
7. 글 마지막에 자주 묻는 질문 3~4개(질문+답변 2~3문장)
8. 참고자료가 있으면 원문 초안 하나만 따라 쓰지 말고, 참고자료의 사실관계도 같이 종합해서 더 폭넓은 글로 재구성할 것

[출력 형식 — 순수 HTML만 출력, 다른 설명·마크다운 코드블록 없이. 반드시 첫 줄에 제목 주석부터]
<!--TITLE: (키워드 포함 한국어 SEO 제목 40~60자)-->
<h2>(소제목1)</h2>
<p>(단락1: 6문장 이상)</p>
<p>(단락2: 6문장 이상)</p>
... (h2 5~6개 반복) ...
<h2>자주 묻는 질문</h2>
<p><strong>Q. (질문1)</strong><br/>(답변 2~3문장)</p>
<p><strong>Q. (질문2)</strong><br/>(답변 2~3문장)</p>
${aiPrompt ? `\n추가 지시사항: ${aiPrompt}` : ''}`;

  const result = await callAI(prompt, provider, apiKeys);
  // 코드블록 감싸기 제거
  const cleaned = result.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();
  // 첫 줄의 <!--TITLE: ...--> 추출 (외국어 원문일 때 한국어 제목이 필요한 경우 사용)
  const titleMatch = cleaned.match(/^<!--\s*TITLE:\s*(.+?)\s*-->/i);
  const aiTitle = titleMatch ? titleMatch[1].trim() : '';
  const html = cleaned.replace(/^<!--\s*TITLE:.*?-->\s*/i, '');
  return { html, aiTitle };
}

/**
 * Gemini image generation으로 썸네일 생성 → /tmp에 저장
 * @returns {string} 로컬 파일 경로
 */
async function generateThumbnail(jobId, title, thumbnailPrompt, geminiApiKey) {
  const prompt = thumbnailPrompt || `"${title}" 블로그 대표이미지, 깔끔한 일러스트, 16:9 비율, 고화질`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${geminiApiKey}`,
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
 * 리라이팅된 HTML의 소제목(h2)마다 스크랩 원본 사진을 순서대로 배치.
 * publish-naver.js는 <figure><img></figure> 블록만 이미지로 인식하므로
 * (htmlToParagraphs 참고) 반드시 이 형태로 감싸야 한다. 스톡사진(Pixabay 등)은
 * 글 내용과 무관해서 안 씀 — 원본 기사에 있던 사진만, 있는 만큼만 사용.
 */
function mixContentWithImages(rewrittenHtml, scrapedImageUrls) {
  if (!scrapedImageUrls || scrapedImageUrls.length === 0) return rewrittenHtml;

  const headings = [...rewrittenHtml.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
  if (headings.length === 0) {
    const imgs = scrapedImageUrls.map(url => `<figure><img src="${url}"/></figure>`).join('\n');
    return `${rewrittenHtml}\n${imgs}`;
  }

  let i = 0;
  return rewrittenHtml.replace(/(<h2[^>]*>[\s\S]*?<\/h2>)/gi, (match) => {
    const url = scrapedImageUrls[i++];
    if (!url) return match;
    const alt = match.replace(/<[^>]+>/g, '').trim();
    return `${match}\n<figure><img src="${url}" alt="${alt}"/><figcaption>${alt}</figcaption></figure>`;
  });
}

/**
 * 글 마지막에 참고 사이트/사진 출처를 텍스트로만 추가한다 — 링크(<a href>)로
 * 걸면 독자가 원문 사이트로 빠져나가버리므로, 클릭 안 되는 일반 텍스트로만
 * 주소를 적어둔다(어차피 publish-naver.js가 발행 시 태그를 다 벗겨 순수
 * 텍스트로 타이핑하지만, 의도를 코드에도 명확히 남겨둠).
 */
function appendSourcesFooter(html, { primarySource, refItems = [], imageUrls = [] } = {}) {
  const lines = [];
  if (primarySource) lines.push(`원문: ${primarySource}`);
  for (const r of refItems) {
    if (r.link) lines.push(`참고: ${r.title} - ${r.link}`);
  }
  if (imageUrls.length) lines.push(`사진 출처: ${imageUrls.join(', ')}`);
  if (lines.length === 0) return html;
  return `${html}\n<h2>출처</h2>\n<p>${lines.join('<br/>')}</p>`;
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
    console.log('  → [rewrite] 관련 기사·블로그 검색 중...');
    const [newsItems, blogItems] = await Promise.all([
      searchNaver('news', job.title, apiKeys.NAVER_CLIENT_ID, apiKeys.NAVER_CLIENT_SECRET),
      searchNaver('blog', job.title, apiKeys.NAVER_CLIENT_ID, apiKeys.NAVER_CLIENT_SECRET),
    ]);
    const refItems = [...newsItems.slice(0, 5), ...blogItems.slice(0, 5)];
    console.log(`  → [rewrite] 참고자료 ${refItems.length}건 확보`);

    console.log('  → [rewrite] AI 리라이팅 시작...');
    const { html: rewrittenHtml } = await rewriteContent(
      job.title, job.content, job.ai_prompt, provider, apiKeys, refItems
    );
    console.log('  → [rewrite] 리라이팅 완료');

    const withSources = appendSourcesFooter(rewrittenHtml, { refItems });

    console.log('  → [rewrite] 썸네일 생성 시작...');
    let thumbPath;
    try {
      thumbPath = await generateThumbnail(job.id, job.title, job.thumbnail_prompt, apiKeys.GEMINI_API_KEY);
    } catch (e) {
      console.warn(`  ⚠️  썸네일 생성 실패(발행은 계속 진행): ${e.message}`);
    }

    return { ...job, content: withSources, _thumbnailLocalPath: thumbPath };
  }

  if (jobType === 'scrape') {
    console.log(`  → [scrape] 스크랩 시작: ${job.source_url}`);
    const scraped = await scrapeSourceUrl(job.source_url);
    console.log(`  → [scrape] 스크랩 완료 - 이미지 ${scraped.imageUrls.length}개`);

    // 스크랩 원본 DB 저장
    await sbPatch('naver_publish_jobs', `id=eq.${job.id}`, { raw_content: scraped.bodyHtml });

    // AI 리라이팅용 임시 제목(검색 시드로도 사용) — 실제 발행 제목은 아래 publishTitle에서 결정
    const seedTitle = job.title?.trim() || scraped.title;

    console.log('  → [scrape] 관련 기사·블로그 검색 중...');
    const [newsItems, blogItems] = await Promise.all([
      searchNaver('news', seedTitle, apiKeys.NAVER_CLIENT_ID, apiKeys.NAVER_CLIENT_SECRET),
      searchNaver('blog', seedTitle, apiKeys.NAVER_CLIENT_ID, apiKeys.NAVER_CLIENT_SECRET),
    ]);
    const refItems = [...newsItems.slice(0, 5), ...blogItems.slice(0, 5)];
    console.log(`  → [scrape] 참고자료 ${refItems.length}건 확보`);

    console.log('  → [scrape] AI 리라이팅 시작...');
    const { html: rewrittenHtml, aiTitle } = await rewriteContent(
      seedTitle, scraped.bodyHtml, job.ai_prompt, provider, apiKeys, refItems
    );
    console.log('  → [scrape] 리라이팅 완료');

    // 발행 제목: 사람이 직접 넣었으면 그걸 우선, 아니면 AI가 뽑은 한국어 제목
    // (원문이 외국어 사이트였어도 aiTitle은 항상 한국어라 그대로 씀)
    const publishTitle = job.title?.trim() || aiTitle || seedTitle;

    const mixedHtml = mixContentWithImages(rewrittenHtml, scraped.imageUrls);
    const withSources = appendSourcesFooter(mixedHtml, {
      primarySource: job.source_url, refItems, imageUrls: scraped.imageUrls,
    });

    console.log('  → [scrape] 썸네일 생성 시작...');
    let thumbPath;
    try {
      thumbPath = await generateThumbnail(job.id, publishTitle, job.thumbnail_prompt, apiKeys.GEMINI_API_KEY);
    } catch (e) {
      console.warn(`  ⚠️  썸네일 생성 실패(발행은 계속 진행): ${e.message}`);
    }

    return { ...job, title: publishTitle, content: withSources, _thumbnailLocalPath: thumbPath };
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
    let thumbnailInserted = false;
    if (thumbnailLocalPath && fs.existsSync(thumbnailLocalPath)) {
      console.log('  → 썸네일 삽입 시작...');
      // 본문 영역 클릭 포커스 (썸네일이 첫 번째 삽입이므로 아직 내용 없음 → 클릭 OK)
      let thumbFocused = false;
      for (const sel of ['[contenteditable="true"]:nth-child(2)', '.se-main-section', '.se-document', '[class*="content_body"]']) {
        const el = page.locator(sel).first();
        if (await el.count() > 0) {
          try { await el.click({ force: true, timeout: 3000 }); thumbFocused = true; break; } catch {}
        }
      }
      if (!thumbFocused) await humanClick(page, vp.width / 2, 450);
      await humanWait(300, 600);

      try {
        await insertImageToSE4(page, thumbnailLocalPath);
        thumbnailInserted = true;
        console.log('  → 썸네일 삽입 완료');
        fs.unlinkSync(thumbnailLocalPath);
        console.log(`  → 썸네일 임시파일 삭제: ${thumbnailLocalPath}`);
      } catch (e) {
        console.warn(`  ⚠️ 썸네일 삽입 실패: ${e.message}`);
      }
    }

    // ── 본문 입력 (세그먼트 기반: 텍스트 + 이미지) ───────────────────────────
    console.log('  → 본문 입력...');
    await humanWait(300, 600);

    const segments = parseContentSegments(content);
    console.log(`  → 세그먼트: ${segments.map(s => s.type === 'image' ? '[IMG]' : '[TXT]').join(' ')}`);

    // 본문 영역 포커스
    // ★ 썸네일 삽입 후에는 클릭 금지 (커서가 맨 위로 올라가 텍스트가 이미지 위에 써짐)
    //   → Ctrl+End로 문서 끝에 커서 유지
    let bodyFocused = false;
    if (thumbnailInserted) {
      await page.keyboard.press('Control+End');
      await humanWait(200, 400);
      bodyFocused = true;
      console.log('  → 썸네일 삽입 후 Ctrl+End로 커서 유지 (재클릭 없음)');
    } else {
      // 썸네일 없을 때만 클릭으로 포커스
      const bodyFocusStrategies = [
        async () => {
          const ces = page.locator('[contenteditable="true"]');
          const count = await ces.count();
          for (let i = 1; i < count; i++) {
            try { await ces.nth(i).click({ force: true, timeout: 3000 }); await humanWait(300, 600); return true; } catch {}
          }
          return false;
        },
        async () => {
          for (const sel of ['.se-main-section', '.se-document', '[class*="content_body"]', '.se-section-text']) {
            const el = page.locator(sel).first();
            if (await el.count() > 0) {
              await el.click({ force: true, timeout: 3000 }); await humanWait(300, 600); return true;
            }
          }
          return false;
        },
        async () => { await humanClick(page, vp.width / 2, 450); await humanWait(800, 1500); return true; },
      ];
      for (const fn of bodyFocusStrategies) {
        try { if (await fn()) { bodyFocused = true; break; } } catch {}
      }
    }
    if (!bodyFocused) console.warn('  ⚠️ 본문 영역 포커스 실패');

    // 소제목 블록 서식 적용/해제 — .github/scripts/publish-naver.js와 동일 방식.
    // 굵게(인라인 서식)로 흉내내려던 시도는 전부 실패(글자 뒤섞임, 서식 새어나감,
    // 문단 삭제)했었고, 에디터에 내장된 진짜 "소제목" 블록 서식(문단 서식 드롭다운
    // → data-value="sectionTitle")을 써야 안전하다 — 커서가 문단 안에 있기만
    // 하면 적용되는 블록 단위 명령이라 선택 영역 기반 사고가 안 생김.
    const applySectionTitle = async () => {
      const btn = page.locator('button[data-name="text-format"]').first();
      if (await btn.count() === 0) return false;
      await btn.click({ force: true }).catch(() => {});
      await humanWait(150, 250);
      const opt = page.locator('button[data-name="text-format"][data-value="sectionTitle"]').first();
      if (await opt.count() === 0) {
        await page.keyboard.press('Escape').catch(() => {});
        return false;
      }
      await opt.click().catch(async () => { await opt.click({ force: true }).catch(() => {}); });
      await humanWait(100, 200);
      return true;
    };
    const revertToBody = async () => {
      const backBtn = page.locator('button[data-name="text-format"]').first();
      if (await backBtn.count() === 0) return;
      await backBtn.click({ force: true }).catch(() => {});
      await humanWait(120, 200);
      const bodyOpt = page.locator('button[data-name="text-format"][data-value="text"]').first();
      if (await bodyOpt.count() > 0) await bodyOpt.click().catch(() => {});
      else await page.keyboard.press('Escape').catch(() => {});
      await humanWait(120, 200);
    };

    // 세그먼트 순회 입력 (문단 단위 — 소제목은 블록 서식 적용)
    let imgIndex = 0;
    let bodyFilled = false;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.type === 'image') {
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
        // insertImageToSE4가 캡션용 빈 줄을 자동으로 만들어두므로 별도 Enter 불필요
        continue;
      }

      // 텍스트 세그먼트
      if (i > 0 && segments[i - 1].type === 'image') {
        // 이미지 다음 텍스트: 재클릭 금지(커서가 이미지 위로 튐) — End로 줄 끝 확인 후 타이핑
        await page.keyboard.press('End');
        await humanWait(100, 200);
      }
      if (seg.isHeading && i > 0) {
        // 소제목 앞엔 빈 줄 하나로 본문과 시각적으로 구분(첫 줄이면 생략)
        await page.keyboard.press('Enter').catch(() => {});
        await humanWait(60, 100);
      }
      await humanType(page, seg.text);
      bodyFilled = true;

      let sectionTitleApplied = false;
      if (seg.isHeading) {
        sectionTitleApplied = await applySectionTitle();
        if (!sectionTitleApplied) console.warn('  ⚠️ 소제목 서식 적용 실패 — 평문으로 남음');
      }

      await page.keyboard.press('Enter');
      await humanWait(80, 150);

      // 소제목 블록 뒤에 이어지는 문단이 소제목 서식을 물려받을 수 있어 명시적으로 되돌림
      if (sectionTitleApplied) await revertToBody();
    }
    const headingCount = segments.filter((s) => s.isHeading).length;
    console.log(`  → 소제목 ${headingCount}개 서식 적용 시도됨`);
    console.log(bodyFilled ? '  → 본문 입력 완료' : '  ⚠️ 본문 입력 실패');

    // ── 태그 입력 (SE4: 본문에 #태그명 직접 입력 방식) ──────────────────────
    if (tags && tags.length > 0) {
      console.log(`  → 태그 입력: ${tags.join(', ')}`);
      await humanWait(400, 800);

      // 본문 끝으로 커서 이동 (클릭 금지 — 커서 위치 틀어짐 방지)
      await page.keyboard.press('Control+End');
      await humanWait(200, 300);
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

    // 6. 발행 / 임시저장 처리
    // 팝업/오버레이 닫기
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.locator('.se-popup-dim').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});

    // ── 임시저장 모드 ─────────────────────────────────────────────────────────
    if (!isPublish) {
      console.log('  → 임시저장 처리...');
      // SE4 상단 툴바의 "저장" 버튼 클릭
      // 버튼 텍스트가 "저장 | 3" 처럼 숫자/구분자를 포함할 수 있으므로
      // 숫자, 공백, 구분자(|·•-) 제거 후 "저장" 또는 "임시저장"과 정확히 일치하는 버튼 탐색
      const draftsaved = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => {
          if (!b.offsetParent) return false;
          // 한글만 추출해 비교 (숫자·공백·|·· 등 제거)
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
        // 임시저장 버튼 못 찾으면 단축키 시도 (Ctrl+S)
        console.warn('  ⚠️ 임시저장 버튼 못 찾음 → Ctrl+S 시도');
        await page.keyboard.press('Control+s');
        await page.waitForTimeout(2000);
      }
      return { postId: '__draft__', postUrl: '' };
    }

    // ── 발행 버튼 클릭 (즉시 / 예약) ──────────────────────────────────────────
    console.log('  → 발행 버튼 클릭...');
    let published = await page.evaluate(() => {
      const btn = document.querySelector('button.publish_btn__m9KHH') ||
        Array.from(document.querySelectorAll('button')).find(b =>
          b.textContent.trim() === '발행' && b.offsetParent !== null
        );
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (published) console.log('  → 발행 버튼 클릭');

    if (published) {
      await page.waitForTimeout(1500);

      // 패널 버튼 덤프 (디버깅)
      const panelBtns = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null)
          .map(b => ({ txt: b.textContent.trim().slice(0, 20), cls: b.className.slice(0, 50) }))
      );
      console.log('  [패널 버튼]:', panelBtns.map(b => `"${b.txt}"`).join(' | '));

      if (scheduledAt) {
        // ── 예약 발행 ──────────────────────────────────────────────────────────
        const schedDate = new Date(scheduledAt);
        console.log(`  → 예약 발행 설정: ${schedDate.toLocaleString('ko-KR')}`);

        // "예약" 라디오/레이블 클릭
        const schedToggled = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('label, input[type="radio"]'));
          const el = els.find(e => /예약/.test(e.textContent || e.getAttribute('value') || ''));
          if (el) { el.click(); return true; }
          return false;
        });
        if (schedToggled) console.log('  → 예약 라디오 클릭');
        else console.warn('  ⚠️ 예약 라디오 못 찾음');
        await humanWait(500, 800);

        // 날짜/시간 입력 — SE4 패널의 숫자 입력 필드에 직접 키보드 입력
        const yy = String(schedDate.getFullYear());
        const mo = String(schedDate.getMonth() + 1).padStart(2, '0');
        const dd = String(schedDate.getDate()).padStart(2, '0');
        const hh = String(schedDate.getHours()).padStart(2, '0');
        const mi = String(schedDate.getMinutes()).padStart(2, '0');

        // 숫자 input 목록 수집 (날짜 관련)
        const inputCount = await page.evaluate(() =>
          Array.from(document.querySelectorAll('input[type="text"], input[type="number"]'))
            .filter(i => i.offsetParent !== null).length
        );
        console.log(`  → 패널 input 수: ${inputCount}`);

        // 연/월/일/시/분 순서로 input 채우기
        const dateValues = [yy, mo, dd, hh, mi];
        for (let idx = 0; idx < dateValues.length; idx++) {
          await page.evaluate((i) => {
            const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"]'))
              .filter(el => el.offsetParent !== null);
            if (inputs[i]) inputs[i].click();
          }, idx);
          await humanWait(100, 200);
          await page.keyboard.press('Control+a');
          await page.keyboard.type(dateValues[idx]);
          await page.keyboard.press('Tab');
          await humanWait(150, 300);
        }
        console.log(`  → 예약 날짜/시간 입력: ${yy}.${mo}.${dd} ${hh}:${mi}`);
        await humanWait(400, 600);

      } else {
        // ── 즉시 발행 — "현재" 라디오 확인 ────────────────────────────────────
        await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('label, input[type="radio"]'));
          const el = els.find(e => /현재/.test(e.textContent || e.getAttribute('value') || ''));
          if (el) el.click();
        });
        console.log('  → 즉시 발행(현재) 선택');
        await humanWait(200, 400);
      }

      // 최종 발행 확인 클릭
      const confirmed = await page.evaluate(() => {
        const visibleBtns = Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null);
        const btn = [...visibleBtns].reverse().find(b => /^발행$|^발행하기$/.test(b.textContent.trim()));
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

  const isDraft = result.postId === '__draft__';
  const isSuccess = isDraft || !!(result.postId || result.postUrl);
  await sbPatch('naver_publish_jobs', `id=eq.${job.id}`, {
    status: isSuccess ? 'completed' : 'failed',
    post_id: isDraft ? null : (result.postId || null),
    post_url: result.postUrl || null,
    thumbnail_url: prepared._thumbnailLocalPath ? `[local:${prepared._thumbnailLocalPath}]` : null,
    error_message: null,
    completed_at: new Date().toISOString(),
  });

  if (isDraft) {
    await sbInsert('naver_publish_history', {
      user_id: job.user_id,
      blog_id: conn.blog_id,
      post_id: '',
      post_url: '',
      title: job.title,
      notion_page_id: job.notion_page_id || '',
      status: 'draft',
    });
    console.log(`  ✅ 임시저장 완료`);
  } else if (isSuccess) {
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

// ── 전자제품 자동 발행 (해외 뉴스 소스 → 1시간마다 자동 기사 생성) ───────────────
// NAVER_AUTO_TECH=0 으로 끌 수 있음 (기본은 켜짐)
const AUTO_TECH_ENABLED = process.env.NAVER_AUTO_TECH !== '0';
const AUTO_TECH_MARKER = '__auto_tech__'; // notion_page_id 컬럼을 표식으로 재사용
const AUTO_TECH_INTERVAL_MS = 60 * 60 * 1000; // 1시간
const AUTO_TECH_LOOKBACK_HOURS = 24; // "최근 트렌드만" — 이 기간 안에 올라온 기사만 후보

const TECH_RSS_SOURCES = [
  { name: 'Apple Newsroom', url: 'https://www.apple.com/newsroom/rss-feed.rss' },
  { name: 'Samsung Newsroom', url: 'https://news.samsung.com/global/feed' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
  { name: 'Engadget', url: 'https://www.engadget.com/rss.xml' },
  { name: '9to5Mac', url: 'https://9to5mac.com/feed/' },
  { name: '9to5Google', url: 'https://9to5google.com/feed/' },
  { name: 'Android Authority', url: 'https://www.androidauthority.com/feed/' },
  { name: 'GSMArena', url: 'https://www.gsmarena.com/rss-news-reviews.php3' },
];

/**
 * RSS 2.0 <item> 블록에서 title/link/pubDate만 정규식으로 추출.
 * 이 스크립트는 XML 파서 의존성이 없고, RSS item 구조가 단순해 정규식으로 충분함.
 */
function parseRssItems(xml, sourceName) {
  const items = [];
  // RSS 2.0 <item> + Atom <entry> 둘 다 지원 (Apple Newsroom, The Verge는 Atom)
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi) || [];
  for (const block of blocks) {
    const titleM = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    // RSS: <link>url</link> / Atom: <link ... href="url" .../>
    const linkTextM = block.match(/<link>([\s\S]*?)<\/link>/i);
    const linkHrefM = block.match(/<link\b[^>]*\brel=["']?alternate["']?[^>]*\bhref=["']([^"']+)["']/i)
      || block.match(/<link\b[^>]*\bhref=["']([^"']+)["']/i);
    const dateM = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)
      || block.match(/<published>([\s\S]*?)<\/published>/i)
      || block.match(/<updated>([\s\S]*?)<\/updated>/i);
    const title = titleM ? titleM[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    const link = (linkTextM ? linkTextM[1].trim() : '') || (linkHrefM ? linkHrefM[1].trim() : '');
    const rawDate = dateM ? dateM[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    const pubDate = rawDate ? new Date(rawDate) : null;
    if (title && link && pubDate && !isNaN(pubDate.getTime())) {
      items.push({ title, link, pubDate, source: sourceName });
    }
  }
  return items;
}

/** 해외 전자제품 사이트 RSS를 모아 최근(기본 24시간 이내) 기사만 최신순으로 반환 */
async function fetchRecentTechArticles(hoursBack = AUTO_TECH_LOOKBACK_HOURS) {
  const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
  const perSource = await Promise.all(TECH_RSS_SOURCES.map(async (src) => {
    try {
      const res = await fetch(src.url, {
        headers: { 'User-Agent': USER_AGENTS[0] },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return [];
      return parseRssItems(await res.text(), src.name);
    } catch { return []; }
  }));
  return perSource.flat()
    .filter((item) => item.pubDate.getTime() >= cutoff)
    .sort((a, b) => b.pubDate - a.pubDate);
}

/** 이미 발행에 쓴 기사(source_url)는 제외하고 최신 기사 하나를 고른다 */
async function pickAutoTechTopic() {
  const candidates = await fetchRecentTechArticles();
  if (candidates.length === 0) return null;
  // 최근 auto-tech 작업들의 source_url만 가져와 로컬에서 비교 (후보 URL 수가
  // 많을 때 or=() 필터를 그만큼 길게 만드는 것보다 안전하고 간단함)
  const cutoffIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const usedRows = await sbGet(
    'naver_publish_jobs',
    `notion_page_id=eq.${AUTO_TECH_MARKER}&created_at=gte.${cutoffIso}&select=source_url`
  ).catch(() => []);
  const used = new Set(usedRows.map((r) => r.source_url));
  return candidates.find((c) => !used.has(c.link)) || null;
}

async function getAutoTechUserId() {
  const rows = await sbGet('naver_connections', 'select=user_id&limit=1').catch(() => []);
  return rows[0]?.user_id || null;
}

/** 1시간에 한 번, 최근 해외 전자제품 뉴스에서 새 글감을 찾아 자동으로 발행 작업을 만들고 바로 처리 */
async function maybeRunAutoTech() {
  if (!AUTO_TECH_ENABLED) return;
  try {
    const last = await sbGet(
      'naver_publish_jobs',
      `notion_page_id=eq.${AUTO_TECH_MARKER}&order=created_at.desc&limit=1&select=created_at`
    );
    const lastAt = last[0]?.created_at ? new Date(last[0].created_at).getTime() : 0;
    if (Date.now() - lastAt < AUTO_TECH_INTERVAL_MS) return;

    console.log('\n⏰ [auto-tech] 1시간 주기 도달 — 최근 24시간 내 전자제품 뉴스 탐색 중...');
    const topic = await pickAutoTechTopic();
    if (!topic) {
      console.log('   → 새로 쓸 만한 최근 기사가 없음, 이번 회차는 건너뜀');
      return;
    }
    console.log(`   → 선정: [${topic.source}] ${topic.title}`);

    const userId = await getAutoTechUserId();
    if (!userId) {
      console.log('   → naver_connections에 연결된 계정이 없어 건너뜀');
      return;
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/naver_publish_jobs`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=representation',
      },
      body: JSON.stringify({
        user_id: userId,
        title: '',
        content: '',
        job_type: 'scrape',
        source_url: topic.link,
        ai_provider: 'groq',
        category_no: 18, // 전자제품
        is_publish: true,
        notion_page_id: AUTO_TECH_MARKER,
        status: 'pending',
      }),
    });
    const rows = await res.json();
    const job = rows[0];
    if (!job) { console.log('   → 작업 생성 실패'); return; }
    console.log(`   → 작업 생성됨(${job.id}) — 바로 처리 시작`);
    await processJob(job);
  } catch (e) {
    console.error('[auto-tech] 오류:', e.message);
  }
}

// ── 메인 루프 ─────────────────────────────────────────────────────────────────

async function run() {
  const modeLabel = FORCE ? '[PRIMARY]' : '[FALLBACK]';
  console.log(`🤖 네이버 블로그 로컬 에이전트 시작 ${modeLabel}`);
  console.log(`   모드: ${ONCE ? '한 번만 실행' : '연속 실행 (10초마다 폴링)'}`);
  console.log(FORCE ? '   역할: 현재 맥북 (강제 처리 - server1 체크 무시)' : '   역할: Primary(오래된 맥북) 오프라인 시 자동 인계');
  console.log('   종료: Ctrl+C\n');

  // preferred_agent 컬럼 존재 여부 확인
  let hasPreferredAgent = true;
  try {
    await sbGet('naver_publish_jobs', 'preferred_agent=eq.server2&limit=1&select=preferred_agent');
  } catch (_) {
    hasPreferredAgent = false;
    console.log('ℹ️  preferred_agent 컬럼 없음 → Primary 오프라인 시 전체 처리 모드');
  }

  let failCount = 0;
  const MAX_FAIL = 5;

  do {
    try {
      const primaryAlive = FORCE ? false : await isPrimaryAlive();

      // processing stuck 잡 복구 (5분 이상 processing 상태면 pending으로 되돌림)
      const stuckCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      await fetch(`${SUPABASE_URL}/rest/v1/naver_publish_jobs?status=eq.processing&created_at=lt.${stuckCutoff}`, {
        method: 'PATCH',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'pending' }),
      }).catch(() => {});

      await maybeRunAutoTech();

      let jobs = [];
      if (FORCE) {
        // --force: 모든 pending 작업 처리 (server 구분 무시)
        jobs = await sbGet(
          'naver_publish_jobs',
          'status=eq.pending&order=created_at.asc&limit=5&select=*'
        );
      } else if (hasPreferredAgent) {
        // server2 전용 작업은 항상 처리
        const server2Jobs = await sbGet(
          'naver_publish_jobs',
          'status=eq.pending&preferred_agent=eq.server2&order=created_at.asc&limit=5&select=*'
        );
        // server1 작업은 Primary 오프라인일 때만 인계
        const server1Jobs = primaryAlive ? [] : await sbGet(
          'naver_publish_jobs',
          'status=eq.pending&or=(preferred_agent.eq.server1,preferred_agent.is.null)&order=created_at.asc&limit=5&select=*'
        );
        jobs = [...server2Jobs, ...server1Jobs];
      } else {
        // 컬럼 없음 → Primary 오프라인 시만 전체 처리
        jobs = primaryAlive ? [] : await sbGet(
          'naver_publish_jobs',
          'status=eq.pending&order=created_at.asc&limit=5&select=*'
        );
      }
      failCount = 0;

      if (jobs.length > 0) {
        const mode = FORCE ? '🟢 [PRIMARY]'
          : (!hasPreferredAgent || jobs.some(j => j.preferred_agent !== 'server2'))
            ? '🟡 [FALLBACK] server1 인계' : '🟢 [SERVER2]';
        console.log(`\n${mode} ${jobs.length}개 작업 처리`);
        for (const job of jobs) {
          await processJob(job);
        }
      } else if (!ONCE) {
        const status = FORCE ? '🟢 PRIMARY' : primaryAlive ? '🔵 Server1 활성' : '🟡 Server1 오프라인';
        process.stdout.write(`${status}, 작업 없음...\r`);
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
