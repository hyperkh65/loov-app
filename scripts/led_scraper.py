#!/usr/bin/env python3
"""
LED 데이터 수집기
1. 다나와 LED 제품 → R2: led-data/products.json
2. 나라장터 LED 업체/제품 → R2: g2b-data/companies.json, products.json, changes.json
"""
import os, json, re, time, uuid, boto3, requests
from datetime import datetime, date
from collections import defaultdict
from botocore.config import Config

R2_ACCOUNT_ID = os.environ['R2_ACCOUNT_ID']
R2_ACCESS_KEY  = os.environ['R2_ACCESS_KEY_ID']
R2_SECRET_KEY  = os.environ['R2_SECRET_ACCESS_KEY']
R2_BUCKET      = os.environ.get('R2_BUCKET', 'loov-storage')
GEMINI_KEY     = os.environ.get('GEMINI_API_KEY', '')
G2B_API_KEY    = os.environ.get('DATA_GO_KR_SERVICE_KEY', '')

s3 = boto3.client(
    's3',
    endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    config=Config(signature_version='s3v4'),
    region_name='auto',
)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Referer': 'https://www.g2b.go.kr/',
}

LED_KEYWORDS = ['LED 전구', 'LED 등기구', 'LED 투광기', 'LED 다운라이트', 'LED 가로등', 'LED 조명', 'LED 형광등', 'LED 패널']

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
        Body=json.dumps(data, ensure_ascii=False).encode(),
        ContentType='application/json',
    )

# ─── 나라장터 쇼핑 ──────────────────────────────────────────────

def fetch_g2b_api(keyword, page=1):
    """나라장터 쇼핑 공공데이터 API"""
    url = 'http://apis.data.go.kr/1230000/naraShopInfoService/getProductInfoServc'
    params = {
        'serviceKey': G2B_API_KEY,
        'pageNo': page,
        'numOfRows': 100,
        'searchNm': keyword,
        'type': 'json',
    }
    try:
        r = requests.get(url, params=params, timeout=15)
        if r.status_code != 200:
            return []
        data = r.json()
        items = data.get('response', {}).get('body', {}).get('items', {}).get('item', [])
        if isinstance(items, dict):
            items = [items]
        return items
    except Exception as e:
        print(f'  G2B API 오류: {e}')
        return []

def scrape_g2b_web(keyword):
    """나라장터 쇼핑 웹 스크래핑 (API 키 없을 때)"""
    products = []
    for page in range(1, 4):
        url = (
            f'https://shopping.g2b.go.kr/sp/na/naby/sp-nabypbblList.do'
            f'?searchQuery={requests.utils.quote(keyword)}&pageIndex={page}'
        )
        try:
            r = requests.get(url, headers=HEADERS, timeout=15)
            if r.status_code != 200:
                break
            html = r.text

            # 상품 블록 파싱
            blocks = re.findall(r'class="item_cont"([\s\S]*?)(?=class="item_cont"|</ul>)', html)
            found = 0
            for block in blocks:
                name_m = re.search(r'class="item_name"[^>]*>([^<]+)', block)
                price_m = re.search(r'([\d,]{3,})\s*원', block)
                comp_m  = re.search(r'class="[^"]*comp[^"]*"[^>]*>([^<]+)', block)
                no_m    = re.search(r'상품번호[^\d]*([\d]+)', block)

                if not name_m:
                    continue
                products.append({
                    'name': name_m.group(1).strip(),
                    'price': int(price_m.group(1).replace(',','')) if price_m else 0,
                    'company': comp_m.group(1).strip() if comp_m else '미상',
                    'product_no': no_m.group(1) if no_m else '',
                })
                found += 1

            if found == 0:
                break
            time.sleep(0.8)
        except Exception as e:
            print(f'  G2B 웹 스크래핑 오류: {e}')
            break

    return products

