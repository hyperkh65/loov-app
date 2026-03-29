#!/usr/bin/env python3
"""
LED 시장 인텔리전스 수집기
- 네이버 쇼핑 API: 카테고리당 1000개
- 규칙 기반 원산지/제조사 분석
- 전체 통계 생성 → R2 저장
"""
import os, json, re, time, uuid, boto3, requests, math
from datetime import datetime, date
from collections import defaultdict
from botocore.config import Config

R2_ACCOUNT_ID = os.environ['R2_ACCOUNT_ID']
R2_ACCESS_KEY  = os.environ['R2_ACCESS_KEY_ID']
R2_SECRET_KEY  = os.environ['R2_SECRET_ACCESS_KEY']
R2_BUCKET      = os.environ.get('R2_BUCKET', 'loov-storage')
NAVER_ID       = os.environ.get('NAVER_CLIENT_ID', '')
NAVER_SECRET   = os.environ.get('NAVER_CLIENT_SECRET', '')
OPENAI_KEY     = os.environ.get('OPENAI_API_KEY', '')
CLAUDE_KEY     = os.environ.get('CLAUDE_API_KEY', '')
OPENROUTER_KEY = os.environ.get('OPENROUTER_API_KEY', '')

s3 = boto3.client(
    's3',
    endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    config=Config(signature_version='s3v4'),
    region_name='auto',
)

# ─── 카테고리 (20개) ────────────────────────────────────────────
CATEGORIES = [
    'LED 전구', 'LED 등기구', 'LED 투광기', 'LED 다운라이트',
    'LED 가로등', 'LED 형광등', 'LED 패널조명', 'LED 센서등',
    'LED 스포트라이트', 'LED 바조명', 'LED 비상조명', 'LED 공장등',
    'LED 볼전구', 'LED 천장등', 'LED 간판조명', 'LED 수중등',
    'LED 지중등', 'LED 방폭등', 'LED 스트립', 'LED 모듈',
]

# ─── 원산지 분류 규칙 ───────────────────────────────────────────
KOREAN_BRANDS = {
    '삼성', 'lg', '두산', '한화', '현대', '코오롱', '금호',
    '남영', '신성', '아이에스', '동부', '제일', '코콤', '원창',
    '유니룩스', '에스엠', '엘이디', '한국', '국산', '코리아',
    '조명나라', '빛과조명', '디케이', '루미', '유진', '대진',
    '선일', '동일', '성신', '일진', '한빛', '명광', '대광',
    '이지', '원빛', '조명왕', '비츠로', '케이엠더블유',
    '나스텍', '세미', '디에이치', '에이치케이',
}
CHINA_KEYWORDS = {
    '중국', 'china', 'chinese', '직구', '타오바오', '알리',
    '샤오미', 'xiaomi', 'opple', '오플', 'philips china',
}
CHINA_MAKERS = {'opple', '오플', 'ienkorea', 'aukey', 'baseus'}

def detect_origin(name: str, maker: str) -> str:
    text = (name + ' ' + maker).lower()
    for kw in CHINA_KEYWORDS:
        if kw in text:
            return 'china'
    for kw in CHINA_MAKERS:
        if kw in text:
            return 'china'
    for kw in KOREAN_BRANDS:
        if kw in text:
            return 'korea'
    # 한글 상호 패턴 (주식회사, (주), 코 등)
    if re.search(r'(주식회사|㈜|\(주\)|코\.?$|전기$|조명$|엔지니어링$)', maker):
        return 'korea'
    return 'unknown'

def detect_maker_type(maker: str) -> str:
    if re.search(r'(삼성|lg|두산|한화|현대|코오롱)', maker.lower()):
        return '대기업'
    if re.search(r'(주식회사|㈜|\(주\))', maker):
        return '중소기업'
    return '개인/기타'

