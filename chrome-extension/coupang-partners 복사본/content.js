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

// ── 자동 수집 실행 ────────────────────────────────────────────────────────
async function autoCollect() {
  _stopRequested = false;
  const products = getAllProducts();
  if (!products.length) {
    showToast('수집할 상품이 없습니다. 쿠팡 상품 목록 페이지에서 실행해주세요.', 'error');
    chrome.runtime.sendMessage({ type: 'COLLECT_DONE', success: 0, fail: 0, stopped: false });
    return;
  }

  showToast(`🚀 ${products.length}개 상품 자동 수집 시작!`);
  let success = 0, fail = 0;

  for (let i = 0; i < products.length; i++) {
    // 중단 요청 확인
    if (_stopRequested) {
      showToast(`⏹ 수집 중단됨 (${success}개 저장, ${fail}개 실패)`, 'error');
      chrome.runtime.sendMessage({ type: 'COLLECT_DONE', success, fail, stopped: true });
      return;
    }

    const product = products[i];
    try {
      // 진행상황 팝업 전송
      chrome.runtime.sendMessage({
        type: 'COLLECT_PROGRESS',
        current: i + 1, total: products.length,
        name: product.name.slice(0, 20), status: 'processing'
      });

      // 리뷰 수집 (iframe은 수집 즉시 닫힘)
      const { reviews, reviewImages } = await collectReviews(product.url);

      // 파트너스 링크 생성
      const linkRes = await chrome.runtime.sendMessage({ type: 'GENERATE_LINK', url: product.url });
      const partnerLink = linkRes.ok ? linkRes.link : product.url;

      // 노션 저장
      const notionRes = await chrome.runtime.sendMessage({
        type: 'SAVE_NOTION',
        data: { ...product, partnerLink, reviews, reviewImages }
      });

      if (notionRes.ok) {
        success++;
        chrome.runtime.sendMessage({
          type: 'COLLECT_PROGRESS',
          current: i + 1, total: products.length,
          name: product.name.slice(0, 20), status: 'ok'
        });
      } else throw new Error(notionRes.error);

    } catch(e) {
      fail++;
      chrome.runtime.sendMessage({
        type: 'COLLECT_PROGRESS',
        current: i + 1, total: products.length,
        name: product.name.slice(0, 20), status: 'error'
      });
    }

    // 쿠팡 서버 부하 방지 딜레이
    await new Promise(r => setTimeout(r, 1500));
  }

  showToast(`✅ 완료! ${success}개 저장, ${fail}개 실패`);
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
    autoCollect();
    sendResponse({ ok: true });
  }
  if (msg.type === 'STOP_COLLECT') {
    _stopRequested = true;
    sendResponse({ ok: true });
  }
});
