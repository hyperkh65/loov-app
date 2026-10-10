import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const accessToken = await getSetting('PINTEREST_ACCESS_TOKEN');
  if (!accessToken) {
    return NextResponse.json({ error: 'Pinterest Access Token이 설정되지 않았습니다' }, { status: 400 });
  }

  try {
    const res = await fetch('https://api.pinterest.com/v5/boards?page_size=50', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        return NextResponse.json({ error: 'Access Token이 만료되었거나 유효하지 않습니다. 토큰을 재발급해주세요.' }, { status: 401 });
      }
      return NextResponse.json({ error: `Pinterest 오류 (${res.status}): ${(data as { message?: string }).message || '알 수 없는 오류'}` }, { status: 500 });
    }

    const data = await res.json() as { items?: { id: string; name: string; description?: string; privacy?: string }[] };
    const boards = (data.items || []).map(b => ({
      id: b.id,
      name: b.name,
      privacy: b.privacy || 'PUBLIC',
    }));

    return NextResponse.json({ boards });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
