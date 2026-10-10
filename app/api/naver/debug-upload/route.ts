import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { nasExecWithStdin } from '@/lib/nas-ssh';

const DEBUG_SCRIPT = `#!/usr/bin/env python3
import sys, json, re, uuid, urllib.request

data = json.loads(sys.stdin.read())
blog_id = data['blogId']
nid_aut = data['nidAut']
nid_ses = data['nidSes']
naver_user_id = data['naverUserId']

BASE = 'https://blog.naver.com'
ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36'

result = {}

# Step 1: Get session key
try:
    key_url = f'https://section.blog.naver.com/api/blogs/{naver_user_id}/photo-infra-profile-session-key'
    key_req = urllib.request.Request(key_url, headers={
        'Cookie': f'NID_AUT={nid_aut}; NID_SES={nid_ses}',
        'User-Agent': ua, 'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': f'{BASE}/PostWriteForm.naver?blogId={blog_id}',
        'Origin': BASE,
    })
    with urllib.request.urlopen(key_req, timeout=10) as r:
        resp = json.load(r)
    session_key = resp.get('result', '')
    result['session_key_ok'] = bool(session_key)
    result['session_key_prefix'] = session_key[:30] if session_key else ''
except Exception as e:
    result['session_key_error'] = str(e)[:100]
    print(json.dumps(result))
    sys.exit(0)

# Step 2: Download test image
try:
    req = urllib.request.Request('https://picsum.photos/400/300.jpg', headers={'User-Agent': ua})
    with urllib.request.urlopen(req, timeout=15) as r:
        img_data = r.read()
        ctype = r.headers.get('Content-Type', 'image/jpeg').split(';')[0].strip()
    result['download_ok'] = True
    result['img_size'] = len(img_data)
    result['ctype'] = ctype
except Exception as e:
    result['download_error'] = str(e)[:100]
    print(json.dumps(result))
    sys.exit(0)

# Step 3: Upload to Naver CDN
try:
    boundary = uuid.uuid4().hex
    filename = 'test_debug.jpg'
    body = (f'--{boundary}\\r\\nContent-Disposition: form-data; name="image"; filename="{filename}"\\r\\nContent-Type: {ctype}\\r\\n\\r\\n').encode() + img_data + f'\\r\\n--{boundary}--\\r\\n'.encode()
    up_url = f'https://blog.upphoto.naver.com/{session_key}/simpleUpload/0?userId={naver_user_id}&extractExif=false&extractAnimatedCnt=false&extractAnimatedInfo=false&autorotate=false&extractDominantColor=false'
    up_req = urllib.request.Request(up_url, data=body, headers={
        'Content-Type': f'multipart/form-data; boundary={boundary}',
        'Cookie': f'NID_AUT={nid_aut}; NID_SES={nid_ses}',
        'User-Agent': ua,
        'Referer': f'{BASE}/PostWriteForm.naver?blogId={blog_id}',
        'Origin': BASE,
    }, method='POST')
    with urllib.request.urlopen(up_req, timeout=20) as r:
        upload_resp_raw = r.read().decode('utf-8', errors='replace')
    result['upload_raw'] = upload_resp_raw[:600]

    url_m = re.search('<url>(.*?)</url>', upload_resp_raw)
    path_m = re.search('<path>(.*?)</path>', upload_resp_raw)
    w_m = re.search('<width>([0-9]+)</width>', upload_resp_raw)
    h_m = re.search('<height>([0-9]+)</height>', upload_resp_raw)

    if url_m:
        url_val = url_m.group(1)
        cdn_url = url_val if url_val.startswith('http') else 'https://postfiles.pstatic.net' + url_val
        path_val = path_m.group(1) if path_m else url_val
        result['url_val'] = url_val
        result['path_val'] = path_val
        result['cdn_url'] = cdn_url
        result['width'] = int(w_m.group(1)) if w_m else 0
        result['height'] = int(h_m.group(1)) if h_m else 0
        result['upload_ok'] = True
    else:
        result['upload_no_url'] = True
except Exception as e:
    result['upload_error'] = str(e)[:200]

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
      'mkdir -p /volume1/homes/urjent/naver_publish && cat > /volume1/homes/urjent/naver_publish/debug_upload.py',
      DEBUG_SCRIPT,
    );

    const result = await nasExecWithStdin(
      'python3 /volume1/homes/urjent/naver_publish/debug_upload.py',
      JSON.stringify({
        blogId: conn.blog_id,
        nidAut: conn.nid_aut,
        nidSes: conn.nid_ses,
        naverUserId: conn.naver_user_id || '',
      }),
    );

    const line = result.stdout.trim().split('\n').pop() || '{}';
    const parsed = JSON.parse(line);

    return NextResponse.json({
      ok: true,
      ...parsed,
      stderr: result.stderr?.slice(0, 300),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
