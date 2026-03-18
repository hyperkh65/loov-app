// ── 아이콘 클릭 → 고정 창으로 열기 ──────────────────────────────────────
chrome.action.onClicked.addListener(() => {
  chrome.windows.create({
    url: chrome.runtime.getURL('popup.html'),
    type: 'popup',
    width: 340,
    height: 760,
    focused: true,
  });
});

// ── 설정 로드 ─────────────────────────────────────────────────────────────
async function getConfig() {
  return new Promise(resolve => chrome.storage.sync.get([
    'notionApiKey', 'notionDatabaseId', 'coupangAccessKey', 'coupangSecretKey'
  ], resolve));
}

// ── 쿠팡 파트너스 공식 API HMAC 서명 ──────────────────────────────────────
async function hmacSha256Hex(secretKey, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── 쿠팡파트너스 링크 생성 (로그인 세션 이용, DOM 추출) ─────────────────
async function generatePartnerLink(originalUrl) {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const partnerPageUrl = `https://partners.coupang.com/#create_link/url=${encodeURIComponent(originalUrl)}`;
  let winId, tabId;

  try {
    const win = await chrome.windows.create({
      url: partnerPageUrl,
      type: 'popup', width: 1024, height: 768, focused: false,
    });
    winId = win.id;
    tabId = win.tabs[0].id;

    // 페이지 로딩 완료 대기
    for (let i = 0; i < 30; i++) {
      await wait(500);
      const t = await chrome.tabs.get(tabId).catch(() => null);
      if (!t) break;
      if (t.status === 'complete') break;
    }

    // React 렌더링 후 링크 생성까지 대기 후 DOM 추출 (최대 15초)
    for (let i = 0; i < 30; i++) {
      await wait(500);
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const el = document.querySelector('.unselectable-input.shorten-url-input');
          const text = (el?.textContent || '').trim();
          return text.includes('link.coupang.com') ? text : null;
        },
      }).catch(() => [{ result: null }]);

      const link = result?.[0]?.result;
      if (link) {
        await chrome.windows.remove(winId).catch(() => {});
        return link;
      }
    }
  } catch (e) { /* ignore */ }

  if (winId) await chrome.windows.remove(winId).catch(() => {});
  return { needsManual: true, originalUrl };
}

// ── 노션 저장 ─────────────────────────────────────────────────────────────
async function saveToNotion(productData) {
  const config = await getConfig();
  const { notionApiKey, notionDatabaseId } = config;
  if (!notionApiKey || !notionDatabaseId) throw new Error('노션 설정이 필요합니다.');

  // Notion URL 프로퍼티: 빈 문자열 불가 → null 사용
  const safeUrl = v => v ? { url: v } : { url: null };

  const props = {
    '상품명': { title: [{ text: { content: productData.name || '' } }] },
    '가격': { number: parseInt((productData.price || '0').replace(/,/g, '')) || 0 },
    '파트너스링크': safeUrl(productData.partnerLink || productData.url),
    '원본링크': safeUrl(productData.url),
    '리뷰1': { rich_text: [{ text: { content: (productData.reviews?.[0] || '').slice(0, 2000) } }] },
    '리뷰2': { rich_text: [{ text: { content: (productData.reviews?.[1] || '').slice(0, 2000) } }] },
    '수집일': { date: { start: new Date().toISOString().slice(0, 10) } },
  };

  // 리뷰 이미지를 사진1~사진5 열(URL 타입)로 저장
  const images = productData.reviewImages || [];
  for (let i = 0; i < 5; i++) {
    props[`사진${i + 1}`] = safeUrl(images[i]);
  }

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${notionApiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      parent: { database_id: notionDatabaseId },
      properties: props,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error('노션 저장 실패: ' + (err.message || res.status));
  }
  return await res.json();
}

// ── 상품평 수집: 일반 탭으로 열기 (popup은 봇 감지됨) ─────────────────────
async function fetchProductReviews(productId) {
  const url = `https://www.coupang.com/vp/products/${productId}`;
  let tabId;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  try {
    // active: true로 열어야 봇 감지 우회 가능 (background tab은 감지됨)
    const tab = await chrome.tabs.create({ url, active: true });
    tabId = tab.id;

    // 페이지 로딩 완료까지 polling (최대 15초)
    for (let i = 0; i < 30; i++) {
      await wait(500);
      const t = await chrome.tabs.get(tabId).catch(() => null);
      if (!t) return { reviews: [], reviewImages: [] };
      if (t.status === 'complete') break;
    }

    // Access Denied / 로그인 페이지 감지 → 즉시 종료
    const pageCheck = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const body = document.body?.innerText || '';
        const url = window.location.href;
        if (body.includes('Access Denied') || url.includes('login') || url.includes('http://')) {
          return 'blocked';
        }
        return 'ok';
      }
    }).catch(() => [{ result: 'blocked' }]);
    if (pageCheck?.[0]?.result !== 'ok') return { reviews: [], reviewImages: [] };

    // 상품평 탭 클릭 + 페이지 스크롤
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        for (const el of document.querySelectorAll('a,button,li,span')) {
          if (el.textContent?.trim().startsWith('상품평') && el.offsetParent !== null) {
            el.click(); break;
          }
        }
        window.scrollTo({ top: document.body.scrollHeight * 0.7 });
      }
    }).catch(() => {});

    // 리뷰 article이 나타날 때까지 polling (새 쿠팡 UI: span[translate="no"])
    for (let i = 0; i < 20; i++) {
      await wait(500);
      const found = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => document.querySelectorAll('article span[translate="no"]').length > 0,
      }).catch(() => [{ result: false }]);
      if (found?.[0]?.result) break;
    }

    // 스크롤해서 lazy load 트리거
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const h = document.body.scrollHeight;
        window.scrollTo({ top: h * 0.5 });
        setTimeout(() => window.scrollTo({ top: h * 0.75 }), 300);
        setTimeout(() => window.scrollTo({ top: h * 0.9 }), 600);
      }
    }).catch(() => {});
    await wait(1200);

    // 상품평 텍스트 + 이미지 추출 (새 쿠팡 UI 기준)
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const reviews = [];
        const reviewImages = [];

        // 리뷰 본문: <span translate="no"> 안에 실제 텍스트 있음
        document.querySelectorAll('article span[translate="no"]').forEach(el => {
          const text = (el.innerText || el.textContent || '').trim();
          if (text.length > 20 && !text.includes('신고하기') && reviews.length < 2)
            reviews.push(text.slice(0, 500));
        });

        // 리뷰 이미지: 부모 div에 inline style(width/height ~98px)이 있는 것만 = 리뷰 사진
        // 프로필 사진은 class만 있고 inline style 없음
        document.querySelectorAll('article div[style] > img').forEach(img => {
          const src = img.src || '';
          // src가 없거나 data: placeholder이면 스킵
          if (!src || src.includes('data:') || src.length < 20) return;
          if (reviewImages.length < 5) {
            reviewImages.push(src.replace(/\/local\/\d+\//, '/local/1000/'));
          }
        });

        return { reviews, reviewImages };
      },
    });

    return results?.[0]?.result || { reviews: [], reviewImages: [] };

  } catch(e) {
    return { reviews: [], reviewImages: [] };
  } finally {
    if (tabId) await chrome.tabs.remove(tabId).catch(() => {});
  }
}

