import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { nasExecWithStdin } from '@/lib/nas-ssh';

export const maxDuration = 60;

const NAS_SCRIPT_PATH = '/volume1/homes/urjent/tistory_publish/post.py';

// NAS에 티스토리 발행 스크립트 업로드 (최초 1회)
const TISTORY_POST_SCRIPT = `#!/usr/bin/env python3
import sys, json, re
import urllib.request, urllib.parse, urllib.error

data = json.loads(sys.stdin.read())
blog_name = data['blogName']
title = data['title']
content = data['content']
tssession = data['tssession']
tags = data.get('tags', [])
category = data.get('category', '0')
blog_url = data.get('blogUrl', 'https://' + blog_name + '.tistory.com')

ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
cookie = 'TSSESSION=' + tssession

def make_headers(extra=None):
    h = {
        'Cookie': cookie,
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Origin': blog_url,
        'Referer': blog_url,
    }
    if extra:
        h.update(extra)
    return h

def http_get(url):
    req = urllib.request.Request(url, headers=make_headers())
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read().decode('utf-8', errors='replace'), r.geturl(), r.status
    except urllib.error.HTTPError as e:
        return e.read().decode('utf-8', errors='replace'), url, e.code
    except Exception as e:
        return str(e), url, 0

def http_post(url, data_bytes, extra_headers=None):
    h = make_headers(extra_headers)
    req = urllib.request.Request(url, data=data_bytes, headers=h, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode('utf-8', errors='replace'), r.geturl(), r.status
    except urllib.error.HTTPError as e:
        return e.read().decode('utf-8', errors='replace'), url, e.code
    except Exception as e:
        return str(e), url, 0

def out(result):
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0)

def is_login_page(url, html=''):
    return ('accounts.kakao.com' in url or 'login' in url or
            'kakaoAccount' in html or 'kakao_login' in html)

import http.cookiejar
errors = []

# 쿠키 자동 처리 opener 생성
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
opener.addheaders = [
    ('User-Agent', ua),
    ('Accept', 'text/html,application/xhtml+xml,*/*;q=0.8'),
    ('Accept-Language', 'ko-KR,ko;q=0.9'),
    ('Cookie', cookie),
]
urllib.request.install_opener(opener)

def get_xsrf():
    for c in cj:
        if 'xsrf' in c.name.lower() or 'csrf' in c.name.lower():
            return c.value
    return ''

# 세션 유효성 + XSRF 쿠키 획득
try:
    _, check_url, check_status = http_get(blog_url + '/manage/')
    if is_login_page(check_url):
        out({'error': '인증 실패 — TSSESSION 만료. 티스토리 재로그인 후 쿠키를 다시 발급하세요', 'errorCode': 'AUTH'})
    if check_status in (401, 403):
        out({'error': '인증 실패(' + str(check_status) + ') — TSSESSION을 다시 발급하세요', 'errorCode': 'AUTH'})
except Exception as e:
    errors.append('auth check: ' + str(e))

# 신 에디터 페이지 로드하여 쿠키/토큰 획득
try:
    write_page_url = blog_url + '/manage/post/0'
    html, _, _ = http_get(write_page_url)
    if is_login_page('', html):
        out({'error': '인증 실패 — TSSESSION 만료. 티스토리 재로그인 후 쿠키를 다시 발급하세요', 'errorCode': 'AUTH'})
except Exception as e:
    errors.append('write page: ' + str(e))

xsrf = get_xsrf()

# JSON API로 포스팅 시도 (신 에디터 내부 API)
try:
    api_endpoints = [
        blog_url + '/manage/api/posts',
        blog_url + '/manage/api/entry',
        'https://www.tistory.com/manage/api/posts',
    ]
    post_json = json.dumps({
        'title': title,
        'content': content,
        'tag': ','.join(tags[:10]),
        'category': category,
        'visibility': 20,
        'acceptComment': 1,
        'published': 1,
    }).encode('utf-8')
    json_headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Referer': blog_url + '/manage/',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json',
    }
    if xsrf:
        json_headers['X-XSRF-TOKEN'] = xsrf
    for ep in api_endpoints:
        try:
            body, final_url, status = http_post(ep, post_json, json_headers)
            if status in (401, 403):
                out({'error': '인증 실패 — TSSESSION을 다시 발급하세요', 'errorCode': 'AUTH'})
            if 200 <= status < 400:
                try:
                    resp = json.loads(body)
                    pid = str(resp.get('postId', resp.get('id', resp.get('data', {}).get('id', ''))))
                    if pid:
                        out({'postId': pid, 'postUrl': blog_url + '/' + pid})
                except Exception:
                    pass
                m = re.search(r'/([0-9]+)(?:[^0-9]|$)', final_url)
                if m:
                    out({'postId': m.group(1), 'postUrl': blog_url + '/' + m.group(1)})
            errors.append('JSON ' + ep + ' -> ' + str(status) + ': ' + body[:100])
        except Exception as ex:
            errors.append('JSON exc ' + ep + ': ' + str(ex))
except Exception as e:
    errors.append('JSON block: ' + str(e))

# 폼 방식도 시도 (구 에디터 호환)
try:
    post_params = {
        'title': title, 'content': content,
        'tag': ','.join(tags[:10]), 'category': category,
        'visibility': '20', 'acceptComment': '1', 'published': '1',
    }
    if xsrf:
        post_params['_csrf'] = xsrf
    form_bytes = urllib.parse.urlencode(post_params).encode('utf-8')
    for form_url in [blog_url + '/manage/post', blog_url + '/manage/entry/post']:
        body, final_url, status = http_post(form_url, form_bytes, {
            'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
            'Referer': blog_url + '/manage/',
            'X-Requested-With': 'XMLHttpRequest',
        })
        if is_login_page(final_url, body):
            out({'error': '인증 실패 — TSSESSION을 다시 발급하세요', 'errorCode': 'AUTH'})
        if 200 <= status < 400:
            m = re.search(r'/([0-9]+)(?:[^0-9]|$)', final_url)
            if m:
                out({'postId': m.group(1), 'postUrl': blog_url + '/' + m.group(1)})
        errors.append('Form ' + form_url + ' -> ' + str(status) + ': ' + body[:100])
except Exception as e:
    errors.append('Form exc: ' + str(e))

out({'error': 'xsrf=' + xsrf + ' | ' + ' | '.join(errors), 'errorCode': 'UNKNOWN'})
`;

