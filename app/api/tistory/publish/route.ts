import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { nasExecWithStdin } from '@/lib/nas-ssh';
import { sanitizeInvisible, findHtmlProblem } from '@/lib/html-gate';

export const maxDuration = 60;

const NAS_SCRIPT_PATH = '/volume1/homes/urjent/tistory_publish/post.py';

// 실제 브라우저(miracool65.tistory.com/manage/newpost/)에서 "공개 발행"/"비공개 저장"을
// 직접 눌러 Network 탭으로 캡처해 확인한 실제 요청 포맷을 그대로 재현한다.
// 예전 버전은 /manage/drafts(임시저장)만 호출해 실제로는 한 번도 정식 글을 발행한 적이 없었음.
const TISTORY_POST_SCRIPT = `#!/usr/bin/env python3
import sys, json, http.cookiejar, secrets, re
import urllib.request, urllib.error, urllib.parse

data = json.loads(sys.stdin.read())
blog_name = data['blogName']
title = data['title']
content = data['content']
tssession = data['tssession']
tags = data.get('tags', [])
category_id = int(data.get('category', 0) or 0)
blog_url = data.get('blogUrl', 'https://' + blog_name + '.tistory.com').rstrip('/')
is_publish = data.get('isPublish', True)

ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

def out(r):
    print(json.dumps(r, ensure_ascii=False))
    sys.exit(0)

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
urllib.request.install_opener(opener)

import http.cookiejar as hcj
ck = hcj.Cookie(0, 'TSSESSION', tssession, None, False, '.tistory.com', True, True, '/', True, False, None, True, None, None, {})
cj.set_cookie(ck)

def http_get(url, referer=None):
    req = urllib.request.Request(url, headers={
        'User-Agent': ua, 'Accept': 'text/html,*/*', 'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': referer or blog_url + '/manage/',
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read().decode('utf-8', errors='replace'), r.geturl(), r.status
    except urllib.error.HTTPError as e:
        return e.read().decode('utf-8', errors='replace'), url, e.code
    except Exception as e:
        return str(e), url, 0

def http_json(url, payload, referer, method='POST'):
    body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    h = {
        'User-Agent': ua,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Content-Type': 'application/json; charset=utf-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': blog_url,
        'Referer': referer,
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
    }
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode('utf-8', errors='replace'), r.status
    except urllib.error.HTTPError as e:
        return e.read().decode('utf-8', errors='replace'), e.code
    except Exception as e:
        return str(e), 0

# 1. 세션 확인
_, manage_url, manage_status = http_get(blog_url + '/manage/')
if 'accounts.kakao.com' in manage_url or 'tistory.com/auth' in manage_url or manage_status in (401, 403):
    out({'error': 'TSSESSION 만료 — 티스토리 재로그인 후 쿠키를 다시 발급하세요', 'errorCode': 'AUTH'})

# 2. 에디터 초기화 (세션/CSRF 컨텍스트 확보)
new_post_url = blog_url + '/manage/newpost/'
http_get(new_post_url, referer=blog_url + '/manage/')

strip_chars = ['[', ']', '"', chr(39), '?', '!', '.', ',']
slug = title
for ch in strip_chars:
    slug = slug.replace(ch, '')
slug = re.sub(r'\\s+', '-', slug.strip())[:80] or 'post'

# 실제 캡처된 페이로드 그대로: visibility 0=비공개, 1=공개(보호), 3=공개(발행)
payload = {
    'title': title,
    'content': content,
    'slogan': slug,
    'visibility': 3 if is_publish else 0,
    'category': category_id,
    'tag': ','.join(tags[:10]),
    'acceptComment': 1,
    'published': 0,
    'password': secrets.token_urlsafe(6),
    'uselessMarginForEntry': 0,
    'daumLike': None,
    'cclCommercial': 2,
    'cclDerive': 2,
    'thumbnail': None,
    'type': 'post',
    'attachments': [],
    'recaptchaValue': '',
    'draftSequence': None,
    'totalWritingTimeMs': 3000,
}
body, status = http_json(blog_url + '/manage/post.json', payload, new_post_url)

if status != 200:
    out({'error': f'발행 실패 (status={status}): {body[:300]}', 'errorCode': 'PUBLISH_FAIL'})

# 생성 응답 포맷이 불안정할 수 있어, 글 목록 조회로 실제 생성된 글의 permalink를 확정한다
list_url = (blog_url + '/manage/posts.json?category=-3&page=1&searchType=title&visibility=all'
            + '&searchKeyword=' + urllib.parse.quote(title))
list_body, _, list_status = http_get(list_url, blog_url + '/manage/posts/')
match = None
try:
    items = json.loads(list_body).get('data', {}).get('items', [])
    match = next((it for it in items if it.get('title') == title), items[0] if items else None)
except Exception:
    pass

if not match:
    out({'error': '발행 요청은 200으로 응답했으나 글 목록에서 확인 실패', 'errorCode': 'VERIFY_FAIL'})

out({'postId': match.get('id'), 'postUrl': match.get('permalink'), 'visibility': match.get('visibility')})
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
      is_publish?: boolean;
      category_id?: number | string;
    };
    if (!body.user_id) return NextResponse.json({ error: 'user_id 필요 (내부 호출)' }, { status: 400 });
    userId = body.user_id;
    return handlePublish(userId, body.blog_id, body.title, body.content, body.tags ?? [], body.is_publish ?? true, body.category_id);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json() as {
    blog_id: string;
    title: string;
    content: string;
    tags?: string[];
    is_publish?: boolean;
    category_id?: number | string;
  };
  return handlePublish(user.id, body.blog_id, body.title, body.content, body.tags ?? [], body.is_publish ?? true, body.category_id);
}

async function handlePublish(
  userId: string,
  blogId: string,
  title: string,
  content: string,
  tags: string[],
  isPublish: boolean,
  categoryId?: number | string,
) {
  if (!blogId || !title || !content) {
    return NextResponse.json({ error: 'blog_id, title, content 필요' }, { status: 400 });
  }

  title = sanitizeInvisible(title);
  content = sanitizeInvisible(content);
  const problem = findHtmlProblem(title, content);
  if (problem) return NextResponse.json({ error: `발행 차단(불완전 HTML): ${problem}` }, { status: 422 });

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
    category: String(categoryId || 0),
    isPublish,
  });

  let result: { postId?: string | number; postUrl?: string; visibility?: string; error?: string; errorCode?: string };
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
      post_id: String(result.postId || ''),
      post_url: result.postUrl,
      title,
    });
  } catch { /* ignore */ }

  await supabase.from('tistory_connections')
    .update({ last_tested_at: new Date().toISOString() })
    .eq('id', blogId);

  return NextResponse.json({ ok: true, url: result.postUrl, post_id: result.postId, isDraft: !isPublish });
}