// ── 파트너스 링크생성 페이지에서 직접 링크 추출 ──────────────────────────
async function generatePartnerLinkFromPage(linkGenUrl, coupangUrl, password) {
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // linkGenUrl 없으면 기존 방식으로 fallback
  const targetUrl = linkGenUrl ||
    (coupangUrl ? `https://partners.coupang.com/#create_link/url=${encodeURIComponent(coupangUrl)}` : null);
  if (!targetUrl) return null;

  let winId, tabId;
  try {
    const win = await chrome.windows.create({
      url: targetUrl,
      type: 'popup', width: 1024, height: 768, focused: false,
    });
    winId = win.id;
    tabId = win.tabs[0].id;

    // 페이지 로딩 완료 대기
    for (let i = 0; i < 30; i++) {
      await wait(500);
      const t = await chrome.tabs.get(tabId).catch(() => null);
      if (!t) break;
      if (t.status === 'complete') break;
    }
    await wait(1000);

    // 최대 3번: 비밀번호 처리 → 링크 추출
    for (let attempt = 0; attempt < 3; attempt++) {
      // 비밀번호 프롬프트 자동 처리
      if (password) {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (pwd) => {
            const pwInput = document.querySelector('input[type="password"]');
            if (!pwInput || pwInput.offsetParent === null) return 'no-prompt';
            pwInput.value = pwd;
            pwInput.dispatchEvent(new Event('input', { bubbles: true }));
            pwInput.dispatchEvent(new Event('change', { bubbles: true }));
            const btn = document.querySelector('button[type="submit"], .confirm-btn, .ok-btn, button.btn-primary');
            if (btn) { btn.click(); return 'clicked'; }
            pwInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            return 'enter';
          },
          args: [password],
        }).catch(() => {});
        await wait(2000);
      }

      // 링크 생성 완료까지 polling (최대 15초)
      for (let i = 0; i < 30; i++) {
        await wait(500);
        const result = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const el = document.querySelector('.unselectable-input.shorten-url-input');
            const text = (el?.textContent || '').trim();
            return text.includes('link.coupang.com') ? text : null;
          },
        }).catch(() => [{ result: null }]);
        const link = result?.[0]?.result;
        if (link) {
          await chrome.windows.remove(winId).catch(() => {});
          return link;
        }
      }
    }
  } catch (e) { /* ignore */ }

  if (winId) await chrome.windows.remove(winId).catch(() => {});
  return null;
}

// ── 메시지 핸들러 ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GENERATE_PARTNER_LINK_FROM_PAGE') {
    generatePartnerLinkFromPage(msg.linkGenUrl, msg.coupangUrl, msg.password)
      .then(link => sendResponse({ link }))
      .catch(() => sendResponse({ link: null }));
    return true;
  }

  if (msg.type === 'GENERATE_LINK') {
    generatePartnerLink(msg.url)
      .then(result => {
        if (result?.needsManual) {
          // 파트너스 사이트 새탭 열기 (수동 복사)
          chrome.tabs.create({ url: result.partnerPageUrl });
          sendResponse({ ok: false, needsManual: true, error: '파트너스 사이트에서 로그인 후 링크를 복사해주세요.' });
        } else {
          sendResponse({ ok: true, link: result });
        }
      })
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === 'SAVE_NOTION') {
    saveToNotion(msg.data)
      .then(res => sendResponse({ ok: true, notionUrl: res.url }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === 'FETCH_REVIEWS') {
    fetchProductReviews(msg.productId)
      .then(result => sendResponse(result))
      .catch(() => sendResponse({ reviews: [], reviewImages: [] }));
    return true;
  }

  if (msg.type === 'OPEN_LINK') {
    chrome.tabs.create({ url: msg.url });
    sendResponse({ ok: true });
    return true;
  }
});
