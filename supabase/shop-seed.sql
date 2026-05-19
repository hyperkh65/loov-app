-- ================================================================
-- LOOV 쇼핑몰 샘플 데이터 시드
-- Supabase SQL Editor에서 실행하세요
-- ================================================================

-- 1. 테이블 생성 (없으면)
create table if not exists shop_categories (
  id bigserial primary key,
  name text not null,
  slug text not null unique,
  description text,
  icon text,
  sort_order int default 0,
  created_at timestamptz default now()
);

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

create table if not exists shop_product_images (
  id bigserial primary key,
  product_id bigint references shop_products(id) on delete cascade,
  url text not null,
  sort_order int default 0
);

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

create table if not exists shop_order_items (
  id bigserial primary key,
  order_id bigint references shop_orders(id) on delete cascade,
  product_id bigint,
  product_name text,
  option_name text,
  price int,
  qty int
);

create table if not exists shop_reviews (
  id bigserial primary key,
  product_id bigint references shop_products(id) on delete cascade,
  user_id uuid,
  author_name text,
  rating int check (rating between 1 and 5),
  content text,
  created_at timestamptz default now()
);

create table if not exists shop_banners (
  id bigserial primary key,
  title text not null default '',
  subtitle text default '',
  image_url text,
  link_url text,
  bg_color text default 'linear-gradient(135deg,#1a1a2e,#0f3460)',
  text_color text default '#ffffff',
  badge_text text,
  cta_text text default '쇼핑하기',
  sort_order int default 0,
  is_active bool default true,
  created_at timestamptz default now()
);

-- 2. 카테고리 삽입
insert into shop_categories (name, slug, icon, sort_order) values
  ('전자제품', 'electronics', '💻', 1),
  ('생활용품', 'living',      '🏠', 2),
  ('조명',     'lighting',    '💡', 3)
on conflict (slug) do nothing;

-- 3. 배너 삽입
insert into shop_banners (title, subtitle, badge_text, cta_text, bg_color, sort_order, is_active) values
  ('여름 특가 세일', '전 품목 최대 40% 할인', '🔥 SUMMER SALE', '지금 쇼핑하기', 'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)', 0, true),
  ('신상 조명 컬렉션', '공간을 바꾸는 빛의 예술', '✨ NEW ARRIVAL', '컬렉션 보기', 'linear-gradient(135deg,#0f2027,#203a43,#2c5364)', 1, true),
  ('스마트 생활가전', '더 스마트한 일상의 시작', '💻 TECH', '지금 확인', 'linear-gradient(135deg,#232526,#414345)', 2, true)
on conflict do nothing;

-- ================================================================
-- 4. 상품 삽입
-- ================================================================

-- ── 전자제품 10개 ──────────────────────────────────────────────

insert into shop_products
  (category_id, name, slug, price, sale_price, stock, is_active, is_new, is_best, is_featured, thumbnail_url, description, spec, sort_order)
values

-- 1
((select id from shop_categories where slug='electronics'),
 'LG 올레드 TV 55인치 4K', 'lg-oled-55', 1500000, 1190000, 20,
 true, false, true, true,
 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=500&h=500&fit=crop',
 '완벽한 블랙과 무한 명암비. 영화관을 집으로.',
 '{"화면크기":"55인치","해상도":"3840×2160 (4K)","패널":"OLED","주사율":"120Hz","HDR":"Dolby Vision·HDR10","스마트TV":"webOS 23"}', 1),

-- 2
((select id from shop_categories where slug='electronics'),
 '소니 WH-1000XM5 노이즈캔슬링 헤드폰', 'sony-wh1000xm5', 420000, 359000, 45,
 true, true, true, false,
 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&h=500&fit=crop',
 '업계 최고 수준의 노이즈캔슬링과 30시간 배터리.',
 '{"드라이버":"30mm","주파수":"4Hz~40kHz","배터리":"30시간","충전":"USB-C","연결":"블루투스 5.2","무게":"250g"}', 2),

