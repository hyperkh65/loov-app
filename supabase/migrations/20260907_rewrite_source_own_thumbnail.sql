-- 특정 소스 사이트의 대표이미지가 실제 사진이 아니라 범용 템플릿(주간 미리보기 배너 등)이라
-- 스크랩한 이미지 대신 우리가 직접 썸네일을 생성하도록 소스별로 선택할 수 있게 함.
alter table bossai_rewrite_sources
  add column if not exists use_generated_thumbnail boolean not null default false;
