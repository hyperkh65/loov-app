-- ── 제휴 상품 발굴 + 숏폼 콘텐츠 엔진 (Affiliate Engine) ──────────────────────
-- Phase 2: 전체 정규화 스키마. 이 시점엔 affiliate_sources만 실제 UI/API로 연결됨 —
-- 나머지 테이블은 이후 Phase(3~13)에서 순서대로 채워짐. 구조만 미리 만들어 두는 이유:
-- 뒤 Phase들이 서로 FK로 참조하므로 나중에 쪼개서 만들면 매번 alter가 필요해짐.
--
-- 명명: 기존 코드베이스는 bossai_ 접두사와 기능별 접두사(shop_, coupang_, led_)가 혼재.
-- 이 시스템은 규모가 크고 독립적인 하나의 서브시스템이라 affiliate_ 접두사로 통일.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SOURCE REGISTRY — 발굴 소스 목록 (Phase 2에서 실제로 쓰는 유일한 테이블)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS affiliate_sources (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                    text NOT NULL,
  source_type             text NOT NULL, -- 'social_trend' | 'ecommerce' | 'stock_media' | 'supplier' | 'manual'
  country                 text,
  categories              text[] DEFAULT '{}',
  discovery_method        text NOT NULL DEFAULT 'MANUAL_IMPORT', -- 'API' | 'MANUAL_IMPORT' | 'REFERENCE_ONLY'
  official_api_available  boolean NOT NULL DEFAULT false,
  authentication_required boolean NOT NULL DEFAULT false,
  terms_url               text,
  rate_limit              text,
  enabled                 boolean NOT NULL DEFAULT false,
  priority                integer NOT NULL DEFAULT 50,
  usage_mode              text NOT NULL DEFAULT 'REFERENCE_ONLY',
    -- 'TREND_SIGNAL_ONLY' | 'PRODUCT_DISCOVERY' | 'LICENSED_MEDIA' | 'AFFILIATE_MATCHING' | 'CREATIVE_REFERENCE'
  media_download_allowed  boolean NOT NULL DEFAULT false,
  commercial_use_status   text NOT NULL DEFAULT 'UNKNOWN', -- 'ALLOWED' | 'RESTRICTED' | 'UNKNOWN'
  connector_status        text NOT NULL DEFAULT 'REFERENCE_ONLY',
    -- 'CONNECTED' | 'REQUIRES_API_KEY' | 'REFERENCE_ONLY' | 'FUTURE_CONNECTOR'
  last_checked_at         timestamptz,
  health_status           text NOT NULL DEFAULT 'UP', -- 'UP' | 'DEGRADED' | 'DOWN' | 'AUTH_REQUIRED' | 'RATE_LIMITED' | 'CHANGED' | 'DISABLED'
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_sources_own" ON affiliate_sources FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_sources_user ON affiliate_sources (user_id, enabled);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. DISCOVERY QUERIES — 자동 생성/확장되는 검색어
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS affiliate_discovery_queries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query_text    text NOT NULL,
  language      text NOT NULL DEFAULT 'ko', -- 'ko' | 'en' | 'zh' | 'ja'
  category      text,
  origin        text NOT NULL DEFAULT 'SEED', -- 'SEED' | 'EXPANDED'
  parent_query_id uuid REFERENCES affiliate_discovery_queries(id) ON DELETE SET NULL,
  is_active     boolean NOT NULL DEFAULT true,
  last_used_at  timestamptz,
  result_count  integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_discovery_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_discovery_queries_own" ON affiliate_discovery_queries FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_discovery_queries_user ON affiliate_discovery_queries (user_id, is_active);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. SOURCE ITEMS — 발굴된 원본 게시물/영상 (트렌드 신호)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS affiliate_source_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id       uuid NOT NULL REFERENCES affiliate_sources(id) ON DELETE CASCADE,
  query_id        uuid REFERENCES affiliate_discovery_queries(id) ON DELETE SET NULL,
  external_id     text,
  url             text NOT NULL,
  title           text,
  description     text,
  creator_name    text,
  thumbnail_url   text,
  published_at    timestamptz,
  discovered_at   timestamptz NOT NULL DEFAULT now(),
  raw_metrics     jsonb DEFAULT '{}', -- views/likes/comments/shares 등 원본 그대로
  status          text NOT NULL DEFAULT 'NEW', -- 'NEW' | 'PROCESSED' | 'IGNORED' | 'ERROR'
  UNIQUE (source_id, external_id)
);
ALTER TABLE affiliate_source_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_source_items_own" ON affiliate_source_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_source_items_user ON affiliate_source_items (user_id, status);
CREATE INDEX IF NOT EXISTS idx_affiliate_source_items_source ON affiliate_source_items (source_id, discovered_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. PRODUCTS — 정규화된 상품 개념 (아직 실제 판매 링크 아님)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS affiliate_products (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_name           text NOT NULL,
  normalized_product_name text NOT NULL,
  brand                  text,
  generic_product_type   text,
  category               text,
  subcategory            text,
  features                text[] DEFAULT '{}',
  problem_solved         text,
  use_case               text,
  estimated_price_min    numeric,
  estimated_price_max    numeric,
  country_of_origin      text,
  visual_description     text,
  search_keywords_ko     text[] DEFAULT '{}',
  search_keywords_en     text[] DEFAULT '{}',
  search_keywords_zh     text[] DEFAULT '{}',
  search_keywords_ja     text[] DEFAULT '{}',
  status                 text NOT NULL DEFAULT 'DISCOVERED',
    -- 'DISCOVERED' | 'SCORED' | 'MATCHED' | 'READY' | 'IN_PRODUCTION' | 'PUBLISHED' | 'REJECTED'
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_products_own" ON affiliate_products FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_products_user ON affiliate_products (user_id, status);
CREATE INDEX IF NOT EXISTS idx_affiliate_products_norm_name ON affiliate_products (normalized_product_name);

-- 상품 ↔ 발견된 원본 아이템 연결 (여러 소스에서 같은 상품이 반복 발견됨)
CREATE TABLE IF NOT EXISTS affiliate_product_aliases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES affiliate_products(id) ON DELETE CASCADE,
  source_item_id  uuid NOT NULL REFERENCES affiliate_source_items(id) ON DELETE CASCADE,
  alias_name      text NOT NULL,
  similarity_score numeric,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, source_item_id)
);
ALTER TABLE affiliate_product_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_product_aliases_own" ON affiliate_product_aliases FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_product_aliases_product ON affiliate_product_aliases (product_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. TREND METRICS — 시계열 참여도 신호 (조회수/좋아요 등 스냅샷)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS affiliate_trend_metrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_item_id  uuid NOT NULL REFERENCES affiliate_source_items(id) ON DELETE CASCADE,
  views           bigint,
  likes           bigint,
  comments        bigint,
  shares          bigint,
  saves           bigint,
  hours_since_publish numeric,
  velocity        numeric, -- views / hours_since_publish
  snapshot_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_trend_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_trend_metrics_own" ON affiliate_trend_metrics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_trend_metrics_item ON affiliate_trend_metrics (source_item_id, snapshot_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. PRODUCT SCORES — 바이럴/기회/포화 점수 (시점별 이력, 가중치 변경 대응)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS affiliate_product_scores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES affiliate_products(id) ON DELETE CASCADE,
  viral_score         numeric, -- 0-100
  visual_impact_score numeric,
  problem_clarity_score numeric,
  engagement_velocity_score numeric,
  korean_relevance_score numeric,
  purchase_intent_score numeric,
  coupang_match_score numeric,
  affiliate_economics_score numeric,
  production_feasibility_score numeric,
  saturation_level    text, -- 'LOW' | 'RISING' | 'MEDIUM' | 'HIGH' | 'OVERUSED'
  opportunity_score   numeric, -- 0-100
  score_weights       jsonb DEFAULT '{}', -- 이 계산에 실제 쓰인 가중치(설정 변경 이력 추적용)
  explanation         text, -- 관리자용 AI 요약 ("해외 급성장 + 국내 저포화 + 쿠팡 매칭 확인")
  computed_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_product_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_product_scores_own" ON affiliate_product_scores FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_product_scores_product ON affiliate_product_scores (product_id, computed_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. LISTINGS — 실제 제휴 네트워크의 판매 상품 (쿠팡 등, 스펙의 "affiliate_products")
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS affiliate_listings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  network           text NOT NULL, -- 'coupang' | 'agoda' | 'amazon' | 'aliexpress' 등 (어댑터 이름)
  network_product_id text NOT NULL,
  product_name      text NOT NULL,
  product_url       text NOT NULL,
  affiliate_url     text, -- 반드시 어댑터가 공식 발급한 링크만 저장 — 임의 생성 금지
  current_price     numeric,
  original_price    numeric,
  discount_rate     numeric,
  rating            numeric,
  review_count      integer,
  shipping_type     text,
  seller            text,
  availability      text,
  category          text,
  commission_info   jsonb DEFAULT '{}',
  image_url         text,
  last_checked_at   timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network, network_product_id)
);
ALTER TABLE affiliate_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_listings_own" ON affiliate_listings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_listings_network ON affiliate_listings (network, network_product_id);

