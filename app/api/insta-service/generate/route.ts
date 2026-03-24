import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';

export const maxDuration = 60;

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { article_id, topic, tone = 'casual' } = await req.json();

  let title = topic || '';
  let keyword = '';
  let summary = '';

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
      summary = article.meta_description || stripHtml(article.content || '').slice(0, 500);
    }
  }

  const toneGuide = tone === 'casual'
    ? '친근하고 편안한 말투, 이모지 풍부하게 사용'
    : tone === 'professional'
    ? '전문적이고 신뢰감 있는 말투, 이모지 적절히 사용'
    : '트렌디하고 감각적인 말투, 이모지와 라인브레이크 활용';

  const prompt = `당신은 인스타그램 마케터입니다. 다음 내용을 인스타그램 게시물 캡션으로 작성하세요.

제목: ${title}
키워드: ${keyword}
요약: ${summary}
톤: ${toneGuide}

요구사항:
- 한국어로 작성
- 1-3문장의 메인 카피 (감성적이고 공감 유도)
- 줄바꿈으로 가독성 확보
- 관련 해시태그 20-30개 (마지막에 모아서)
- 전체 2200자 이내
- 마케팅적으로 자연스럽게, 광고 느낌 최소화
- Call-to-action 포함 (예: 댓글, 저장, 팔로우 유도)

캡션만 출력하세요 (설명 없이):`;

  try {
    const caption = await generateText(prompt, 'qwen3');
    const hashtagMatch = caption.match(/#[\w가-힣]+/g) || [];
    return NextResponse.json({ caption, hashtags: hashtagMatch });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
