/**
 * IndexNow — 워드프레스에 새 글이 올라가면 네이버/빙 등 참여 검색엔진에
 * 즉시 알려서 크롤링을 앞당김(구글은 이 프로토콜 미참여 — 사이트맵/자연
 * 크롤링에 맡길 수밖에 없음). https://www.indexnow.org
 *
 * 키 검증 파일(<key>.txt)은 각 워드프레스 사이트 루트에 미리 업로드해둬야
 * 함 — /volume1/web/aboda_re, /volume1/web/miracool2.re에 이미 배치됨.
 */
const INDEXNOW_KEY = 'f0625bf1c8c42e7f374ecd6f10b0125a';

export async function submitToIndexNow(postUrl: string): Promise<void> {
  try {
    const host = new URL(postUrl).host;
    await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        keyLocation: `https://${host}/${INDEXNOW_KEY}.txt`,
        urlList: [postUrl],
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch { /* 색인 알림은 부가 기능 — 실패해도 발행 자체는 이미 성공했으니 무시 */ }
}
