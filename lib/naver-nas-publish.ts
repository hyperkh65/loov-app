/**
 * 네이버 블로그 발행 — NAS(가정용 IP) 경유 파이썬 스크립트 방식.
 * 네이버가 클라우드 IP를 차단하기 때문에 NAS에서 SEOne API(RabbitWrite.naver)를
 * 직접 호출한다. 브라우저 자동화가 필요 없어서 서버사이드 스케줄러에서도 쓸 수 있다.
 * (app/api/naver/publish/route.ts에서 분리 — 스케줄러 러너와 공유)
 */
import { nasExecWithStdin } from '@/lib/nas-ssh';

const NAS_SCRIPT_PATH = '/volume1/homes/urjent/naver_publish/post.py';

// Python script that runs on NAS (home IP) to bypass Naver's cloud IP block
// Uses SEOne API (RabbitWrite.naver) + blog.upphoto.naver.com for image upload
const NAVER_POST_SCRIPT = `#!/usr/bin/env python3
import sys, json, re, uuid, random, string, urllib.request, urllib.parse, urllib.error

DQ = chr(34)
SQ = chr(39)

data = json.loads(sys.stdin.read())
blog_id = data['blogId']
nid_aut = data['nidAut']
nid_ses = data['nidSes']
title = data['title']
content = data['content']
tags = data.get('tags', [])
category_no = int(data.get('categoryNo', 0) or 0)
is_publish = bool(data.get('isPublish', True))
upload_session_key = data.get('uploadSessionKey', '')
naver_user_id = data.get('naverUserId', '')
preloaded_images = data.get('preloadedImages', {})

BASE = 'https://blog.naver.com'
ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
HDR = {
    'Cookie': f'NID_AUT={nid_aut}; NID_SES={nid_ses}',
    'User-Agent': ua,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Referer': f'{BASE}/PostWriteForm.naver?blogId={blog_id}',
    'Origin': BASE,
    'X-Requested-With': 'XMLHttpRequest',
}

def se_id():
    return 'SE-' + str(uuid.uuid4())

def doc_id():
    c = string.ascii_uppercase + string.digits
    return '01' + ''.join(random.choices(c, k=24))

def strip_html(h):
    return re.sub('<[^>]+>', '', h)

def out(r):
    print(json.dumps(r, ensure_ascii=False))
    sys.exit(0)

img_errors = []
uploaded_images = []
_cached_session_key = None
_cached_se_token = None

def get_se_token():
    global _cached_se_token
    if _cached_se_token:
        return _cached_se_token
    try:
        url = f'{BASE}/PostWriteFormSeOptions.naver?blogId={blog_id}'
        req = urllib.request.Request(url, headers={
            'Cookie': f'NID_AUT={nid_aut}; NID_SES={nid_ses}',
            'User-Agent': ua,
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': f'{BASE}/PostWriteForm.naver?blogId={blog_id}',
            'Origin': BASE,
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            resp = json.loads(r.read().decode('utf-8', errors='replace'))
        token = (resp.get('result') or {}).get('token') or ''
        if token:
            _cached_se_token = token
        return token
    except Exception as e:
        img_errors.append('se_token:' + str(e)[:60])
        return None

def get_upload_session_key():
    global _cached_session_key
    if _cached_session_key:
        return _cached_session_key
    if not naver_user_id:
        return None
    try:
        se_token = get_se_token()
        if not se_token:
            img_errors.append('no_se_token')
            return None
        key_url = 'https://platform.editor.naver.com/api/blogpc001/v1/photo-uploader/session-key'
        key_req = urllib.request.Request(key_url, headers={
            'Cookie': f'NID_AUT={nid_aut}; NID_SES={nid_ses}',
            'User-Agent': ua,
            'Accept': 'application/json',
            'se-authorization': se_token,
            'Referer': f'{BASE}/PostWriteForm.naver?blogId={blog_id}',
            'Origin': BASE,
        })
        with urllib.request.urlopen(key_req, timeout=10) as r:
            resp = json.loads(r.read().decode('utf-8', errors='replace'))
        key = resp.get('sessionKey') or ''
        if key:
            _cached_session_key = key
        return key
    except Exception as e:
        img_errors.append('key:' + str(e)[:60])
        return None

def upload_image(img_url):
    if not naver_user_id:
        return None
    try:
        if img_url in preloaded_images:
            import base64 as _b64
            pre = preloaded_images[img_url]
            img_data = _b64.b64decode(pre['data'])
            ctype = pre.get('type', 'image/jpeg').split(';')[0].strip()
        else:
            dl_headers = {'User-Agent': ua}
            dl_req = urllib.request.Request(img_url, headers=dl_headers)
            with urllib.request.urlopen(dl_req, timeout=15) as r:
                img_data = r.read()
                ctype = r.headers.get('Content-Type', 'image/jpeg').split(';')[0].strip()
        if not img_data:
            return None
        session_key = get_upload_session_key()
        if not session_key:
            img_errors.append('no_session_key')
            return None
        ext_map = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp'}
        ext = ext_map.get(ctype, 'jpg')
        raw_name = img_url.split('/')[-1].split('?')[0]
        filename = re.sub('[^a-zA-Z0-9._-]', '_', raw_name) if raw_name else ('img.' + ext)
        if '.' not in filename:
            filename += '.' + ext
        up_url = f'https://blog.upphoto.naver.com/{session_key}/simpleUpload/0?userId={naver_user_id}&extractExif=false&extractAnimatedCnt=false&extractAnimatedInfo=false&autorotate=false&extractDominantColor=false'
        boundary = uuid.uuid4().hex
        body = (f'--{boundary}\\r\\nContent-Disposition: form-data; name="image"; filename="{filename}"\\r\\nContent-Type: {ctype}\\r\\n\\r\\n').encode() + img_data + f'\\r\\n--{boundary}--\\r\\n'.encode()
        up_req = urllib.request.Request(up_url, data=body, headers={
            'Content-Type': f'multipart/form-data; boundary={boundary}',
            'Cookie': f'NID_AUT={nid_aut}; NID_SES={nid_ses}',
            'User-Agent': ua,
            'Referer': f'{BASE}/PostWriteForm.naver?blogId={blog_id}',
            'Origin': BASE,
        }, method='POST')
        with urllib.request.urlopen(up_req, timeout=20) as r:
            resp = r.read().decode('utf-8', errors='replace')
        sys.stderr.write(f'[UP_RESP] {resp[:400]}\\n')
        url_m = re.search('<url>(.*?)</url>', resp)
        path_m = re.search('<path>(.*?)</path>', resp)
        w_m = re.search('<width>([0-9]+)</width>', resp)
        h_m = re.search('<height>([0-9]+)</height>', resp)
        if url_m:
            url_val = url_m.group(1)
            cdn_url = url_val if url_val.startswith('http') else 'https://blogfiles.pstatic.net' + url_val
            path_val = (path_m.group(1) if path_m else url_val).lstrip('/')
            w = int(w_m.group(1)) if w_m else 800
            h = int(h_m.group(1)) if h_m else 600
            return {'url': cdn_url, 'path': path_val, 'width': w, 'height': h, 'filename': filename}
        ec_m = re.search('<errorCode>(.*?)</errorCode>', resp)
        em_m = re.search('<errorMessage>(.*?)</errorMessage>', resp)
        ec_info = (ec_m.group(1) if ec_m else '') + '/' + (em_m.group(1) if em_m else '')
        img_errors.append('no_url:ec=' + ec_info + ':' + resp[:120])
        return None
    except Exception as e:
        img_errors.append('up:' + str(e)[:60])
        return None

represent_assigned = False

def make_image_component(src, alt=''):
    global represent_assigned
    info = None
    if not ('pstatic.net' in src or 'naver.com' in src or src.startswith('data:')):
        info = upload_image(src)
    if info:
        uploaded_images.append(info['url'])
        img_domain = info['url'].split('/')[2] if info['url'].startswith('http') else 'postfiles.pstatic.net'
        # represent=False가 모든 이미지에 고정돼 있으면 네이버가 대표이미지 후보를
        # 하나도 못 찾아 목록/공유 썸네일이 비게 된다(실사용 확인) — 이 글에서 처음
        # 업로드에 성공한 이미지 하나에만 True를 줘서 대표이미지로 지정되게 한다.
        is_represent = not represent_assigned
        # represent=True를 imageNode(text 컴포넌트 안에 중첩된 형태)에 줘도 화면엔 잘
        # 나오지만 네이버가 대표이미지로 인식을 못 했다(실사용 확인: og:image가 계속
        # 네이버 기본 아이콘으로만 나옴) — 대표이미지로 쓸 첫 이미지만 최상위
        # @ctype:"image" 컴포넌트로 올려야 네이버가 인식한다는 걸 확인해서 그 형태로
        # 분기. 나머지(대표 아닌) 이미지는 기존에 검증된 중첩 구조 그대로 유지.
        if is_represent:
            represent_assigned = True
            return {
                'id': se_id(), 'layout': 'default', '@ctype': 'image',
                'represent': True, 'contentMode': 'normal',
                'src': info['url'], 'path': info['path'], 'domain': img_domain,
                'width': info['width'], 'height': info['height'],
                'fileSize': 0, 'fileName': info['filename'],
                'internalResource': False, 'ai': False,
            }
        return {
            'id': se_id(), 'layout': 'default', '@ctype': 'text',
            'value': [{
                'id': se_id(), '@ctype': 'paragraph',
                'nodes': [{
                    'id': se_id(), '@ctype': 'imageNode',
                    'src': info['url'],
                    'path': info['path'],
                    'domain': img_domain,
                    'width': info['width'],
                    'height': info['height'],
                    'fileSize': 0,
                    'fileName': info['filename'],
                    'internalResource': False,
                    'represent': False,
                    'ai': False,
                }]
            }]
        }
    return None

def make_text_node(text):
    return {
        'id': se_id(),
        'nodes': [{
            'id': se_id(), 'value': text,
            'style': {'fontColor': '#000000', 'fontFamily': 'nanumbareunhipi',
                      'fontSizeCode': 'fs19', '@ctype': 'nodeStyle'},
            '@ctype': 'textNode',
        }],
        '@ctype': 'paragraph',
    }

def make_heading_component(text, level=2):
    font_size = 'fs24' if level == 2 else 'fs19'
    return {
        'id': se_id(), 'layout': 'default', '@ctype': 'text',
        'value': [{
            'id': se_id(), '@ctype': 'paragraph',
            'nodes': [{'id': se_id(), 'value': text, '@ctype': 'textNode',
                       'style': {'bold': True, 'fontFamily': 'nanumbareunhipi',
                                 'fontSizeCode': font_size, '@ctype': 'nodeStyle'}}],
        }],
    }

def html_to_components(body_html):
    components = []
    chunks = re.split('(<figure.*?</figure>|<h2[^>]*>.*?</h2>|<h3[^>]*>.*?</h3>)', body_html, flags=re.DOTALL | re.I)
    pending_texts = []

    def flush_texts():
        if not pending_texts:
            return
        paras = [t for t in pending_texts if t.strip()]
        for i, p in enumerate(paras):
            components.append({
                'id': se_id(), 'layout': 'default', '@ctype': 'text',
                'value': [make_text_node(p)],
            })
            if i < len(paras) - 1:
                components.append({
                    'id': se_id(), 'layout': 'default', '@ctype': 'text',
                    # 빈 문단을 nodes: [] 로 보내면 네이버가 documentModel 전체를
                    # 거부한다("parse fail") — 문단이 2개 이상 연속될 때마다 이
                    # 간격용 컴포넌트가 들어가서 긴 글은 사실상 항상 실패했다
                    # (2026-09-16 실측: 문단 1개면 성공, 2개 이상이면 무조건 실패).
                    # 값이 빈 텍스트 노드를 하나 넣어주면 정상 통과한다.
                    'value': [{'id': se_id(), '@ctype': 'paragraph', 'nodes': [{
                        'id': se_id(), 'value': '', '@ctype': 'textNode',
                        'style': {'fontColor': '#000000', 'fontFamily': 'nanumbareunhipi',
                                  'fontSizeCode': 'fs19', '@ctype': 'nodeStyle'},
                    }]}],
                })
        pending_texts.clear()

    for chunk in chunks:
        cl = chunk.lower()
        if cl.startswith('<figure'):
            img_m = re.search('src=[' + DQ + SQ + '](https?://[^' + DQ + SQ + ']+)[' + DQ + SQ + ']', chunk, re.I)
            alt_m = re.search('alt=[' + DQ + SQ + '](.*?)[' + DQ + SQ + ']', chunk, re.I)
            if img_m:
                flush_texts()
                img_comp = make_image_component(img_m.group(1), alt_m.group(1) if alt_m else '')
                if img_comp:
                    components.append(img_comp)
        elif cl.startswith('<h2'):
            flush_texts()
            text = strip_html(chunk).strip()
            if text:
                components.append(make_heading_component(text, level=2))
        elif cl.startswith('<h3'):
            flush_texts()
            text = strip_html(chunk).strip()
            if text:
                components.append(make_heading_component(text, level=3))
        else:
            img_parts = re.split('(<img[^>]+>)', chunk, flags=re.I)
            for part in img_parts:
                if re.match('<img', part, re.I):
                    img_m = re.search('src=[' + DQ + SQ + '](https?://[^' + DQ + SQ + ']+)[' + DQ + SQ + ']', part, re.I)
                    alt_m = re.search('alt=[' + DQ + SQ + '](.*?)[' + DQ + SQ + ']', part, re.I)
                    if img_m:
                        flush_texts()
                        img_comp = make_image_component(img_m.group(1), alt_m.group(1) if alt_m else '')
                        if img_comp:
                            components.append(img_comp)
                else:
                    for p in re.split('<(?:p|br|div)[^>]*>', part):
                        t = strip_html(p).strip()
                        if t:
                            pending_texts.append(t)

    flush_texts()
    return components

def build_doc(title_text, body_html):
    body_components = html_to_components(body_html)
    if not body_components:
        body_components = [{'id': se_id(), 'layout': 'default', '@ctype': 'text',
                            'value': [make_text_node('(내용 없음)')]}]
    return {'documentId': '', 'document': {
        'version': '2.10.2', 'theme': 'default', 'language': 'ko-KR', 'id': doc_id(),
        'components': [
            {'id': se_id(), 'layout': 'default', '@ctype': 'documentTitle',
             'title': [{'id': se_id(), '@ctype': 'paragraph', 'nodes': [{
                 'id': se_id(), 'value': title_text, '@ctype': 'textNode',
                 'style': {'fontFamily': 'nanumbareunhipi', '@ctype': 'nodeStyle'},
             }]}], 'subTitle': None, 'align': 'left'},
            *body_components,
        ],
    }}

extra_cookies = {}

def collect_set_cookies(r):
    for sc in (r.headers.get_all('set-cookie') or []):
        parts = sc.split(';')
        if parts:
            nv = parts[0].strip().split('=', 1)
            if len(nv) == 2:
                name = nv[0].strip()
                if name not in ('NID_AUT', 'NID_SES'):
                    extra_cookies[name] = nv[1].strip()

def make_write_cookie():
    parts = [f'NID_AUT={nid_aut}', f'NID_SES={nid_ses}']
    for k, v in extra_cookies.items():
        parts.append(f'{k}={v}')
    return '; '.join(parts)

# 세션 초기화: 쓰기 폼 방문으로 JSESSIONID 등 세션 쿠키 수집
try:
    _sr = urllib.request.Request(f'{BASE}/PostWriteForm.naver?blogId={blog_id}', headers=HDR)
    with urllib.request.urlopen(_sr, timeout=15) as _r:
        collect_set_cookies(_r)
except Exception:
    pass

def http_get_json(url):
    req = urllib.request.Request(url, headers=HDR)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            final_url = r.geturl()
            body = r.read().decode('utf-8', errors='replace')
            collect_set_cookies(r)
        if 'nid.naver.com' in final_url or 'nidlogin' in final_url or 'login' in final_url.lower():
            out({'error': 'NID_AUT/NID_SES 만료 — 쿠키 재발급 필요', 'errorCode': 'AUTH'})
        if body.strip().startswith('<') or '<!DOCTYPE' in body[:100]:
            out({'error': 'NID_AUT/NID_SES 만료 (HTML 응답) — 쿠키 재발급 필요', 'errorCode': 'AUTH'})
        return json.loads(body)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            out({'error': '인증 실패', 'errorCode': 'AUTH'})
        raise

def http_post_form(url, pairs):
    body = urllib.parse.urlencode(pairs).encode('utf-8')
    h = {**HDR, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Cookie': make_write_cookie()}
    req = urllib.request.Request(url, data=body, headers=h, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            collect_set_cookies(r)
            resp_body = r.read().decode('utf-8', errors='replace')
            status = r.status
        try:
            return json.loads(resp_body), status
        except Exception:
            return {'isSuccess': False, '_raw': resp_body[:200]}, status
    except urllib.error.HTTPError as e:
        return {'isSuccess': False, '_httpCode': e.code}, e.code

# 1. Get blog form configuration
try:
    mgr = http_get_json(f'{BASE}/PostWriteFormManagerOptions.naver?blogId={blog_id}')
    if not mgr.get('isSuccess'):
        out({'error': 'manager options: ' + str(mgr.get('result', ''))[:100], 'errorCode': 'CONFIG_ERROR'})
    fv = mgr['result']['formView']
    fv_keys = list(fv.keys())
    cfg = dict(fv['postConfiguration'])
    meta = dict(fv['postFormMeta'])
    clv = fv.get('categoryListFormView', {})
    default_category_id = clv.get('defaultCategoryId') or meta.get('categoryId') or 0
    if not default_category_id:
        cats = clv.get('categoryFormViewList', [])
        default_category_id = cats[0].get('categoryNo', 0) if cats else 0
except SystemExit:
    raise
except Exception as e:
    out({'error': f'config load fail: {e}', 'errorCode': 'CONFIG_ERROR'})

# 2. Apply settings
effective_category_id = category_no if category_no and category_no > 0 else default_category_id

# 3. Build SEOne document
dm = build_doc(title, content)
dm_str = json.dumps(dm, ensure_ascii=False)

# Build populationParams using Redux/D8 key names:
# 'configuration' (not postConfiguration), 'populationMeta' (not postFormMeta)
cfg_raw = dict(fv['postConfiguration'])
ccl_yn = cfg_raw.get('cclYn', False)
configuration = {k: v for k, v in cfg_raw.items() if k not in ('commercialUsesYn', 'contentsModification')}
if ccl_yn:
    configuration['commercialUsesYn'] = cfg_raw.get('commercialUsesYn')
    configuration['contentsModification'] = cfg_raw.get('contentsModification')
configuration['openType'] = 2 if is_publish else 1

pop_meta = dict(fv['postFormMeta'])
pop_meta['categoryId'] = effective_category_id
pop_meta['tags'] = ','.join(tags[:30]) if tags else pop_meta.get('tags')
pop_meta['logNo'] = None
pop_meta['prePostDate'] = None
if not pop_meta.get('themeSourceCode'):
    pop_meta.pop('themeSourceCode', None)
if not pop_meta.get('bookThemeInfoPk'):
    pop_meta.pop('bookThemeInfoPk', None)

media_resources = json.dumps({'image': [u.split('?')[0] for u in uploaded_images], 'video': [], 'file': []}, ensure_ascii=False)

# AutoSave populationParams includes editorSource
pop_params_autosave = {
    'configuration': configuration,
    'populationMeta': pop_meta,
    'editorSource': fv.get('editorSource', ''),
}
# Write populationParams (no editorSource)
pop_params_write = {
    'configuration': configuration,
    'populationMeta': pop_meta,
}

# 4. Auto-save (선택적)
auto_save_no = None
auto_save_dbg = 'skip'
try:
    sr, sr_status = http_post_form(f'{BASE}/RabbitAutoSaveWrite.naver', [
        ('blogId', blog_id),
        ('documentModel', dm_str),
        ('populationParams', json.dumps(pop_params_autosave, ensure_ascii=False)),
        ('mediaResources', media_resources),
        ('productApiVersion', 'v1'),
    ])
    if sr.get('isSuccess'):
        auto_save_no = (sr.get('result') or {}).get('autoSaveNo')
        auto_save_dbg = f'ok({auto_save_no})'
    else:
        auto_save_dbg = f'fail({str(sr)[:80]})'
except Exception as e:
    auto_save_dbg = f'exc({str(e)[:50]})'

# 5. Publish via RabbitWrite
img_comps = [c for c in dm['document']['components'] if c.get('@ctype') == 'image']
sys.stderr.write(f'[IMG_COMP] {json.dumps(img_comps, ensure_ascii=False)[:600]}\\n')
sys.stderr.write(f'[MEDIA] {media_resources[:300]}\\n')
sys.stderr.write(f'[WR_REQ] dm={dm_str[:300]} media={media_resources[:200]}\\n')
wr, status = http_post_form(f'{BASE}/RabbitWrite.naver', [
    ('blogId', blog_id),
    ('documentModel', dm_str),
    ('populationParams', json.dumps(pop_params_write, ensure_ascii=False)),
    ('mediaResources', media_resources),
    ('productApiVersion', 'v1'),
])
sys.stderr.write(f'[WR_RESP] status={status} wr={str(wr)[:400]}\\n')

if status in (401, 403):
    out({'error': '인증 실패 — 쿠키 재발급 필요', 'errorCode': 'AUTH'})

if wr.get('isSuccess'):
    result_r = wr.get('result', {})
    log_no = str(result_r.get('logNo', '')) if isinstance(result_r, dict) else ''
    if not log_no:
        redirect = result_r.get('redirectUrl', '') if isinstance(result_r, dict) else ''
        m2 = re.search('logNo=([0-9]+)', redirect)
        log_no = m2.group(1) if m2 else ''
    out({'postId': log_no, 'postUrl': f'https://blog.naver.com/{blog_id}/{log_no}', 'imgErrors': img_errors})

result_val = wr.get('result', {})
ec = result_val.get('errorCode', 'UNKNOWN') if isinstance(result_val, dict) else str(result_val)
if ec in ('LOGIN', 'AUTH', 'auth'):
    out({'error': '인증 실패 — 쿠키 재발급 필요', 'errorCode': 'AUTH'})

out({'error': f'ec={ec} as={auto_save_dbg} raw={str(wr)[:400]}', 'errorCode': ec, 'imgErrors': img_errors})
`;