def scrape_g2b_with_gemini(keyword):
    """Gemini AI로 나라장터 파싱"""
    url = f'https://shopping.g2b.go.kr/sp/na/naby/sp-nabypbblList.do?searchQuery={requests.utils.quote(keyword)}'
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            return []
        html = r.text[:10000]
    except:
        return []

    prompt = f"""다음 나라장터 쇼핑 HTML에서 LED 제품 목록을 추출하세요. 최대 30개.
형식: [{{"name":"제품명","price":가격숫자,"company":"업체명","product_no":"제품번호","category":"LED카테고리"}}]
HTML:\n{html}\nJSON 배열만 반환:"""

    try:
        res = requests.post(
            f'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_KEY}',
            json={'contents': [{'parts': [{'text': prompt}]}], 'generationConfig': {'temperature': 0.1, 'maxOutputTokens': 4096}},
            timeout=60
        )
        text = res.json()['candidates'][0]['content']['parts'][0]['text']
        m = re.search(r'\[[\s\S]*\]', text)
        return json.loads(m.group(0)) if m else []
    except Exception as e:
        print(f'  Gemini 오류: {e}')
        return []

def collect_g2b():
    """나라장터 전체 수집 → 업체/제품/변동 분석"""
    all_products = []
    now = datetime.utcnow().isoformat() + 'Z'

    for keyword in LED_KEYWORDS:
        print(f'\n[G2B] {keyword} 수집...')
        raw = []

        if G2B_API_KEY:
            raw = fetch_g2b_api(keyword)
            print(f'  API: {len(raw)}개')
        if not raw and GEMINI_KEY:
            raw = scrape_g2b_with_gemini(keyword)
            print(f'  Gemini: {len(raw)}개')
        if not raw:
            raw = scrape_g2b_web(keyword)
            print(f'  Web: {len(raw)}개')

        for item in raw:
            # API 응답 필드 정규화
            name    = item.get('name') or item.get('prdctNm') or item.get('품목명') or ''
            price   = item.get('price') or item.get('unitPrice') or item.get('단가') or 0
            company = item.get('company') or item.get('bizName') or item.get('업체명') or '미상'
            prod_no = item.get('product_no') or item.get('prdctNo') or ''
            cat     = item.get('category') or keyword

            if not name or len(name) < 2:
                continue
            try:
                price = int(str(price).replace(',','').replace('원','').strip())
            except:
                price = 0

            all_products.append({
                'id': f'g2b_{uuid.uuid4().hex[:8]}',
                'name': name,
                'price': price,
                'company': company,
                'product_no': prod_no,
                'category': cat,
                'collected_at': now,
            })

        time.sleep(1.5)

    print(f'\n나라장터 신규 수집: {len(all_products)}개')

    # 기존 제품 로드
    existing_products = r2_read('g2b-data/products.json') or []
    existing_changes  = r2_read('g2b-data/changes.json') or []

    # 변동 감지 (제품번호 기준)
    existing_map = {p['product_no']: p for p in existing_products if p.get('product_no')}
    new_changes = []

    for p in all_products:
        pno = p.get('product_no')
        if not pno:
            continue
        old = existing_map.get(pno)
        if old:
            # 가격 변동
            if old['price'] and p['price'] and old['price'] != p['price']:
                change_pct = (p['price'] - old['price']) / old['price'] * 100
                new_changes.append({
                    'type': 'price_change',
                    'company': p['company'],
                    'product': p['name'],
                    'old_price': old['price'],
                    'new_price': p['price'],
                    'change_pct': round(change_pct, 1),
                    'detected_at': now,
                })
                print(f'  가격변동: {p["name"]} {old["price"]:,}→{p["price"]:,} ({change_pct:+.1f}%)')
            # 카테고리 변동
            if old.get('category') != p.get('category') and old.get('category'):
                new_changes.append({
                    'type': 'category_change',
                    'company': p['company'],
                    'product': p['name'],
                    'old_category': old['category'],
                    'new_category': p['category'],
                    'detected_at': now,
                })
        else:
            # 신규 등록
            new_changes.append({
                'type': 'new_product',
                'company': p['company'],
                'product': p['name'],
                'detected_at': now,
            })

    # 삭제된 제품 감지
    if existing_products:
        new_nos = {p['product_no'] for p in all_products if p.get('product_no')}
        for old in existing_products:
            if old.get('product_no') and old['product_no'] not in new_nos:
                new_changes.append({
                    'type': 'removed_product',
                    'company': old['company'],
                    'product': old['name'],
                    'detected_at': now,
                })

    # 제품 병합 (신규 + 기존 중 새 수집에 없는 것)
    new_nos = {p['product_no'] for p in all_products if p.get('product_no')}
    new_names = {p['name'] for p in all_products}
    merged_products = all_products + [
        p for p in existing_products
        if p.get('product_no') not in new_nos and p.get('name') not in new_names
    ]
    merged_products = merged_products[:5000]

    # 업체별 집계
    comp_map = defaultdict(lambda: {'products': [], 'prices': []})
    for p in merged_products:
        c = p['company']
        comp_map[c]['products'].append(p)
        if p['price'] > 0:
            comp_map[c]['prices'].append(p['price'])

    companies = []
    for name, data in comp_map.items():
        prices = data['prices']
        cats = list(set(p['category'] for p in data['products']))
        companies.append({
            'name': name,
            'product_count': len(data['products']),
            'categories': cats,
            'avg_price': int(sum(prices)/len(prices)) if prices else 0,
            'min_price': min(prices) if prices else 0,
            'max_price': max(prices) if prices else 0,
            'last_updated': now,
        })
    companies.sort(key=lambda c: c['product_count'], reverse=True)

    # 변동 이력 업데이트 (최근 500건)
    all_changes = new_changes + existing_changes
    all_changes = all_changes[:500]

    # 스냅샷 저장
    snapshot_key = f'g2b-data/snapshots/{date.today().isoformat()}.json'
    r2_write(snapshot_key, {'products': all_products, 'collected_at': now})

    # 저장
    r2_write('g2b-data/products.json', merged_products)
    r2_write('g2b-data/companies.json', companies)
    r2_write('g2b-data/changes.json', all_changes)

    print(f'G2B 저장 완료: 업체 {len(companies)}개, 제품 {len(merged_products)}개, 변동 {len(new_changes)}건')
    return len(all_products), len(companies)

