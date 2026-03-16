import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 60;

export interface YarnClip {
  id: string;
  text: string;
  videoUrl: string;
  thumbnailUrl: string;
  show: string;
  platform: 'yarn';
}

const SCRAPER_URL = process.env.YARN_SCRAPER_URL ?? '';
const SCRAPER_SECRET = process.env.YARN_SCRAPER_SECRET ?? '';

function scraperHeaders(): Record<string, string> {
  return SCRAPER_SECRET ? { 'x-secret': SCRAPER_SECRET } : {};
}

// ── Python 스크래퍼 서비스 호출 ───────────────────────────────────────────
async function searchViaScaper(query: string): Promise<YarnClip[]> {
  if (!SCRAPER_URL) throw new Error('YARN_SCRAPER_URL 환경변수가 설정되지 않았습니다.');

  const res = await fetch(
    `${SCRAPER_URL}/search?q=${encodeURIComponent(query)}&limit=30`,
    {
      headers: scraperHeaders(),
      signal: AbortSignal.timeout(50000),
    }
  );

  if (!res.ok) throw new Error(`스크래퍼 서비스 오류: ${res.status}`);

  const data = await res.json() as {
    clips?: YarnClip[];
    error?: string;
    total?: number;
  };

  if (data.error) throw new Error(data.error);

  // 브라우저가 직접 y.yarn.co CDN에 접근 (CF는 실제 브라우저 허용)
  return (data.clips ?? []);
}

// ── 번역 ──────────────────────────────────────────────────────────────────
async function translateToKorean(text: string): Promise<string> {
  const gKey = process.env.GEMINI_API_KEY;
  if (gKey) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(gKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(
        `다음 영어 문장을 자연스럽고 짧은 한국어 구어체로 번역해줘 (번역문만 출력):\n"${text}"`
      );
      return result.response.text().trim();
    } catch { /* fall through */ }
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return '';
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: '영어 문장을 자연스러운 한국어 구어체로 번역해줘. 번역문만 출력.' },
          { role: 'user', content: `"${text}"` },
        ],
        temperature: 0.3, max_tokens: 200,
      }),
    });
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  } catch { return ''; }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');
    const action = searchParams.get('action');
    const text = searchParams.get('text');

    if (action === 'translate' && text) {
      const ko = await translateToKorean(text);
      return NextResponse.json({ ko });
    }

    if (!q) return NextResponse.json({ error: '검색어 필요' }, { status: 400 });

    if (!SCRAPER_URL) {
      return NextResponse.json({
        error: 'YARN_SCRAPER_URL이 설정되지 않았습니다. Railway에 Python 스크래퍼를 배포하고 환경변수를 설정해주세요.',
      }, { status: 503 });
    }

    const clips = await searchViaScaper(q);
    return NextResponse.json({
      clips,
      total: clips.length,
      query: q,
      source: 'yarn.co (via Railway scraper)',
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
