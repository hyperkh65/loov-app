import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { nasExecWithStdin } from '@/lib/nas-ssh';

export const maxDuration = 30;

const TEST_SCRIPT = `#!/usr/bin/env python3
import sys, json, http.cookiejar
import urllib.request, urllib.error

data = json.loads(sys.stdin.read())
tssession = data['tssession']
blog_name = data['blogName']
blog_url = data.get('blogUrl', 'https://' + blog_name + '.tistory.com').rstrip('/')

ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

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

try:
    req = urllib.request.Request(
        blog_url + '/manage/',
        headers={'User-Agent': ua, 'Accept': 'text/html,*/*', 'Accept-Language': 'ko-KR,ko;q=0.9'},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        final_url = r.geturl()
        status = r.status
        html = r.read(2000).decode('utf-8', errors='replace')
except urllib.error.HTTPError as e:
    final_url = blog_url + '/manage/'
    status = e.code
    html = ''

if 'accounts.kakao.com' in final_url or 'tistory.com/auth' in final_url or status in (401, 403):
    print(json.dumps({'ok': False, 'reason': 'TSSESSION 만료 또는 인증 실패'}))
elif status == 200:
    # 관리 페이지 접근 성공 여부 확인
    is_manage = 'manage' in final_url or '글 관리' in html or 'dashboard' in html or '글쓰기' in html
    print(json.dumps({'ok': True, 'status': status, 'manage': is_manage}))
else:
    print(json.dumps({'ok': False, 'reason': f'status={status}, url={final_url}'}))
`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { blog_id } = await req.json() as { blog_id: string };
  if (!blog_id) return NextResponse.json({ error: 'blog_id 필요' }, { status: 400 });

  const { data: conn } = await supabase
    .from('tistory_connections')
    .select('blog_name, blog_url, tssession')
    .eq('id', blog_id)
    .eq('user_id', user.id)
    .single();

  if (!conn) return NextResponse.json({ error: '연결 없음' }, { status: 404 });

  const scriptPath = '/tmp/tistory_test.py';
  try {
    await nasExecWithStdin(
      `cat > ${scriptPath} && chmod +x ${scriptPath}`,
      TEST_SCRIPT,
    );
    const input = JSON.stringify({
      tssession: conn.tssession,
      blogName: conn.blog_name,
      blogUrl: conn.blog_url || `https://${conn.blog_name}.tistory.com`,
    });
    const { stdout, stderr } = await nasExecWithStdin(`python3 ${scriptPath}`, input);
    const lastLine = stdout.trim().split('\n').pop() || '';
    if (!lastLine) return NextResponse.json({ ok: false, reason: stderr?.slice(0, 200) || '출력 없음' });
    const result = JSON.parse(lastLine);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ ok: false, reason: String(e) }, { status: 500 });
  }
}