# ─── 다나와 수집 ────────────────────────────────────────────────

LED_SEARCH_QUERIES = [
    ('LED 전구', 'LED 전구'),
    ('LED 등기구', 'LED 등기구'),
    ('LED 투광기', 'LED 투광기'),
    ('LED 다운라이트', 'LED 다운라이트'),
    ('LED 가로등', 'LED 가로등'),
    ('LED 조명', 'LED 조명'),
]

NAVER_CLIENT_ID     = os.environ.get('NAVER_CLIENT_ID', '')
NAVER_CLIENT_SECRET = os.environ.get('NAVER_CLIENT_SECRET', '')

def fetch_naver_shopping_api(query, category, display=100):
    """네이버 쇼핑 공식 API (키 있을 때)"""
    url = 'https://openapi.naver.com/v1/search/shop.json'
    headers = {
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
    }
    products = []
    for start in range(1, 201, 100):
        try:
            r = requests.get(url, headers=headers,
                params={'query': query, 'display': display, 'start': start, 'sort': 'sim'},
                timeout=15)
            if r.status_code != 200:
                break
            items = r.json().get('items', [])
            for it in items:
                name = re.sub(r'<[^>]+>', '', it.get('title', ''))
                products.append({
                    'id': f'naver_{uuid.uuid4().hex[:8]}',
                    'name': name.strip(),
                    'price': int(it.get('lprice', 0)),
                    'maker': it.get('maker') or it.get('brand') or '기타',
                    'category': category,
                    'image_url': it.get('image', ''),
                    'product_url': it.get('link', ''),
                    'collected_at': datetime.utcnow().isoformat() + 'Z',
                })
            if len(items) < display:
                break
        except Exception as e:
            print(f'  네이버 API 오류: {e}')
            break
    return products

def fetch_naver_shopping_search(query, category):
    """네이버 쇼핑 검색 JSON (키 불필요)"""
    products = []
    for page_idx in range(1, 4):
        url = (
            'https://search.shopping.naver.com/api/search'
            f'?query={requests.utils.quote(query)}'
            f'&sort=rel&pagingIndex={page_idx}&pagingSize=40&viewType=list'
        )
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
            'Referer': 'https://search.shopping.naver.com/',
            'Accept': 'application/json',
        }
        try:
            r = requests.get(url, headers=headers, timeout=15)
            if r.status_code != 200:
                print(f'  네이버 검색 HTTP {r.status_code}')
                break
            data = r.json()
            items = data.get('shoppingResult', {}).get('products', [])
            if not items:
                items = data.get('products', [])
            found = 0
            for it in items:
                name = it.get('productName') or it.get('name') or ''
                if not name or 'LED' not in name.upper() and 'led' not in name.lower() and '조명' not in name:
                    continue
                products.append({
                    'id': f'naver_{uuid.uuid4().hex[:8]}',
                    'name': name.strip(),
                    'price': int(it.get('price') or it.get('lowPrice') or 0),
                    'maker': it.get('brand') or it.get('maker') or '기타',
                    'category': category,
                    'image_url': it.get('imageUrl') or it.get('image') or '',
                    'product_url': it.get('mallProductUrl') or '',
                    'collected_at': datetime.utcnow().isoformat() + 'Z',
                })
                found += 1
            print(f'  페이지 {page_idx}: {found}개')
            if found == 0:
                break
            time.sleep(0.8)
        except Exception as e:
            print(f'  네이버 검색 오류: {e}')
            break
    return products

