import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import { callAI } from '@/lib/ai-call';

export const maxDuration = 60;

async function getMediumUserId(token: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.medium.com/v1/me', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.id || null;
  } catch { return null; }
}

async function generateEnglishSummary(title: string, metaDesc: string, keyword: string): Promise<string> {
  try {
    const result = await callAI({
      provider: 'ollama',
      messages: [
        {
          role: 'user',
          content: `Write a concise 3-sentence English summary for a Korean blog article.
Title (Korean): ${title}
Keyword: ${keyword}
Korean description: ${metaDesc}

Rules:
- Write in natural English
- Do NOT mention "Korean article" or translation
- Focus on the topic factually
- End with "Read the full article for more details."
- Plain text only, no markdown`,
        },
      ],
      maxTokens: 200,
      temperature: 0.7,
    });
    return result.text.trim();
  } catch {
    return `${metaDesc} Read the full article for more details.`;
  }
}

// GET: 연결 상태 확인
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const token = await getSetting('MEDIUM_INTEGRATION_TOKEN');
  if (!token) return NextResponse.json({ configured: false });

  const userId = await getMediumUserId(token);
  return NextResponse.json({ configured: !!userId, connected: !!userId });
}

// POST: Medium에 글 발행
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { title, meta_description, keyword, canonical_url, representative_image_url } = await req.json() as {
    title: string;
    meta_description: string;
    keyword: string;
    canonical_url: string;
    representative_image_url?: string;
  };

  if (!title || !canonical_url) return NextResponse.json({ error: 'title, canonical_url 필요' }, { status: 400 });

  const token = await getSetting('MEDIUM_INTEGRATION_TOKEN');
  if (!token) return NextResponse.json({ error: 'Medium 토큰이 설정되지 않았습니다' }, { status: 400 });

  const mediumUserId = await getMediumUserId(token);
  if (!mediumUserId) return NextResponse.json({ error: 'Medium 연결 실패 — 토큰을 확인하세요' }, { status: 400 });

  // 영문 요약 생성
  const summary = await generateEnglishSummary(title, meta_description || '', keyword || '');

  // Medium HTML 콘텐츠 구성
  const imageHtml = representative_image_url
    ? `<img src="${representative_image_url}" alt="${title}" style="width:100%;max-width:800px;border-radius:8px;margin-bottom:16px;" />`
    : '';

  const content = `
${imageHtml}
<p>${summary}</p>
<p>━━━━━━━━━━━━━━━━━━</p>
<p>🔗 <a href="${canonical_url}"><strong>Read the full article (Korean)</strong></a></p>
<p style="font-size:12px;color:#888;">This is a brief English summary. The original article is in Korean.</p>
`.trim();

  // 태그 생성 (keyword → 영어 단어로 분리, 최대 5개)
  const tags = [
    keyword?.split(' ')[0] || 'korea',
    'korea',
    'korean-blog',
    'news',
    'information',
  ].filter(Boolean).slice(0, 5);

  try {
    const res = await fetch(`https://api.medium.com/v1/users/${mediumUserId}/posts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `[Summary] ${title}`,
        contentFormat: 'html',
        content,
        tags,
        publishStatus: 'public',
        canonicalUrl: canonical_url,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Medium 오류: ${err.slice(0, 200)}` }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json({ success: true, url: data.data?.url });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
