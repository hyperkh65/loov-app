import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { nasExecWithStdin } from '@/lib/nas-ssh';

const SCRIPT = `#!/usr/bin/env python3
import sys, json, re, uuid, urllib.request, urllib.parse

data = json.loads(sys.stdin.read())
blog_id = data['blogId']
nid_aut = data['nidAut']
nid_ses = data['nidSes']
naver_user_id = data['naverUserId']

BASE = 'https://blog.naver.com'
ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36'
HDR = {
    'Cookie': f'NID_AUT={nid_aut}; NID_SES={nid_ses}',
    'User-Agent': ua,
    'Accept': 'application/json, text/plain, */*',
    'Referer': f'{BASE}/PostWriteForm.naver?blogId={blog_id}',
    'Origin': BASE,
    'X-Requested-With': 'XMLHttpRequest',
}

def se_id():
    return 'SE-' + str(uuid.uuid4())

import string, random
def doc_id():
    c = string.ascii_uppercase + string.digits
    return '01' + ''.join(random.choices(c, k=24))

result = {}

# Step 1: Upload a test image
try:
    key_url = f'https://section.blog.naver.com/api/blogs/{naver_user_id}/photo-infra-profile-session-key'
    kr = urllib.request.Request(key_url, headers={**HDR, 'Accept': 'application/json'})
    with urllib.request.urlopen(kr, timeout=10) as r:
        session_key = json.load(r).get('result', '')

    req = urllib.request.Request('https://picsum.photos/400/300.jpg', headers={'User-Agent': ua})
    with urllib.request.urlopen(req, timeout=15) as r:
        img_data = r.read()

    boundary = uuid.uuid4().hex
    body = (f'--{boundary}\\r\\nContent-Disposition: form-data; name="image"; filename="dbg.jpg"\\r\\nContent-Type: image/jpeg\\r\\n\\r\\n').encode() + img_data + f'\\r\\n--{boundary}--\\r\\n'.encode()
    up_url = f'https://blog.upphoto.naver.com/{session_key}/simpleUpload/0?userId={naver_user_id}&extractExif=false&extractAnimatedCnt=false&extractAnimatedInfo=false&autorotate=false&extractDominantColor=false'
    up_req = urllib.request.Request(up_url, data=body, headers={
        'Content-Type': f'multipart/form-data; boundary={boundary}',
        'Cookie': f'NID_AUT={nid_aut}; NID_SES={nid_ses}',
        'User-Agent': ua, 'Referer': f'{BASE}/PostWriteForm.naver?blogId={blog_id}', 'Origin': BASE,
    }, method='POST')
    with urllib.request.urlopen(up_req, timeout=20) as r:
        up_resp = r.read().decode('utf-8', errors='replace')

    url_m = re.search('<url>(.*?)</url>', up_resp)
    path_m = re.search('<path>(.*?)</path>', up_resp)
    w_m = re.search('<width>([0-9]+)</width>', up_resp)
    h_m = re.search('<height>([0-9]+)</height>', up_resp)

    url_val = url_m.group(1) if url_m else ''
    path_val = path_m.group(1) if path_m else ''
    cdn_url = 'https://postfiles.pstatic.net' + url_val
    W = int(w_m.group(1)) if w_m else 400
    H = int(h_m.group(1)) if h_m else 300
    result['upload_ok'] = bool(url_val)
    result['url_val'] = url_val
    result['path_val'] = path_val
    result['cdn_url'] = cdn_url[:80]
except Exception as e:
    result['upload_error'] = str(e)[:100]
    print(json.dumps(result)); sys.exit(0)

# Step 2: Get blog config for populationParams
try:
    mgr_url = f'{BASE}/PostWriteFormManagerOptions.naver?blogId={blog_id}'
    mgr_req = urllib.request.Request(mgr_url, headers=HDR)
    with urllib.request.urlopen(mgr_req, timeout=15) as r:
        mgr = json.loads(r.read().decode('utf-8', errors='replace'))
    fv = mgr['result']['formView']
    cfg_raw = dict(fv['postConfiguration'])
    cfg_raw['openType'] = 1
    pop_meta = dict(fv['postFormMeta'])
    pop_meta['logNo'] = None
    pop_meta['prePostDate'] = None
    pop_meta.pop('themeSourceCode', None)
    pop_meta.pop('bookThemeInfoPk', None)
    pop_params = json.dumps({
        'configuration': cfg_raw,
        'populationMeta': pop_meta,
        'editorSource': fv.get('editorSource', ''),
    }, ensure_ascii=False)
except Exception as e:
    result['config_error'] = str(e)[:100]
    print(json.dumps(result)); sys.exit(0)

# Step 3: Test 4 different image component structures
unit_id = se_id()
structures = {
    'A_linkinfo_obj_caption_obj': {
        'id': unit_id, '@ctype': 'imageUnit',
        'src': cdn_url, 'path': path_val.lstrip('/'),
        'width': W, 'height': H, 'originalWidth': W, 'originalHeight': H,
        'fileName': 'dbg.jpg', 'imageType': 'JPEG',
        'linkInfo': {'linkUse': False, 'linkUrl': ''},
        'caption': {'hidden': True, 'value': [{'id': se_id(), '@ctype': 'paragraph', 'nodes': [{'id': se_id(), '@ctype': 'textNode', 'value': ''}]}]},
    },
    'B_both_null': {
        'id': unit_id, '@ctype': 'imageUnit',
        'src': cdn_url, 'path': path_val.lstrip('/'),
        'width': W, 'height': H, 'originalWidth': W, 'originalHeight': H,
        'fileName': 'dbg.jpg', 'imageType': 'JPEG',
        'linkInfo': None, 'caption': None,
    },
    'C_no_optional': {
        'id': unit_id, '@ctype': 'imageUnit',
        'src': cdn_url, 'path': path_val.lstrip('/'),
        'width': W, 'height': H, 'originalWidth': W, 'originalHeight': H,
        'fileName': 'dbg.jpg', 'imageType': 'JPEG',
    },
    'D_path_with_slash': {
        'id': unit_id, '@ctype': 'imageUnit',
        'src': cdn_url, 'path': path_val,
        'width': W, 'height': H, 'originalWidth': W, 'originalHeight': H,
        'fileName': 'dbg.jpg', 'imageType': 'JPEG',
        'linkInfo': None, 'caption': None,
    },
}

test_results = {}
for name, img_unit in structures.items():
    media = json.dumps({'image': [{'id': unit_id, 'src': cdn_url, 'path': img_unit['path'], 'width': W, 'height': H, 'fileName': 'dbg.jpg', 'imageType': 'JPEG'}], 'video': [], 'file': []}, ensure_ascii=False)
    dm = json.dumps({'documentId': '', 'document': {
        'version': '2.10.2', 'theme': 'default', 'language': 'ko-KR', 'id': doc_id(),
        'components': [
            {'id': se_id(), 'layout': 'default', '@ctype': 'documentTitle',
             'title': [{'id': se_id(), '@ctype': 'paragraph', 'nodes': [{'id': se_id(), 'value': 'Debug Test', '@ctype': 'textNode', 'style': {'@ctype': 'nodeStyle'}}]}],
             'subTitle': None, 'align': 'left'},
            {'id': se_id(), 'layout': 'default', '@ctype': 'image', 'value': [img_unit]},
        ],
    }}, ensure_ascii=False)

    body = urllib.parse.urlencode([
        ('blogId', blog_id), ('documentModel', dm),
        ('populationParams', pop_params), ('mediaResources', media),
        ('productApiVersion', 'v1'),
    ]).encode('utf-8')
    req = urllib.request.Request(f'{BASE}/RabbitAutoSaveWrite.naver', data=body, headers={
        **HDR, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.loads(r.read().decode('utf-8', errors='replace'))
        test_results[name] = {'ok': resp.get('isSuccess'), 'result': str(resp.get('result', ''))[:80]}
    except Exception as e:
        test_results[name] = {'error': str(e)[:80]}

result['tests'] = test_results
print(json.dumps(result, ensure_ascii=False))
`;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data: conn } = await supabase
    .from('naver_connections')
    .select('blog_id, nid_aut, nid_ses, naver_user_id')
    .eq('user_id', user.id)
    .single();

  if (!conn?.blog_id || !conn.nid_aut || !conn.nid_ses) {
    return NextResponse.json({ error: '네이버 연결 정보 없음' }, { status: 400 });
  }

  try {
    await nasExecWithStdin(
      'cat > /tmp/naver_debug_doc.py',
      SCRIPT,
    );
    const result = await nasExecWithStdin(
      'python3 /tmp/naver_debug_doc.py',
      JSON.stringify({ blogId: conn.blog_id, nidAut: conn.nid_aut, nidSes: conn.nid_ses, naverUserId: conn.naver_user_id || '' }),
    );
    const line = result.stdout.trim().split('\n').pop() || '{}';
    return NextResponse.json({ ok: true, ...JSON.parse(line), stderr: result.stderr?.slice(-300) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