-- 상품(개념) ↔ 실제 판매 리스팅 매칭 근거
CREATE TABLE IF NOT EXISTS affiliate_product_matches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES affiliate_products(id) ON DELETE CASCADE,
  listing_id      uuid NOT NULL REFERENCES affiliate_listings(id) ON DELETE CASCADE,
  match_confidence text NOT NULL, -- 'EXACT_MATCH' | 'HIGH_CONFIDENCE_EQUIVALENT' | 'SIMILAR_PRODUCT' | 'LOW_CONFIDENCE' | 'NO_MATCH'
  match_evidence  jsonb DEFAULT '{}', -- 어떤 근거로(제목/키워드/가격대/이미지유사도) 매칭됐는지
  matched_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, listing_id)
);
ALTER TABLE affiliate_product_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_product_matches_own" ON affiliate_product_matches FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_product_matches_product ON affiliate_product_matches (product_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. MEDIA RIGHTS ENGINE — 미디어 자산과 권리 상태 (필수, 자동발행 게이트의 핵심)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS affiliate_media_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id      uuid REFERENCES affiliate_products(id) ON DELETE SET NULL,
  source_item_id  uuid REFERENCES affiliate_source_items(id) ON DELETE SET NULL,
  source          text NOT NULL, -- 'supplier_upload' | 'own_footage' | 'pexels' | 'pixabay' | 'stock' | 'reference_only' 등
  asset_type      text NOT NULL DEFAULT 'video', -- 'video' | 'image' | 'audio'
  original_url    text,
  storage_key     text, -- R2 key (LICENSED media만 실제로 다운로드되어 저장됨)
  creator          text,
  retrieved_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_media_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_media_assets_own" ON affiliate_media_assets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_media_assets_product ON affiliate_media_assets (product_id);