async function ensureScript(): Promise<void> {
  try {
    await nasExecWithStdin(
      `mkdir -p $(dirname ${NAS_SCRIPT_PATH}) && cat > ${NAS_SCRIPT_PATH} && chmod +x ${NAS_SCRIPT_PATH}`,
      TISTORY_POST_SCRIPT,
    );
  } catch { /* ignore */ }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { blog_id, title, content, tags = [], blog_url } = await req.json() as {
    blog_id: string;
    title: string;
    content: string;
    tags?: string[];
    blog_url?: string;
  };

  if (!blog_id || !title || !content) {
    return NextResponse.json({ error: 'blog_id, title, content 필요' }, { status: 400 });
  }

  const { data: conn } = await supabase
    .from('tistory_connections')
    .select('*')
    .eq('id', blog_id)
    .eq('user_id', user.id)
    .single();

  if (!conn) return NextResponse.json({ error: '티스토리 연결 없음' }, { status: 400 });

  // NAS 스크립트 업로드 (없으면)
  await ensureScript();

  // 스크립트 실행
  const input = JSON.stringify({
    blogName: conn.blog_name,
    blogUrl: conn.blog_url || `https://${conn.blog_name}.tistory.com`,
    title,
    content,
    tssession: conn.tssession,
    tags,
    category: '0',
  });

  let result: { postId?: string; postUrl?: string; error?: string; errorCode?: string };
  try {
    const { stdout, stderr, code } = await nasExecWithStdin(`python3 ${NAS_SCRIPT_PATH}`, input);
    const lastLine = stdout.trim().split('\n').pop() || '';
    if (!lastLine) {
      const errDetail = stderr ? stderr.slice(0, 300) : `exit code ${code}`;
      return NextResponse.json({ error: `스크립트 출력 없음: ${errDetail}` }, { status: 500 });
    }
    try {
      result = JSON.parse(lastLine);
    } catch {
      return NextResponse.json({ error: `JSON 파싱 실패: ${lastLine.slice(0, 200)}` }, { status: 500 });
    }
  } catch (e) {
    return NextResponse.json({ error: `NAS 실행 오류: ${String(e)}` }, { status: 500 });
  }

  if (result.error || !result.postUrl) {
    return NextResponse.json({ error: result.error || `발행 실패 (errorCode: ${result.errorCode || 'none'})`, errorCode: result.errorCode }, { status: 400 });
  }

  // 발행 이력 저장
  try {
    await supabase.from('tistory_history').insert({
      user_id: user.id,
      blog_id: conn.id,
      blog_name: conn.blog_name,
      post_id: result.postId || null,
      post_url: result.postUrl,
      title,
    });
  } catch { /* ignore */ }

  // last_tested_at 갱신
  await supabase.from('tistory_connections')
    .update({ last_tested_at: new Date().toISOString() })
    .eq('id', blog_id);

  return NextResponse.json({ ok: true, url: result.postUrl, post_id: result.postId });
}
