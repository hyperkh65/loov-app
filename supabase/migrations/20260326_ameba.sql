-- アメブロ (Ameba Blog) 자동화 테이블

-- 아메바 블로그 연결 정보
create table if not exists ameba_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  blog_id text not null,
  email text not null,
  password_plain text,
  cookies jsonb default '[]',
  cookies_updated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);
alter table ameba_connections enable row level security;
create policy "ameba_conn_user" on ameba_connections for all using (auth.uid() = user_id);

-- 발행 큐 (로컬 에이전트가 처리)
create table if not exists ameba_publish_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  blog_id text not null,
  title text not null,
  content text not null,
  category text default '',
  status text default 'pending',
  result_url text,
  error text,
  created_at timestamptz default now(),
  processed_at timestamptz
);
alter table ameba_publish_queue enable row level security;
create policy "ameba_queue_user" on ameba_publish_queue for all using (auth.uid() = user_id);

-- 발행 이력
create table if not exists ameba_publish_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  blog_id text not null,
  title text not null,
  post_url text,
  status text default 'success',
  error text,
  created_at timestamptz default now()
);
alter table ameba_publish_history enable row level security;
create policy "ameba_history_user" on ameba_publish_history for all using (auth.uid() = user_id);
