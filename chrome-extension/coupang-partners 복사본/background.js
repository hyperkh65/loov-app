// ── 아이콘 클릭 → 고정 창으로 열기 ──────────────────────────────────────
chrome.action.onClicked.addListener(() => {
  chrome.windows.create({
    url: chrome.runtime.getURL('popup.html'),
    type: 'popup',
    width: 340,
    height: 580,
    focused: true,
  });
});

// ── 설정 로드 ─────────────────────────────────────────────────────────────
async function getConfig() {
  return new Promise(resolve => chrome.storage.sync.get([
    'notionApiKey', 'notionDatabaseId'
  ], resolve));
}

// ── 쿠팡파트너스 링크 생성 (로그인 세션 이용, API 키 불필요) ─────────────
async function generatePartnerLink(originalUrl) {
  // 방법 1: 파트너스 사이트 내부 API (로그인 쿠키 자동 전송)
  try {
    const res = await fetch('https://partners.coupang.com/api/coupang/deepLink', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Referer': 'https://partners.coupang.com/',
        'Origin': 'https://partners.coupang.com',
      },
      credentials: 'include',  // 로그인 쿠키 자동 포함
      body: JSON.stringify({ url: originalUrl }),
    });

    if (res.ok) {
      const data = await res.json();
      const link = data?.shortenUrl || data?.landingUrl || data?.url || data?.data?.shortenUrl;
      if (link) return link;
    }
  } catch (e) { /* 폴백 시도 */ }

  // 방법 2: 다른 내부 엔드포인트
  try {
    const encoded = encodeURIComponent(originalUrl);
    const res = await fetch(
      `https://partners.coupang.com/api/deeplink?url=${encoded}`,
      {
        headers: { 'Referer': 'https://partners.coupang.com/' },
        credentials: 'include',
      }
    );
    if (res.ok) {
      const data = await res.json();
      const link = data?.shortenUrl || data?.url || data?.data;
      if (link) return link;
    }
  } catch (e) { /* 폴백 시도 */ }

  // 방법 3: 파트너스 링크 생성 페이지를 새탭으로 열어서 추출
  const partnerPageUrl = `https://partners.coupang.com/#create_link/url=${encodeURIComponent(originalUrl)}`;
  return { needsManual: true, partnerPageUrl, originalUrl };
}

// ── 노션 저장 ─────────────────────────────────────────────────────────────
async function saveToNotion(productData) {
  const config = await getConfig();
  const { notionApiKey, notionDatabaseId } = config;
  if (!notionApiKey || !notionDatabaseId) throw new Error('노션 설정이 필요합니다.');

  const props = {
    '상품명': { title: [{ text: { content: productData.name || '' } }] },
    '가격': { number: parseInt((productData.price || '0').replace(/,/g, '')) || 0 },
    '파트너스링크': { url: productData.partnerLink || productData.url || '' },
    '원본링크': { url: productData.url || '' },
    '리뷰1': { rich_text: [{ text: { content: (productData.reviews?.[0] || '').slice(0, 2000) } }] },
    '리뷰2': { rich_text: [{ text: { content: (productData.reviews?.[1] || '').slice(0, 2000) } }] },
    '수집일': { date: { start: new Date().toISOString().slice(0, 10) } },
  };

  const children = [];
  if (productData.reviewImages?.length) {
    children.push({
      object: 'block', type: 'heading_3',
      heading_3: { rich_text: [{ text: { content: '리뷰 이미지' } }] }
    });
    for (const imgUrl of productData.reviewImages.slice(0, 10)) {
      children.push({
        object: 'block', type: 'image',
        image: { type: 'external', external: { url: imgUrl } }
      });
    }
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
      children,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error('노션 저장 실패: ' + (err.message || res.status));
  }
  return await res.json();
}

