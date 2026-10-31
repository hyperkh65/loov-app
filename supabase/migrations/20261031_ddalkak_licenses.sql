-- 딸깍 라이선스: 번호는 해시로만 저장(원문은 발급 때 한 번만 보여 준다), 기기 목록은 별도 테이블
create table if not exists public.ddalkak_licenses (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_hint text not null,
  plan text not null check (plan in ('trial1','m3','m6','m9','m12')),
  months int not null,
  status text not null default 'unused' check (status in ('unused','active','revoked')),
  email text,
  activated_at timestamptz,
  expires_at timestamptz,
  max_devices int not null default 2,
  memo text,
  created_at timestamptz not null default now()
);

create table if not exists public.ddalkak_devices (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.ddalkak_licenses(id) on delete cascade,
  device_id text not null,
  device_name text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (license_id, device_id)
);

-- 서비스 키로만 접근(정책 없음 = 일반 사용자는 읽지도 쓰지도 못함)
alter table public.ddalkak_licenses enable row level security;
alter table public.ddalkak_devices enable row level security;
grant all on public.ddalkak_licenses to service_role;
grant all on public.ddalkak_devices to service_role;
