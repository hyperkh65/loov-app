-- 카테고리
create table if not exists shop_categories (
  id bigserial primary key,
  name text not null,
  slug text not null unique,
  description text,
  icon text,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- 상품
create table if not exists shop_products (
  id bigserial primary key,
  category_id bigint references shop_categories(id) on delete set null,
  name text not null,
  slug text,
  description text,
  detail_html text,
  price int not null default 0,
  sale_price int,
  stock int default 999,
  is_active bool default true,
  is_featured bool default false,
  is_new bool default false,
  is_best bool default false,
  sort_order int default 0,
  thumbnail_url text,
  options jsonb,
  spec jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 상품 이미지
create table if not exists shop_product_images (
  id bigserial primary key,
  product_id bigint references shop_products(id) on delete cascade,
  url text not null,
  sort_order int default 0
);

-- 주문
create table if not exists shop_orders (
  id bigserial primary key,
  order_no text not null unique,
  user_id uuid,
  total_amount int not null,
  shipping_name text,
  shipping_phone text,
  shipping_addr text,
  shipping_addr_detail text,
  shipping_zipcode text,
  memo text,
  status text default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 주문 항목
create table if not exists shop_order_items (
  id bigserial primary key,
  order_id bigint references shop_orders(id) on delete cascade,
  product_id bigint,
  product_name text,
  option_name text,
  price int,
  qty int
);

-- 리뷰
create table if not exists shop_reviews (
  id bigserial primary key,
  product_id bigint references shop_products(id) on delete cascade,
  user_id uuid,
  author_name text,
  rating int check (rating between 1 and 5),
  content text,
  created_at timestamptz default now()
);

-- 샘플 카테고리
insert into shop_categories (name, slug, icon, sort_order) values
  ('전체', 'all', '🛒', 0),
  ('전자제품', 'electronics', '💻', 1),
  ('생활용품', 'living', '🏠', 2),
  ('조명', 'lighting', '💡', 3)
on conflict (slug) do nothing;