-- 3
((select id from shop_categories where slug='electronics'),
 '삼성 갤럭시 워치6 Classic 47mm', 'galaxy-watch6-classic', 399000, 329000, 60,
 true, true, false, true,
 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&h=500&fit=crop',
 '회전 베젤로 조작하는 클래식한 스마트워치.',
 '{"디스플레이":"1.5인치 AMOLED","배터리":"425mAh","방수":"5ATM","운영체제":"Wear OS","소재":"스테인리스 스틸"}', 3),

-- 4
((select id from shop_categories where slug='electronics'),
 '애플 에어팟 프로 2세대', 'airpods-pro-2', 359000, null, 80,
 true, false, true, false,
 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=500&h=500&fit=crop',
 '적응형 투명도 모드와 공간 음향으로 새로운 차원의 사운드.',
 '{"칩":"H2","배터리":"이어폰 6시간·케이스 포함 30시간","ANC":"활성형 소음 차단","방수":"IPX4","연결":"블루투스 5.3"}', 4),

-- 5
((select id from shop_categories where slug='electronics'),
 '로지텍 MX Master 3S 무선 마우스', 'logitech-mx-master-3s', 129000, 109000, 100,
 true, false, false, false,
 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=500&h=500&fit=crop',
 '초고속 MagSpeed 스크롤과 8000DPI 센서.',
 '{"DPI":"200~8000","배터리":"70일","연결":"블루투스·Unifying","버튼":"7개","무게":"141g","호환":"Windows·Mac·Linux"}', 5),

-- 6
((select id from shop_categories where slug='electronics'),
 'LG 그램 16 노트북 (2024)', 'lg-gram-16-2024', 2190000, 1890000, 15,
 true, true, false, true,
 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=500&h=500&fit=crop',
 '1.19kg 초경량, 72Wh 대용량 배터리. MIL-STD-810H 인증.',
 '{"CPU":"Intel Core Ultra 7","RAM":"32GB","저장장치":"1TB NVMe SSD","화면":"16인치 IPS 2560×1600","배터리":"72Wh·약 24시간","무게":"1.19kg"}', 6),

-- 7
((select id from shop_categories where slug='electronics'),
 '삼성 포터블 SSD T7 Shield 2TB', 'samsung-t7-shield-2tb', 189000, 159000, 70,
 true, false, true, false,
 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=500&h=500&fit=crop',
 '방진·방수(IP65) + 1050MB/s 전송속도 외장 SSD.',
 '{"용량":"2TB","읽기속도":"1050MB/s","쓰기속도":"1000MB/s","인터페이스":"USB 3.2 Gen2","방수":"IP65","무게":"98g"}', 7),

-- 8
((select id from shop_categories where slug='electronics'),
 '필립스 65PUS8518 미니LED 4K TV', 'philips-65-miniled', 1390000, 1090000, 10,
 true, true, false, false,
 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=500&h=500&fit=crop&seed=tv65',
 '아모비아+ 미니LED, P5 Perfect Picture 엔진.',
 '{"화면크기":"65인치","패널":"Mini LED","해상도":"4K UHD","주사율":"144Hz","HDR":"Dolby Vision IQ·HDR10+","스마트TV":"Google TV"}', 8),

-- 9
((select id from shop_categories where slug='electronics'),
 '앤커 PowerConf H700 무선 헤드셋', 'anker-powerconf-h700', 159000, 129000, 35,
 true, false, false, false,
 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=500&h=500&fit=crop',
 '6개 마이크 AI 노이즈 필터링. 재택근무 필수템.',
 '{"마이크":"6개 AI 노이즈캔슬링","배터리":"70시간","연결":"2.4GHz 무선·블루투스","범위":"10m","무게":"165g"}', 9),

-- 10
((select id from shop_categories where slug='electronics'),
 '아이패드 10세대 Wi-Fi 256GB', 'ipad-10th-256gb', 899000, null, 25,
 true, false, true, true,
 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=500&h=500&fit=crop',
 '10.9인치 Liquid Retina, A14 Bionic. 새로운 디자인.',
 '{"칩":"A14 Bionic","화면":"10.9인치 Liquid Retina","저장":"256GB","카메라":"후면 12MP·전면 12MP","배터리":"약 10시간","무게":"477g"}', 10);

