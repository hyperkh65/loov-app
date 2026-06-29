import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { postToNaverBlog, postToNaverBlogOAuth, refreshNaverToken, sanitizeForNaver } from '@/lib/naver-blog';
import { nasExec, nasExecWithStdin } from '@/lib/nas-ssh';

const NAS_SCRIPT_PATH = '/volume1/homes/urjent/naver_publish/post.py';

// Python script that runs on NAS (home IP) to bypass Naver's cloud IP block
const NAVER_POST_SCRIPT = `#!/usr/bin/env python3
import sys, json, re
import urllib.request, urllib.parse, urllib.error
import http.cookiejar

DQ = chr(34)
SQ = chr(39)

data = json.loads(sys.stdin.read())
blog_id = data['blogId']
nid_aut = data['nidAut']
nid_ses = data['nidSes']
title = data['title']
content = data['content']
tags = data.get('tags', [])
category_no = data.get('categoryNo', 0)
is_publish = data.get('isPublish', True)

ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

# Cookie jar: 서버가 내려주는 CSRF 쿠키 등을 자동으로 캡처
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
urllib.request.install_opener(opener)

def full_cookie():
    extra = {c.name: c.value for c in cj}
    merged = {'NID_AUT': nid_aut, 'NID_SES': nid_ses, **extra}
    return '; '.join(k + '=' + v for k, v in merged.items())

def make_headers(extra=None):
    h = {
        'Cookie': full_cookie(),
        'User-Agent': ua,
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
    }
    if extra:
        h.update(extra)
    return h

def http_get(url):
    req = urllib.request.Request(url, headers=make_headers())
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.read().decode('utf-8', errors='replace'), r.geturl(), r.status
    except urllib.error.HTTPError as e:
        return e.read().decode('utf-8', errors='replace'), url, e.code
    except Exception as e:
        return str(e), url, 0

def http_post(url, data_bytes, headers):
    req = urllib.request.Request(url, data=data_bytes, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.read().decode('utf-8', errors='replace'), r.geturl(), r.status
    except urllib.error.HTTPError as e:
        return e.read().decode('utf-8', errors='replace'), url, e.code
    except Exception as e:
        return str(e), url, 0

def out(result):
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0)

errors = []
img_errors = []

def upload_image_to_naver(img_url):
    try:
        dl_req = urllib.request.Request(img_url, headers={'User-Agent': ua, 'Referer': img_url})
        with urllib.request.urlopen(dl_req, timeout=15) as r:
            img_data = r.read()
            ctype = r.headers.get('Content-Type', 'image/jpeg').split(';')[0].strip()
        if not img_data:
            return None
        ext_map = {'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp'}
        ext = ext_map.get(ctype, 'jpg')
        raw_name = img_url.split('/')[-1].split('?')[0]
        filename = re.sub(r'[^a-zA-Z0-9._-]', '_', raw_name) if raw_name else ('img.' + ext)
        if '.' not in filename:
            filename += '.' + ext
        boundary = b'----LoovNaverBoundary20240101'
        CRLF = b'\\r\\n'
        file_extra = ('Content-Disposition: form-data; name="uploadFile"; filename="' + filename + '"').encode() + CRLF + ('Content-Type: ' + ctype).encode()
        body = (b'--' + boundary + CRLF +
                b'Content-Disposition: form-data; name="blogId"' + CRLF + CRLF +
                blog_id.encode() + CRLF +
                b'--' + boundary + CRLF +
                file_extra + CRLF + CRLF +
                img_data + CRLF +
                b'--' + boundary + b'--' + CRLF)
        up_headers = {**make_headers(),
            'Content-Type': 'multipart/form-data; boundary=' + boundary.decode(),
            'Referer': 'https://blog.naver.com/PostWriteForm.naver?blogId=' + blog_id,
            'Origin': 'https://blog.naver.com',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json, text/javascript, */*',
        }
        for up_url in [
            'https://blog.naver.com/nwPostWriteAttachImageFromSave.naver',
            'https://blog.naver.com/PostWriteImageUpload.naver',
            'https://blog.naver.com/UploadBlogAttachment.naver',
        ]:
            resp_body, _, status = http_post(up_url, body, up_headers)
            if 200 <= status < 300:
                try:
                    rj = json.loads(resp_body)
                    naver_url = (rj.get('url') or rj.get('fileUrl') or rj.get('imageUrl') or
                                 rj.get('attachUrl') or rj.get('uploadURL') or
                                 (rj.get('result') or {}).get('url') or '')
                    if naver_url:
                        return naver_url
                except Exception:
                    pass
                pstatic_pat = 'https://[^' + DQ + SQ + '\\\\s]+pstatic[.]net[^' + DQ + SQ + '\\\\s]+'
                m = re.search(pstatic_pat, resp_body)
                if m:
                    return m.group(0)
            img_errors.append(up_url.split('naver.com')[1] + ' ' + str(status))
    except Exception as e:
        img_errors.append('dl: ' + str(e)[:60])
    return None

def replace_image_urls(html):
    src_pat = 'src=[' + DQ + SQ + '](https?://[^' + DQ + SQ + ']+)[' + DQ + SQ + '\\\\s]'
    def replace_src(match):
        tag = match.group(0)
        sm = re.search(src_pat, tag, re.I)
        if not sm:
            return tag
        src = sm.group(1)
        if 'pstatic.net' in src or 'naver.com' in src or src.startswith('data:'):
            return tag
        naver_url = upload_image_to_naver(src)
        if naver_url:
            return tag.replace(sm.group(1), naver_url)
        return tag
    return re.sub(r'<img[^>]+>', replace_src, html, flags=re.I)

content = replace_image_urls(content)

# Step 1: 쓰기 페이지 로드 → CSRF 쿠키 캡처 + 페이지에서 CSRF 추출
csrf = ''
form_html = ''
try:
    form_html, form_url, form_status = http_get('https://blog.naver.com/PostWriteForm.naver?blogId=' + blog_id)
    if 'nid.naver.com' in form_url or 'nidlogin' in form_url:
        out({'error': 'NID_AUT/NID_SES 만료 — 네이버 재로그인 후 쿠키를 다시 발급하세요', 'errorCode': 'AUTH'})
    if form_status in (401, 403):
        out({'error': '인증 실패(' + str(form_status) + ') — 쿠키 재발급 필요', 'errorCode': 'AUTH'})
    q = '[' + DQ + SQ + ']'
    csrf_pats = [
        q + '_csrf' + q + '\\s*[,:]\\s*' + q + '([^' + DQ + SQ + ']{10,})' + q,
        'name=' + q + '_csrf' + q + '[^>]+value=' + q + '([^' + DQ + SQ + ']{10,})' + q,
        'value=' + q + '([^' + DQ + SQ + ']{10,})' + q + '[^>]+name=' + q + '_csrf' + q,
        'csrf[_-]token' + q + '[\\s:=]+' + q + '([a-zA-Z0-9/+_=-]{20,})' + q,
        DQ + 'csrf' + DQ + '\\s*:\\s*' + DQ + '([^' + DQ + ']{10,})' + DQ,
    ]
    for pat in csrf_pats:
        m = re.search(pat, form_html, re.I)
        if m:
            csrf = m.group(1)
            break
    if not csrf:
        for c in cj:
            if 'csrf' in c.name.lower() or 'xsrf' in c.name.lower():
                csrf = c.value
                break
    errors.append('form=' + str(form_status) + ' csrf=' + str(len(csrf)))
except Exception as e:
    errors.append('form exc:' + str(e)[:40])

# Step 2: Form POST (원래 동작하던 방식 복원)
try:
    hidden = {}
    input_re = '<input[^>]+type=[' + DQ + SQ + ']hidden[' + DQ + SQ + '][^>]*>'
    name_re = 'name=[' + DQ + SQ + ']([^' + DQ + SQ + ']+)[' + DQ + SQ + ']'
    value_re = 'value=[' + DQ + SQ + ']([^' + DQ + SQ + ']*)[' + DQ + SQ + ']'
    for inp in re.finditer(input_re, form_html, re.I):
        nm = re.search(name_re, inp.group())
        vm = re.search(value_re, inp.group())
        if nm:
            hidden[nm.group(1)] = vm.group(1) if vm else ''
    post_data = {**hidden,
        'blogId': blog_id, 'title': title, 'body': content,
        'tag': ','.join(tags[:30]), 'categoryNo': str(category_no),
        'isPublish': '1' if is_publish else '0', 'publishType': 'A' if is_publish else 'B',
        'postWriteRootPath': 'BLOG', 'logNo': '0', 'postWriteFormType': 'default',
    }
    if csrf:
        post_data['_csrf'] = csrf
    form_bytes = urllib.parse.urlencode(post_data).encode('utf-8')
    resp_body, final_url, status = http_post(
        'https://blog.naver.com/PostWriteFormsave.naver', form_bytes,
        {**make_headers(),
         'Content-Type': 'application/x-www-form-urlencoded',
         'Referer': 'https://blog.naver.com/PostWriteForm.naver?blogId=' + blog_id,
         'Origin': 'https://blog.naver.com'})
    if status in (401, 403):
        out({'error': '인증 실패 (' + str(status) + ')', 'errorCode': 'AUTH'})
    if 200 <= status < 300:
        m = re.search(r'logNo=([0-9]+)', final_url) or re.search(r'/([0-9]{5,})(?:[^0-9/?#]|$)', final_url)
        if not m:
            m = re.search('logNo[=:][' + DQ + SQ + ' ]*([0-9]{5,})', resp_body)
        if m:
            pid = m.group(1)
            out({'postId': pid, 'postUrl': 'https://blog.naver.com/' + blog_id + '/' + pid})
    errors.append('form=' + str(form_status) + ' hidden=' + str(len(hidden)) + ' save=' + str(status))
except Exception as e:
    errors.append('form exc:' + str(e)[:50])

# Step 3: REST API 폴백
for api_url in [
    'https://blog.naver.com/api/v1/blogs/' + blog_id + '/posts',
    'https://blog.naver.com/api/v2/blogs/' + blog_id + '/posts',
    'https://m.blog.naver.com/api/v1/blogs/' + blog_id + '/posts',
]:
    try:
        jdata = json.dumps({'title': title, 'contents': content, 'tags': tags[:30],
            'isPublish': is_publish, 'categoryNo': category_no, 'isOpen': True}).encode('utf-8')
        body, final_url, status = http_post(api_url, jdata, {**make_headers(),
            'Content-Type': 'application/json;charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': 'https://blog.naver.com',
            'Referer': 'https://blog.naver.com/' + blog_id,
            'Accept': 'application/json'})
        if status in (401, 403):
            out({'error': '인증 실패 (' + str(status) + ')', 'errorCode': 'AUTH'})
        if 200 <= status < 300:
            try:
                d = json.loads(body)
                pid = str(d.get('logNo') or d.get('postId') or d.get('id') or d.get('no') or '')
                out({'postId': pid, 'postUrl': 'https://blog.naver.com/' + blog_id + ('/' + pid if pid else '')})
            except Exception:
                pass
        errors.append(api_url.split('naver.com')[1] + '->' + str(status))
    except Exception as ex:
        errors.append(api_url.split('naver.com')[1] + ' exc:' + str(ex)[:30])

img_note = (' [img:' + ','.join(img_errors[:3]) + ']') if img_errors else ''
out({'error': ' | '.join(errors[:5]) + img_note, 'errorCode': 'UNKNOWN'})
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
