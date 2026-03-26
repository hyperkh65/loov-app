#!/usr/bin/env node
/**
 * アメブロ (Ameba Blog) ローカル発行エージェント
 * アメバブログ自動投稿エージェント
 *
 * 사용법:
 *   node scripts/ameba-agent.js          # 대기 모드 (10초마다 폴링)
 *   node scripts/ameba-agent.js --once   # 현재 pending 작업만 처리 후 종료
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

// 사람처럼 타이핑 (자연스러운 속도 변화)
async function humanType(page, text, { typoRate = 0.02 } = {}) {
  for (const ch of text) {
    // 가끔 오타 후 백스페이스 수정
    if (Math.random() < typoRate && /[a-zA-Z0-9]/.test(ch)) {
      const wrongKeys = 'qwertyuiop';
      await page.keyboard.type(wrongKeys[rnd(0, wrongKeys.length - 1)], { delay: rnd(60, 130) });
      await humanWait(80, 200);
      await page.keyboard.press('Backspace');
      await humanWait(60, 150);
    }
    await page.keyboard.type(ch, { delay: rnd(40, 140) });
    // 단어 끝(공백/줄바꿈)에서 잠깐 더 쉬기
    if (ch === ' ' || ch === '\n') await humanWait(50, 180);
  }
}

// 자연스러운 마우스 이동 후 클릭
async function humanClick(page, x, y) {
  const steps = rnd(3, 6);
  const cx = rnd(100, 900), cy = rnd(100, 400);
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

// 랜덤 스크롤
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

// ── アメブロ Playwright 발행 ──────────────────────────────────────────────────

/**
 * アメブロにPlaywrightで投稿する
 * Playwright로 아메바 블로그에 포스팅
 *
 * @param {object} params
 * @param {string} params.blogId    - ブログID (アメブロのID) e.g. "myblog"
 * @param {string} params.email     - ログイン用メールアドレス
 * @param {string} params.password  - ログイン用パスワード
 * @param {Array}  params.cookies   - 保存済みクッキー (あれば自動ログインをスキップ)
 * @param {string} params.title     - 記事タイトル
 * @param {string} params.content   - 記事本文 (HTML)
 * @param {string} params.category  - カテゴリー名 (任意)
 * @returns {{ postUrl: string, cookies: Array }}
 */