CREATE TABLE IF NOT EXISTS affiliate_media_rights (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_asset_id         uuid NOT NULL REFERENCES affiliate_media_assets(id) ON DELETE CASCADE UNIQUE,
  license_type           text, -- 'ROYALTY_FREE' | 'SUPPLIER_GRANT' | 'OWNED' | 'UNKNOWN' 등
  commercial_use_allowed boolean NOT NULL DEFAULT false,
  modification_allowed   boolean NOT NULL DEFAULT false,
  redistribution_allowed boolean NOT NULL DEFAULT false,
  attribution_required   boolean NOT NULL DEFAULT false,
  attribution_text       text,
  license_evidence       text, -- URL 또는 문서/근거 설명
  license_checked_at     timestamptz,
  rights_confidence      text NOT NULL DEFAULT 'UNKNOWN', -- 'VERIFIED' | 'LIKELY' | 'UNKNOWN' | 'RESTRICTED'
  production_allowed     boolean NOT NULL DEFAULT false, -- VERIFIED + 상업적 사용 허용일 때만 true (게이트 체크포인트)
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_media_rights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_media_rights_own" ON affiliate_media_rights FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. CREATIVE DNA — 레퍼런스 영상의 구조 패턴 (원본 그대로 베끼지 않기 위함)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS affiliate_creative_dna (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_item_id      uuid NOT NULL REFERENCES affiliate_source_items(id) ON DELETE CASCADE,
  hook_type           text,
  hook_duration       numeric,
  first_frame_type    text,
  scene_count         integer,
  avg_scene_duration  numeric,
  problem_scene       jsonb DEFAULT '{}',
  product_reveal_time numeric,
  demo_sequence       jsonb DEFAULT '[]',
  before_after_structure boolean,
  text_density        text,
  caption_position    text,
  cta_style           text,
  audio_energy        text,
  camera_style         text,
  ending_pattern      text,
  analyzed_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_creative_dna ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_creative_dna_own" ON affiliate_creative_dna FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_creative_dna_item ON affiliate_creative_dna (source_item_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. SCRIPTS / VIDEO PROJECTS / VARIANTS / RENDERS
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS affiliate_scripts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES affiliate_products(id) ON DELETE CASCADE,
  variant_label text NOT NULL, -- 'A_CURIOSITY' | 'B_PROBLEM_SOLUTION' | 'C_BEFORE_AFTER' | 'D_PRICE_VALUE' | 'E_SATISFYING'
  hook_class    text, -- 'CURIOSITY' | 'PROBLEM' | 'SHOCK' | ... (섹션 19)
  hook_text     text,
  full_script   text NOT NULL,
  structure     jsonb DEFAULT '{}', -- 씬별 타이밍/목적
  ai_model      text,
  validated     boolean NOT NULL DEFAULT false, -- 과장/허위/미검증 주장 없는지 체크됨
  validation_notes text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_scripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_scripts_own" ON affiliate_scripts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_scripts_product ON affiliate_scripts (product_id);

CREATE TABLE IF NOT EXISTS affiliate_video_projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES affiliate_products(id) ON DELETE CASCADE,
  listing_id    uuid REFERENCES affiliate_listings(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'DRAFT',
    -- 'DRAFT' | 'CREATING' | 'QA_FAILED' | 'NEEDS_REVIEW' | 'READY_TO_PUBLISH' | 'PUBLISHED' | 'REJECTED'
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_video_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_video_projects_own" ON affiliate_video_projects FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_video_projects_user ON affiliate_video_projects (user_id, status);

CREATE TABLE IF NOT EXISTS affiliate_video_variants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES affiliate_video_projects(id) ON DELETE CASCADE,
  script_id     uuid REFERENCES affiliate_scripts(id) ON DELETE SET NULL,
  variant_label text NOT NULL,
  duration_sec  numeric,
  media_asset_ids uuid[] DEFAULT '{}', -- 실제 사용된 검증된 미디어 자산들
  duplication_score numeric, -- 과거 콘텐츠와의 유사도 (섹션 27)
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_video_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_video_variants_own" ON affiliate_video_variants FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_video_variants_project ON affiliate_video_variants (project_id);

CREATE TABLE IF NOT EXISTS affiliate_renders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  variant_id    uuid NOT NULL REFERENCES affiliate_video_variants(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'queued', -- queued|running|completed|failed|retrying|cancelled
  storage_key   text, -- R2 key
  public_url    text,
  resolution    text,
  duration_sec  numeric,
  error_message text,
  retry_count   integer NOT NULL DEFAULT 0,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_renders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_renders_own" ON affiliate_renders FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_renders_variant ON affiliate_renders (variant_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. QA REPORTS — 렌더 후 자동 검수 (자동발행 게이트의 핵심)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS affiliate_qa_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  render_id         uuid NOT NULL REFERENCES affiliate_renders(id) ON DELETE CASCADE,
  qa_score          numeric, -- 0-100
  technical_checks  jsonb DEFAULT '{}', -- duration/resolution/black_frames/audio_clipping 등 개별 결과
  semantic_checks   jsonb DEFAULT '{}', -- AI vision 리뷰 결과(제품 일치/과장주장/CTA 자연스러움 등)
  passed            boolean NOT NULL DEFAULT false,
  failure_reasons   text[] DEFAULT '{}',
  reviewed_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_qa_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_qa_reports_own" ON affiliate_qa_reports FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_qa_reports_render ON affiliate_qa_reports (render_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. PUBLISHING
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS affiliate_publication_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  render_id     uuid NOT NULL REFERENCES affiliate_renders(id) ON DELETE CASCADE,
  platform      text NOT NULL, -- 'youtube_shorts' | 'instagram_reels' | 'tiktok' | 'threads' 등
  status        text NOT NULL DEFAULT 'queued',
  scheduled_at  timestamptz,
  gate_checks   jsonb DEFAULT '{}', -- 섹션 31 하드 게이트 각 항목 통과 여부 스냅샷
  error_message text,
  retry_count   integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_publication_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_publication_jobs_own" ON affiliate_publication_jobs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_publication_jobs_status ON affiliate_publication_jobs (user_id, status);

CREATE TABLE IF NOT EXISTS affiliate_publications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  publication_job_id uuid NOT NULL REFERENCES affiliate_publication_jobs(id) ON DELETE CASCADE,
  platform          text NOT NULL,
  platform_post_id  text,
  post_url          text,
  disclosure_template text,
  published_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_publications_own" ON affiliate_publications FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. PERFORMANCE + LEARNING LOOP
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS affiliate_performance_metrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  publication_id  uuid NOT NULL REFERENCES affiliate_publications(id) ON DELETE CASCADE,
  views           bigint,
  likes           bigint,
  comments        bigint,
  shares          bigint,
  watch_time_sec  numeric,
  completion_rate numeric,
  ctr             numeric,
  affiliate_clicks integer,
  orders          integer,
  conversion_rate numeric,
  revenue         numeric,
  commission      numeric,
  snapshot_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_performance_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_performance_metrics_own" ON affiliate_performance_metrics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_performance_metrics_pub ON affiliate_performance_metrics (publication_id, snapshot_at DESC);

CREATE TABLE IF NOT EXISTS affiliate_learning_signals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_type   text NOT NULL, -- 'WINNER_PATTERN' | 'FAILURE_CAUSE' | 'CATEGORY_INSIGHT' | 'HOOK_INSIGHT' 등
  scope         jsonb DEFAULT '{}', -- 어떤 카테고리/훅/플랫폼에 적용되는지
  insight       text NOT NULL,
  confidence    numeric,
  evidence_ids  uuid[] DEFAULT '{}', -- 근거가 된 publication/performance id들
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_learning_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_learning_signals_own" ON affiliate_learning_signals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. JOB SYSTEM + COST CONTROL
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS affiliate_automation_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type      text NOT NULL, -- DISCOVER|NORMALIZE|MATCH|RIGHTS_CHECK|ANALYZE|SCRIPT|GENERATE|RENDER|QA|PUBLISH|METRICS|LEARN
  status        text NOT NULL DEFAULT 'queued', -- queued|running|completed|failed|retrying|cancelled
  target_type   text, -- 'source' | 'product' | 'video_project' | 'render' 등
  target_id     uuid,
  idempotency_key text UNIQUE,
  retry_count   integer NOT NULL DEFAULT 0,
  error_message text,
  logs          text,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_automation_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_automation_jobs_own" ON affiliate_automation_jobs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_automation_jobs_status ON affiliate_automation_jobs (user_id, status, job_type);

CREATE TABLE IF NOT EXISTS affiliate_api_usage (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider      text NOT NULL,
  operation     text NOT NULL,
  tokens        integer,
  request_count integer NOT NULL DEFAULT 1,
  estimated_cost numeric NOT NULL DEFAULT 0,
  product_id    uuid REFERENCES affiliate_products(id) ON DELETE SET NULL,
  job_id        uuid REFERENCES affiliate_automation_jobs(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_api_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_api_usage_own" ON affiliate_api_usage FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_api_usage_user_date ON affiliate_api_usage (user_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 15. 자동화 설정 (레벨 0~5, 예산 등 — 유저당 1행)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS affiliate_engine_settings (
  user_id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  automation_level    integer NOT NULL DEFAULT 4, -- 0~5, 기본 4 (Level 5는 명시적으로만)
  score_weights       jsonb DEFAULT '{}', -- 섹션 8 가중치 커스터마이즈
  daily_budget        numeric,
  monthly_budget      numeric,
  budget_warning_pct  numeric DEFAULT 80,
  qa_pass_threshold   numeric DEFAULT 70,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_engine_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_engine_settings_own" ON affiliate_engine_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
