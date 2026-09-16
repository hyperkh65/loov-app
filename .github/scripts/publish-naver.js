/**
 * GitHub Actions 환경에서 Playwright로 네이버 블로그 발행
 * - 실제 브라우저 사용 → IP 차단 완전 우회
 * - 쿠키(NID_AUT, NID_SES)로 로그인 상태 복원
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

// HTML을 { type: 'text'|'image', ... } 블록 배열로 — 클립보드 paste 이벤트
// 흉내는 스마트에디터 ONE의 내부 상태에 실제로 반영되지 않는 걸 실사용 중
// 확인함(제목은 채워졌는데 본문은 빈 placeholder 그대로였음). 진짜 키보드
// 타이핑만 에디터가 인식하므로 리치 HTML 붙여넣기는 포기하되, 원본이 h1~h6
// (소제목)였는지, <figure><img>였는지는 따로 파싱해서 남겨둔다 — 이미지는
// 실제 파일 업로드로 별도 삽입해야 하고, 소제목은 앞뒤 빈 줄로 구분하기 위함.
function htmlToParagraphs(html) {
  const stripInline = (s) => s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  // 줄 맨 앞이 "24." "3)" 같은 숫자+구두점이면 스마트에디터가 타이핑 중 자동으로
  // 번호매기기 리스트(<ol><li>)로 바꿔버린다 — 원문 숫자와 에디터가 새로 매긴
  // 번호가 겹쳐 보이는 것뿐 아니라, 발행된 글의 실제 HTML을 까본 결과 그 줄
  // 뒤에 오는 모든 문단이 통째로 같은 리스트에 편입되는 훨씬 심각한 사고로
  // 이어짐. 보이지 않는 문자를 앞/사이/뒤 어디에 끼워넣어도(세 가지 다 실사용
  // 테스트로 확인) 감지를 못 피했다 — 보이지 않는 문자를 정규화해서 무시하고
  // 판정하는 것으로 보임. 그래서 소제목(h1~h6 출신)은 번호를 아예 안 보내는
  // 쪽으로 바꿨다(어차피 굵게 표시도 포기해서 번호가 꼭 필요하지 않음 — 앞뒤
  // 빈 줄만으로도 구분됨). 일반 본문 문단에 우연히 등장하는 숫자+구두점은
  // 여전히 폭 0 문자로 최대한 방어(완전히 막는다는 보장은 없음).
  const stripHeadingNumber = (s) => s.replace(/^\d+[.)]\s*/, '');
  const dodgeAutoNumber = (s) => s.replace(/^(\d+)([.)])/, `$1​$2`);

  // <figure>...<img src="...">...</figure> 통째로 먼저 매치해서 이미지 블록으로
  // 뽑아낸다(그 안의 <figcaption>은 소제목과 똑같은 텍스트를 다시 넣는 것뿐이라
  // 별도 본문 문단으로 안 만듦 — 예전엔 이게 문단으로 잡혀서 소제목이 중복
  // 타이핑되는 부작용이 있었음). 그 외엔 기존대로 p/h1~6/li 블록.
  const blockRe = /<figure\b[^>]*>[\s\S]*?<img\b[^>]*\bsrc="([^"]+)"[^>]*>[\s\S]*?<\/figure>|<(p|h[1-6]|li)\b[^>]*>([\s\S]*?)<\/\2>/gi;
  const results = [];
  let m;
  while ((m = blockRe.exec(html))) {
    if (m[1]) {
      results.push({ type: 'image', src: m[1] });
      continue;
    }
    const isHeading = /^h[1-6]$/i.test(m[2]);
    for (const line of stripInline(m[3]).split('\n').map(s => s.trim()).filter(Boolean)) {
      const text = isHeading ? stripHeadingNumber(line) : dodgeAutoNumber(line);
      results.push({ type: 'text', text, isHeading });
    }
  }
  if (results.length > 0) return results;

  // 위 블록 태그가 하나도 안 잡힌 예외적인 입력(순수 텍스트 등) — 줄바꿈 기준
  // 폴백, 전부 본문(굵게 처리 없음) 취급.
  return stripInline(html.replace(/<\/div>/gi, '\n'))
    .split('\n').map(s => s.trim()).filter(Boolean)
    .map(text => ({ type: 'text', text: dodgeAutoNumber(text), isHeading: false }));
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

    // 이미지 삽입 — 텍스트와 달리 클립보드/붙여넣기 흉내가 아니라 실제 파일
    // 업로드로 넣는다. "사진" 툴바 버튼을 누르면 네이티브 파일 선택창이 뜨는
    // 표준 <input type=file> 흐름이라(사람이 실제로 쓰는 것과 동일한 경로),
    // 스마트에디터 내부 상태를 못 속이던 클립보드 이벤트 흉내보다 훨씬 안정적일
    // 것으로 예상됨 — 본문 텍스트를 리치 HTML paste로 못 넣었던 것과 같은 이유로
    // 이미지도 paste event 흉내로는 실패할 가능성이 높아 처음부터 이 방식을 씀.
    const tmpImgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naver-img-'));
    let imgCounter = 0;
    const insertImageAtCursor = async (imageUrl) => {
      const res = await fetch(imageUrl).catch(() => null);
      if (!res || !res.ok) {
        console.warn(`[Playwright] 이미지 다운로드 실패, 건너뜀: ${imageUrl}`);
        return false;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const ext = (imageUrl.match(/\.(jpg|jpeg|png|gif|webp)(?:[?#]|$)/i)?.[1] || 'jpg').toLowerCase();
      const localPath = path.join(tmpImgDir, `img-${imgCounter++}.${ext}`);
      fs.writeFileSync(localPath, buf);

      // "사진" 하나만 정확히 매치하는 접근성 이름을 못 찾음(버튼엔 "사진"과
      // "사진 추가"라는 두 개의 텍스트 노드가 같이 붙어있는 걸로 보임) — exact
      // 매치 대신 정규식으로 느슨하게 찾는다.
      const photoBtn = page.getByRole('button', { name: /^사진(\s*추가)?$/ }).first();
      if (await photoBtn.count() === 0) {
        const btnNames = await page.locator('button').evaluateAll(
          els => els.map(e => (e.textContent || e.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 40)
        ).catch(() => []);
        console.warn(`[Playwright] "사진" 버튼을 못 찾음 — 이미지 삽입 건너뜀. 실제 버튼 이름들: ${JSON.stringify(btnNames)}`);
        return false;
      }
      try {
        const [chooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 8000 }),
          photoBtn.click({ force: true }),
        ]);
        await chooser.setFiles(localPath);
        await page.waitForTimeout(2000); // 업로드 + 에디터 삽입 처리 대기
        console.log(`[Playwright] 이미지 삽입 완료: ${imageUrl}`);
        return true;
      } catch (e) {
        console.warn(`[Playwright] 이미지 삽입 실패(${imageUrl}): ${e.message}`);
        return false;
      }
    };

    // 2. 본문을 먼저 입력한다 — 실사용 중 확인: 제목을 먼저 채운 뒤 본문을 타이핑하면
    // "본문에서 뽑은 문구를 제목에 자동 제안" 같은 스마트에디터 내부 동작(디바운스로
    // 뒤늦게 실행되는 듯)이 제목 타이핑 도중 커서 위치에 본문 일부를 끼워넣는 사고가
    // 재현됐다(제목 앞부분+본문 첫 문단 일부+제목 뒷부분이 그대로 섞여 발행된 실제
    // 사례로 확인). 본문을 먼저 완전히 채우고 안정될 시간을 준 뒤 제목을 맨 마지막에
    // 입력하면 그 시점엔 본문발 자동 제안이 이미 다 끝난 뒤라 더는 끼어들 수 없다.
    // 클립보드 paste 이벤트 흉내는 에디터 내부 상태에 실제로 반영 안 되는 걸 확인함
    // (제목만 채워지고 본문은 빈 placeholder 그대로였음) — 진짜 키보드 타이핑만 씀.
    const bodySelectors = ['.se-component-content .se-text-paragraph', '.se-main-container [contenteditable="true"]', '[contenteditable="true"]'];
    let bodyFilled = false;
    const paragraphs = htmlToParagraphs(content);
    for (const sel of bodySelectors) {
      const el = mainFrame.locator(sel).first();
      if (await el.count() > 0) {
        await dismissPopup();
        await el.click({ force: true });
        await page.waitForTimeout(300);

        // 실사용 중 확인: 같은 계정으로 반복 발행하다 보면 매번 완전히 새 글
        // 페이지로 이동해도 본문에 예전 임시저장 내용(예: 몇 번 전 테스트에서
        // 깨진 채로 남은 소제목 문단)이 남아있는 경우가 있고, 우리가 새로
        // 타이핑한 내용과 나란히 섞여서 발행됨 — 새 글인데도 완전히 빈 상태가
        // 아닐 수 있다는 뜻. 타이핑 시작 전에 무조건 전체 선택 후 삭제해서
        // 편집기를 확실히 비운다.
        const preClearLen = await mainFrame.evaluate(() =>
          (document.querySelector('.se-main-container')?.innerText || '').length
        ).catch(() => -1);
        await page.keyboard.press('Control+A').catch(() => {});
        await page.keyboard.press('Backspace').catch(() => {});
        await page.waitForTimeout(300);
        const postClearLen = await mainFrame.evaluate(() =>
          (document.querySelector('.se-main-container')?.innerText || '').length
        ).catch(() => -1);
        console.log(`[Playwright] Body pre-clear length: ${preClearLen} -> post-clear: ${postClearLen}`);

        let imagesInserted = 0;
        for (let i = 0; i < paragraphs.length; i++) {
          const para = paragraphs[i];

          if (para.type === 'image') {
            const ok = await insertImageAtCursor(para.src);
            if (ok) imagesInserted++;
            // 이미지 삽입 뒤 스마트에디터가 캡션 입력용 빈 줄을 자동으로 만들어
            // 주므로, 다음 문단은 그 줄에 이어서 타이핑하면 됨 — 별도 Enter 불필요.
            await page.waitForTimeout(300);
            continue;
          }

          // 소제목(h1~h6 출신) 앞엔 빈 줄을 하나 넣어 본문과 시각적으로 구분한다
          // (원본 템플릿의 소제목 위쪽 여백 의도를 살림). 글 맨 첫 줄이면 생략.
          //
          // Ctrl+B로 소제목을 굵게 만들어보려는 시도를 두 가지 방식(타이핑 후
          // 줄 선택 / 타이핑 전후 토글) 모두 실사용으로 검증했으나, 둘 다 아직
          // 처리 중인 타이핑 이벤트와 경쟁해서 (1) 글자 순서가 뒤섞이고 (2) 굵게
          // 상태가 꺼지지 않고 뒤에 오는 무관한 본문 문단들까지 새어나가는 걸
          // 실제 발행 결과에서 확인함 — 서식 없는 평문보다 더 나쁜 결과라
          // 완전히 포기함. 빈 줄로 여백만 주고 텍스트 자체는 건드리지 않는다.
          if (para.isHeading && i > 0) {
            await page.keyboard.press('Enter').catch(() => {});
            await page.waitForTimeout(80);
          }
          await page.keyboard.type(para.text, { delay: 5 });
          await page.keyboard.press('Enter');
          // Enter 직후 스마트에디터가 새 문단 블록을 만드는 처리가 끝나기 전에
          // 바로 다음 문단 타이핑을 시작하면 그 문단 첫 글자가 중복 입력되는
          // 버그를 실제 발행 글에서 확인함(예: "S25"→"SS25", "미국"→"미미국",
          // "운영체제"→"운운영체제" — Ctrl+B 도입 전부터 있었던, 무관한 별개
          // 버그). 다음 타이핑 전에 짧게 쉬어서 블록 생성이 끝나길 기다린다.
          await page.waitForTimeout(80);
        }
        const headingCount = paragraphs.filter(p => p.isHeading).length;
        const imageCount = paragraphs.filter(p => p.type === 'image').length;
        console.log(`[Playwright] Body typed via keyboard: ${sel} (${paragraphs.length} blocks, ${headingCount} headings spaced, ${imagesInserted}/${imageCount} images inserted)`);

        // 실사용 중 확인: 이 블로그 계정 에디터의 기본/직전 서체가 "바른히피"라는
        // 손글씨체로 맞춰져 있어서, 숫자·스펙 위주 정보성 글이 전부 삐뚤빼뚤한
        // 손글씨로 발행되는 사고가 있었음(스크린샷으로 확인). 실제 옵션 버튼
        // (`data-value="nanumgothic"`)을 정확히 찾아 클릭해도 툴바 라벨은
        // "나눔고딕"으로 바뀌었다고 나오는데 실제 발행 글의 span엔 여전히 예전
        // 서체 클래스가 박혀 있었다 — 빈 커서 상태(선택 영역 없음)에서는 클릭이
        // 그냥 "마지막으로 고른 항목" 표시만 갱신할 뿐 실제 서식엔 반영 안 되는
        // 것으로 보인다(처음 추측이 맞았지만 그땐 엉뚱한 요소를 클릭하고 있었음).
        // 본문을 다 채운 지금, 본문을 다시 클릭해 포커스를 확실히 되돌린 뒤
        // 전체를 실제로 선택한 상태에서 서체를 적용한다.
        await el.click({ force: true });
        await page.waitForTimeout(200);
        await page.keyboard.press('Control+A').catch(() => {});
        await page.waitForTimeout(200);
        const fontToggleBtn = page.getByRole('button', { name: /서체 변경/ }).first();
        if (await fontToggleBtn.count() > 0) {
          await fontToggleBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(300);
          const fontOptionBtn = page.locator('button[data-name="font-family"][data-value="nanumgothic"]').first();
          if (await fontOptionBtn.count() > 0) {
            await fontOptionBtn.click().catch(async (e) => {
              console.warn(`[Playwright] 서체 옵션 클릭 실패, force로 재시도: ${e.message}`);
              await fontOptionBtn.click({ force: true }).catch(() => {});
            });
            console.log('[Playwright] 서체를 나눔고딕으로 변경(전체 선택 후 적용)');
          } else {
            console.warn('[Playwright] 나눔고딕 서체 버튼을 못 찾음(드롭다운 연 뒤에도) — 서체 변경 건너뜀');
            await page.keyboard.press('Escape').catch(() => {});
          }
          await page.waitForTimeout(200);
        } else {
          console.warn('[Playwright] 서체 변경 토글 버튼을 못 찾음');
        }
        await page.keyboard.press('End').catch(() => {});

        bodyFilled = true;
        break;
      }
    }
    if (!bodyFilled) console.warn('[Playwright] Body selector not found — 아래 진단 정보 참고');

    // 본문 관련 비동기 동작(자동저장, 제목 제안 등)이 다 정리될 시간을 준다 —
    // 이게 끝난 뒤에 제목을 입력해야 그 사이에 끼어들 여지가 없어짐.
    await page.waitForTimeout(1500);

    // 3. 제목 입력 — 스마트에디터 ONE은 제목도 프레임 안 contenteditable(.se-title-text).
    // 본문을 다 채운 뒤 마지막에 입력해서, 본문발 자동 제안이 제목 타이핑 도중
    // 끼어드는 걸 원천적으로 막는다(위 설명 참고).
    const titleSelectors = ['.se-title-text', '.se-placeholder-focused .se-title-text', 'input[name="title"]', '#title'];
    let titleFilled = false;
    for (const sel of titleSelectors) {
      const el = mainFrame.locator(sel).first();
      if (await el.count() > 0) {
        await dismissPopup(); // 클릭 직전에 한 번 더 — 팝업이 뒤늦게 뜨는 경우 대비
        await el.click({ force: true });
        await page.waitForTimeout(200);
        const tag = await el.evaluate(n => n.tagName).catch(() => '');
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
          await el.fill(title);
        } else {
          if (typeof el.pressSequentially === 'function') await el.pressSequentially(title);
          else await page.keyboard.type(title);
          await page.keyboard.press('Tab').catch(() => {});
        }
        await page.waitForTimeout(500);

        // 검증: 실제로 입력된 텍스트가 의도한 제목과 정확히 같은지 확인. 다르면
        // (여전히 뭔가 끼어들었거나 이전 임시저장 잔여 텍스트가 남아있는 경우)
        // 전체 선택 후 지우고 한 번 더 깨끗하게 재입력한다.
        const actualText = await el.evaluate(n => (n.innerText || n.textContent || '').trim()).catch(() => null);
        if (actualText !== null && actualText !== title.trim()) {
          console.warn(`[Playwright] Title mismatch after typing — expected="${title}" actual="${actualText}" — retrying with clean overwrite`);
          await el.click({ clickCount: 3, force: true }).catch(() => {});
          await page.keyboard.press('Backspace').catch(() => {});
          await page.waitForTimeout(200);
          if (typeof el.pressSequentially === 'function') await el.pressSequentially(title);
          else await page.keyboard.type(title);
          await page.keyboard.press('Tab').catch(() => {});
          await page.waitForTimeout(500);
          const retryText = await el.evaluate(n => (n.innerText || n.textContent || '').trim()).catch(() => null);
          console.log(`[Playwright] Title after retry: "${retryText}"`);
        }

        console.log(`[Playwright] Title filled via: ${sel}`);
        titleFilled = true;
        break;
      }
    }
    if (!titleFilled) console.warn('[Playwright] Title selector not found — 아래 진단 정보 참고');

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
    // "도움말" 패널이 화면 우측을 계속 덮고 있는 걸 스크린샷 2번 다 확인함 —
    // class/aria 기반 닫기 버튼 클릭이 실제로는 안 먹혔음(엉뚱한 버튼을 집었을
    // 가능성). 두 스크린샷 모두 같은 위치(우측 상단 ✕, 뷰포트 기준 약 1237,42)에
    // 아이콘이 있는 걸 육안으로 확인했으므로 좌표 클릭으로 확실하게 닫는다.
    for (let i = 0; i < 3; i++) {
      const helpVisible = await page.locator('div:has-text("도움말")').first().isVisible().catch(() => false);
      if (!helpVisible) break;
      await page.mouse.click(1237, 42).catch(() => {});
      await page.waitForTimeout(400);
    }
    const stillHelpVisible = await page.locator('div:has-text("도움말")').first().isVisible().catch(() => false);
    console.log(`[Playwright] Help panel still visible after close attempts: ${stillHelpVisible}`);

    await publishOpenBtn.click({ force: true, timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/naver-publish-layer.png', fullPage: true }).catch(() => {});

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
      const allPublishBtns = await page.locator('button:has-text("발행")').all();
      const btnInfo = await Promise.all(allPublishBtns.map(async b => ({
        text: (await b.textContent().catch(() => '') || '').trim(),
        visible: await b.isVisible().catch(() => false),
      })));
      console.log('[Playwright] All 발행 buttons:', JSON.stringify(btnInfo));
      await page.screenshot({ path: '/tmp/naver-before-confirm.png', fullPage: true }).catch(() => {});

      const confirmBtn = page.locator('button:has-text("발행")').last();
      if (await confirmBtn.count() > 0) {
        await confirmBtn.click({ force: true, timeout: 10000 });
        console.log('[Playwright] Final publish confirm clicked');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: '/tmp/naver-after-confirm.png', fullPage: true }).catch(() => {});
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
