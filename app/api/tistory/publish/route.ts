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

ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
cookie = 'TSSESSION=' + tssession

def make_headers(extra=None):
    h = {
        'Cookie': cookie,
        'User-Agent': ua,
        'Accept': 'application/json, text/html, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Origin': 'https://www.tistory.com',
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

errors = []

# Method 1: Tistory Open API (TSSESSION as cookie)
try:
    api_url = 'https://www.tistory.com/apis/post/write'
    params = {
        'output': 'json',
        'blogName': blog_name,
        'title': title,
        'content': content,
        'tag': ','.join(tags[:10]),
        'category': category,
        'visibility': '20',
        'acceptComment': '1',
    }
    form_bytes = urllib.parse.urlencode(params).encode('utf-8')
    body, final_url, status = http_post(api_url, form_bytes, {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        'Referer': 'https://www.tistory.com',
    })
    if status in (401, 403):
        out({'error': '인증 실패 — TSSESSION 쿠키를 다시 발급하세요', 'errorCode': 'AUTH'})
    if 200 <= status < 300:
        try:
            result = json.loads(body)
            tistory = result.get('tistory', {})
            if tistory.get('status') == '200':
                item = tistory.get('item', {})
                post_id = str(item.get('postId', ''))
                post_url = item.get('url', '') or (blog_url + '/' + post_id)
                out({'postId': post_id, 'postUrl': post_url})
        except Exception:
            pass
        # URL에서 postId 추출 시도
        m = re.search(r'/([0-9]+)(?:[^0-9]|$)', final_url)
        if m:
            pid = m.group(1)
            out({'postId': pid, 'postUrl': blog_url + '/' + pid})
        errors.append('API 200 but no postId: ' + body[:200])
    else:
        errors.append('API ' + str(status) + ': ' + body[:150])
except Exception as e:
    errors.append('API exc: ' + str(e))

# Method 2: 관리자 페이지 폼 제출
try:
    manage_url = blog_url + '/manage/post/'
    html, _, _ = http_get(manage_url)
    # CSRF 토큰 추출
    csrf = ''
    m = re.search(r'name=["\\'']?_csrf["\\'"]?[^>]*value=["\\'"]?([a-zA-Z0-9_-]+)["\\'"]?', html)
    if not m:
        m = re.search(r'csrf[_-]?token["\\'"]?\\s*[=:]\\s*["\\'"]?([a-zA-Z0-9_-]+)', html, re.I)
    if m:
        csrf = m.group(1)

    post_params = {
        'title': title,
        'content': content,
        'tag': ','.join(tags[:10]),
        'category': category,
        'visibility': '20',
        'acceptComment': '1',
    }
    if csrf:
        post_params['_csrf'] = csrf

    form_bytes = urllib.parse.urlencode(post_params).encode('utf-8')
    body, final_url, status = http_post(manage_url, form_bytes, {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        'Referer': manage_url,
    })
    if status in (401, 403):
        out({'error': '인증 실패 — TSSESSION 쿠키를 다시 발급하세요', 'errorCode': 'AUTH'})
    if 200 <= status < 300 or status == 302:
        m = re.search(r'/([0-9]+)(?:[^0-9]|$)', final_url)
        if m:
            pid = m.group(1)
            out({'postId': pid, 'postUrl': blog_url + '/' + pid})
        errors.append('Form 200 but no postId: ' + body[:200])
    else:
        errors.append('Form ' + str(status) + ': ' + body[:150])
except Exception as e:
    errors.append('Form exc: ' + str(e))

out({'error': ' | '.join(errors), 'errorCode': 'UNKNOWN'})
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
