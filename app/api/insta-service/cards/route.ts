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

  const prompt = `당신은 인스타그램 알짜정보 카드뉴스 전문 작가입니다. 독자가 스크롤을 멈추고 저장하게 만드는 후킹성 카드뉴스를 작성하세요.

제목: ${title}
키워드: ${keyword}
내용: ${content}

❗ 작성 원칙:
- 타이틀: "몰랐죠?", "이것만 알면!", "지금 당장 확인!", "90%가 모르는", "꼭 알아야 할" 등 궁금증 폭발
- 내용 카드: 알짜배기 정보를 재미있게, 구체적인 금액/날짜/조건 포함
- 이모지 풍부하게, 말투는 친근하고 흥미롭게
- 각 포인트: "→ 이거 몰랐다면 손해!", "💡 팁:" 등 맥락 추가

정확히 ${slide_count}개의 슬라이드 JSON 배열만 출력 (코드블록·설명 없이):
[
  {
    "type": "title",
    "title": "🔥 손가락 멈추는 강렬한 제목 (18자 이내)",
    "body": "→ 지금 바로 저장하세요! 나중에 필요할 거예요",
    "points": []
  },
  {
    "type": "content",
    "title": "📌 핵심 포인트 제목 (15자 이내)",
    "body": "💡 이것만 알면 당신도 이미 전문가",
    "points": [
      "✅ [구체적 자격/조건] — 몰랐으면 진짜 손해인 정보",
      "💰 [금액/혜택] — 최대 얼마까지? 구체적 숫자 포함",
      "📋 [신청 방법] — 딱 이렇게만 하면 됩니다",
      "⚠️ [주의사항] — 많이들 실수하는 바로 이것!",
      "🎯 [핵심 요약] — 오늘 배운 것 한 줄 정리"
    ]
  },
  ... (content 슬라이드 총 ${contentSlides}개),
  {
    "type": "brand",
    "title": "2days.kr",
    "body": "오늘의 알짜정보, 내일의 성공비결 💪",
    "points": [
      "📲 팔로우하면 매일 이런 알짜정보 받아봄",
      "💾 저장해두고 친구한테 공유하면 인싸됨",
      "🔔 놓치지 말고 알림 설정도 꼭 해두세요"
    ]
  }
]

규칙:
- 슬라이드 순서: title 1개 → content ${contentSlides}개 → brand 1개 (총 ${slide_count}개)
- content 슬라이드마다 points 반드시 4~5개, 각 25~50자
- 한국어, 재미있고 후킹성 있게
- JSON 배열만 출력`;

  try {
    const raw = await generateText(prompt, 'qwen3');
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('JSON 파싱 실패: ' + raw.slice(0, 200));
    const slides = JSON.parse(match[0]);
    if (!Array.isArray(slides)) throw new Error('슬라이드 배열이 아닙니다');
    const normalized = slides.map((s: { type: string; title: string; body: string; points?: string[] }) => ({
      ...s,
      points: Array.isArray(s.points) ? s.points : [],
    }));
    return NextResponse.json({ slides: normalized, title, keyword });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
