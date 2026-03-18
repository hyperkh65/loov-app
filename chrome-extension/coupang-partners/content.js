// ── 상품 목록 수집 ────────────────────────────────────────────────────────
function getAllProducts() {
  const selectors = [
    'li.baby-product', 'li[class*="product"]', 'li.search-product',
    '.unit-product', '[data-product-id]', 'li[id*="productId"]',
  ];
  const found = new Map();
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach(el => {
      const a = el.querySelector('a[href*="/products/"]');
      if (!a) return;
      const m = a.href.match(/\/products\/(\d+)/);
      if (!m) return;
      const id = m[1];
      if (found.has(id)) return;
      // 상품명: 정확한 클래스 우선
      const nameEl =
        el.querySelector('.name') ||
        el.querySelector('.prod-name') ||
        el.querySelector('[class="name"]') ||
        el.querySelector('[class*="prod-name"]') ||
        el.querySelector('[class*="item-name"]') ||
        el.querySelector('h2,h3,h4');
      const rawName = nameEl?.textContent?.trim()
        || a.getAttribute('title')
        || a.getAttribute('aria-label')
        || a.textContent?.trim()
        || '';

      // 가격: 상품 li 전체 innerText에서 "숫자원" 패턴으로 직접 추출
      const elText = el.innerText || el.textContent || '';
      const wonMatches = elText.match(/(\d{1,3}(?:,\d{3})*)\s*원/g) || [];
      // 마지막 값이 할인가인 경우가 많음. 100원 이상 첫 번째 값 사용
      const cleanPrice = (wonMatches
        .map(s => s.replace(/[^\d,]/g, ''))
        .find(s => parseInt(s.replace(/,/g, '')) >= 100)) || '';

      const imgEl = el.querySelector('img');
      found.set(id, {
        id,
        url: 'https://www.coupang.com/vp/products/' + id,
        name: rawName || '상품명 없음',
        price: cleanPrice,
        thumbnail: imgEl?.src || imgEl?.dataset?.src || '',
      });
    });
  }
  return [...found.values()];
}

// ── 상품평 수집 (background fetch 방식) ──────────────────────────────────
async function collectReviews(productUrl) {
  const productId = productUrl.match(/\/products\/(\d+)/)?.[1];
  if (!productId) return { reviews: [], reviewImages: [] };
  try {
    const result = await chrome.runtime.sendMessage({ type: 'FETCH_REVIEWS', productId });
    return result || { reviews: [], reviewImages: [] };
  } catch(e) {
    return { reviews: [], reviewImages: [] };
  }
}

// ── 수집 중단 플래그 ──────────────────────────────────────────────────────
let _stopRequested = false;

// ── 다음 페이지로 이동 ────────────────────────────────────────────────────
function goNextPage() {
  // 쿠팡 페이지네이션: 다음 버튼 찾기
  const selectors = [
    'a.next', 'button.next', '[class*="next"]',
    'a[aria-label*="다음"]', 'button[aria-label*="다음"]',
    '.pagination a:last-child', '[class*="pagination"] a:last-child',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.offsetParent !== null && !el.classList.contains('disabled')) {
      el.click();
      return true;
    }
  }
  // 현재 페이지 번호 기반으로 다음 페이지 URL 직접 이동
  const url = new URL(location.href);
  const page = parseInt(url.searchParams.get('page') || '1');
  url.searchParams.set('page', page + 1);
  location.href = url.toString();
  return true;
}

// ── 자동 수집 실행 (다중 페이지) ──────────────────────────────────────────
async function autoCollect({ maxPages = 5 } = {}) {
  _stopRequested = false;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  let success = 0, fail = 0;
  let pageNum = 1;
  let totalCollected = 0;

  // 팝업에서 받은 maxPages 사용
  showToast(`🚀 최대 ${maxPages}페이지 자동 수집 시작!`);

  while (pageNum <= maxPages) {
    if (_stopRequested) {
      showToast(`⏹ 수집 중단됨 (${success}개 저장, ${fail}개 실패)`, 'error');
      chrome.runtime.sendMessage({ type: 'COLLECT_DONE', success, fail, stopped: true });
      return;
    }

    const products = getAllProducts();
    if (!products.length) {
      showToast(`페이지 ${pageNum}: 상품 없음. 종료.`, 'error');
      break;
    }

    showToast(`📄 ${pageNum}페이지 - ${products.length}개 수집 중...`);

    for (let i = 0; i < products.length; i++) {
      if (_stopRequested) {
        showToast(`⏹ 수집 중단됨 (${success}개 저장, ${fail}개 실패)`, 'error');
        chrome.runtime.sendMessage({ type: 'COLLECT_DONE', success, fail, stopped: true });
        return;
      }

      const product = products[i];
      totalCollected++;

      try {
        chrome.runtime.sendMessage({
          type: 'COLLECT_PROGRESS',
          current: totalCollected,
          total: totalCollected, // 전체 미지수이므로 현재값 표시
          name: `[${pageNum}p] ${product.name.slice(0, 15)}`,
          status: 'processing'
        });

        const { reviews, reviewImages } = await collectReviews(product.url);

        const linkRes = await chrome.runtime.sendMessage({ type: 'GENERATE_LINK', url: product.url });
        const partnerLink = linkRes.ok ? linkRes.link : product.url;

        const notionRes = await chrome.runtime.sendMessage({
          type: 'SAVE_NOTION',
          data: { ...product, partnerLink, reviews, reviewImages }
        });

        if (notionRes.ok) {
          success++;
          chrome.runtime.sendMessage({
            type: 'COLLECT_PROGRESS',
            current: totalCollected, total: totalCollected,
            name: `[${pageNum}p] ${product.name.slice(0, 15)}`, status: 'ok'
          });
        } else throw new Error(notionRes.error);

      } catch(e) {
        fail++;
        chrome.runtime.sendMessage({
          type: 'COLLECT_PROGRESS',
          current: totalCollected, total: totalCollected,
          name: `[${pageNum}p] ${product.name.slice(0, 15)}`, status: 'error'
        });
      }

      await wait(1500);
    }

    pageNum++;
    if (pageNum > maxPages) break;

    // 다음 페이지로 이동 후 로딩 대기
    showToast(`➡️ ${pageNum}페이지로 이동 중...`);
    goNextPage();
    await wait(3000); // 페이지 로딩 대기
  }

  showToast(`✅ 완료! 총 ${success}개 저장, ${fail}개 실패`);
  chrome.runtime.sendMessage({ type: 'COLLECT_DONE', success, fail, stopped: false });
}

// ── 토스트 ────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  let toast = document.getElementById('cp-toast');
  if (toast) toast.remove();
  toast = document.createElement('div');
  toast.id = 'cp-toast';
  toast.style.cssText = `
    position:fixed;bottom:30px;left:50%;transform:translateX(-50%);
    background:${type === 'error' ? '#e74c3c' : '#2ecc71'};
    color:white;padding:12px 24px;border-radius:10px;font-size:13px;font-weight:700;
    z-index:9999999;max-width:400px;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,0.2);
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ── 메시지 수신 ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'AUTO_COLLECT') {
    autoCollect({ maxPages: msg.maxPages || 5 });
    sendResponse({ ok: true });
  }
  if (msg.type === 'STOP_COLLECT') {
    _stopRequested = true;
    sendResponse({ ok: true });
  }
});