-- ── 생활용품 10개 ──────────────────────────────────────────────

insert into shop_products
  (category_id, name, slug, price, sale_price, stock, is_active, is_new, is_best, is_featured, thumbnail_url, description, spec, sort_order)
values

-- 1
((select id from shop_categories where slug='living'),
 '다이슨 V15 Detect 무선청소기', 'dyson-v15-detect', 999000, 849000, 18,
 true, false, true, true,
 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&h=500&fit=crop',
 '레이저로 먼지를 감지하는 최강의 무선청소기.',
 '{"흡입력":"240 AW","배터리":"60분","집진통":"0.77L","무게":"3.1kg","필터":"HEPA","소음":"<72dB"}', 11),

-- 2
((select id from shop_categories where slug='living'),
 '필립스 에어프라이어 XXL 7.2L', 'philips-airfryer-xxl', 239000, 189000, 40,
 true, true, true, false,
 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=500&h=500&fit=crop',
 '라피드 에어 기술로 기름 없이 바삭하게.',
 '{"용량":"7.2L (6인분)","전력":"2225W","온도":"40~200°C","타이머":"60분","기능":"에어프라이·굽기·찜·해동"}', 12),

-- 3
((select id from shop_categories where slug='living'),
 '네스프레소 버츄오 넥스트 커피머신', 'nespresso-vertuo-next', 229000, 189000, 55,
 true, false, true, true,
 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500&h=500&fit=crop',
 '바코드 인식으로 자동 추출. 5가지 컵 크기.',
 '{"추출방식":"Centrifusion™","컵크기":"5가지 (40~535ml)","예열":"25초","용수통":"1.1L","압력":"2bar","WiFi":"있음"}', 13),

-- 4
((select id from shop_categories where slug='living'),
 '르크루제 코코트 론드 22cm 체리', 'le-creuset-cocotte-22', 520000, 429000, 12,
 true, false, false, true,
 'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=500&h=500&fit=crop',
 '프랑스 장인의 법랑 주물냄비. 평생 사용 가능.',
 '{"소재":"법랑 주물","용량":"3.3L","크기":"직경 22cm","무게":"3.7kg","사용가능":"가스·인덕션·오븐·식기세척기","색상":"체리"}', 14),

-- 5
((select id from shop_categories where slug='living'),
 '발뮤다 더 토스터 K05A 스팀', 'balmuda-toaster-k05a', 370000, null, 20,
 true, false, true, false,
 'https://images.unsplash.com/photo-1565514020179-026b92b84bb6?w=500&h=500&fit=crop',
 '스팀 기술로 구운 빵집 그 맛. 일본 감성 디자인.',
 '{"전력":"1300W","용량":"물 5cc","모드":"토스트·치즈·피자·와플·오븐","크기":"35×30×22cm","무게":"2.6kg"}', 15),

-- 6
((select id from shop_categories where slug='living'),
 '쿠쿠 IH 압력밥솥 10인용 CRP-LHTR1090S', 'cuckoo-ih-10cup', 459000, 389000, 30,
 true, true, true, false,
 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=500&h=500&fit=crop',
 '스마트 쿠킹 IH 가열로 밥맛이 다릅니다.',
 '{"용량":"10인용 (1.8L)","가열방식":"IH 전자유도가열","압력":"최대 2기압","모드":"쌀·현미·잡곡·찜·국 외 8가지","앱연동":"있음"}', 16),

-- 7
((select id from shop_categories where slug='living'),
 '한샘 소피아 패브릭 소파 3인용', 'hanssem-sophia-sofa', 890000, 720000, 5,
 true, false, false, true,
 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=500&h=500&fit=crop',
 '고밀도 우레탄 폼, 항균·항취 패브릭 소재.',
 '{"크기":"W2100×D900×H860mm","소재":"항균 패브릭+고밀도 우레탄","색상":"라이트그레이·다크그레이","다리":"원목 오크","인원":"3인용"}', 17),

