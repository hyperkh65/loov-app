import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 120;

async function searchNaver(type: 'news' | 'blog', query: string) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];
  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/${type}.json?query=${encodeURIComponent(query)}&display=5&sort=date`,
      { headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map((item: { title: string; description: string; link: string }) => ({
      title: item.title.replace(/<[^>]+>/g, ''),
      description: item.description.replace(/<[^>]+>/g, ''),
      link: item.link,
    }));
  } catch { return []; }
}

async function searchPixabay(query: string): Promise<string | null> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&lang=ko&image_type=photo&per_page=5&safesearch=true&min_width=800`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.hits?.[0]?.webformatURL || null;
  } catch { return null; }
}

async function callOllamaCloud(prompt: string, model: string): Promise<string> {
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) throw new Error('OLLAMA_API_KEY 없음');

  const res = await fetch('https://ollama.com/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama API 오류: ${err}`);
  }

  const data = await res.json();
  return data.message?.content || '';
}

function buildPrompt(keyword: string, newsItems: {title:string;description:string}[], blogItems: {title:string;description:string}[]): string {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  const sources = [
    ...newsItems.map((n, i) => `[뉴스${i+1}] ${n.title}\n${n.description}`),
    ...blogItems.map((b, i) => `[블로그${i+1}] ${b.title}\n${b.description}`),
  ].join('\n\n');

  return `당신은 SEO 최적화 블로그 글 전문 작성가입니다. 구글 애드센스 수익 최적화에 맞게 글을 작성하세요.

포커스 키워드: "${keyword}"
오늘 날짜: ${today}

참고 자료:
${sources || '(참고 자료 없음 - 일반 지식으로 작성)'}

아래 형식으로 정확히 출력하세요 (마크다운 금지, HTML만 사용):

===TITLE===
(SEO 제목: 포커스 키워드를 앞부분에 포함, 30-60자)
===META===
(메타 설명: 포커스 키워드 포함, 120-160자)
===CONTENT===
(아래 HTML 형식으로 3000자 이상 작성)
===KEYWORDS===
(관련 키워드 10개, 쉼표로 구분)

HTML 형식 (반드시 이 구조 그대로):

<p data-ke-size="size16"><span style="background-color: #fafafa; color: #333333; text-align: start;">[제목] [날짜], [도입부 2문장 - 포커스 키워드 포함]</span></p>
<p data-ke-size="size16">[도입 2단락 - 배경과 맥락 설명 3문장]</p>
<div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; font-style: italic; margin-bottom: 25px; font-size: 15px;"><b>[제목]</b> [이 글의 핵심 내용 요약 2-3문장]</div>
<h3 style="margin-bottom: 15px;" data-ke-size="size23"><b><span style="background-color: #fafafa; color: #333333; text-align: start;">[제목]</span></b></h3>

(H2 섹션 5-6개 - 각 섹션 형식:)
<h2 id="sectionN" style="font-size: 22px; color: white; background: linear-gradient(to right, #1a73e8, #004d99); margin: 30px 0 15px; border-radius: 10px; padding: 10px 25px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>N. [섹션 제목 - 포커스 키워드 변형 포함]</b></h2>
<p style="margin-bottom: 15px;" data-ke-size="size16">[내용 단락 1 - 3-4문장]</p>
<p style="margin-bottom: 15px;" data-ke-size="size16">[내용 단락 2 - 3-4문장]</p>
<div style="background-color: #e8f4fd; border-left: 4px solid #1a73e8; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;"><b>💡 핵심 포인트</b><br />[이 섹션의 핵심 요약 1-2문장]</div>

(핵심 요약 카드:)
<div class="single-summary-card" style="border: 2px solid #ccc; padding: 20px; border-radius: 8px; max-width: 800px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin: 20px auto;">
<div class="card-header" style="display: flex; align-items: center; border-bottom: 2px solid #1a73e8; padding-bottom: 10px; margin-bottom: 10px;"><span style="font-size: 24px; color: #1a73e8; margin-right: 10px;" class="card-header-icon">💡</span>
<h3 style="font-size: 20px; color: #1a73e8; margin: 0;" data-ke-size="size23">핵심 요약</h3>
</div>
<div class="card-content" style="font-size: 16px; line-height: 1.5; color: #333;">
<div class="section" style="margin-bottom: 10px;"><b>첫 번째 핵심:</b> <span style="background-color: #fffde7; padding: 2px 5px; border-radius: 3px;">[핵심1]</span></div>
<div class="section" style="margin-bottom: 10px;"><b>두 번째 핵심:</b> <span style="background-color: #fffde7; padding: 2px 5px; border-radius: 3px;">[핵심2]</span></div>
<div class="section" style="margin-bottom: 10px;"><b>세 번째 핵심:</b> <span style="background-color: #fffde7; padding: 2px 5px; border-radius: 3px;">[핵심3]</span></div>
<div class="section" style="margin-bottom: 10px;"><b>네 번째 핵심:</b> <span style="background-color: #fffde7; padding: 2px 5px; border-radius: 3px;">[핵심4]</span></div>
</div>
<div class="card-footer" style="font-size: 14px; color: #777; border-top: 1px dashed #ddd; padding-top: 10px; margin-top: 10px; text-align: center;">[마무리 한 문장]</div>
</div>

(FAQ 섹션:)
<h2 id="faq" style="font-size: 22px; color: #1a73e8; margin: 30px 0 14px; padding-bottom: 8px; border-bottom: 2px solid #dcdcdc;" data-ke-size="size26"><b>자주 묻는 질문</b></h2>
<div style="margin: 22px 0 0;">
(FAQ 6개 - 각 형식:)
<div style="margin: 0 0 18px; padding: 14px; background-color: #f9f9f9; border: 1px solid #eeeeee; border-radius: 8px;">
<div style="font-weight: bold; margin: 0 0 6px; color: #1a73e8;">QN. [질문]</div>
<div style="color: #555;">[답변 2-3문장]</div>
</div>
</div>

(마지막 키워드 나열:)
<p data-ke-size="size16"><span style="background-color: #fafafa; color: #333333; text-align: start;">[키워드1], [키워드2], [키워드3], ... (10개)</span></p>

중요: HTML 외 다른 텍스트, 마크다운, 설명문 절대 금지. ===TITLE=== 등 섹션 구분자만 허용.`;
}

