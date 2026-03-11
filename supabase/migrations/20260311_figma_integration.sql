-- Figma 연동 테이블
create table if not exists public.bossai_figma_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  access_token text not null,
  figma_name text default '',
  figma_email text default '',
  figma_img_url text default '',
  is_connected boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

-- RLS 활성화
alter table public.bossai_figma_connections enable row level security;

-- 본인 데이터만 접근 가능
create policy "Users can manage own figma connection"
  on public.bossai_figma_connections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