async function ensureNasScript(): Promise<void> {
  try {
    await nasExecWithStdin(
      `mkdir -p $(dirname ${NAS_SCRIPT_PATH}) && cat > ${NAS_SCRIPT_PATH} && chmod +x ${NAS_SCRIPT_PATH}`,
      NAVER_POST_SCRIPT,
    );
  } catch { /* ignore */ }
}

async function preloadImages(html: string): Promise<Record<string, { data: string; type: string }>> {
  const imgUrls = [...html.matchAll(/src=["'](https?:\/\/[^"']+)["']/gi)].map(m => m[1]);
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36';
  const result: Record<string, { data: string; type: string }> = {};
  await Promise.all(imgUrls.map(async (url) => {
    try {
      const headers: Record<string, string> = { 'User-Agent': ua };
      if (url.includes('pixabay.com')) headers['Referer'] = 'https://pixabay.com/';
      else if (url.includes('pexels.com')) headers['Referer'] = 'https://www.pexels.com/';
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      const type = (res.headers.get('Content-Type') || 'image/jpeg').split(';')[0].trim();
      result[url] = { data: Buffer.from(buf).toString('base64'), type };
    } catch { /* skip */ }
  }));
  return result;
}

export async function postViaNas(params: {
  blogId: string; nidAut: string; nidSes: string;
  title: string; content: string; tags: string[];
  categoryNo: number; isPublish: boolean;
  uploadSessionKey?: string; naverUserId?: string;
}): Promise<{ postId?: string; postUrl?: string; error?: string; errorCode?: string; imgErrors?: string[]; _debug?: string }> {
  try {
    await ensureNasScript();
    const preloadedImages = await preloadImages(params.content);
    const result = await nasExecWithStdin(
      `python3 ${NAS_SCRIPT_PATH}`,
      JSON.stringify({ ...params, preloadedImages }),
    );
    if (result.code !== 0 && !result.stdout) {
      return { error: `NAS 스크립트 오류: ${result.stderr}`, errorCode: 'UNKNOWN' };
    }
    const line = result.stdout.trim().split('\n').pop() || '{}';
    const parsed = JSON.parse(line);
    if (result.stderr) {
      parsed._debug = result.stderr.slice(-1200);
    }
    return parsed;
  } catch (e) {
    return { error: `NAS SSH 오류: ${String(e)}`, errorCode: 'UNKNOWN' };
  }
}