async function publishToAmeba({ blogId, email, password, cookies, title, content, category }) {
  const browser = await chromium.launch({
    headless: false,
    slowMo: rnd(30, 80),
    args: ['--disable-blink-features=AutomationControlled'],
  });

  try {
    const viewports = [
      { width: 1440, height: 900 }, { width: 1280, height: 800 },
      { width: 1512, height: 982 }, { width: 1920, height: 1080 },
    ];
    const viewport = viewports[rnd(0, viewports.length - 1)];

    const context = await browser.newContext({
      userAgent: USER_AGENTS[rnd(0, USER_AGENTS.length - 1)],
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      viewport,
      extraHTTPHeaders: { 'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7' },
    });

    // navigator.webdriver 숨기기
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });

    // 저장된 쿠키 복원 (로그인 스킵)
    if (cookies && Array.isArray(cookies) && cookies.length > 0) {
      try {
        await context.addCookies(cookies);
        console.log(`  → 저장된 쿠키 ${cookies.length}개 복원`);
      } catch (e) {
        console.warn(`  ⚠️ 쿠키 복원 실패: ${e.message}`);
      }
    }

    const page = await context.newPage();

    // ── 1. ログイン確認 / ログイン処理 ────────────────────────────────────────
    // アメブロのトップページに移動してログイン状態を確認
    // 아메바 메인 페이지로 이동하여 로그인 상태 확인
    console.log('  → ameblo.jp 방문 중...');
    await page.goto('https://ameblo.jp', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanWait(1000, 2000);
    await humanScroll(page);

    const currentUrl = page.url();
    console.log(`  → 현재 URL: ${currentUrl}`);

    // ログイン済みかチェック (アイコンや名前が表示されているか)
    // 로그인 여부 확인 (사용자 아이콘이나 이름 표시 여부)
    const isLoggedIn = await page.evaluate(() => {
      // アメブロのログイン状態を示す要素を探す
      // 아메바 로그인 상태를 나타내는 요소 탐색
      const indicators = [
        document.querySelector('.skin-headerAvatar'),        // ヘッダーのアバター
        document.querySelector('[class*="headerAvatar"]'),   // アバター関連クラス
        document.querySelector('[class*="mypage"]'),         // マイページリンク
        document.querySelector('a[href*="/user/amebaId"]'),  // ユーザーIDリンク
        document.querySelector('[data-user-id]'),            // ユーザーID属性
        document.querySelector('.p-header-user'),            // ユーザー情報ヘッダー
      ];
      return indicators.some(el => el !== null);
    });

    console.log(`  → 로그인 상태: ${isLoggedIn ? '✅ 로그인됨' : '❌ 미로그인'}`);

    if (!isLoggedIn) {
      // ── ログイン処理 ────────────────────────────────────────────────────────
      // アメブロのログインページへ遷移
      // 아메바 로그인 페이지로 이동
      console.log('  → 아메바 로그인 시도...');

      // アメブロのログインURLは変更される場合があるため複数試す
      // 아메바 로그인 URL은 변경될 수 있으므로 여러 경로 시도
      const loginUrls = [
        'https://auth.ameba.jp/login',
        'https://auth.ameba.jp/',
        'https://ameblo.jp/signin',
      ];

      let loginPageLoaded = false;
      for (const loginUrl of loginUrls) {
        try {
          await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await humanWait(1000, 2000);
          const url = page.url();
          console.log(`  → 로그인 페이지 URL: ${url}`);

          // ログインフォームの存在確認
          // 로그인 폼 존재 확인
          const hasForm = await page.evaluate(() => {
            return !!(
              document.querySelector('input[type="email"]') ||
              document.querySelector('input[name="email"]') ||
              document.querySelector('input[type="text"][name*="mail"]') ||
              document.querySelector('#email') ||
              document.querySelector('#userId')
            );
          });

          if (hasForm) {
            loginPageLoaded = true;
            console.log(`  → 로그인 폼 발견: ${loginUrl}`);
            break;
          }
        } catch (e) {
          console.warn(`  ⚠️ 로그인 URL 접근 실패 (${loginUrl}): ${e.message?.slice(0, 50)}`);
        }
      }

      if (!loginPageLoaded) {
        throw new Error('ログインページが見つかりません。ログインURLを確認してください。 / 로그인 페이지를 찾을 수 없습니다.');
      }

      // メールアドレス入力
      // 이메일 주소 입력
      console.log('  → 이메일 입력...');
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[id="email"]',
        'input[placeholder*="メールアドレス"]',
        'input[placeholder*="メール"]',
        'input[placeholder*="mail"]',
        '#userId',
      ];

      let emailFilled = false;
      for (const sel of emailSelectors) {
        try {
          const el = page.locator(sel).first();
          if (await el.count() > 0) {
            await el.click({ timeout: 3000 });
            await humanWait(200, 400);
            await el.fill('');
            await humanWait(100, 200);
            await humanType(page, email);
            emailFilled = true;
            console.log(`  → 이메일 입력 완료 (${sel})`);
            break;
          }
        } catch {}
      }

      if (!emailFilled) {
        throw new Error('メールアドレス入力フィールドが見つかりません / 이메일 입력 필드를 찾을 수 없습니다');
      }

      await humanWait(300, 700);

      // パスワード入力
      // 비밀번호 입력
      console.log('  → 비밀번호 입력...');

      // アメブロは2ステップ入力の場合がある (メール → 次へ → パスワード)
      // 아메바는 2단계 입력일 수 있음 (이메일 → 다음 → 비밀번호)
      // まず「次へ」ボタンを探す
      const nextBtnClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
        const btn = btns.find(b => {
          const t = b.textContent?.trim() || b.getAttribute('value') || '';
          return /次へ|ログイン|login|next/i.test(t);
        });
        if (btn) { btn.click(); return true; }
        return false;
      });

      if (nextBtnClicked) {
        console.log('  → "次へ" 버튼 클릭 (2단계 로그인 감지)');
        await humanWait(1500, 2500);
      }

      // パスワードフィールドを探す
      // 비밀번호 필드 탐색
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[id="password"]',
        'input[placeholder*="パスワード"]',
      ];

      let passwordFilled = false;
      for (const sel of passwordSelectors) {
        try {
          const el = page.locator(sel).first();
          if (await el.count() > 0) {
            await el.click({ timeout: 3000 });
            await humanWait(200, 400);
            await el.fill('');
            await humanWait(100, 200);
            await humanType(page, password);
            passwordFilled = true;
            console.log(`  → 비밀번호 입력 완료 (${sel})`);
            break;
          }
        } catch {}
      }

      if (!passwordFilled) {
        throw new Error('パスワード入力フィールドが見つかりません / 비밀번호 입력 필드를 찾을 수 없습니다');
      }

      await humanWait(400, 800);

      // ログインボタンをクリック
      // 로그인 버튼 클릭
      const loginBtnClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
        const btn = btns.find(b => {
          const t = b.textContent?.trim() || b.getAttribute('value') || '';
          return /ログイン|login|サインイン|signin/i.test(t);
        });
        if (btn) { btn.click(); return true; }
        return false;
      });

      if (!loginBtnClicked) {
        // Enterキーでサブミット
        // Enter 키로 제출
        await page.keyboard.press('Enter');
        console.log('  → Enter로 로그인 제출');
      } else {
        console.log('  → 로그인 버튼 클릭');
      }

      // ログイン完了を待機
      // 로그인 완료 대기
      console.log('  → 로그인 완료 대기...');
      await humanWait(3000, 5000);
      await page.screenshot({ path: '/tmp/ameba-login.png', fullPage: false }).catch(() => {});
      console.log('  → 스크린샷: /tmp/ameba-login.png');

      const afterLoginUrl = page.url();
      console.log(`  → 로그인 후 URL: ${afterLoginUrl}`);

      // ログイン後の確認
      // 로그인 후 확인
      if (afterLoginUrl.includes('auth.ameba') || afterLoginUrl.includes('/login')) {
        // エラーメッセージを取得
        // 에러 메시지 확인
        const errMsg = await page.evaluate(() => {
          const errEl = document.querySelector('[class*="error"], [class*="alert"], [class*="message"]');
          return errEl?.textContent?.trim() || '';
        });
        throw new Error(`ログイン失敗 / 로그인 실패${errMsg ? ': ' + errMsg : ''}`);
      }
    }

    // ── 2. クッキーを保存 ──────────────────────────────────────────────────────
    // ログイン後のクッキーを保存（次回の自動ログインに使用）
    // 로그인 후 쿠키 저장 (다음 번 자동 로그인에 사용)
    const newCookies = await context.cookies();
    const relevantCookies = newCookies.filter(c =>
      c.domain.includes('ameba') || c.domain.includes('ameblo')
    );
    console.log(`  → 쿠키 저장: ${relevantCookies.length}개`);

    // ── 3. 新規記事作成ページへ移動 ────────────────────────────────────────────
    // アメブロの新規記事作成ページのURL
    // 아메바 신규 기사 작성 페이지 URL
    // ※ セレクターは変更される場合があります / 셀렉터는 변경될 수 있습니다
    const newPostUrl = `https://ameblo.jp/${blogId}/edit-entry-new.html`;
    console.log(`  → 글쓰기 페이지 이동: ${newPostUrl}`);

    await humanWait(500, 1200);
    await page.goto(newPostUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanWait(2000, 4000);

    const editorUrl = page.url();
    console.log(`  → 에디터 URL: ${editorUrl}`);

    // ログインが必要な場合（リダイレクトされた場合）
    // 로그인이 필요한 경우 (리다이렉트된 경우)
    if (editorUrl.includes('auth.ameba') || editorUrl.includes('/login') || editorUrl.includes('/signin')) {
      throw new Error('AUTH: 세션이 만료되었습니다. 설정 탭에서 비밀번호를 확인해주세요.');
    }

    await page.screenshot({ path: '/tmp/ameba-editor.png', fullPage: false }).catch(() => {});
    console.log('  → 에디터 스크린샷: /tmp/ameba-editor.png');

    // エディタのロード待機
    // 에디터 로드 대기
    // ※ アメブロのエディターセレクターは変更される場合があります
    // ※ 아메바 에디터 셀렉터는 변경될 수 있습니다
    await page.waitForTimeout(3000);

    // ── 4. タイトル入力 ────────────────────────────────────────────────────────
    // タイトル入力フィールドのセレクター
    // 타이틀 입력 필드 셀렉터
    // ※ 以下のセレクターは変更される場合があります / 아래 셀렉터는 변경될 수 있습니다
    console.log('  → 제목 입력...');
    await humanWait(500, 1000);

    const titleSelectors = [
      'input[placeholder*="タイトル"]',          // プレースホルダーにタイトルを含む
      'input[placeholder*="title"]',             // 英語プレースホルダー
      'input[name="title"]',                     // name属性
      'input[id*="title"]',                      // id属性
      '.entry-title input',                      // エントリータイトルクラス
      '[class*="entryTitle"] input',             // エントリータイトル関連クラス
      '[class*="articleTitle"] input',           // 記事タイトル関連クラス
      'textarea[name="title"]',                  // textareaの場合
    ];

    let titleFilled = false;
    for (const sel of titleSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.count() > 0) {
          await el.click({ force: true, timeout: 3000 });
          await humanWait(300, 600);
          await el.fill('');
          await humanWait(100, 200);
          await humanType(page, title);
          titleFilled = true;
          console.log(`  → 제목 입력 완료 (${sel})`);
          break;
        }
      } catch {}
    }

    if (!titleFilled) {
      // フォールバック: 中央付近をクリック
      // 폴백: 중앙 부근 클릭
      console.warn('  ⚠️ 제목 필드를 찾지 못함, 화면 중앙 클릭 시도');
      const vp = page.viewportSize() || { width: 1280, height: 900 };
      await humanClick(page, vp.width / 2, 200);
      await humanWait(300, 600);
      await humanType(page, title);
      titleFilled = true;
    }

    await humanWait(500, 1000);

    // ── 5. 本文入力 ────────────────────────────────────────────────────────────
    // 記事の本文を入力する
    // 기사 본문을 입력
    // アメブロのエディターはcontenteditable要素を使用
    // 아메바 에디터는 contenteditable 요소를 사용
    console.log('  → 본문 입력...');
    await humanWait(500, 1000);

    // HTMLとして直接設定を試みる
    // HTML로 직접 설정 시도
    const contentSelectors = [
      '[contenteditable="true"]',                // contenteditable要素
      '.editor-content',                         // エディターコンテンツクラス
      '[class*="editorContent"]',                // エディターコンテンツ関連
      '[class*="blogContent"]',                  // ブログコンテンツ関連
      '[class*="articleContent"]',               // 記事コンテンツ関連
      '[class*="entryContent"]',                 // エントリーコンテンツ関連
      'iframe[title*="editor"]',                 // iframeエディター
      'textarea[name="body"]',                   // textarea本文
    ];

    let contentFilled = false;

    // まずcontenteditable要素への直接HTML注入を試みる
    // 먼저 contenteditable 요소에 직접 HTML 주입 시도
    const contentInjected = await page.evaluate((html) => {
      // title入力の次のcontenteditable要素を探す（本文エリア）
      // 타이틀 입력 다음의 contenteditable 요소 탐색 (본문 영역)
      const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
      // 最初の要素はタイトルの場合があるので2番目以降を優先
      // 첫 번째 요소는 타이틀일 수 있으므로 두 번째 이후를 우선
      const bodyEditable = editables.length > 1 ? editables[1] : editables[0];
      if (bodyEditable) {
        bodyEditable.focus();
        bodyEditable.innerHTML = html;
        // input/change イベントを発火して React/Vueのステートを更新
        // input/change 이벤트를 발생시켜 React/Vue 상태를 업데이트
        bodyEditable.dispatchEvent(new Event('input', { bubbles: true }));
        bodyEditable.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }, content);

    if (contentInjected) {
      contentFilled = true;
      console.log('  → 본문 HTML 직접 주입 완료 (contenteditable)');
    } else {
      // テキストエリアへのフォールバック
      // textarea 폴백
      for (const sel of contentSelectors) {
        try {
          const el = page.locator(sel).first();
          if (await el.count() > 0) {
            const tagName = await el.evaluate(e => e.tagName.toLowerCase());
            if (tagName === 'textarea') {
              await el.fill(content);
              contentFilled = true;
              console.log(`  → 본문 텍스트 영역 입력 완료 (${sel})`);
              break;
            } else {
              await el.click({ force: true, timeout: 3000 });
              await humanWait(300, 600);
              // 既存内容をクリア
              // 기존 내용 지우기
              await page.keyboard.press('Control+a');
              await humanWait(100, 200);
              await page.keyboard.press('Delete');
              await humanWait(100, 200);
              // HTMLを貼り付け (クリップボード経由)
              // HTML 붙여넣기 (클립보드 경유)
              await page.evaluate((html) => {
                const el = document.querySelector('[contenteditable="true"]');
                if (el) { el.innerHTML = html; }
              }, content);
              contentFilled = true;
              console.log(`  → 본문 입력 완료 (${sel})`);
              break;
            }
          }
        } catch {}
      }
    }

    if (!contentFilled) {
      console.warn('  ⚠️ 본문 입력 실패 - 에디터 구조를 확인하세요');
    }

    await humanWait(1000, 2000);

    // ── 6. カテゴリー設定（任意）──────────────────────────────────────────────
    // カテゴリーが指定されている場合は設定する
    // 카테고리가 지정된 경우 설정
    if (category && category.trim()) {
      console.log(`  → 카테고리 설정: ${category}`);
      try {
        // セレクトボックスでカテゴリーを選択
        // 셀렉트 박스에서 카테고리 선택
        const catSelected = await page.evaluate((catName) => {
          const selects = Array.from(document.querySelectorAll('select'));
          for (const sel of selects) {
            const opt = Array.from(sel.options).find(o =>
              o.text.includes(catName) || o.value.includes(catName)
            );
            if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; }
          }
          return false;
        }, category.trim());

        if (catSelected) {
          console.log('  → 카테고리 선택 완료');
        } else {
          // テキスト入力でカテゴリー
          // 텍스트 입력으로 카테고리
          const catInputSel = '[placeholder*="カテゴリ"], [placeholder*="category"], input[name*="category"]';
          const catEl = page.locator(catInputSel).first();
          if (await catEl.count() > 0) {
            await catEl.fill(category.trim());
            console.log('  → 카테고리 텍스트 입력 완료');
          } else {
            console.warn('  ⚠️ 카테고리 필드를 찾을 수 없습니다');
          }
        }
      } catch (e) {
        console.warn(`  ⚠️ 카테고리 설정 실패: ${e.message?.slice(0, 80)}`);
      }
      await humanWait(300, 600);
    }

    // スクリーンショット（デバッグ用）
    // 스크린샷 (디버그용)
    await page.screenshot({ path: '/tmp/ameba-before-publish.png', fullPage: false }).catch(() => {});
    console.log('  → 발행 전 스크린샷: /tmp/ameba-before-publish.png');

    await page.waitForTimeout(1000);

    // ── 7. 投稿ボタンをクリック ────────────────────────────────────────────────
    // 公開/投稿ボタンのセレクター
    // 공개/투고 버튼 셀렉터
    // ※ アメブロのUIは変更される場合があります / 아메바 UI는 변경될 수 있습니다
    console.log('  → 발행 버튼 클릭...');

    const publishBtnClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
      // 公開する・投稿する・公開・投稿 などのテキストを持つボタン
      // 공개하기, 투고하기, 공개, 투고 등의 텍스트를 가진 버튼
      const publishBtn = btns.find(b => {
        if (!b.offsetParent) return false; // 非表示要素をスキップ / 숨김 요소 스킵
        const t = b.textContent?.trim() || b.getAttribute('value') || '';
        return /公開する|公開|投稿する|投稿|publish|post/i.test(t) && !/プレビュー|preview/i.test(t);
      });
      if (publishBtn) { publishBtn.click(); return publishBtn.textContent?.trim() || true; }
      return false;
    });

    if (publishBtnClicked) {
      console.log(`  → 발행 버튼 클릭: "${typeof publishBtnClicked === 'string' ? publishBtnClicked : '버튼'}`);
    } else {
      // フォールバック: aria-label やdata属性で探す
      // 폴백: aria-label이나 data 속성으로 탐색
      const fallbackClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('[aria-label], [data-action]'));
        const btn = btns.find(b => {
          const label = b.getAttribute('aria-label') || b.getAttribute('data-action') || '';
          return /公開|投稿|publish|post/i.test(label);
        });
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (!fallbackClicked) {
        console.warn('  ⚠️ 발행 버튼을 찾을 수 없습니다. 페이지 구조를 확인하세요.');
      }
    }

    // 투고 확인 다이얼로그 처리
    await humanWait(1500, 3000);

    // 確認ダイアログが出た場合は「OK」や「公開する」をクリック
    // 확인 다이얼로그가 나온 경우 "OK"나 "공개하기" 클릭
    const confirmClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null);
      const btn = btns.find(b => {
        const t = b.textContent?.trim() || '';
        return /^(OK|確認|公開する|投稿する|はい|完了)$/.test(t);
      });
      if (btn) { btn.click(); return btn.textContent?.trim(); }
      return null;
    });
    if (confirmClicked) {
      console.log(`  → 확인 버튼 클릭: "${confirmClicked}"`);
      await humanWait(2000, 4000);
    }

    // ── 8. 投稿完了URL取得 ────────────────────────────────────────────────────
    // 投稿完了を待機してURLを取得
    // 투고 완료를 기다리고 URL 취득
    console.log('  → 발행 완료 URL 대기...');

    await page.waitForURL(
      url => {
        const u = url.toString();
        // アメブロの記事URLパターン
        // 아메바 기사 URL 패턴
        // e.g. https://ameblo.jp/blog-id/entry-12345678901.html
        return /ameblo\.jp/.test(u) && /entry-\d+/.test(u);
      },
      { timeout: 30000 }
    ).catch(() => {
      console.warn('  ⚠️ URL 변경 대기 timeout - 현재 URL에서 postUrl 추출 시도');
    });

    const finalUrl = page.url();
    console.log(`  → 최종 URL: ${finalUrl}`);

    await page.screenshot({ path: '/tmp/ameba-after-publish.png', fullPage: false }).catch(() => {});
    console.log('  → 발행 후 스크린샷: /tmp/ameba-after-publish.png');

    // URLからentry IDを抽出
    // URL에서 entry ID 추출
    // e.g. https://ameblo.jp/myblog/entry-12345678901.html
    const entryMatch = finalUrl.match(/entry-(\d+)\.html/);
    let postUrl = finalUrl;
    if (entryMatch) {
      postUrl = `https://ameblo.jp/${blogId}/entry-${entryMatch[1]}.html`;
      console.log(`  ✅ 발행 완료: ${postUrl}`);
    } else {
      // ページ内からURLを探す
      // 페이지 내에서 URL 탐색
      const pageContent = await page.content().catch(() => '');
      const contentMatch = pageContent.match(/ameblo\.jp\/[^/"]+\/entry-(\d+)\.html/);
      if (contentMatch) {
        postUrl = `https://ameblo.jp/${blogId}/entry-${contentMatch[1]}.html`;
        console.log(`  ✅ 발행 완료 (페이지에서 URL 추출): ${postUrl}`);
      } else if (finalUrl.includes('ameblo.jp') && !finalUrl.includes('edit')) {
        console.log(`  ✅ 발행 완료 (현재 URL): ${postUrl}`);
      } else {
        console.warn(`  ⚠️ 발행 완료 URL을 추출하지 못했습니다: ${finalUrl}`);
        postUrl = '';
      }
    }

    return { postUrl, cookies: relevantCookies };

  } finally {
    await browser.close();
  }
}