function parseAiOutput(raw: string) {
  const extract = (tag: string) => {
    const re = new RegExp(`===${tag}===\\s*([\\s\\S]*?)(?=====[A-Z]|$)`, 'i');
    const match = raw.match(re);
    return match ? match[1].trim() : '';
  };

  const title = extract('TITLE');
  const meta = extract('META');
  const content = extract('CONTENT');
  const keywordsRaw = extract('KEYWORDS');
  const keywords = keywordsRaw.split(',').map(k => k.trim()).filter(Boolean);

  return { title, meta_description: meta, content, keywords };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { keyword, ai_model = 'qwen3' } = await req.json();
  if (!keyword?.trim()) return NextResponse.json({ error: '키워드를 입력하세요' }, { status: 400 });

  // 1. 뉴스/블로그 수집
  const [newsItems, blogItems] = await Promise.all([
    searchNaver('news', keyword),
    searchNaver('blog', keyword),
  ]);

  const sources = [
    ...newsItems.map((n: {title:string;description:string;link:string}) => ({ type: 'news', ...n })),
    ...blogItems.map((b: {title:string;description:string;link:string}) => ({ type: 'blog', ...b })),
  ];

  // 2. AI 글 생성
  const prompt = buildPrompt(keyword, newsItems, blogItems);
  let rawOutput: string;
  try {
    rawOutput = await callOllamaCloud(prompt, ai_model);
  } catch (err) {
    return NextResponse.json({ error: `AI 생성 실패: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }

  const { title, meta_description, content, keywords } = parseAiOutput(rawOutput);
  if (!title || !content) {
    return NextResponse.json({ error: 'AI 출력 파싱 실패. 다시 시도해주세요.' }, { status: 500 });
  }

  // 3. 대표 이미지 검색
  const imageUrl = await searchPixabay(keyword);

  // 4. 글자 수 계산 (HTML 태그 제거)
  const wordCount = content.replace(/<[^>]+>/g, '').length;

  // 5. DB 저장
  const { data, error } = await supabase
    .from('bossai_auto_articles')
    .insert({
      user_id: user.id,
      keyword,
      focus_keyword: keyword,
      title,
      meta_description,
      content,
      representative_image_url: imageUrl,
      ai_model,
      status: 'draft',
      sources,
      word_count: wordCount,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ item: data, keywords, word_count: wordCount });
}
