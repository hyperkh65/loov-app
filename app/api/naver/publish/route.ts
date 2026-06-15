import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { postToNaverBlog, postToNaverBlogOAuth, refreshNaverToken, sanitizeForNaver } from '@/lib/naver-blog';
import { nasExec, nasExecWithStdin } from '@/lib/nas-ssh';

const NAS_SCRIPT_PATH = '/volume1/homes/urjent/naver_publish/post.py';

// Python script that runs on NAS (home IP) to bypass Naver's cloud IP block
const NAVER_POST_SCRIPT = `#!/usr/bin/env python3
import sys, json, re
import urllib.request, urllib.parse, urllib.error

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

cookie = 'NID_AUT=' + nid_aut + '; NID_SES=' + nid_ses
ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

def make_headers(extra=None):
    h = {'Cookie': cookie, 'User-Agent': ua, 'Accept-Language': 'ko-KR,ko;q=0.9', 'Accept': 'application/json, text/html, */*'}
    if extra:
        h.update(extra)
    return h

def http_get(url):
    req = urllib.request.Request(url, headers=make_headers())
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.read().decode('utf-8', errors='replace'), r.geturl(), r.status
    except Exception as e:
        return '', url, 0

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

# Method 1: PostWriteFormsave
try:
    form_html, _, _ = http_get('https://blog.naver.com/PostWriteForm.naver?blogId=' + blog_id)
    hidden = {}
    input_re = '<input[^>]+type=[' + DQ + SQ + ']hidden[' + DQ + SQ + '][^>]*>'
    name_re = 'name=[' + DQ + SQ + ']([^' + DQ + SQ + ']+)[' + DQ + SQ + ']'
    value_re = 'value=[' + DQ + SQ + ']([^' + DQ + SQ + ']*)[' + DQ + SQ + ']'
    for m in re.finditer(input_re, form_html, re.I):
        nm = re.search(name_re, m.group())
        vm = re.search(value_re, m.group())
        if nm:
            hidden[nm.group(1)] = vm.group(1) if vm else ''
    post_data = {**hidden,
        'blogId': blog_id, 'title': title, 'body': content,
        'tag': ','.join(tags[:30]), 'categoryNo': str(category_no),
        'isPublish': '1' if is_publish else '0', 'publishType': 'A' if is_publish else 'B',
        'postWriteRootPath': 'BLOG', 'logNo': '0', 'postWriteFormType': 'default',
    }
    form_bytes = urllib.parse.urlencode(post_data).encode('utf-8')
    body, final_url, status = http_post('https://blog.naver.com/PostWriteFormsave.naver', form_bytes,
        {**make_headers(), 'Content-Type': 'application/x-www-form-urlencoded',
         'Referer': 'https://blog.naver.com/PostWriteForm.naver?blogId=' + blog_id,
         'Origin': 'https://blog.naver.com'})
    if status in (401, 403):
        out({'error': '인증 실패 쿠키 재발급 필요', 'errorCode': 'AUTH'})
    if 200 <= status < 300:
        m = re.search(r'logNo=([0-9]+)', final_url) or re.search(r'/([0-9]{5,})(?:[^0-9/?#]|$)', final_url)
        if not m:
            logno_re = 'logNo[=:][' + DQ + SQ + ' ]*([0-9]{5,})'
            postno_re = DQ + '(?:logNo|postNo)' + DQ + '[ ]*:[ ]*' + DQ + '?([0-9]{5,})' + DQ + '?'
            m = re.search(logno_re, body) or re.search(postno_re, body)
        if m:
            pid = m.group(1)
            out({'postId': pid, 'postUrl': 'https://blog.naver.com/' + blog_id + '/' + pid})
    errors.append('Formsave ' + str(status) + ': ' + body[:150])
except Exception as e:
    errors.append('Formsave exc: ' + str(e))

# Method 2: JSON REST API
for api_url in [
    'https://blog.naver.com/api/v1/blogs/' + blog_id + '/posts',
    'https://blog.naver.com/api/v2/blogs/' + blog_id + '/posts',
    'https://m.blog.naver.com/api/v1/blogs/' + blog_id + '/posts',
]:
    try:
        jdata = json.dumps({'title': title, 'contents': content, 'tags': tags[:30],
            'isPublish': is_publish, 'categoryNo': category_no, 'isOpen': True}).encode('utf-8')
        body, _, status = http_post(api_url, jdata, {**make_headers(),
            'Content-Type': 'application/json;charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': 'https://blog.naver.com',
            'Referer': 'https://blog.naver.com/' + blog_id})
        if 200 <= status < 300:
            d = json.loads(body)
            pid = str(d.get('logNo') or d.get('postId') or d.get('id') or d.get('no') or '')
            out({'postId': pid, 'postUrl': 'https://blog.naver.com/' + blog_id + ('/' + pid if pid else '')})
        if status in (401, 403):
            out({'error': '인증 실패 (' + str(status) + ')', 'errorCode': 'AUTH'})
        errors.append('REST ' + str(status) + ' ' + api_url.split('naver.com')[1])
    except Exception as e:
        errors.append('REST exc: ' + str(e))

out({'error': '발행 실패: ' + ' | '.join(errors), 'errorCode': 'UNKNOWN'})
`;

async function ensureNasScript(): Promise<void> {
  const check = await nasExec(`test -f ${NAS_SCRIPT_PATH} && echo exists || echo missing`);
  if (check.stdout.includes('missing') || check.code !== 0) {
    await nasExec(`mkdir -p /volume1/homes/urjent/naver_publish`);
    await nasExecWithStdin(`cat > ${NAS_SCRIPT_PATH} && chmod +x ${NAS_SCRIPT_PATH}`, NAVER_POST_SCRIPT);
  }
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
