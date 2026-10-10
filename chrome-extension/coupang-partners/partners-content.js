// ── background.js 메시지 수신 ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SCRAPE_PARTNERS_PRODUCTS') {
    sendResponse({ products: scrapePartnersProducts() });
  }
  if (msg.type === 'AUTO_COLLECT_PARTNERS') {
    autoCollectFromPartners(msg.maxItems || 20, msg.password || '');
    sendResponse({ ok: true });
  }
  if (msg.type === 'STOP_COLLECT') {
    _stopRequested = true;
    sendResponse({ ok: true });
  }
});

// ── 상품 목록 스크랩 ──────────────────────────────────────────────────────
function scrapePartnersProducts() {
  const products = [];
  const seen = new Set();

  for (const item of document.querySelectorAll('div.product-item:not(.as-placeholder)')) {
    if (!item.querySelector('button.btn-generate-link')) continue;

    const img = item.querySelector('.product-picture > img');
    const imageUrl = img?.src || '';
    if (!imageUrl || imageUrl.startsWith('data:') || seen.has(imageUrl)) continue;
    seen.add(imageUrl);

    const nameEl = item.querySelector('.LinesEllipsis');
    let name = '상품명 없음';
    if (nameEl) {
      name = Array.from(nameEl.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent.trim()).join('').replace(/\s+/g, ' ').trim()
        || nameEl.textContent.trim().replace(/…$/, '').trim();
    }

    const salePriceEl = item.querySelector('.sale-price .currency-label');
    const price = ((salePriceEl?.textContent || '').match(/[\d,]+/) || ['0'])[0];

    products.push({ name, price, imageUrl });
  }

  showToast(
    products.length ? `🔍 ${products.length}개 상품 발견` : '상품을 찾지 못했습니다',
    products.length ? 'success' : 'error'
  );
  return products;
}

// ── imageUrl로 product-item 요소 찾기 ────────────────────────────────────
function findItemByImage(imageUrl) {
  for (const item of document.querySelectorAll('div.product-item:not(.as-placeholder)')) {
    const img = item.querySelector('.product-picture > img');
    if (img?.src === imageUrl) return item;
  }
  return null;
}

// ── btn-open-detail 클릭 → window.open 가로채서 coupangUrl 획득 ──────────
function getCoupangUrl(item) {
  return new Promise(resolve => {
    const btn = item?.querySelector('button.btn-open-detail');
    if (!btn) { resolve(''); return; }

    let captured = '';
    const origOpen = window.open;

    window.open = function(url) {
      if (url && url.includes('coupang.com')) captured = url;
      window.open = origOpen;
      resolve(captured);
      return null;
    };

    btn.click();

    // window.open이 비동기일 경우 대비 1초 타임아웃
    setTimeout(() => {
      window.open = origOpen;
      resolve(captured);
    }, 1000);
  });
}

// ── btn-generate-link 클릭 → 파트너스 링크 + coupangUrl 획득 ─────────────
async function getPartnerLink(item, password) {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const startHash = window.location.hash;

  item.querySelector('button.btn-generate-link').click();

  let partnerLink = null;
  let coupangUrl = '';

  for (let j = 0; j < 40; j++) {
    await wait(500);

    // 링크생성 페이지 hash에서 productId 추출
    // 패턴: #affiliate/ws/linkgeneration/PRODUCT/{itemId}/{vendorItemId}
    if (!coupangUrl) {
      const m = window.location.hash.match(/linkgeneration\/PRODUCT\/(\d+)/);
      if (m) coupangUrl = `https://www.coupang.com/vp/products/${m[1]}`;
    }

    // 인증 실패 모달 → 비밀번호 자동 입력 (화면에 보이는 경우만)
    const pwInput = document.querySelector('input#password.ant-input[type="password"]');
    if (pwInput && pwInput.offsetParent !== null && password && !_pwSubmitting) {
      _pwSubmitting = true;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(pwInput, password); else pwInput.value = password;
      pwInput.dispatchEvent(new Event('input', { bubbles: true }));
      pwInput.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(300);
      document.querySelector('button[type="submit"].ant-btn-primary')?.click();
      for (let k = 0; k < 10; k++) {
        await wait(500);
        const still = document.querySelector('input#password.ant-input[type="password"]');
        if (!still || still.offsetParent === null) break;
      }
      _pwSubmitting = false;
      continue;
    }

    // 링크 추출 방법1: input value
    const urlInput = Array.from(document.querySelectorAll('input'))
      .find(inp => (inp.value || '').includes('link.coupang.com'));
    if (urlInput) { partnerLink = urlInput.value.trim(); break; }

    // 링크 추출 방법2: div.unselectable-input
    const divEl = document.querySelector('.unselectable-input.shorten-url-input');
    const divText = (divEl?.textContent || '').trim();
    if (divText.includes('link.coupang.com')) { partnerLink = divText; break; }

    // 링크 추출 방법3: innerHTML 정규식
    const m2 = document.body.innerHTML.match(/https:\/\/link\.coupang\.com\/a\/[A-Za-z0-9]+/);
    if (m2) { partnerLink = m2[0]; break; }
  }

  // 링크생성 페이지에서 뒤로가기
  if (window.location.hash !== startHash) {
    history.back();
    await wait(2500);
  }

  return { partnerLink, coupangUrl };
}

