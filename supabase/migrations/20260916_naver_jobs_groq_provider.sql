-- naver_publish_jobs.ai_provider에 'groq' 허용 — Gemini 무료 티어가 모델
-- deprecate(404)/이미지 생성 쿼터 0으로 자주 막혀서, 이미 검증된 Groq
-- 4키 라운드로빈(lib/ai-translate.ts와 동일 패턴)을 네이버 자동발행에도 사용.
ALTER TABLE naver_publish_jobs DROP CONSTRAINT IF EXISTS naver_publish_jobs_ai_provider_check;
ALTER TABLE naver_publish_jobs
  ADD CONSTRAINT naver_publish_jobs_ai_provider_check
  CHECK (ai_provider IN ('gemini', 'claude', 'gpt4o', 'gpt4', 'gpt35', 'groq'));
