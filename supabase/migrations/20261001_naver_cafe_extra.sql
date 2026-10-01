alter table naver_cafe_connections add column if not exists extra_cafes jsonb not null default '[]'::jsonb;
