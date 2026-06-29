import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { postToNaverBlog, postToNaverBlogOAuth, refreshNaverToken, sanitizeForNaver } from '@/lib/naver-blog';
import { nasExec, nasExecWithStdin } from '@/lib/nas-ssh';

const NAS_SCRIPT_PATH = '/volume1/homes/urjent/naver_publish/post.py';

// Python script that runs on NAS (home IP) to bypass Naver's cloud IP block
// Uses SEOne API (RabbitWrite.naver) for text posting
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

def make_image_component(src, alt=''):
    return {
        'id': se_id(), 'layout': 'default', '@ctype': 'image',
        'value': [{
            'id': se_id(), '@ctype': 'imageUnit',
            'src': src, 'width': 800, 'height': 600,
            'originalWidth': 800, 'originalHeight': 600,
            'caption': {'id': se_id(), '@ctype': 'paragraph',
                        'nodes': [{'id': se_id(), 'value': alt, '@ctype': 'textNode'}]} if alt else None,
            'link': None, 'isLinked': False,
        }],
    }

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
    ctype = 'heading2' if level == 2 else 'heading3'
    return {
        'id': se_id(), 'layout': 'default', '@ctype': ctype,
        'value': [{
            'id': se_id(), '@ctype': 'paragraph',
            'nodes': [{'id': se_id(), 'value': text, '@ctype': 'textNode',
                       'style': {'fontFamily': 'nanumbareunhipi', '@ctype': 'nodeStyle'}}],
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
        if paras:
            components.append({
                'id': se_id(), 'layout': 'default', '@ctype': 'text',
                'value': [make_text_node(p) for p in paras],
            })
        pending_texts.clear()

    for chunk in chunks:
        cl = chunk.lower()
        if cl.startswith('<figure'):
            img_m = re.search('src=[' + DQ + SQ + '](https?://[^' + DQ + SQ + ']+)[' + DQ + SQ + ']', chunk, re.I)
            alt_m = re.search('alt=[' + DQ + SQ + '](.*?)[' + DQ + SQ + ']', chunk, re.I)
            if img_m:
                flush_texts()
                components.append(make_image_component(img_m.group(1), alt_m.group(1) if alt_m else ''))
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
                        components.append(make_image_component(img_m.group(1), alt_m.group(1) if alt_m else ''))
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

def http_get_json(url):
    req = urllib.request.Request(url, headers=HDR)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            final_url = r.geturl()
            if 'nid.naver.com' in final_url or 'nidlogin' in final_url:
                out({'error': 'NID_AUT/NID_SES 만료', 'errorCode': 'AUTH'})
            body = r.read().decode('utf-8', errors='replace')
        return json.loads(body)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            out({'error': '인증 실패', 'errorCode': 'AUTH'})
        raise

def http_post_form(url, pairs):
    body = urllib.parse.urlencode(pairs).encode('utf-8')
    h = {**HDR, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'}
    req = urllib.request.Request(url, data=body, headers=h, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
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
cfg['openType'] = 2 if is_publish else 1
meta['categoryId'] = category_no if category_no and category_no > 0 else default_category_id
meta['tags'] = ','.join(tags[:30]) if tags else None
meta['logNo'] = None
meta['prePostDate'] = None

# 3. Build SEOne document
dm = build_doc(title, content)
dm_str = json.dumps(dm, ensure_ascii=False)

# 4. Publish via RabbitWrite (SEOne API)
pop_params = {'configuration': cfg, 'populationMeta': meta}
wr, status = http_post_form(f'{BASE}/RabbitWrite.naver', [
    ('documentModel', dm_str),
    ('populationParams', json.dumps(pop_params, ensure_ascii=False)),
    ('ugcMarketInfo', ''),
    ('buyWithMyOwnMoneyInfo', ''),
    ('mediaResources', '{}'),
    ('blogId', blog_id),
    ('productApiVersion', ''),
    ('tokenId', ''),
])

if status in (401, 403):
    out({'error': '인증 실패 — 쿠키 재발급 필요', 'errorCode': 'AUTH'})

if wr.get('isSuccess'):
    redirect = (wr.get('result') or {}).get('redirectUrl', '')
    m = re.search('logNo=([0-9]+)', redirect)
    log_no = m.group(1) if m else ''
    out({'postId': log_no, 'postUrl': f'https://blog.naver.com/{blog_id}/{log_no}'})

result_val = wr.get('result', {})
ec = result_val.get('errorCode', 'UNKNOWN') if isinstance(result_val, dict) else str(result_val)
if ec in ('LOGIN', 'AUTH', 'auth'):
    out({'error': '인증 실패 — 쿠키 재발급 필요', 'errorCode': 'AUTH'})

out({'error': f'RabbitWrite fail: status={status} ec={ec}', 'errorCode': ec, 'raw': str(wr)[:200]})
`;

async function ensureNasScript(): Promise<void> {
  try {
    await nasExecWithStdin(
      `mkdir -p $(dirname ${NAS_SCRIPT_PATH}) && cat > ${NAS_SCRIPT_PATH} && chmod +x ${NAS_SCRIPT_PATH}`,
      NAVER_POST_SCRIPT,
    );
  } catch { /* ignore */ }
}

async function postViaNas(params: {
  blogId: string; nidAut: string; nidSes: string;
  title: string; content: string; tags: string[];
  categoryNo: number; isPublish: boolean;
}): Promise<{ postId?: string; postUrl?: string; error?: string; errorCode?: string }> {
  try {
    await ensureNasScript();
    const result = await nasExecWithStdin(
      `python3 ${NAS_SCRIPT_PATH}`,
      JSON.stringify(params),
    );
    if (result.code !== 0 && !result.stdout) {
      return { error: `NAS 스크립트 오류: ${result.stderr}`, errorCode: 'UNKNOWN' };
    }
    const line = result.stdout.trim().split('\n').pop() || '{}';
    return JSON.parse(line);
  } catch (e) {
    return { error: `NAS SSH 오류: ${String(e)}`, errorCode: 'UNKNOWN' };
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const {
    title, content, tags = [], categoryNo = 0,
    status = 'publish', notionPageId = '',
  } = await req.json() as {
    title: string; content: string; tags: string[];
    categoryNo: number; status: string; notionPageId: string;
  };

  if (!title?.trim()) return NextResponse.json({ error: '제목이 필요합니다' }, { status: 400 });
  if (!content?.trim()) return NextResponse.json({ error: '내용이 필요합니다' }, { status: 400 });

  const { data: conn } = await supabase
    .from('naver_connections')
    .select('blog_id, nid_aut, nid_ses, access_token, refresh_token, token_expires_at')
    .eq('user_id', user.id)
    .single();

  if (!conn?.blog_id) {
    return NextResponse.json({ error: '네이버 블로그 연결 정보가 없습니다. 설정 탭에서 먼저 연결해주세요.' }, { status: 400 });
  }

  const cleanContent = sanitizeForNaver(content);
  const isPublish = status === 'publish';

  // ── 1순위: NAS 경유 발행 (쿠키 기반, 가정용 IP라 차단 없음) ─────────────────
  if (conn.nid_aut && conn.nid_ses) {
    const nasResult = await postViaNas({
      blogId: conn.blog_id,
      nidAut: conn.nid_aut,
      nidSes: conn.nid_ses,
      title: title.trim(),
      content: cleanContent,
      tags,
      categoryNo,
      isPublish,
    });

    if (nasResult.errorCode === 'AUTH') {
      return NextResponse.json({
        error: '네이버 쿠키가 만료되었습니다. 설정 탭에서 NID_AUT / NID_SES를 다시 입력해주세요.',
        errorCode: 'AUTH',
      }, { status: 401 });
    }

    if (nasResult.postId || nasResult.postUrl) {
      await supabase.from('naver_publish_history').insert({
        user_id: user.id,
        blog_id: conn.blog_id,
        post_id: nasResult.postId || '',
        post_url: nasResult.postUrl || '',
        title: title.trim(),
        notion_page_id: notionPageId,
        status,
      });
      return NextResponse.json({ postId: nasResult.postId, postUrl: nasResult.postUrl });
    }
    // NAS 실패 시 아래 OAuth로 폴백
    console.warn('[Naver] NAS publish failed, falling back to OAuth:', nasResult.error);
  }

  // ── 2순위: OAuth API (IP 무관하지만 권한 제한 있음) ──────────────────────────
  let accessToken = conn.access_token || '';
  const tokenExpiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : new Date(0);

  if (accessToken) {
    if (tokenExpiresAt <= new Date() && conn.refresh_token) {
      const refreshed = await refreshNaverToken(conn.refresh_token);
      if (refreshed.accessToken) {
        accessToken = refreshed.accessToken;
        await supabase.from('naver_connections').update({
          access_token: refreshed.accessToken,
          token_expires_at: refreshed.expiresAt,
        }).eq('user_id', user.id);
      } else {
        accessToken = '';
      }
    }
  }

  if (accessToken) {
    const result = await postToNaverBlogOAuth({
      accessToken,
      blogId: conn.blog_id,
      title: title.trim(),
      content: cleanContent,
      tags,
      categoryNo,
      isPublish,
    });

    if (result.errorCode === 'AUTH') {
      await supabase.from('naver_connections').update({
        access_token: null, refresh_token: null, token_expires_at: null,
      }).eq('user_id', user.id);
      return NextResponse.json({
        error: 'OAuth 토큰이 만료되었습니다. 설정 탭에서 네이버 재연결을 해주세요.',
        errorCode: 'AUTH',
      }, { status: 401 });
    }

    if (result.postId || result.postUrl) {
      await supabase.from('naver_publish_history').insert({
        user_id: user.id,
        blog_id: conn.blog_id,
        post_id: result.postId || '',
        post_url: result.postUrl || '',
        title: title.trim(),
        notion_page_id: notionPageId,
        status,
      });
      return NextResponse.json({ postId: result.postId, postUrl: result.postUrl });
    }
  }

  // ── 3순위: 직접 쿠키 (서버 IP 차단 가능성 있지만 최후 시도) ─────────────────
  if (conn.nid_aut && conn.nid_ses) {
    const result = await postToNaverBlog({
      blogId: conn.blog_id,
      nidAut: conn.nid_aut,
      nidSes: conn.nid_ses,
      title: title.trim(),
      content: cleanContent,
      tags,
      categoryNo,
      isPublish,
    });

    if (result.postId || result.postUrl) {
      await supabase.from('naver_publish_history').insert({
        user_id: user.id,
        blog_id: conn.blog_id,
        post_id: result.postId || '',
        post_url: result.postUrl || '',
        title: title.trim(),
        notion_page_id: notionPageId,
        status,
      });
      return NextResponse.json({ postId: result.postId, postUrl: result.postUrl });
    }

    if (result.errorCode === 'AUTH') {
      return NextResponse.json({ error: result.error, errorCode: result.errorCode }, { status: 401 });
    }

    return NextResponse.json({ error: result.error, errorCode: result.errorCode }, { status: 500 });
  }

  return NextResponse.json({
    error: '발행 방법 없음: NID_AUT/NID_SES 쿠키 또는 OAuth 토큰이 필요합니다.',
    errorCode: 'AUTH',
  }, { status: 400 });
}
