// partners.coupang.com 에서 실행 - 생성된 파트너스 링크 자동 추출
(function () {
  // URL 해시에서 원본 URL 추출
  const hash = window.location.hash;
  if (!hash.includes('create_link')) return;

  // 링크 생성 완료를 감지해서 추출
  const observer = new MutationObserver(() => {
    const linkEl = document.querySelector(
      '.shortUrl, [class*="shortUrl"], input[class*="link"], .result-url, [class*="result"] input'
    );
    if (linkEl) {
      const link = linkEl.value || linkEl.textContent?.trim();
      if (link && (link.startsWith('http') || link.startsWith('https'))) {
        observer.disconnect();
        // 링크를 클립보드에 복사
        navigator.clipboard.writeText(link).catch(() => {});
        // 배너 표시
        const banner = document.createElement('div');
        banner.style.cssText = `
          position:fixed;top:0;left:0;right:0;z-index:99999;
          background:#2ecc71;color:white;padding:12px;text-align:center;
          font-size:14px;font-weight:700;
        `;
        banner.textContent = `✅ 파트너스 링크 복사됨: ${link}`;
        document.body.prepend(banner);
        setTimeout(() => banner.remove(), 4000);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
