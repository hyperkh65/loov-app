// one.yoosol/yoonfree 우선순위(2026-09-24 재도입, 2026-10-01 process에도 적용 —
// 사용자 확정). publish-next(ready→발행)뿐 아니라 process(pending→ready)에서도
// 이 소스들에 대기 글이 있으면 항상 먼저 처리해서, 다른 19개 소스와의 공정
// 라운드로빈 때문에 이 소스만 계속 밀리는 문제(실사용 중 118건 적체 확인)를 막음.
export const PRIORITY_SOURCE_IDS = new Set([
  '1c036b9d-2a2b-449d-9b97-0a12c76dab6f', // one.yoosol
  '132c4df6-2a18-4693-8799-342893aa1469', // yoonfree
  '627b59b2-01f5-4537-ab7d-4f4a2c401573', // infolife.infowid.com (2026-10-03 추가, 2days.kr)
]);