// ── 단일 작업 처리 ────────────────────────────────────────────────────────────

async function processJob(job) {
  console.log(`\n📝 작업 처리: ${job.id}`);
  console.log(`   제목: ${job.title}`);
  console.log(`   블로그 ID: ${job.blog_id}`);

  // 처리 중으로 상태 변경
  await sbPatch('ameba_publish_queue', `id=eq.${job.id}`, { status: 'processing' });

  // 연결 정보 조회
  const conns = await sbGet('ameba_connections', `user_id=eq.${job.user_id}&select=*`);
  const conn = conns[0];

  if (!conn?.email) {
    await sbPatch('ameba_publish_queue', `id=eq.${job.id}`, {
      status: 'error',
      error: '아메바 계정 정보 없음 (email 미설정)',
      processed_at: new Date().toISOString(),
    });
    console.error('  ❌ 계정 정보 없음');
    return;
  }

  if (!conn?.password_plain) {
    await sbPatch('ameba_publish_queue', `id=eq.${job.id}`, {
      status: 'error',
      error: '아메바 비밀번호 없음 - 설정 탭에서 비밀번호를 입력해주세요',
      processed_at: new Date().toISOString(),
    });
    console.error('  ❌ 비밀번호 없음');
    return;
  }

  let result;
  try {
    result = await publishToAmeba({
      blogId: conn.blog_id,
      email: conn.email,
      password: conn.password_plain,
      cookies: conn.cookies || [],
      title: job.title,
      content: job.content,
      category: job.category || '',
    });
  } catch (e) {
    const errMsg = e.message || String(e);
    await sbPatch('ameba_publish_queue', `id=eq.${job.id}`, {
      status: 'error',
      error: errMsg,
      processed_at: new Date().toISOString(),
    });
    console.error(`  ❌ 발행 실패: ${errMsg}`);
    return;
  }

  // 성공 — 큐 업데이트
  await sbPatch('ameba_publish_queue', `id=eq.${job.id}`, {
    status: 'done',
    result_url: result.postUrl || null,
    processed_at: new Date().toISOString(),
  });

  // 쿠키 업데이트 (다음 번 자동 로그인을 위해)
  if (result.cookies && result.cookies.length > 0) {
    await sbPatch('ameba_connections', `user_id=eq.${job.user_id}`, {
      cookies: result.cookies,
      cookies_updated_at: new Date().toISOString(),
    }).catch(e => console.warn(`  ⚠️ 쿠키 업데이트 실패: ${e.message}`));
    console.log(`  → 쿠키 저장 완료 (${result.cookies.length}개)`);
  }

  // 히스토리 삽입
  await sbInsert('ameba_publish_history', {
    user_id: job.user_id,
    blog_id: conn.blog_id,
    title: job.title,
    post_url: result.postUrl || null,
    status: result.postUrl ? 'success' : 'success_no_url',
  });

  console.log(`  ✅ 완료: ${result.postUrl || '(URL 없음)'}`);
}

