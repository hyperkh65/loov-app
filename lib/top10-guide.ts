/** TOP10 인포그래픽(딸깍 영상) — 블로그 작가 플러그인용 작성 지침과 사전 검증. 맥(딸깍) top10.js 의 규칙과 같게 유지한다. */

export const TOP10_GUIDE = `# TOP10 인포그래픽 만들기 (딸깍이 영상으로 만든다)
목표: 사람들이 저장·공유하고 싶어 하는 "순위가 분명한" TOP10을 정확한 데이터로 만든다. 데이터가 불확실하면 만들지 않는다.

## 순서
1. 주제 고르기: 숫자로 순위를 매길 수 있고(면적·인구·길이·연도·가격·시청자 수 등), 의외성이 있고, 출처가 2곳 이상 확인되는 것. 막연한 "추천" 순위·주관 순위는 금지.
2. 직접 검색해 출처 2곳 이상에서 같은 숫자를 확인한다(공식 기관·통계청·위키백과 원문 등). 확인 못 한 항목은 빼고 다른 항목으로 채운다. 숫자·순위를 지어내면 안 된다.
3. 아래 JSON을 만든다. 만든 뒤 sendTop10ToDdalkak을 **한 번만** 호출한다. 오류(errors)가 오면 고쳐서 다시 호출한다.
4. 보낸 뒤 사용자에게 "딸깍으로 보냈고, 영상이 만들어지면 LOOV 발행 대기에 올라와요"라고 알린다.

## JSON 필드 (정확히 이 키 이름)
- title: 제목. 공백 포함 18자 이하. 강조할 말은 *별표*로 감싼다(예: "세계에서 *가장 큰* 호수 TOP10").
- kicker: 위 작은 문구(예: "세계 TOP10"), sub: 부제 한 줄, metric: 순위 기준(예: "면적(㎢)"), checked: 확인한 날짜(YYYY-MM-DD)
- rows: **정확히 10개**, 1위부터. 각 항목:
  - name: 이름(16자 이하, 중복 금지)
  - value: 숫자가 들어간 값(12자 이하, 단위는 모든 항목이 같게. 예 "371,000㎢"). 1위→10위로 값이 계속 줄어들거나 계속 늘어야 한다.
  - note: 한 줄 설명(26자 이하)
  - say: 영상에서 읽을 한 문장(구어체, 숫자 포함, 30~50자)
  - img: 이미지 묘사 영어 한 문장(장소·사물, 글자·로고·사람 얼굴 없이)
- source: 출처 이름(예 "통계청·위키백과"), sources: [{name, url}] **2개 이상**, url은 http(s)로 시작하는 실제 열어 본 주소
- caption: SNS 캡션(300자 이하, 첫 줄은 궁금증, 해시태그 제외), tags: ["태그", ...최대 8개]
- theme: history | nature | tech | food | money | pop 중 주제에 맞는 것, format: countdown | race | deck 중 하나(비우면 자동)
- intro: 영상 첫 문장(질문·반전), outro: 마지막 문장(저장·댓글 유도)

## 금지
- 확인 안 된 숫자, 출처 없는 순위, 서로 다른 단위 섞기, 같은 항목 중복, 광고·과장 문구
- 정치·인물 평가, 의학적 효능 단정

## 예시 (일부)
{"title":"세계에서 *가장 큰* 호수","kicker":"세계 TOP10","sub":"넓이로 비교했어요","metric":"면적(㎢)","checked":"2026-11-05","rows":[{"name":"카스피해","value":"371,000㎢","note":"호수로 분류되는 내해","say":"1위는 카스피해, 넓이가 371,000제곱킬로미터예요.","img":"wide view of the Caspian Sea coast at sunrise"}],"source":"위키백과","sources":[{"name":"위키백과","url":"https://ko.wikipedia.org/wiki/…"},{"name":"브리태니커","url":"https://www.britannica.com/…"}],"caption":"…","tags":["세계지리"],"theme":"nature","intro":"…","outro":"저장해두고 친구에게 알려주세요!"}
(실제 rows는 10개 모두 채운다)`;

const num = (v: unknown) => { const m = String(v ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };

/** 맥(딸깍)이 거절할 형식 오류를 GPT가 보내기 전에 알려 준다 */
export function validateTop10(d: Record<string, unknown>): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  const rows = (Array.isArray(d.rows) ? d.rows : []) as Array<Record<string, unknown>>;
  const title = String(d.title || '');
  if (!title) errors.push('title 없음'); else if (title.replace(/\*/g, '').length > 20) errors.push('제목이 너무 길어요(공백 포함 18~20자 이하)');
  if (rows.length !== 10) errors.push(`rows는 정확히 10개여야 해요(현재 ${rows.length})`);
  rows.forEach((r, i) => {
    if (!r.name) errors.push(`${i + 1}위 name 없음`); else if (String(r.name).length > 16) warnings.push(`${i + 1}위 name이 길어요(16자 이하 권장)`);
    if (!isFinite(num(r.value))) errors.push(`${i + 1}위 value에 숫자가 없어요: ${r.value}`); else if (String(r.value).length > 12) warnings.push(`${i + 1}위 value가 길어요`);
    if (r.note && String(r.note).length > 26) warnings.push(`${i + 1}위 note가 길어요(26자 이하 권장)`);
  });
  const v = rows.map(r => num(r.value));
  if (v.length && v.every(isFinite)) {
    const dn = v.every((x, i) => !i || x <= v[i - 1]), up = v.every((x, i) => !i || x >= v[i - 1]);
    if (!dn && !up) errors.push('순위가 값 순서와 맞지 않아요(1위→10위로 값이 계속 줄거나 계속 늘어야 함): ' + v.join(', '));
  }
  const names = rows.map(r => String(r.name || '').replace(/\s/g, ''));
  if (new Set(names).size !== names.length) errors.push('중복 항목이 있어요');
  const units = new Set(rows.map(r => String(r.value ?? '').replace(/[\d.,\s-]/g, ''))); if (units.size > 1) warnings.push('단위가 제각각이에요: ' + [...units].join(' | '));
  if (!d.source) errors.push('source(출처) 없음');
  const src = (Array.isArray(d.sources) ? d.sources : []) as Array<{ url?: string }>;
  if (!src.length) errors.push('sources[{name,url}] 없음 — 출처 URL이 있어야 해요'); else if (src.length < 2) warnings.push('출처가 1곳뿐이에요 — 2곳 이상 교차 확인 권장');
  src.forEach(s => { if (!/^https?:\/\//.test(String(s.url || ''))) errors.push('출처 URL 형식 오류: ' + s.url); });
  if (d.caption && String(d.caption).length > 300) warnings.push('caption이 길어요(300자 이하 권장)');
  if (!d.metric) warnings.push('metric(순위 기준) 없음');
  if (!d.checked) warnings.push('checked(확인 날짜) 없음');
  return { errors, warnings };
}
