import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { title, meta_description, keyword, canonical_url } = await req.json() as {
    title: string;
    meta_description?: string;
    keyword?: string;
    canonical_url: string;
  };

  if (!title || !canonical_url) return NextResponse.json({ error: 'title, canonical_url 필요' }, { status: 400 });

  const accessToken = await getSetting('LINKEDIN_ACCESS_TOKEN');
  if (!accessToken) {
    return NextResponse.json({ error: 'LinkedIn Access Token 누락 — 설정 페이지에서 입력해주세요' }, { status: 400 });
  }

  try {
    // 프로필 URN 조회
    const meRes = await fetch('https://api.linkedin.com/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!meRes.ok) {
      return NextResponse.json(
        { error: 'LinkedIn 인증 실패 — Access Token을 확인해주세요 (만료 여부 확인)' },
        { status: 500 },
      );
    }
    const meData = await meRes.json();
    const personUrn = `urn:li:person:${meData.id}`;

    const tags = keyword ? `#${keyword.split(' ')[0].replace(/[^a-zA-Z0-9가-힣]/g, '')}` : '';
    const commentary = `${title}\n\n${meta_description || ''}\n\n${tags}`.trim();

    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: commentary },
            shareMediaCategory: 'ARTICLE',
            media: [{
              status: 'READY',
              description: { text: (meta_description || '').slice(0, 256) },
              originalUrl: canonical_url,
              title: { text: title.slice(0, 200) },
            }],
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: `LinkedIn 오류 (${res.status}): ${data.message || JSON.stringify(data)}` },
        { status: 500 },
      );
    }

    const postId = res.headers.get('X-RestLi-Id') || data.id;
    const url = postId ? `https://www.linkedin.com/feed/update/${postId}` : undefined;
    return NextResponse.json({ success: true, url });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const accessToken = await getSetting('LINKEDIN_ACCESS_TOKEN');
  return NextResponse.json({ configured: !!accessToken });
}