// ── 메인 루프 ─────────────────────────────────────────────────────────────────

async function run() {
  console.log('🌸 アメブロ 로컬 발행 에이전트 시작');
  console.log(`   모드: ${ONCE ? '한 번만 실행' : '연속 실행 (10초마다 폴링)'}`);
  console.log('   종료: Ctrl+C\n');

  let failCount = 0;
  const MAX_FAIL = 5;

  do {
    try {
      // processing stuck 잡 복구 (5분 이상 processing 상태면 pending으로 되돌림)
      const stuckCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      await fetch(
        `${SUPABASE_URL}/rest/v1/ameba_publish_queue?status=eq.processing&created_at=lt.${stuckCutoff}`,
        {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json', Prefer: 'return=minimal',
          },
          body: JSON.stringify({ status: 'pending' }),
        }
      ).catch(() => {});

      // pending 작업 조회
      const jobs = await sbGet(
        'ameba_publish_queue',
        'status=eq.pending&order=created_at.asc&limit=5&select=*'
      );
      failCount = 0;

      if (jobs.length > 0) {
        console.log(`\n🌸 ${jobs.length}개 작업 처리 시작`);
        for (const job of jobs) {
          await processJob(job);
        }
      } else if (!ONCE) {
        process.stdout.write('🌸 대기 중 (pending 작업 없음)...\r');
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
