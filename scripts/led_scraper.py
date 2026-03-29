#!/usr/bin/env python3
"""
다나와 LED 제품 스크래퍼 → Cloudflare R2 저장
환경변수: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, GEMINI_API_KEY (선택)
"""
import os, json, re, time, uuid, boto3, requests
from datetime import datetime
from botocore.config import Config

# R2 설정
R2_ACCOUNT_ID   = os.environ['R2_ACCOUNT_ID']
R2_ACCESS_KEY   = os.environ['R2_ACCESS_KEY_ID']
R2_SECRET_KEY   = os.environ['R2_SECRET_ACCESS_KEY']
R2_BUCKET       = os.environ.get('R2_BUCKET', 'loov-storage')
GEMINI_KEY      = os.environ.get('GEMINI_API_KEY', '')

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
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    'Referer': 'https://www.danawa.com/',
}

CATEGORIES = [
    ('LED 전구',    'LED 전구'),
    ('LED 등기구',  'LED 등기구'),
    ('LED 투광기',  'LED 투광기'),
    ('LED 다운라이트', 'LED 다운라이트'),
    ('LED 가로등',  'LED 가로등'),
    ('LED 조명',    'LED 조명'),
]

def scrape_danawa(query: str, category: str, max_page: int = 5) -> list:
    products = []
    for page in range(1, max_page + 1):
        url = (
            f'https://search.danawa.com/dsearch.php'
            f'?query={requests.utils.quote(query)}'
            f'&tab=goods&page={page}&limit=30&sort=saveDESC'
        )
        try:
            r = requests.get(url, headers=HEADERS, timeout=15)
            if r.status_code != 200:
                break
            html = r.text

            # 상품 블록 추출
            blocks = re.findall(
                r'<li[^>]+class="[^"]*prod-item[^"]*"[^>]*>([\s\S]*?)</li>',
                html
            )
            if not blocks:
                # 다른 패턴 시도
                blocks = re.findall(
                    r'class="main-prodlist-item"[^>]*>([\s\S]*?)</li>',
                    html
                )

            found = 0
            for block in blocks:
                # 상품명
                name_m = re.search(r'class="[^"]*prod-name[^"]*"[^>]*>.*?<a[^>]*>([^<]+)</a>', block, re.S)
                if not name_m:
                    name_m = re.search(r'title="([^"]{5,80})"', block)
                if not name_m:
                    continue
                name = name_m.group(1).strip()

                # 가격
                price_m = re.search(r'([\d,]{4,})\s*원', block)
                price = int(price_m.group(1).replace(',', '')) if price_m else 0

                # 제조사
                maker_m = re.search(r'class="[^"]*maker[^"]*"[^>]*>.*?<a[^>]*>([^<]+)</a>', block, re.S)
                if not maker_m:
                    maker_m = re.search(r'class="[^"]*brand[^"]*"[^>]*>([^<]+)<', block)
                maker = maker_m.group(1).strip() if maker_m else '기타'

                # 이미지
                img_m = re.search(r'<img[^>]+src="(https?://[^"]+\.(?:jpg|png|webp)[^"]*)"', block, re.I)
                image_url = img_m.group(1) if img_m else ''

                # 상품 URL
                url_m = re.search(r'href="(https?://prod\.danawa\.com[^"]+)"', block)
                product_url = url_m.group(1) if url_m else ''

                if len(name) < 3:
                    continue

                products.append({
                    'id': f'danawa_{uuid.uuid4().hex[:8]}',
                    'name': name,
                    'price': price,
                    'maker': maker,
                    'category': category,
                    'image_url': image_url,
                    'product_url': product_url,
                    'collected_at': datetime.utcnow().isoformat() + 'Z',
                })
                found += 1

            print(f'  [{category}] 페이지 {page}: {found}개')
            if found == 0:
                break
            time.sleep(1.0)
        except Exception as e:
            print(f'  오류: {e}')
            break

    return products


def scrape_with_gemini(query: str, category: str) -> list:
    """Gemini AI로 HTML 파싱"""
    url = f'https://search.danawa.com/dsearch.php?query={requests.utils.quote(query)}&tab=goods&limit=30'
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            return []
        html = r.text[:12000]
    except:
        return []

    prompt = f"""다음 HTML에서 LED 조명 상품 목록을 JSON 배열로 추출하세요. 최대 30개.
각 항목 형식: {{"name":"상품명","price":숫자,"maker":"제조사","image_url":"이미지URL","product_url":"상품URL"}}
가격은 원 단위 정수. 상품명 없는 항목 제외.
HTML:\n{html}\nJSON 배열만 반환:"""

    api_url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_KEY}'
    try:
        res = requests.post(api_url, json={
            'contents': [{'parts': [{'text': prompt}]}],
            'generationConfig': {'temperature': 0.1, 'maxOutputTokens': 8192}
        }, timeout=60)
        text = res.json()['candidates'][0]['content']['parts'][0]['text']
        m = re.search(r'\[[\s\S]*\]', text)
        if not m:
            return []
        items = json.loads(m.group(0))
        return [{
            'id': f'danawa_{uuid.uuid4().hex[:8]}',
            'name': it.get('name', ''),
            'price': int(it.get('price', 0)),
            'maker': it.get('maker', '기타'),
            'category': category,
            'image_url': it.get('image_url', ''),
            'product_url': it.get('product_url', ''),
            'collected_at': datetime.utcnow().isoformat() + 'Z',
        } for it in items if it.get('name')]
    except Exception as e:
        print(f'  Gemini 오류: {e}')
        return []


def load_existing() -> list:
    try:
        obj = s3.get_object(Bucket=R2_BUCKET, Key='led-data/products.json')
        return json.loads(obj['Body'].read().decode())
    except:
        return []


def save_to_r2(products: list, report: dict):
    s3.put_object(
        Bucket=R2_BUCKET, Key='led-data/products.json',
        Body=json.dumps(products, ensure_ascii=False).encode(),
        ContentType='application/json',
    )
    s3.put_object(
        Bucket=R2_BUCKET, Key='led-data/report.json',
        Body=json.dumps(report, ensure_ascii=False).encode(),
        ContentType='application/json',
    )
    print(f'R2 저장 완료: {len(products)}개 제품')


def main():
    all_new = []
    for query, category in CATEGORIES:
        print(f'\n[{category}] 수집 시작...')
        if GEMINI_KEY:
            items = scrape_with_gemini(query, category)
            print(f'  Gemini 파싱: {len(items)}개')
            if len(items) < 5:
                # fallback to regex
                items = scrape_danawa(query, category)
        else:
            items = scrape_danawa(query, category)
        all_new.extend(items)
        time.sleep(2)

    print(f'\n신규 수집: {len(all_new)}개')

    # 기존 데이터와 병합
    existing = load_existing()
    existing_names = {p['name'] for p in all_new}
    merged = all_new + [p for p in existing if p['name'] not in existing_names]
    merged = merged[:5000]

    report = {
        'generated_at': datetime.utcnow().isoformat() + 'Z',
        'total_count': len(merged),
        'newly_collected': len(all_new),
        'categories': list({p['category'] for p in all_new}),
        'ai_commentary': (
            f'총 {len(merged)}개 LED 제품 데이터 수집 완료. '
            f'신규 {len(all_new)}개 추가. '
            f'카테고리: {", ".join(set(p["category"] for p in all_new))}.'
        ) if all_new else '데이터 수집에 실패했습니다.',
    }

    save_to_r2(merged, report)
    print(f'완료: 총 {len(merged)}개')


if __name__ == '__main__':
    main()
