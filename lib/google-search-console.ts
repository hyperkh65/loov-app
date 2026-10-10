/**
 * Google Site Verification API(파일 방식 소유확인) + Search Console API(속성 등록,
 * 사이트맵 제출) 자동화. 대상 사이트가 실제로 인터넷에 떠 있어야
 * (WebStation 가상호스트+DNS 수동 연결 완료) 구글이 확인 파일을 읽을 수 있으므로,
 * 호출 전에 사이트 접속 가능 여부는 호출부(gsc-sync)에서 먼저 확인한다.
 */
function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

export async function registerSiteWithGoogle(
  accessToken: string,
  siteUrl: string,
  writeVerificationFile: (filename: string, content: string) => Promise<void>
): Promise<void> {
  const identifier = withTrailingSlash(siteUrl);
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

  const tokenRes = await fetch('https://www.googleapis.com/siteVerification/v1/token', {
    method: 'POST',
    headers,
    body: JSON.stringify({ site: { type: 'SITE', identifier }, verificationMethod: 'FILE' }),
  });
  if (!tokenRes.ok) throw new Error(`소유확인 토큰 발급 실패: ${(await tokenRes.text()).slice(0, 300)}`);
  const { token: filename } = await tokenRes.json();
  if (!filename) throw new Error('소유확인 토큰 응답에 파일명 없음');

  await writeVerificationFile(filename, `google-site-verification: ${filename}`);

  const verifyRes = await fetch('https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=FILE', {
    method: 'POST',
    headers,
    body: JSON.stringify({ site: { type: 'SITE', identifier } }),
  });
  if (!verifyRes.ok) throw new Error(`소유확인 실패: ${(await verifyRes.text()).slice(0, 300)}`);

  const addRes = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(identifier)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!addRes.ok) {
    const t = await addRes.text();
    if (!t.toLowerCase().includes('already')) throw new Error(`Search Console 등록 실패: ${t.slice(0, 300)}`);
  }
}

export async function submitSitemapToGoogle(accessToken: string, siteUrl: string, sitemapUrl: string): Promise<void> {
  const identifier = withTrailingSlash(siteUrl);
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(identifier)}/sitemaps/${encodeURIComponent(sitemapUrl)}`,
    { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`사이트맵 제출 실패: ${(await res.text()).slice(0, 300)}`);
}
