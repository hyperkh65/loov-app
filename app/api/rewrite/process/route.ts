/**
 * POST /api/rewrite/process
 * 리라이팅 처리: pending 기사 1개를 AI로 리라이팅
 * Auth: Bearer CRON_SECRET
 * Body: { article_id?: string, ai_model?: string }
 *   - article_id 없으면 oldest pending 자동 선택
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';
import { cleanWatermarks, ANTI_WATERMARK_PROMPT } from '@/lib/ai-watermark';

export const maxDuration = 300;

function authOk(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.BOT_SECRET;
  return !!(secret && req.headers.get('authorization') === `Bearer ${secret}`);
}

function err(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function buildRewritePrompt(title: string, originalContent: string): string {
  return `당신은 대한민국 최고의 SEO 전문 블로그 작가입니다.

${ANTI_WATERMARK_PROMPT}

아래 원문 기사를 철저히 분석하여, 동일한 정보를 전달하되 완전히 새로운 문장과 구성으로 SEO 최적화 블로그 글을 작성하세요.

═══════════════════════════════════
■ 리라이팅 핵심 원칙 (반드시 준수)
═══════════════════════════════════

【독창성 원칙】
- 원문의 문장을 그대로 복사하지 말 것 (표절 금지)
- 핵심 정보와 사실은 유지하되, 표현 방식을 완전히 새롭게 재구성
- 원문에 없는 관련 배경 지식이나 맥락을 추가하여 글을 풍성하게

【두괄식 원칙】
- 모든 소제목과 단락의 첫 문장에 핵심 결론/사실을 먼저 쓸 것
- 독자가 첫 문장만 읽어도 그 단락의 핵심을 파악할 수 있어야 함

【소제목 원칙】
- 소제목은 원문 맥락에 맞게 직접 결정
- 고정 템플릿 소제목 절대 사용 금지

【분량 원칙】
- 순수 텍스트(HTML 태그 제외) 최소 4000자 이상
- H2 섹션 6개, 각 섹션 단락 3개 이상
- 각 단락 최소 5문장

원문 제목: "${title}"

══════════════════════════════
■ 원문 내용 (분석 후 리라이팅)
══════════════════════════════

${originalContent || '(원문 없음 - 제목 기반으로 SEO 블로그 글 작성)'}

══════════════════════════════
■ 출력 형식 (이 구조 그대로 출력)
══════════════════════════════

===TITLE===
[포커스 키워드를 앞에 포함한 SEO 제목, 40-60자]
===META===
[포커스 키워드 포함, 독자 클릭 유발하는 메타 설명 130-160자]
===CONTENT===
<p data-ke-size="size16"><span style="background-color:#fafafa;color:#333333;">[두괄식 도입: 이 글의 핵심 결론/사실을 첫 문장에 직접 명시. 2-3문장]</span></p>
<p data-ke-size="size16">[배경과 맥락 3-4문장]</p>
<div style="background-color:#f5f5f5;padding:15px;border-radius:8px;font-style:italic;margin-bottom:25px;font-size:15px;"><b>[핵심 한줄 요약]</b> [2-3문장]</div>

<h2 id="section1" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>1. [소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식 7-8문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석 5-6문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점 5문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[2-3문장]</div>

<h2 id="section2" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>2. [소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식 7-8문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석 5-6문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점 5문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[2-3문장]</div>

<h2 id="section3" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>3. [소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식 7-8문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석 5-6문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점 5문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[2-3문장]</div>

<h2 id="section4" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>4. [소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식 7-8문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석 5-6문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점 5문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[2-3문장]</div>

<h2 id="section5" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>5. [소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식 7-8문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석 5-6문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점 5문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[2-3문장]</div>

<h2 id="section6" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>6. [소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식 7-8문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석 5-6문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[향후 전망 5-6문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[2-3문장]</div>

<div class="single-summary-card" style="border:2px solid #ccc;padding:20px;border-radius:8px;max-width:800px;background-color:#ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.1);margin:20px auto;">
<div class="card-header" style="display:flex;align-items:center;border-bottom:2px solid #1a73e8;padding-bottom:10px;margin-bottom:10px;"><span style="font-size:24px;color:#1a73e8;margin-right:10px;">💡</span><h3 style="font-size:20px;color:#1a73e8;margin:0;" data-ke-size="size23">핵심 요약</h3></div>
<div class="card-content" style="font-size:16px;line-height:1.5;color:#333;">
<div class="section" style="margin-bottom:10px;"><b>첫 번째 핵심:</b> <span style="background-color:#fffde7;padding:2px 5px;border-radius:3px;">[핵심 사실 1문장]</span></div>
<div class="section" style="margin-bottom:10px;"><b>두 번째 핵심:</b> <span style="background-color:#fffde7;padding:2px 5px;border-radius:3px;">[핵심 사실 1문장]</span></div>
<div class="section" style="margin-bottom:10px;"><b>세 번째 핵심:</b> <span style="background-color:#fffde7;padding:2px 5px;border-radius:3px;">[핵심 사실 1문장]</span></div>
<div class="section" style="margin-bottom:10px;"><b>네 번째 핵심:</b> <span style="background-color:#fffde7;padding:2px 5px;border-radius:3px;">[독자 행동 1문장]</span></div>
</div>
<div class="card-footer" style="font-size:14px;color:#777;border-top:1px dashed #ddd;padding-top:10px;margin-top:10px;text-align:center;">[마무리 한 문장]</div>
</div>
===KEYWORDS===
[관련 키워드 10개 쉼표 구분]
`;
}

function parseAIOutput(raw: string): { title: string; meta: string; content: string } {
  const get = (tag: string, next: string) => {
    const start = raw.indexOf(`===${tag}===`);
    if (start === -1) return '';
    const from = start + tag.length + 6;
    const end = raw.indexOf(`===${next}===`, from);
    return (end === -1 ? raw.slice(from) : raw.slice(from, end)).trim();
  };
  return {
    title: get('TITLE', 'META'),
    meta: get('META', 'CONTENT'),
    content: get('CONTENT', 'KEYWORDS'),
  };
}

export async function POST(req: NextRequest) {
  if (!authOk(req)) return err('인증 실패', 401);

  const body = await req.json().catch(() => ({}));
  const { article_id, ai_model = 'qwen3' } = body as { article_id?: string; ai_model?: string };
  const ownerId = process.env.OWNER_USER_ID!;

  const supabase = await createAdminClient();

  // 처리할 기사 선택
  let article: { id: string; title: string; original_content: string } | null = null;

  if (article_id) {
    const { data } = await supabase
      .from('bossai_rewrite_articles')
      .select('id, title, original_content')
      .eq('id', article_id)
      .eq('user_id', ownerId)
      .single();
    article = data;
  } else {
    // oldest pending 선택
    const { data } = await supabase
      .from('bossai_rewrite_articles')
      .select('id, title, original_content')
      .eq('user_id', ownerId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    article = data;
  }

  if (!article) {
    return NextResponse.json({ ok: true, message: '처리할 기사 없음', processed: 0 });
  }

  // 상태를 rewriting으로 변경
  await supabase
    .from('bossai_rewrite_articles')
    .update({ status: 'rewriting', updated_at: new Date().toISOString() })
    .eq('id', article.id);

  try {
    const prompt = buildRewritePrompt(article.title, article.original_content);
    const raw = await generateText(prompt, ai_model);
    const cleaned = cleanWatermarks(raw);
    const { title, meta, content } = parseAIOutput(cleaned);

    const wordCount = content.replace(/<[^>]+>/g, '').length;

    await supabase
      .from('bossai_rewrite_articles')
      .update({
        rewritten_title: title || article.title,
        rewritten_meta: meta,
        rewritten_content: content,
        ai_model,
        status: 'ready',
        word_count: wordCount,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', article.id);

    return NextResponse.json({
      ok: true,
      processed: 1,
      data: {
        id: article.id,
        title: title || article.title,
        word_count: wordCount,
      },
    });
  } catch (e) {
    await supabase
      .from('bossai_rewrite_articles')
      .update({
        status: 'failed',
        error_message: String(e).slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('id', article.id);

    return NextResponse.json({ ok: false, error: String(e), processed: 0 }, { status: 500 });
  }
}