// ── 플래그 ────────────────────────────────────────────────────────────────
let _stopRequested = false;
let _pwSubmitting = false;

// ── 자동 수집 메인 ─────────────────────────────────────────────────────────
async function autoCollectFromPartners(maxItems, password) {
  _stopRequested = false;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  await wait(1000);

  const products = scrapePartnersProducts();
  if (!products.length) {
    chrome.runtime.sendMessage({ type: 'COLLECT_DONE', success: 0, fail: 0, stopped: false });
    return;
  }

  const target = products.slice(0, maxItems);
  showToast(`🚀 ${target.length}개 수집 시작!`);
  let success = 0, fail = 0;

  for (let i = 0; i < target.length; i++) {
    if (_stopRequested) {
      showToast(`⏹ 중단됨 (${success}개 저장)`, 'error');
      chrome.runtime.sendMessage({ type: 'COLLECT_DONE', success, fail, stopped: true });
      return;
    }

    const p = target[i];
    chrome.runtime.sendMessage({
      type: 'COLLECT_PROGRESS', current: i + 1, total: target.length,
      name: p.name.slice(0, 20), status: 'processing'
    });

    try {
      // history.back() 후 DOM 재렌더링되므로 imageUrl로 요소 재검색
      const item = findItemByImage(p.imageUrl);
      if (!item) throw new Error('상품 카드 찾기 실패');

      // ── 1. 상품정보 클릭 → coupangUrl 획득 ──────────────────────────
      let coupangUrl = await getCoupangUrl(item);

      // ── 2. 링크생성 클릭 → 파트너스 링크 + hash에서 coupangUrl 보완 ─
      const { partnerLink, coupangUrl: urlFromHash } = await getPartnerLink(item, password);
      if (!coupangUrl && urlFromHash) coupangUrl = urlFromHash;

      const finalPartnerLink = partnerLink || coupangUrl || '';

      // ── 3. 상품평 + 사진 수집 (background.js → coupang.com 팝업) ────
      const productId = coupangUrl?.match(/\/products\/(\d+)/)?.[1];
      const { reviews = [], reviewImages = [] } = productId
        ? await chrome.runtime.sendMessage({ type: 'FETCH_REVIEWS', productId })
        : {};

      // ── 4. 노션 저장 ──────────────────────────────────────────────────
      const notionRes = await chrome.runtime.sendMessage({
        type: 'SAVE_NOTION',
        data: {
          name: p.name,
          price: p.price,
          url: coupangUrl,
          partnerLink: finalPartnerLink,
          thumbnail: p.imageUrl,
          reviews,
          reviewImages,
        }
      });

      if (notionRes?.ok) {
        success++;
        chrome.runtime.sendMessage({
          type: 'COLLECT_PROGRESS', current: i + 1, total: target.length,
          name: p.name.slice(0, 20), status: 'ok'
        });
      } else {
        throw new Error(notionRes?.error || 'Notion 저장 실패');
      }
    } catch (e) {
      fail++;
      chrome.runtime.sendMessage({
        type: 'COLLECT_PROGRESS', current: i + 1, total: target.length,
        name: p.name.slice(0, 20), status: 'error'
      });
    }

    await wait(1000);
  }

  showToast(`✅ 완료! ${success}개 저장, ${fail}개 실패`);
  chrome.runtime.sendMessage({ type: 'COLLECT_DONE', success, fail, stopped: false });
}

// ── 토스트 ────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  let t = document.getElementById('cp-partners-toast');
  if (t) t.remove();
  t = document.createElement('div');
  t.id = 'cp-partners-toast';
  t.style.cssText = `
    position:fixed;bottom:30px;left:50%;transform:translateX(-50%);
    background:${type === 'error' ? '#e74c3c' : '#2ecc71'};
    color:white;padding:12px 24px;border-radius:10px;font-size:13px;font-weight:700;
    z-index:9999999;max-width:400px;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,0.2);
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}