def clean_text(text: str) -> str:
    """다나와 등 쇼핑몰 브랜드명 제거"""
    text = re.sub(r'\b(다나와|danawa|쿠팡|11번가|지마켓|옥션|네이버|naver)\b', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

# ─── R2 헬퍼 ───────────────────────────────────────────────────
def r2_read(key):
    try:
        obj = s3.get_object(Bucket=R2_BUCKET, Key=key)
        return json.loads(obj['Body'].read().decode())
    except:
        return None

def r2_write(key, data):
    s3.put_object(
        Bucket=R2_BUCKET, Key=key,
        Body=json.dumps(data, ensure_ascii=False, default=str).encode(),
        ContentType='application/json',
    )

# ─── 네이버 쇼핑 API ────────────────────────────────────────────
def fetch_naver(query: str, max_items: int = 1000) -> list:
    if not NAVER_ID or not NAVER_SECRET:
        print(f'  ⚠ 네이버 API 키 없음')
        return []
    url = 'https://openapi.naver.com/v1/search/shop.json'
    headers = {'X-Naver-Client-Id': NAVER_ID, 'X-Naver-Client-Secret': NAVER_SECRET}
    results = []
    display = 100
    total_pages = math.ceil(max_items / display)
    for page in range(total_pages):
        start = page * display + 1
        if start > 1000:  # Naver API limit
            break
        try:
            r = requests.get(url, headers=headers,
                params={'query': query, 'display': display, 'start': start, 'sort': 'sim'},
                timeout=15)
            if r.status_code == 429:
                print(f'  Rate limit, 대기...')
                time.sleep(5)
                continue
            if r.status_code != 200:
                print(f'  HTTP {r.status_code}')
                break
            items = r.json().get('items', [])
            results.extend(items)
            print(f'  페이지 {page+1}: {len(items)}개 (누적 {len(results)}개)')
            if len(items) < display:
                break
            time.sleep(0.3)
        except Exception as e:
            print(f'  오류: {e}')
            break
    return results

# ─── AI 시장 인사이트 생성 ──────────────────────────────────────
def generate_insight(stats: dict) -> str:
    prompt = f"""LED 조명 시장 데이터를 분석하여 한국어로 2~3문장 시장 인사이트를 작성하세요.
데이터:
- 총 제품 수: {stats['total_products']}개
- 총 제조사 수: {stats['total_makers']}개
- 평균 가격: ₩{stats['avg_price']:,}
- 국산 비율: {stats['origin']['korea_pct']:.1f}%
- 중국산 비율: {stats['origin']['china_pct']:.1f}%
- 최다 카테고리: {stats['top_category']}
- 가장 많은 제조사: {stats['top_maker']}
인사이트 (2~3문장):"""

    # OpenAI
    if OPENAI_KEY:
        try:
            r = requests.post('https://api.openai.com/v1/chat/completions',
                headers={'Authorization': f'Bearer {OPENAI_KEY}', 'Content-Type': 'application/json'},
                json={'model': 'gpt-3.5-turbo', 'messages': [{'role': 'user', 'content': prompt}], 'max_tokens': 300},
                timeout=30)
            return r.json()['choices'][0]['message']['content'].strip()
        except: pass

    # Claude
    if CLAUDE_KEY:
        try:
            r = requests.post('https://api.anthropic.com/v1/messages',
                headers={'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json'},
                json={'model': 'claude-haiku-4-5-20251001', 'max_tokens': 300, 'messages': [{'role': 'user', 'content': prompt}]},
                timeout=30)
            return r.json()['content'][0]['text'].strip()
        except: pass

    # OpenRouter
    if OPENROUTER_KEY:
        try:
            r = requests.post('https://openrouter.ai/api/v1/chat/completions',
                headers={'Authorization': f'Bearer {OPENROUTER_KEY}', 'Content-Type': 'application/json'},
                json={'model': 'mistralai/mistral-7b-instruct:free', 'messages': [{'role': 'user', 'content': prompt}]},
                timeout=30)
            return r.json()['choices'][0]['message']['content'].strip()
        except: pass

    # 규칙 기반 fallback
    return (
        f"총 {stats['total_products']}개 LED 제품, {stats['total_makers']}개 제조사 분석 완료. "
        f"국산 {stats['origin']['korea_pct']:.1f}% / 중국산 {stats['origin']['china_pct']:.1f}% 비율이며, "
        f"평균 가격은 ₩{stats['avg_price']:,}입니다."
    )

# ─── 통계 생성 ──────────────────────────────────────────────────
def generate_stats(products: list) -> dict:
    if not products:
        return {}

    prices = [p['price'] for p in products if p['price'] > 0]
    sorted_prices = sorted(prices)
    n = len(sorted_prices)

    # 원산지
    origin_count = defaultdict(int)
    for p in products:
        origin_count[p.get('origin', 'unknown')] += 1
    total = len(products)

    # 카테고리별
    cat_map = defaultdict(list)
    for p in products:
        cat_map[p['category']].append(p)
    cat_stats = []
    for cat, prods in sorted(cat_map.items(), key=lambda x: -len(x[1])):
        cat_prices = [p['price'] for p in prods if p['price'] > 0]
        cat_origins = [p.get('origin') for p in prods]
        cat_stats.append({
            'name': cat,
            'count': len(prods),
            'avg_price': int(sum(cat_prices)/len(cat_prices)) if cat_prices else 0,
            'min_price': min(cat_prices) if cat_prices else 0,
            'max_price': max(cat_prices) if cat_prices else 0,
            'median_price': sorted(cat_prices)[len(cat_prices)//2] if cat_prices else 0,
            'korea_count': cat_origins.count('korea'),
            'china_count': cat_origins.count('china'),
            'korea_pct': round(cat_origins.count('korea')/len(prods)*100, 1),
        })

    # 제조사별
    maker_map = defaultdict(list)
    for p in products:
        maker_map[p['maker']].append(p)
    maker_stats = []
    for maker, prods in sorted(maker_map.items(), key=lambda x: -len(x[1])):
        m_prices = [p['price'] for p in prods if p['price'] > 0]
        maker_stats.append({
            'name': maker,
            'count': len(prods),
            'avg_price': int(sum(m_prices)/len(m_prices)) if m_prices else 0,
            'origin': prods[0].get('origin', 'unknown'),
            'maker_type': prods[0].get('maker_type', '기타'),
            'categories': list(set(p['category'] for p in prods)),
        })

    # 가격 분포
    price_tiers = {
        '1만원 미만': len([p for p in sorted_prices if p < 10000]),
        '1~5만원': len([p for p in sorted_prices if 10000 <= p < 50000]),
        '5~10만원': len([p for p in sorted_prices if 50000 <= p < 100000]),
        '10~30만원': len([p for p in sorted_prices if 100000 <= p < 300000]),
        '30만원 이상': len([p for p in sorted_prices if p >= 300000]),
    }

    # 제조사 유형별
    type_count = defaultdict(int)
    for p in products:
        type_count[p.get('maker_type', '기타')] += 1

    top_cat = max(cat_map, key=lambda k: len(cat_map[k])) if cat_map else ''
    top_maker = max(maker_map, key=lambda k: len(maker_map[k])) if maker_map else ''

    summary = {
        'total_products': total,
        'total_makers': len(maker_map),
        'total_categories': len(cat_map),
        'products_with_link': len([p for p in products if p.get('product_url')]),
        'avg_price': int(sum(sorted_prices)/n) if n else 0,
        'median_price': sorted_prices[n//2] if n else 0,
        'min_price': sorted_prices[0] if n else 0,
        'max_price': sorted_prices[-1] if n else 0,
        'top_category': top_cat,
        'top_maker': top_maker,
        'origin': {
            'korea': origin_count['korea'],
            'china': origin_count['china'],
            'unknown': origin_count['unknown'],
            'korea_pct': round(origin_count['korea']/total*100, 1),
            'china_pct': round(origin_count['china']/total*100, 1),
        },
        'price_tiers': price_tiers,
        'category_stats': cat_stats,
        'maker_stats': maker_stats[:50],
        'maker_type_dist': dict(type_count),
        'price_percentiles': {
            'p10': sorted_prices[int(n*0.1)] if n else 0,
            'p25': sorted_prices[int(n*0.25)] if n else 0,
            'p50': sorted_prices[n//2] if n else 0,
            'p75': sorted_prices[int(n*0.75)] if n else 0,
            'p90': sorted_prices[int(n*0.9)] if n else 0,
        } if n else {},
    }

    summary['ai_commentary'] = generate_insight(summary)
    return summary

# ─── 메인 수집 ──────────────────────────────────────────────────
def collect():
    all_products = []
    now = datetime.utcnow().isoformat() + 'Z'

    for cat in CATEGORIES:
        print(f'\n[{cat}] 수집...')
        raw_items = fetch_naver(cat, max_items=1000)

        for it in raw_items:
            name = clean_text(re.sub(r'<[^>]+>', '', it.get('title', '')))
            maker = clean_text(it.get('maker') or it.get('brand') or '기타')
            if not name or len(name) < 3:
                continue

            price = 0
            try:
                price = int(it.get('lprice') or it.get('price') or 0)
            except: pass

            origin = detect_origin(name, maker)
            maker_type = detect_maker_type(maker)

            all_products.append({
                'id': f'shop_{uuid.uuid4().hex[:8]}',
                'name': name,
                'price': price,
                'maker': maker,
                'category': cat,
                'image_url': it.get('image', ''),
                'product_url': it.get('link') or it.get('mallProductUrl', ''),
                'origin': origin,
                'maker_type': maker_type,
                'collected_at': now,
            })

        print(f'  완료: {len([p for p in all_products if p["category"] == cat])}개')
        time.sleep(0.5)

    print(f'\n총 수집: {len(all_products)}개')

    # 기존 병합
    existing = r2_read('led-data/products.json') or []
    new_names = {p['name'] for p in all_products}
    merged = all_products + [p for p in existing if p.get('name') not in new_names]
    merged = merged[:50000]

    print('통계 생성 중...')
    stats = generate_stats(merged)

    report = {
        'generated_at': now,
        'total_count': len(merged),
        'newly_collected': len(all_products),
        'ai_commentary': stats.get('ai_commentary', ''),
        **{k: v for k, v in stats.items() if k != 'ai_commentary'},
    }

    r2_write('led-data/products.json', merged)
    r2_write('led-data/report.json', report)

    # 스냅샷
    r2_write(f'led-data/snapshots/{date.today().isoformat()}.json', {
        'collected_at': now,
        'total': len(merged),
        'by_category': {cat: len([p for p in merged if p['category'] == cat]) for cat in CATEGORIES},
    })

    print(f'저장 완료: 제품 {len(merged)}개, 제조사 {stats.get("total_makers", 0)}개')

# ─── G2B 나라장터 수집 ──────────────────────────────────────────
G2B_KEY = os.environ.get('DATA_GO_KR_SERVICE_KEY', '')

G2B_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Referer': 'https://shopping.g2b.go.kr/',
}

def scrape_g2b_web(keyword: str) -> list:
    """나라장터 쇼핑 웹 스크래핑 (API 키 불필요)"""
    products = []
    for page in range(1, 11):  # 최대 10페이지
        url = (
            'https://shopping.g2b.go.kr/sp/na/naby/sp-nabypbblList.do'
            f'?searchQuery={requests.utils.quote(keyword)}&pageIndex={page}'
        )
        try:
            r = requests.get(url, headers=G2B_HEADERS, timeout=20)
            if r.status_code != 200:
                print(f'  G2B HTTP {r.status_code}')
                break
            html = r.text

            # 상품 목록 파싱 (나라장터 쇼핑 HTML 구조)
            # 방법 1: table row 파싱
            rows = re.findall(r'<tr[^>]*class="[^"]*list[^"]*"[^>]*>([\s\S]*?)</tr>', html, re.I)
            if not rows:
                # 방법 2: li 아이템 파싱
                rows = re.findall(r'<li[^>]*class="[^"]*item[^"]*"[^>]*>([\s\S]*?)</li>', html, re.I)

            found = 0
            for row in rows:
                # 품목명
                name_m = (
                    re.search(r'class="[^"]*prd[_-]?name[^"]*"[^>]*>([\s\S]*?)</(?:td|span|div|a)>', row, re.I)
                    or re.search(r'class="[^"]*goods[_-]?name[^"]*"[^>]*>([\s\S]*?)</(?:td|span|div)>', row, re.I)
                    or re.search(r'title="([^"]{3,80})"', row)
                    or re.search(r'<a[^>]+href="[^"]*prdct[^"]*"[^>]*>([^<]{3,80})</a>', row)
                )
                # 업체명
                comp_m = (
                    re.search(r'class="[^"]*comp[_-]?name[^"]*"[^>]*>([\s\S]*?)</(?:td|span|div)>', row, re.I)
                    or re.search(r'class="[^"]*biz[_-]?name[^"]*"[^>]*>([\s\S]*?)</(?:td|span|div)>', row, re.I)
                    or re.search(r'업체[명\s]*[：:]\s*([^\s<]{2,30})', row)
                )
                # 가격
                price_m = re.search(r'([\d,]{3,})\s*원', row)
                # 제품 번호
                no_m = re.search(r'prdctNo=(\d+)', row) or re.search(r'상품번호[^\d]*(\d{5,})', row)
                # 상품 URL
                url_m = re.search(r'href="([^"]*prdct[^"]*\?[^"]+)"', row)

                if not name_m:
                    continue
                name = re.sub(r'<[^>]+>', '', name_m.group(1)).strip()
                if len(name) < 2:
                    continue

                company = re.sub(r'<[^>]+>', '', comp_m.group(1)).strip() if comp_m else '미상'
                price = int(price_m.group(1).replace(',', '')) if price_m else 0
                product_no = no_m.group(1) if no_m else ''
                product_url = ''
                if url_m:
                    u = url_m.group(1)
                    product_url = u if u.startswith('http') else f'https://shopping.g2b.go.kr{u}'

                products.append({
                    'name': clean_text(name),
                    'company': clean_text(company),
                    'price': price,
                    'product_no': product_no,
                    'product_url': product_url,
                })
                found += 1

            print(f'  페이지 {page}: {found}개')
            if found == 0:
                break
            time.sleep(1.0)
        except Exception as e:
            print(f'  G2B 오류: {e}')
            break
    return products


def scrape_g2b_api(keyword: str) -> list:
    """나라장터 공공데이터 API (키 있을 때)"""
    products = []
    for page in range(1, 11):
        try:
            r = requests.get(
                'http://apis.data.go.kr/1230000/naraShopInfoService/getProductInfoServc',
                params={'serviceKey': G2B_KEY, 'pageNo': page, 'numOfRows': 100, 'searchNm': keyword, 'type': 'json'},
                timeout=15)
            if r.status_code != 200: break
            items = r.json().get('response', {}).get('body', {}).get('items', {}).get('item', [])
            if isinstance(items, dict): items = [items]
            if not items: break
            for it in items:
                name = clean_text(str(it.get('prdctNm') or ''))
                company = clean_text(str(it.get('bizName') or '미상'))
                try: price = int(str(it.get('unitPrice') or 0).replace(',', ''))
                except: price = 0
                if not name: continue
                products.append({
                    'name': name, 'company': company, 'price': price,
                    'product_no': str(it.get('prdctNo') or ''),
                    'product_url': '',
                })
            time.sleep(0.3)
        except Exception as e:
            print(f'  API 오류: {e}'); break
    return products


def collect_g2b():
    """나라장터 LED 업체/제품 수집 (웹 스크래핑 우선, API fallback)"""
    all_products, now = [], datetime.utcnow().isoformat() + 'Z'

    for keyword in CATEGORIES[:12]:
        print(f'\n[나라장터] {keyword}...')
        # API 키 있으면 API 우선, 없으면 웹 스크래핑
        if G2B_KEY:
            raw = scrape_g2b_api(keyword)
            if not raw:
                raw = scrape_g2b_web(keyword)
        else:
            raw = scrape_g2b_web(keyword)

        for item in raw:
            origin = detect_origin(item['name'], item['company'])
            all_products.append({
                'id': f'g2b_{uuid.uuid4().hex[:8]}',
                'name': item['name'], 'price': item['price'],
                'company': item['company'], 'product_no': item.get('product_no', ''),
                'product_url': item.get('product_url', ''),
                'category': keyword, 'origin': origin,
                'collected_at': now,
            })
        print(f'  소계: {len([p for p in all_products if p["category"] == keyword])}개')
        time.sleep(1.5)

    print(f'\n나라장터 총 수집: {len(all_products)}개')

    if not all_products:
        print('수집 실패 - 나라장터 접근 불가')
        return

    existing_products = r2_read('g2b-data/products.json') or []
    existing_changes  = r2_read('g2b-data/changes.json') or []
    existing_map = {p['product_no']: p for p in existing_products if p.get('product_no')}
    new_changes = []

    for p in all_products:
        pno = p.get('product_no')
        if not pno: continue
        old = existing_map.get(pno)
        if old and old['price'] and p['price'] and old['price'] != p['price']:
            change_pct = (p['price'] - old['price']) / old['price'] * 100
            new_changes.append({
                'type': 'price_change', 'company': p['company'], 'product': p['name'],
                'old_price': old['price'], 'new_price': p['price'],
                'change_pct': round(change_pct, 1), 'detected_at': now,
            })
        elif not old:
            new_changes.append({'type': 'new_product', 'company': p['company'], 'product': p['name'], 'detected_at': now})

    new_nos = {p['product_no'] for p in all_products if p.get('product_no')}
    new_names_set = {p['name'] for p in all_products}
    merged = all_products + [p for p in existing_products if p.get('product_no') not in new_nos and p.get('name') not in new_names_set]
    merged = merged[:10000]

    comp_map = defaultdict(lambda: {'products': [], 'prices': []})
    for p in merged:
        comp_map[p['company']]['products'].append(p)
        if p['price'] > 0: comp_map[p['company']]['prices'].append(p['price'])

    companies = []
    for name, data in comp_map.items():
        prices = data['prices']
        cats = list(set(p['category'] for p in data['products']))
        origins = [p.get('origin') for p in data['products']]
        companies.append({
            'name': name, 'product_count': len(data['products']),
            'categories': cats, 'avg_price': int(sum(prices)/len(prices)) if prices else 0,
            'min_price': min(prices) if prices else 0, 'max_price': max(prices) if prices else 0,
            'primary_origin': max(set(origins), key=origins.count) if origins else 'unknown',
            'last_updated': now,
        })
    companies.sort(key=lambda c: c['product_count'], reverse=True)

    r2_write('g2b-data/products.json', merged)
    r2_write('g2b-data/companies.json', companies)
    r2_write('g2b-data/changes.json', (new_changes + existing_changes)[:500])
    r2_write(f'g2b-data/snapshots/{date.today().isoformat()}.json', {'products': all_products, 'collected_at': now})
    print(f'G2B: 업체 {len(companies)}개, 제품 {len(merged)}개, 변동 {len(new_changes)}건')

# ─── 진입점 ─────────────────────────────────────────────────────
if __name__ == '__main__':
    import sys
    mode = sys.argv[1] if len(sys.argv) > 1 else 'all'

    if mode in ('all', 'danawa'):
        print('=== LED 제품 수집 (네이버 쇼핑) ===')
        collect()

    if mode in ('all', 'g2b'):
        print('\n=== 나라장터 수집 ===')
        collect_g2b()

    print('\n✅ 완료')
