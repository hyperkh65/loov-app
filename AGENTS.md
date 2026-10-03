# 2days.kr 트렌드 글 발행 — Codex / Claude 공용 지침

사용자가 "2days 글 써줘", "트렌드 글 발행해", "투데이즈 블로그에 올려" 같은 요청을 하면 아래대로만 한다.
결과는 항상 **2days.kr 발행**이다. 어느 에이전트가 하든 같은 API를 쓴다.

## 방식 A — 서버에 전부 맡기기 (가장 쉽고 오류 적음, 기본값)

서버가 구글트렌드·X·네이버 실시간·빙·구글뉴스에서 겹치는 인기 키워드를 고르고, 여러 매체를 교차검증해
글·AI 대표이미지·본문 이미지를 만들어 2days.kr에 발행하고 SNS까지 올린다. 결과 링크는 텔레그램으로 온다.

```bash
set -a; . ./.env.local; set +a
curl -s -X POST https://loov.co.kr/api/trend-post \
  -H "x-trend-key: $TREND_POST_KEY" -H "Content-Type: application/json" \
  -d '{}'                                   # 키워드 지정 시: -d '{"keyword":"근로장려금 신청"}'
```
응답 `{"ok":true,"started":true}` 이면 끝. 3~6분 뒤 텔레그램에 링크가 온다. 기다려서 URL을 받고 싶으면 `"wait":true` 추가(최대 6분).

## 방식 B — 내가(로컬 AI) 직접 쓰고 서버는 이미지·발행만 (품질 우선)

1. 키워드 선정: 사용자가 안 주면 아래를 조회해 **2개 이상 소스에서 겹치는** 주제 1개를 고른다.
   - https://trends.google.com/trending/rss?geo=KR · https://trends24.in/korea/ · https://api.signal.bz/news/realtime
   - https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko · https://www.bing.com/news/search?q=속보&format=rss&setmkt=ko-KR
   - 최근 발행 글과 중복 금지: https://2days.kr/wp-json/wp/v2/posts?per_page=30&_fields=title
2. 자료 조사: 그 키워드로 구글뉴스·빙뉴스 RSS 검색(`.../rss/search?q=키워드`)과 기사 본문을 읽고,
   **서로 다른 매체 2곳 이상이 일치하게 보도한 사실만** 쓴다. 추측·한 곳만 말한 내용·루머 금지.
3. 글 작성 규칙
   - 제목: 검색 키워드로 시작, 20~32자, 감성 문장·질문형 금지 (예: "근로장려금 신청기간과 방법")
   - 본문 HTML: `<h2>` 소제목 5~6개, 각 2~3문단, 첫 문장은 결론부터, 공백 포함 2,500~4,000자,
     마지막에 `<h2>자주 묻는 질문</h2>` 3~4개. 한국어만, 친근한 존댓말, 이미지 태그·외부 링크 넣지 말 것(서버가 넣음)
   - 비극적 사고 희생자 신상·선정적 표현 금지
4. 발행:
```bash
set -a; . ./.env.local; set +a
jq -n --arg t "제목" --rawfile h article.html --arg k "검색 키워드" \
  '{keyword:$k, article:{title:$t, html:$h, outlets:["연합뉴스","KBS"]}}' \
| curl -s -X POST https://loov.co.kr/api/trend-post \
  -H "x-trend-key: $TREND_POST_KEY" -H "Content-Type: application/json" -d @-
```
응답의 `url`이 발행된 글 주소. 서버가 AI 대표이미지·네이버 본문 이미지·교차확인 매체 표기·SNS 발행까지 처리한다.

## 텔레그램 (PC가 꺼져 있어도 동작)
@loov_alert_bot 에 `/글` (자동 트렌드) 또는 `/글 키워드` — 서버가 방식 A로 처리.

## 하지 말 것
- 워드프레스에 직접 로그인/발행하지 말 것(반드시 위 API 사용 — 이미지·SNS·알림이 같이 처리됨)
- `.env.local`의 키를 출력·커밋하지 말 것