-- 8
((select id from shop_categories where slug='living'),
 '테팔 인디움 인덕션 프라이팬 28cm', 'tefal-inducta-28', 89000, 69000, 75,
 true, false, true, false,
 'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=500&h=500&fit=crop&seed=pan',
 '티타늄 코팅, 온도 인디케이터 Thermo-Spot.',
 '{"크기":"28cm","코팅":"티타늄 엑셀런스","가열방식":"인덕션·가스·세라믹","특징":"Thermo-Spot 온도 감지","무세":"무세제 세척 가능"}', 18),

-- 9
((select id from shop_categories where slug='living'),
 '이케아 POÄNG 포앙 안락의자', 'ikea-poang-armchair', 179000, null, 15,
 true, false, false, false,
 'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=500&h=500&fit=crop',
 '자작나무 합판과 쿠션으로 완성한 편안함.',
 '{"소재":"자작나무 합판 프레임","커버":"기계세탁 가능","하중":"110kg","크기":"W68×D82×H100cm","무게":"7kg"}', 19),

-- 10
((select id from shop_categories where slug='living'),
 '발뮤다 더 퓨어 공기청정기 A01D', 'balmuda-the-pure', 690000, 579000, 8,
 true, true, false, true,
 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&h=500&fit=crop&seed=purifier',
 '360도 흡기, 3단계 필터. 25평형 대응.',
 '{"적용면적":"25평형","필터":"프리·카본·HEPA H13","소음":"13~52dB","전력":"3~33W","크기":"Ø295×H695mm","무게":"7.6kg"}', 20);

-- ── 조명 10개 ──────────────────────────────────────────────────

insert into shop_products
  (category_id, name, slug, price, sale_price, stock, is_active, is_new, is_best, is_featured, thumbnail_url, description, spec, sort_order)
values

-- 1
((select id from shop_categories where slug='lighting'),
 '필립스 휴 스타터 키트 (A19 4구)', 'philips-hue-starter-4', 289000, 239000, 35,
 true, false, true, true,
 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&h=500&fit=crop&seed=hue',
 '1600만 색상, 앱으로 분위기를 바꾸는 스마트 조명.',
 '{"전구":"A19 9W×4개","밝기":"806lm","색온도":"2000~6500K","색상":"1600만 가지","연결":"Zigbee (허브 필요)","앱":"Philips Hue"}', 21),

-- 2
((select id from shop_categories where slug='lighting'),
 '아르떼미데 Tolomeo 테이블 램프', 'artemide-tolomeo-table', 420000, null, 10,
 true, false, false, true,
 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=500&h=500&fit=crop',
 '미케레 데 루키 디자인. 이탈리아 알루미늄 관절형 스탠드.',
 '{"소재":"알루미늄+강철","베이스":"대리석 옵션","전구":"E27 최대 70W","높이":"조절 가능 (최대 115cm)","원산지":"이탈리아"}', 22),

-- 3
((select id from shop_categories where slug='lighting'),
 'LED 북유럽 펜던트 조명 3등 세트', 'nordic-pendant-3set', 129000, 99000, 25,
 true, true, true, false,
 'https://images.unsplash.com/photo-1524484485831-a92ffc0de03f?w=500&h=500&fit=crop',
 '미니멀 북유럽 감성, 식탁 위에 딱 맞는 3등 펜던트.',
 '{"전구":"E27 LED 호환","줄길이":"최대 100cm (조절가능)","소재":"철제 반구형 쉐이드","색상":"블랙·화이트·골드","전압":"AC 220V"}', 23),

