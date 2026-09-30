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
    const res = await fetch('https://api.indexnow.org/indexnow', {
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
    // 응답 상태를 한 번도 확인 안 해서, 사이트에 키 검증 파일이 없어 빙이
    // 거부해도(404 등) 아무 로그 없이 조용히 실패하고 있었음(수익화 감사에서
    // finance.2days.kr/yellow.2days.kr 등 여러 사이트가 키 파일 자체가
    // 없는 채로 몇 달째 이 상태였던 게 확인됨) — 최소 로그는 남김.
    if (!res.ok) console.error(`[indexnow] ${host} 제출 실패 (${res.status}): ${(await res.text()).slice(0, 200)}`);
  } catch (e) { console.error('[indexnow] 요청 자체 실패:', e); }
}
