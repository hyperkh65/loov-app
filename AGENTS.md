# 트렌드 글 발행(aboda.kr) — Codex / Claude 공용 지침

"2days 글 써줘", "트렌드 글 발행", "투데이즈 블로그에 올려" 요청 또는 trend-runner가 실행했을 때 아래대로만 한다.
**글은 반드시 너(로컬 AI)가 직접 조사하고 쓴다. 서버는 이미지·발행·SNS만 한다.** 결과는 항상 aboda.kr 발행(2026-10-04 사용자 확정: 2days.kr엔 one.yoosol만 남김).
환경변수 `TREND_POST_KEY`가 없으면 `set -a; . ./.env.local; set +a` 로 불러온다(값을 출력·커밋 금지).

## 1. 키워드 (지정 키워드가 있으면 그것을 쓴다)
아래를 조회해 **2개 이상 소스에서 겹치는** 주제 1개를 고른다. 사람들이 지금 검색해서 읽고 싶어 할 것.
- 구글 트렌드: https://trends.google.com/trending/rss?geo=KR
- X: https://trends24.in/korea/
- 네이버 실시간: https://api.signal.bz/news/realtime
- 구글 뉴스: https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko
- 빙 뉴스: https://www.bing.com/news/search?q=속보&format=rss&setmkt=ko-KR
- **중복 금지**: https://aboda.kr/wp-json/wp/v2/posts?per_page=30&_fields=title 의 최근 제목과 같은 사건·주제면 다른 후보
- 제외: 사고 희생자 개인 신상, 선정적 루머

## 2. 자료 조사·교차검증
`https://news.google.com/rss/search?q=키워드&hl=ko&gl=KR&ceid=KR:ko`, `https://www.bing.com/news/search?q=키워드&format=rss&setmkt=ko-KR`
등으로 기사 여러 개를 찾아 본문까지 읽는다. **서로 다른 매체 2곳 이상이 일치하게 보도한 사실만** 쓴다.
한 곳만 말한 내용·추측·매체 간 다른 내용은 쓰지 않는다. 근거가 된 매체명(최대 5개)을 기록한다.

## 3. 글 작성
- 제목: 검색 키워드로 시작, **20~32자**, 감성 문장·질문형 금지 (예: "근로장려금 신청기간과 방법")
- 본문 HTML: `<h2>` 소제목 5~6개, 각 2~3문단, 첫 문장은 결론부터, 공백 포함 2,500~4,000자 이상(분량은 새 사실·수치·사례로 채우고, 같은 말 되풀이·"독자들은 궁금해하고 있습니다" 류 군더더기 금지),
  마지막 `<h2>자주 묻는 질문</h2>` 3~4개(`<p><strong>Q. …</strong><br>답</p>`).
  한국어만, 친근한 존댓말, 독자에게 실제로 도움 되는 맥락(왜 중요한지·앞으로 일정·확인 방법) 포함.
  `<img>`·외부 링크·출처 문단은 넣지 말 것(서버가 이미지와 교차확인 문구를 넣음)

## 3-1. 이미지 (네가 직접 만들고 직접 확인한다)
- **대표이미지**: 글 내용과 바로 연결되는 장면을 영어 60~90단어 프롬프트로 설계한다.
  잡지 화보풍 실사(editorial photo, cinematic light, shallow depth of field), 한국 사람·한국 배경,
  누가·무엇을·어디서가 분명한 한 장면. 글자·로고·문서 글씨·실존 인물 얼굴 금지.
  ```bash
  curl -s -X POST https://loov.co.kr/api/trend-post -H "x-trend-key: $TREND_POST_KEY" \
    -H "Content-Type: application/json" -d '{"image_prompt":"..."}' --max-time 120   # → {"ok":true,"url":...}
  curl -s -o .trend-work/thumb.jpg "<url>"
  ```
  `.trend-work/thumb.jpg` 를 Read로 **직접 열어 확인**한다. 주제와 안 맞거나, 가짜 글자·뭉개진 손/얼굴이 있으면
  프롬프트를 고쳐 다시 생성(최대 3회). 통과한 url을 `thumb_image_url` 로 쓴다.
- **본문 이미지(소스)**: 2단계에서 읽은 기사들 중 주제와 직접 관련된 기사의 대표 사진(og:image) 2~4개를 고른다.
  `curl -sI <이미지URL>` 로 200 + image/* 인지 확인, 로고·기본 썸네일·광고 이미지는 제외. → `source_images`

## 4. 발행
article.html 을 `.trend-work/article.html` 에 저장한 뒤:
```bash
jq -n --arg k "검색 키워드" --arg t "제목" --rawfile h .trend-work/article.html \
  --arg th "<확인한 대표이미지 url>" --argjson si '["<기사사진1>","<기사사진2>"]' --argjson o '["연합뉴스","KBS"]' \
  '{keyword:$k, article:{title:$t, html:$h, thumb_image_url:$th, source_images:$si, outlets:$o}}' \
| curl -s -X POST https://loov.co.kr/api/trend-post -H "x-trend-key: $TREND_POST_KEY" \
  -H "Content-Type: application/json" -d @- --max-time 280
```
응답 `{"ok":true,"url":...}` 의 url 을 마지막에 출력한다. (트렌드 글은 '트렌드' 카테고리로 올라가 정규 30분 발행과 별개로 처리됨) 실패하면 오류 내용을 고쳐 1회 재시도.

## 하지 말 것
- 워드프레스에 직접 로그인/발행 금지(위 API만 사용 — 이미지·SNS·텔레그램 알림이 함께 처리됨)
- 키 출력·커밋 금지, 위 4단계 외 다른 파일 수정 금지

## 텔레그램
@loov_alert_bot 에 `/글` 또는 `/글 키워드` → 서버 대기열 → PC의 trend-runner(1분 주기)가 이 지침으로 Claude를 실행.
