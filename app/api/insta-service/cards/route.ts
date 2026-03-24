import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';

export const maxDuration = 60;

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { article_id, topic, slide_count = 6 } = await req.json();

  let title = topic || '';
  let content = '';
  let keyword = '';

  if (article_id) {
    const { data: article } = await supabase
      .from('bossai_auto_articles')
      .select('title, content, focus_keyword, keyword, meta_description')
      .eq('id', article_id)
      .eq('user_id', user.id)
      .single();

    if (article) {
      title = article.title || '';
      keyword = article.focus_keyword || article.keyword || '';
      content = stripHtml(article.content || '').slice(0, 3000);
    }
  }

  const contentSlides = Math.max(2, slide_count - 2);

  const prompt = `블로그 글을 인스타그램 카드뉴스로 변환하세요. 각 슬라이드는 핵심 포인트를 bullet points로 풍부하게 작성합니다.

제목: ${title}
키워드: ${keyword}
내용: ${content}

정확히 ${slide_count}개의 슬라이드 JSON 배열로만 출력하세요 (다른 텍스트, 코드블록 없이):
[
  {
    "type": "title",
    "title": "눈길을 끄는 후킹 제목 (20자 이내)",
    "body": "독자의 궁금증을 자극하는 한 줄 부제목",
    "points": []
  },
  {
    "type": "content",
    "title": "첫 번째 핵심 주제 제목",
    "body": "이 슬라이드의 핵심 한 줄 요약",
    "points": [
      "✅ 첫 번째 중요 포인트 - 구체적인 내용을 2줄 분량으로",
      "📌 두 번째 포인트 - 숫자나 데이터를 포함하면 더 좋음",
      "💡 세 번째 포인트 - 실용적인 팁이나 주의사항",
      "🔑 네 번째 포인트 - 핵심 요약 또는 행동 지침"
    ]
  },
  ... (content 슬라이드 ${contentSlides}개),
  {
    "type": "brand",
    "title": "2days.kr",
    "body": "오늘의 정보, 내일의 성공",
    "points": ["📲 팔로우하고 매일 유용한 정보 받기", "💾 저장해두고 필요할 때 꺼내보기", "🔗 친구에게 공유해서 함께 성장하기"]
  }
]

규칙:
- type 순서: title → content×${contentSlides}개 → brand (정확히 ${slide_count}개)
- content 슬라이드마다 points 배열에 반드시 4~5개 bullet point 작성
- 각 point는 이모지로 시작, 구체적이고 실용적인 내용 (20~40자)
- title은 20자 이내, body는 30자 이내
- 한국어로 작성
- JSON 배열만 출력 (설명 없이)`;

  try {
    const raw = await generateText(prompt, 'qwen3');
    // Extract JSON array
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('JSON 파싱 실패: ' + raw.slice(0, 200));
    const slides = JSON.parse(match[0]);
    if (!Array.isArray(slides)) throw new Error('슬라이드 배열이 아닙니다');
    // Ensure every slide has a points array
    const normalized = slides.map((s: { type: string; title: string; body: string; points?: string[] }) => ({
      ...s,
      points: Array.isArray(s.points) ? s.points : [],
    }));
    return NextResponse.json({ slides: normalized, title, keyword });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
