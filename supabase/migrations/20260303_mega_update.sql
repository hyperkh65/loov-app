-- ================================================================
-- LOOV 대대적 기능 업데이트 마이그레이션
-- 2026-03-03
-- ================================================================

-- ── 인사이트 (AI 자동 생성, 공개 공유) ────────────────────
CREATE TABLE IF NOT EXISTS bossai_insights (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  summary text,
  content text,
  category text DEFAULT '트렌드',
  source text DEFAULT 'ai',
  tags text[] DEFAULT '{}',
  is_public boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ── 강의 ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bossai_courses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  instructor text DEFAULT 'LOOV 공식',
  level text DEFAULT '입문',
  duration text,
  lessons_count int DEFAULT 0,
  content jsonb DEFAULT '[]',
  tags text[] DEFAULT '{}',
  icon text DEFAULT '🎓',
  color text DEFAULT 'from-indigo-500 to-purple-600',
  enrolled_count int DEFAULT 0,
  rating numeric(3,1) DEFAULT 4.5,
  is_public boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bossai_course_enrollments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  course_id uuid REFERENCES bossai_courses ON DELETE CASCADE,
  progress int DEFAULT 0,
  enrolled_at timestamptz DEFAULT now(),
  UNIQUE(user_id, course_id)
);

-- ── 커뮤니티 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bossai_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  author_name text DEFAULT '익명',
  author_avatar text DEFAULT '👤',
  title text NOT NULL,
  content text NOT NULL,
  category text DEFAULT '토론',
  tags text[] DEFAULT '{}',
  likes int DEFAULT 0,
  comments_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bossai_post_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid REFERENCES bossai_posts ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  author_name text DEFAULT '익명',
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bossai_post_likes (
  post_id uuid REFERENCES bossai_posts ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);