-- 4
((select id from shop_categories where slug='lighting'),
 '샤오미 Yeelight LED 방등 50W', 'yeelight-ceiling-50w', 79000, 62000, 50,
 true, true, true, false,
 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=500&h=500&fit=crop',
 'WiFi 연결, 앱·음성 제어. 조도·색온도 조절.',
 '{"전력":"50W","밝기":"3500lm","색온도":"2700~6500K","연결":"WiFi 2.4GHz","제어":"앱·시리·구글·알렉사","수명":"25000시간"}', 24),

-- 5
((select id from shop_categories where slug='lighting'),
 '무인양품 LED 스탠드 조명 (아암형)', 'muji-led-arm-stand', 159000, null, 18,
 true, false, false, true,
 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=500&h=500&fit=crop&seed=stand',
 '군더더기 없는 디자인, 세심한 조도 조절.',
 '{"전력":"10W LED","밝기":"800lm","색온도":"3000K (전구색)","암길이":"45cm","베이스":"클램프형·스탠드형","소재":"철제+ABS"}', 25),

-- 6
((select id from shop_categories where slug='lighting'),
 '로디&버그 Edison 복고풍 전구 E27 6구 세트', 'edison-bulb-e27-6set', 45000, 35000, 80,
 true, false, true, false,
 'https://images.unsplash.com/photo-1524484485831-a92ffc0de03f?w=500&h=500&fit=crop&seed=edison',
 '빈티지 필라멘트 LED. 카페 감성 그대로.',
 '{"전력":"4W×6개 (60W 상당)","밝기":"350lm","색온도":"2200K (초전구색)","베이스":"E27","수명":"15000시간","조광기":"호환"}', 26),

-- 7
((select id from shop_categories where slug='lighting'),
 '난야 무선 터치 LED 수유등 (야간등)', 'nanya-touch-nightlight', 39000, 29000, 120,
 true, true, true, false,
 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=500&h=500&fit=crop',
 '충전식, 3단 밝기 조절. 침실·수유실에 딱.',
 '{"전력":"1.5W LED","배터리":"2000mAh (최대 50시간)","밝기":"3단계","색온도":"3000K","충전":"USB-C","방수":"IPX4"}', 27),

-- 8
((select id from shop_categories where slug='lighting'),
 '코스모스 LED 레일 조명 3구 화이트', 'cosmos-rail-3lights', 89000, 72000, 30,
 true, false, false, false,
 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=500&h=500&fit=crop&seed=rail',
 '각도 자유롭게 조절. 갤러리·거실 어디에나.',
 '{"전력":"3×7W=21W","밝기":"각 560lm","색온도":"3000K/4000K 선택","레일길이":"60cm","회전":"360°+90°","전압":"AC 220V"}', 28),

-- 9
((select id from shop_categories where slug='lighting'),
 '솔라테크 태양광 정원 조명 12구 세트', 'solartech-garden-12', 55000, 42000, 60,
 true, true, false, false,
 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=500&h=500&fit=crop&seed=garden',
 '전기 배선 불필요. 해 지면 자동 점등.',
 '{"전력":"태양광 자가충전","배터리":"2000mAh Ni-MH","밝기":"30lm/개","작동시간":"8~10시간","방수":"IP65","구성":"12개 + 지지대"}', 29),

-- 10
((select id from shop_categories where slug='lighting'),
 '나트 Gras N°216 벽부 조명', 'nath-gras-n216', 320000, null, 6,
 true, false, false, true,
 'https://images.unsplash.com/photo-1524484485831-a92ffc0de03f?w=500&h=500&fit=crop&seed=gras',
 '1921년 탄생한 클래식. 프랑스 장인 제작.',
 '{"소재":"알루미늄+철재","암길이":"26cm","전구":"E14 최대 40W","마감":"블랙 에폭시","원산지":"프랑스","용도":"실내 벽부등"}', 30);

-- ================================================================
-- 5. 결과 확인
-- ================================================================
select
  c.name as "카테고리",
  count(p.id) as "상품수",
  min(p.price) as "최저가",
  max(p.price) as "최고가"
from shop_categories c
left join shop_products p on p.category_id = c.id
where c.slug != 'all'
group by c.name
order by c.sort_order;