// ── 상품평 수집: 백그라운드 탭 + polling + 상품평 탭 클릭 ─────────────────
async function fetchProductReviews(productId) {
  const url = `https://www.coupang.com/vp/products/${productId}`;
  let tabId;
  try {
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id;

    // 페이지 로딩 완료까지 polling (최대 15초)
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      const t = await chrome.tabs.get(tabId).catch(() => null);
      if (!t) return { reviews: [], reviewImages: [] };
      if (t.status === 'complete') break;
    }

    // 1단계: 상품평 탭 클릭 + 스크롤
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // "상품평" 텍스트 포함된 탭 버튼 클릭
        const allTabs = document.querySelectorAll('a, button, li, span');
        for (const el of allTabs) {
          if (el.textContent?.trim().startsWith('상품평') && el.offsetParent !== null) {
            el.click();
            break;
          }
        }
        // 페이지 중간까지 스크롤 (리뷰 섹션 로드 트리거)
        window.scrollTo({ top: document.body.scrollHeight * 0.6 });
      }
    }).catch(() => {});

    // 상품평 로딩 대기 (3초)
    await new Promise(r => setTimeout(r, 3000));

    // 2단계: 리뷰 영역 스크롤 + lazy 이미지 트리거
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // 리뷰 컨테이너 찾아서 스크롤
        const reviewContainer = document.querySelector(
          '.sdp-review__article__list, [class*="review-list"], [class*="review__article"]'
        );
        if (reviewContainer) reviewContainer.scrollIntoView({ block: 'start' });

        // lazy load img: data-src → src 강제 적용
        document.querySelectorAll('img[data-src], img[data-img-url], img[data-lazy]').forEach(img => {
          const lazySrc = img.dataset.src || img.dataset.imgUrl || img.dataset.lazy;
          if (lazySrc) img.src = lazySrc;
        });
      }
    }).catch(() => {});

    // lazy 이미지 로드 대기
    await new Promise(r => setTimeout(r, 1500));

    // 3단계: 상품평 텍스트 + 이미지 추출
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const reviews = [];
        const reviewImages = [];

        // 상품평 텍스트 추출
        const textSels = [
          '.sdp-review__article__list__review__content',
          '.js_reviewArticleContentMaxText',
          '.reviewArticleContents',
          '[class*="review__content"]',
          '[class*="reviewContent"]',
        ];
        for (const sel of textSels) {
          document.querySelectorAll(sel).forEach(el => {
            const clone = el.cloneNode(true);
            clone.querySelectorAll('button, [class*="button"], [class*="vote"], [class*="report"]').forEach(n => n.remove());
            const text = (clone.innerText || clone.textContent || '').trim();
            if (text.length > 20 && !text.includes('신고하기') && reviews.length < 2)
              reviews.push(text.slice(0, 500));
          });
          if (reviews.length >= 2) break;
        }

        // 상품평 이미지 추출 (lazy 포함)
        const imgSels = [
          '.sdp-review__article__list__review__media__item img',
          '.js_reviewPhotoItem img',
          '[class*="review"][class*="media"] img',
          '[class*="review"][class*="photo"] img',
          '[class*="review__img"] img',
        ];
        for (const sel of imgSels) {
          document.querySelectorAll(sel).forEach(img => {
            const src = img.src
              || img.dataset.src
              || img.dataset.imgUrl
              || img.dataset.lazy
              || img.getAttribute('data-original') || '';
            const isValid = src
              && !src.startsWith('data:')
              && !src.includes('icon')
              && !src.includes('star')
              && !src.includes('profile')
              && reviewImages.length < 10;
            if (isValid) {
              reviewImages.push(
                src.replace(/\/thumbnail\/\d+x\d+\//, '/origin/')
                   .replace(/\?type=[^&]+/, '')
              );
            }
          });
          if (reviewImages.length >= 10) break;
        }

        return { reviews, reviewImages };
      },
    });

    await chrome.tabs.remove(tabId).catch(() => {});
    return results?.[0]?.result || { reviews: [], reviewImages: [] };

  } catch(e) {
    if (tabId) await chrome.tabs.remove(tabId).catch(() => {});
    return { reviews: [], reviewImages: [] };
  }
}

// ── 메시지 핸들러 ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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
