-- X 수집 영상 테이블
create table if not exists bossai_x_videos (
  id            uuid primary key default gen_random_uuid(),
  tweet_id      text unique not null,
  username      text not null,
  tweet_url     text not null,
  tweet_text    text,
  tweet_date    timestamptz,
  video_url     text not null,   -- Supabase Storage 공개 URL
  storage_path  text not null,   -- 버킷 내 경로
  file_size     bigint,
  collected_at  timestamptz default now(),
  posted_at     timestamptz,
  posted_platforms text[] default '{}'
);

create index if not exists idx_x_videos_username on bossai_x_videos(username);
create index if not exists idx_x_videos_collected on bossai_x_videos(collected_at desc);

alter table bossai_x_videos enable row level security;
create policy "service role full access" on bossai_x_videos using (true) with check (true);
