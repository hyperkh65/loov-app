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
      content = stripHtml(article.content || '').slice(0, 2500);
    }
  }

  const contentSlides = Math.max(2, slide_count - 2);

  const prompt = `블로그 글을 인스타그램 카드뉴스 슬라이드로 변환하세요.

제목: ${title}
키워드: ${keyword}
내용: ${content}

정확히 ${slide_count}개의 슬라이드 JSON 배열로만 출력하세요 (다른 텍스트 없이):
[
  {"type":"title","title":"강렬한 후킹 제목 (20자 이내)","body":"한 줄 부제목 (30자 이내)"},
  ${Array.from({length: contentSlides}, (_, i) => `{"type":"content","title":"포인트 ${i+1} 제목 (15자 이내)","body":"핵심 내용 설명 (60자 이내)"}`).join(',\n  ')},
  {"type":"brand","title":"2days.kr","body":"오늘의 정보 내일의 성공"}
]

규칙:
- 반드시 type이 title → content×${contentSlides} → brand 순서
- 핵심 포인트만 간결하게
- 한국어로 작성
- JSON만 출력 (코드블록 없이)`;

  try {
    const raw = await generateText(prompt, 'qwen3');
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('JSON 파싱 실패: ' + raw.slice(0, 100));
    const slides = JSON.parse(match[0]);
    if (!Array.isArray(slides)) throw new Error('슬라이드 배열이 아닙니다');
    return NextResponse.json({ slides, title, keyword });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
