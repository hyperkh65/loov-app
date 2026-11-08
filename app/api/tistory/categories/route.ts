import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { nasExecWithStdin } from '@/lib/nas-ssh';

export const maxDuration = 30;

const PY = `
import sys, json, urllib.request
d = json.loads(sys.stdin.read())
base = d['url'].rstrip('/')
req = urllib.request.Request(base + '/manage/category.json', headers={
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest',
    'Cookie': 'TSSESSION=' + d['s'], 'Referer': base + '/manage/category',
})
try:
    body = urllib.request.urlopen(req, timeout=20).read().decode('utf-8', 'replace')
    cats = json.loads(body)['categories']
except Exception:
    print(json.dumps({'error': 'SESSION'})); sys.exit(0)
out = []
def walk(items):
    for c in items:
        out.append({'id': c['id'], 'label': c.get('label') or c['name'], 'leaf': bool(c.get('leaf'))})
        walk(c.get('children') or [])
walk(cats)
print(json.dumps({'categories': out}, ensure_ascii=False))
`;

// 발행 라우트(auto-service/publish)가 고르는 것과 같은 연결(첫 활성 티스토리 블로그)의 카테고리를 돌려준다
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data: conns } = await createAdminClient()
    .from('tistory_connections')
    .select('blog_name, blog_url, tssession')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1);
  const conn = conns?.[0];
  if (!conn?.tssession) return NextResponse.json({ error: '활성화된 티스토리 블로그 없음' }, { status: 400 });

  const b64 = Buffer.from(PY).toString('base64');
  const input = JSON.stringify({ url: conn.blog_url || `https://${conn.blog_name}.tistory.com`, s: conn.tssession });
  try {
    const { stdout } = await nasExecWithStdin(`python3 -c "$(echo ${b64} | base64 -d)"`, input, 30_000);
    const r = JSON.parse(stdout.trim().split('\n').pop() || '{}');
    if (r.error) return NextResponse.json({ error: '티스토리 세션 만료 — 쿠키를 다시 등록하세요' }, { status: 400 });
    return NextResponse.json({ blog: conn.blog_name, categories: r.categories ?? [] });
  } catch (e) {
    return NextResponse.json({ error: `카테고리 조회 실패: ${String(e)}` }, { status: 500 });
  }
}
