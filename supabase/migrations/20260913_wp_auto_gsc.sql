-- wp-auto로 만든 사이트를 Search Console에 자동 등록하기 위한 추적 컬럼.
-- WebStation 가상호스트+DNS 연결(수동)이 끝나서 사이트가 실제로 열려야만
-- 구글이 소유확인 파일을 읽을 수 있어서, 생성 시점엔 무조건 'pending'으로
-- 시작하고 크론(gsc-sync)이 주기적으로 접속 가능 여부를 확인해 등록한다.
ALTER TABLE wordpress_sites ADD COLUMN IF NOT EXISTS nas text DEFAULT 'hy64';
ALTER TABLE wordpress_sites ADD COLUMN IF NOT EXISTS subdomain text;
ALTER TABLE wordpress_sites ADD COLUMN IF NOT EXISTS sitemap_url text;
ALTER TABLE wordpress_sites ADD COLUMN IF NOT EXISTS gsc_status text DEFAULT 'pending';
ALTER TABLE wordpress_sites ADD COLUMN IF NOT EXISTS gsc_error text;
ALTER TABLE wordpress_sites ADD COLUMN IF NOT EXISTS gsc_registered_at timestamptz;