def collect_danawa():
    """네이버 쇼핑에서 LED 제품 수집 (다나와 대체)"""
    all_new = []
    for query, category in LED_SEARCH_QUERIES:
        print(f'\n[네이버쇼핑] {category}...')

        # 1순위: 공식 API
        if NAVER_CLIENT_ID and NAVER_CLIENT_SECRET:
            items = fetch_naver_shopping_api(query, category)
            print(f'  API: {len(items)}개')
        else:
            items = []

        # 2순위: 검색 JSON
        if not items:
            items = fetch_naver_shopping_search(query, category)

        # 3순위: Gemini + 네이버 HTML
        if not items and GEMINI_KEY:
            try:
                r = requests.get(
                    f'https://search.shopping.naver.com/search/all?query={requests.utils.quote(query)}',
                    headers={'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ko-KR'},
                    timeout=15
                )
                html = r.text[:12000]
                prompt = (
                    f'다음 HTML에서 LED 조명 상품 목록을 추출하세요. 최대 30개.\n'
                    f'형식: [{{"name":"","price":0,"maker":"","image_url":"","category":"{category}"}}]\n'
                    f'HTML:\n{html}\nJSON 배열만:'
                )
                res = requests.post(
                    f'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_KEY}',
                    json={'contents': [{'parts': [{'text': prompt}]}], 'generationConfig': {'temperature': 0.1}},
                    timeout=60
                )
                text = res.json()['candidates'][0]['content']['parts'][0]['text']
                m = re.search(r'\[[\s\S]*?\]', text)
                if m:
                    raw = json.loads(m.group(0))
                    items = [{'id': f'naver_{uuid.uuid4().hex[:8]}', 'product_url': '', 'collected_at': datetime.utcnow().isoformat()+'Z', **x} for x in raw if x.get('name')]
                    print(f'  Gemini: {len(items)}개')
            except Exception as e:
                print(f'  Gemini 오류: {e}')

        print(f'  합계: {len(items)}개')
        all_new.extend(items)
        time.sleep(1.5)

    existing = r2_read('led-data/products.json') or []
    new_names = {p['name'] for p in all_new}
    merged = all_new + [p for p in existing if p['name'] not in new_names]
    merged = merged[:5000]

    report = {
        'generated_at': datetime.utcnow().isoformat()+'Z',
        'total_count': len(merged),
        'newly_collected': len(all_new),
        'ai_commentary': (
            f'총 {len(merged)}개 LED 제품 데이터 수집 완료 (네이버쇼핑). 신규 {len(all_new)}개 추가.'
            if all_new else '수집 실패. 네이버 쇼핑 API 키 설정을 확인하세요.'
        ),
    }
    r2_write('led-data/products.json', merged)
    r2_write('led-data/report.json', report)
    print(f'저장 완료: {len(merged)}개')
    return len(all_new)

# ─── 메인 ───────────────────────────────────────────────────────

if __name__ == '__main__':
    import sys
    mode = sys.argv[1] if len(sys.argv) > 1 else 'all'

    if mode in ('all', 'danawa'):
        print('=== 다나와 수집 ===')
        n = collect_danawa()
        print(f'다나와 완료: {n}개 신규')

    if mode in ('all', 'g2b'):
        print('\n=== 나라장터 수집 ===')
        n_prod, n_comp = collect_g2b()
        print(f'나라장터 완료: 제품 {n_prod}개, 업체 {n_comp}개')

    print('\n모든 수집 완료!')