-- ── Google Calendar 연동 ──────────────────────────────────
CREATE TABLE IF NOT EXISTS bossai_google_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── 홈페이지 설정 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bossai_website_config (
  user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  slug text UNIQUE,
  is_published boolean DEFAULT false,
  theme text DEFAULT 'modern',
  pages jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- slug 유니크 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS bossai_website_config_slug_idx ON bossai_website_config(slug) WHERE slug IS NOT NULL;

-- ── RLS 정책 ─────────────────────────────────────────────

-- 인사이트: 공개 읽기 허용
ALTER TABLE bossai_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "insights_public_read" ON bossai_insights;
CREATE POLICY "insights_public_read" ON bossai_insights FOR SELECT USING (is_public = true);
DROP POLICY IF EXISTS "insights_service_insert" ON bossai_insights;
CREATE POLICY "insights_service_insert" ON bossai_insights FOR INSERT WITH CHECK (true);

-- 강의: 공개 읽기 허용
ALTER TABLE bossai_courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "courses_public_read" ON bossai_courses;
CREATE POLICY "courses_public_read" ON bossai_courses FOR SELECT USING (is_public = true);
DROP POLICY IF EXISTS "courses_service_insert" ON bossai_courses;
CREATE POLICY "courses_service_insert" ON bossai_courses FOR INSERT WITH CHECK (true);

-- 수강 등록: 본인 것만
ALTER TABLE bossai_course_enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "enrollments_own" ON bossai_course_enrollments;
CREATE POLICY "enrollments_own" ON bossai_course_enrollments USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "enrollments_insert" ON bossai_course_enrollments;
CREATE POLICY "enrollments_insert" ON bossai_course_enrollments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 게시글: 공개 읽기, 인증 필요 쓰기
ALTER TABLE bossai_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "posts_public_read" ON bossai_posts;
CREATE POLICY "posts_public_read" ON bossai_posts FOR SELECT USING (true);
DROP POLICY IF EXISTS "posts_auth_insert" ON bossai_posts;
CREATE POLICY "posts_auth_insert" ON bossai_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "posts_own_update" ON bossai_posts;
CREATE POLICY "posts_own_update" ON bossai_posts FOR UPDATE USING (auth.uid() = user_id);

-- 댓글: 공개 읽기, 인증 필요 쓰기
ALTER TABLE bossai_post_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comments_public_read" ON bossai_post_comments;
CREATE POLICY "comments_public_read" ON bossai_post_comments FOR SELECT USING (true);
DROP POLICY IF EXISTS "comments_auth_insert" ON bossai_post_comments;
CREATE POLICY "comments_auth_insert" ON bossai_post_comments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 좋아요: 인증 필요
ALTER TABLE bossai_post_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "likes_public_read" ON bossai_post_likes;
CREATE POLICY "likes_public_read" ON bossai_post_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS "likes_auth_insert" ON bossai_post_likes;
CREATE POLICY "likes_auth_insert" ON bossai_post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "likes_own_delete" ON bossai_post_likes;
CREATE POLICY "likes_own_delete" ON bossai_post_likes FOR DELETE USING (auth.uid() = user_id);

-- Google 토큰: 본인만
ALTER TABLE bossai_google_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "google_tokens_own" ON bossai_google_tokens;
CREATE POLICY "google_tokens_own" ON bossai_google_tokens USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "google_tokens_insert" ON bossai_google_tokens;
CREATE POLICY "google_tokens_insert" ON bossai_google_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 홈페이지 설정: 공개 읽기 (발행된 것만), 쓰기는 본인만
ALTER TABLE bossai_website_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "website_published_read" ON bossai_website_config;
CREATE POLICY "website_published_read" ON bossai_website_config FOR SELECT USING (is_published = true OR auth.uid() = user_id);
DROP POLICY IF EXISTS "website_own_write" ON bossai_website_config;
CREATE POLICY "website_own_write" ON bossai_website_config FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "website_own_update" ON bossai_website_config;
CREATE POLICY "website_own_update" ON bossai_website_config FOR UPDATE USING (auth.uid() = user_id);

-- ── 초기 강의 데이터 ─────────────────────────────────────
INSERT INTO bossai_courses (title, description, instructor, level, duration, lessons_count, tags, icon, color, enrolled_count, rating) VALUES
('AI 직원 세팅 완벽 가이드', 'LOOV에서 AI 직원을 처음 고용하는 분들을 위한 단계별 완벽 가이드. 설정부터 첫 업무 지시까지.', 'LOOV 공식', '입문', '2시간 30분', 12, ARRAY['입문', 'AI설정', '필수'], '🚀', 'from-indigo-500 to-purple-600', 1240, 4.9),
('1인 기업 AI 마케팅 자동화', 'SNS 자동 발행부터 이메일 마케팅, 광고 최적화까지. AI로 혼자서 마케팅팀 수준의 성과 내기.', '마케팅 전문가', '중급', '4시간', 18, ARRAY['마케팅', '자동화', 'SNS'], '📣', 'from-pink-500 to-rose-600', 890, 4.8),
('AI 영업팀장 활용 실전', '고객 발굴부터 제안서 작성, 계약 클로징까지. AI 영업 직원으로 월 1억 매출 달성하는 법.', '영업 전략가', '중급', '3시간', 15, ARRAY['영업', '매출', '실전'], '💼', 'from-blue-500 to-cyan-600', 672, 4.7),
('AI 회계 & 세무 자동화', '일일 장부 관리, 세금 계산, 세무신고 준비까지. 회계를 몰라도 AI 회계팀장이 다 해결.', '세무사 협력', '입문', '1시간 30분', 8, ARRAY['회계', '세무', '자동화'], '💰', 'from-emerald-500 to-teal-600', 534, 4.6),
('Claude API 기반 커스텀 AI 직원', 'Claude API를 활용해 나만의 특화된 AI 직원 프롬프트 엔지니어링. 업종별 커스터마이징 전략.', '개발자', '고급', '6시간', 24, ARRAY['개발', 'API', '고급'], '⚙️', 'from-gray-600 to-slate-800', 312, 4.9),
('1인 기업 AI 전략 플래닝', '비즈니스 목표 설정부터 AI 도입 로드맵 작성, KPI 관리까지. 전략적 1인 기업 경영법.', '경영 컨설턴트', '중급', '2시간', 10, ARRAY['전략', '경영', '로드맵'], '🎯', 'from-amber-500 to-orange-600', 445, 4.7)
ON CONFLICT DO NOTHING;
