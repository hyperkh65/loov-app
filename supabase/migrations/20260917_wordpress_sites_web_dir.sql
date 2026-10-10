-- 구글 소유확인(FILE 방식)이 subdomain 컬럼으로 웹루트 경로를 유추하는데,
-- wp-auto로 안 만든 레거시 사이트(2days.kr/aboda.kr/miracool.co.kr/blog.2days.kr)는
-- subdomain이 비어있어서 /volume1/web/null/ 에 인증파일이 써지고 있었음
-- (구글이 "verification token could not be found" 로 계속 실패시킨 원인).
-- web_dir을 따로 두어 실제 파일시스템 경로를 명시할 수 있게 함.
ALTER TABLE wordpress_sites
  ADD COLUMN IF NOT EXISTS web_dir text;

UPDATE wordpress_sites SET web_dir = 'miracool2.re' WHERE site_url = 'https://miracool.co.kr';
