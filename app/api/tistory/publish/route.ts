import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { nasExecWithStdin } from '@/lib/nas-ssh';

export const maxDuration = 60;

const NAS_SCRIPT_PATH = '/volume1/homes/urjent/tistory_publish/post.py';

const TISTORY_POST_SCRIPT = `#!/usr/bin/env python3
import sys, json, re, http.cookiejar
import urllib.request, urllib.parse, urllib.error

data = json.loads(sys.stdin.read())
blog_name = data['blogName']
title = data['title']
content = data['content']
tssession = data['tssession']
tags = data.get('tags', [])
category_id = int(data.get('category', 0) or 0)
blog_url = data.get('blogUrl', 'https://' + blog_name + '.tistory.com').rstrip('/')

ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

def out(r):
    print(json.dumps(r, ensure_ascii=False))
    sys.exit(0)

# 쿠키 jar에 TSSESSION 주입
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
urllib.request.install_opener(opener)

import http.cookiejar as hcj
ck = hcj.Cookie(
    version=0, name='TSSESSION', value=tssession,
    port=None, port_specified=False,
    domain='.tistory.com', domain_specified=True, domain_initial_dot=True,
    path='/', path_specified=True,
    secure=False, expires=None, discard=True,
    comment=None, comment_url=None, rest={},
)
cj.set_cookie(ck)

def base_headers(referer=None):
    return {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': referer or blog_url + '/manage/',
    }

def http_get(url):
    req = urllib.request.Request(url, headers=base_headers(url))
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read().decode('utf-8', errors='replace'), r.geturl(), r.status
    except urllib.error.HTTPError as e:
        return e.read().decode('utf-8', errors='replace'), url, e.code
    except Exception as e:
        return str(e), url, 0

def http_post_json(url, payload, xsrf=''):
    body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    h = {
        **base_headers(),
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': blog_url,
    }
    if xsrf:
        h['X-XSRF-TOKEN'] = xsrf
    req = urllib.request.Request(url, data=body, headers=h, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode('utf-8', errors='replace'), r.geturl(), r.status
    except urllib.error.HTTPError as e:
        return e.read().decode('utf-8', errors='replace'), url, e.code
    except Exception as e:
        return str(e), url, 0

# 1. /manage/ 방문해서 세션 쿠키 + XSRF 수집
manage_html, manage_url, manage_status = http_get(blog_url + '/manage/')
if 'accounts.kakao.com' in manage_url or 'tistory.com/auth' in manage_url or manage_status in (401, 403):
    out({'error': 'TSSESSION 만료 — 티스토리 재로그인 후 쿠키를 다시 발급하세요', 'errorCode': 'AUTH'})

# XSRF 토큰 추출 (쿠키에서 먼저)
xsrf = ''
for c in cj:
    if c.name.upper().replace('-', '_') in ('XSRF_TOKEN', '_XSRF', 'CSRF_TOKEN'):
        xsrf = urllib.parse.unquote(c.value)
        break
if not xsrf:
    # HTML에서 추출 시도 (JSON meta 또는 input hidden)
    m = re.search(r'["\']X-XSRF-TOKEN["\']\s*:\s*["\']([^"\']+)', manage_html, re.IGNORECASE)
    if not m:
        m = re.search(r'name=["\']_token["\'][^>]*value=["\']([^"\']+)', manage_html, re.IGNORECASE)
    if not m:
        m = re.search(r'value=["\']([^"\']+)["\'][^>]*name=["\']_token["\']', manage_html, re.IGNORECASE)
    if m:
        xsrf = m.group(1)

errors = ['manage=' + str(manage_status) + ' xsrf=' + (xsrf[:10] if xsrf else 'none')]

# 2. 발행 payload
payload = {
    'title': title,
    'content': content,
    'visibility': 20,
    'categoryId': category_id,
    'tag': ','.join(tags[:10]),
    'acceptComment': 1,
    'published': 1,
}

# 3. 내부 관리 API 엔드포인트만 시도 (OAuth 전용 공개 API 제외)
endpoints = [
    blog_url + '/manage/api/v1/post',
    blog_url + '/manage/api/post',
]

for ep in endpoints:
    try:
        body, final_url, status = http_post_json(ep, payload, xsrf)
        if status in (401, 403):
            out({'error': 'TSSESSION 만료 — 쿠키를 다시 발급하세요', 'errorCode': 'AUTH'})
        if 200 <= status < 400:
            try:
                resp = json.loads(body)
                pid = str(
                    resp.get('postId') or
                    resp.get('id') or
                    (resp.get('data') or {}).get('id') or
                    (resp.get('tistory') or {}).get('postId') or ''
                )
                if pid and pid != 'None':
                    out({'postId': pid, 'postUrl': blog_url + '/' + pid})
            except Exception:
                pass
            m = re.search(r'/([0-9]+)(?:[^0-9]|$)', final_url)
            if m:
                out({'postId': m.group(1), 'postUrl': blog_url + '/' + m.group(1)})
            errors.append(ep + '->' + str(status) + ':' + body[:100])
        else:
            errors.append(ep + '->' + str(status) + ':' + body[:80])
    except Exception as ex:
        errors.append(ep + ' exc:' + str(ex)[:60])

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
  // 내부(cron) 인증 지원: Authorization: Bearer <CRON_SECRET> + body에 user_id 포함
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isInternal = cronSecret && authHeader === `Bearer ${cronSecret}`;

  let userId: string;

  if (isInternal) {
    const body = await req.json() as {
      user_id: string;
      blog_id: string;
      title: string;
      content: string;
      tags?: string[];
    };
    if (!body.user_id) return NextResponse.json({ error: 'user_id 필요 (내부 호출)' }, { status: 400 });
    userId = body.user_id;
    return handlePublish(userId, body.blog_id, body.title, body.content, body.tags ?? [], true);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json() as {
    blog_id: string;
    title: string;
    content: string;
    tags?: string[];
  };
  return handlePublish(user.id, body.blog_id, body.title, body.content, body.tags ?? [], false);
}

async function handlePublish(
  userId: string,
  blogId: string,
  title: string,
  content: string,
  tags: string[],
  isInternal: boolean,
) {
  if (!blogId || !title || !content) {
    return NextResponse.json({ error: 'blog_id, title, content 필요' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: conn } = await supabase
    .from('tistory_connections')
    .select('*')
    .eq('id', blogId)
    .eq('user_id', userId)
    .single();

  if (!conn) return NextResponse.json({ error: '티스토리 연결 없음' }, { status: 400 });

  await ensureScript();

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

  try {
    await supabase.from('tistory_history').insert({
      user_id: userId,
      blog_id: conn.id,
      blog_name: conn.blog_name,
      post_id: result.postId || null,
      post_url: result.postUrl,
      title,
    });
  } catch { /* ignore */ }

  await supabase.from('tistory_connections')
    .update({ last_tested_at: new Date().toISOString() })
    .eq('id', blogId);

  return NextResponse.json({ ok: true, url: result.postUrl, post_id: result.postId });
}
