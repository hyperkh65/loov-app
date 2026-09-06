/**
 * POST /api/rewrite/process
 * 리라이팅 처리: pending 기사 1개를 AI로 리라이팅
 * Auth: Bearer CRON_SECRET
 * Body: { article_id?: string, ai_model?: string }
 *   - article_id 없으면 oldest pending 자동 선택
 *
 * 프롬프트/파싱은 "블로그 자동화"(generateBlogContent)와 동일한 검증된
 * 파이프라인(buildBlogPrompt + parseAiOutput)을 재사용한다 — 원래 이 라우트만
 * 쓰던 별도의 인라인 HTML 프롬프트는 출력 토큰이 훨씬 많아 자주 중간에
 * 끊기거나(본문 누락) 시간이 오래 걸렸음.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';
import { cleanWatermarks } from '@/lib/ai-watermark';
import { searchNaver, buildBlogPrompt, parseAiOutput, insertRepresentativeImageIntoContent, insertImagesIntoContent } from '@/lib/blog-content-generator';
import { generateAndUploadThumbnail } from '@/lib/auto-blog-thumbnail';

export const maxDuration = 300;

async function authOk(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET || process.env.BOT_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return !!user;
  } catch { return false; }
}

function err(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: NextRequest) {
  if (!await authOk(req)) return err('인증 실패', 401);

  const body = await req.json().catch(() => ({}));
  const { article_id, ai_model = 'qwen3' } = body as { article_id?: string; ai_model?: string };
  const ownerId = process.env.OWNER_USER_ID!;

  const supabase = await createAdminClient();

  // 처리할 기사 선택
  type ArticleRow = {
    id: string; title: string; original_content: string;
    source_id: string | null; representative_image_url: string | null; image_urls: string[] | null;
  };
  const SELECT_COLS = 'id, title, original_content, source_id, representative_image_url, image_urls';
  let article: ArticleRow | null = null;

  if (article_id) {
    const { data } = await supabase
      .from('bossai_rewrite_articles')
      .select(SELECT_COLS)
      .eq('id', article_id)
      .eq('user_id', ownerId)
      .single();
    article = data;
  } else {
    // oldest pending 선택
    const { data } = await supabase
      .from('bossai_rewrite_articles')
      .select(SELECT_COLS)
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
    // 다른 뉴스/블로그도 곁들여 맥락 보강 (블로그 자동화와 동일)
    const [news, blogs] = await Promise.all([
      searchNaver('news', article.title),
      searchNaver('blog', article.title),
    ]);

    const prompt = buildBlogPrompt(article.title, news, blogs, {
      title: article.title,
      content: article.original_content,
    });
    const raw = await generateText(prompt, ai_model);
    const cleaned = cleanWatermarks(raw);
    const { title, meta_description: meta, content: rawContent } = parseAiOutput(cleaned);

    if (!title || !rawContent) {
      throw new Error('AI 출력 파싱 실패 (제목/본문 없음) — 모델 응답이 중간에 끊겼을 수 있음');
    }

    // 이미지: 원문에서 스크랩된 게 있으면 그걸 쓰고, 없으면 대표이미지를 새로 생성
    let content = rawContent;
    let representativeImageUrl = article.representative_image_url;
    if (representativeImageUrl) {
      content = insertRepresentativeImageIntoContent(content, representativeImageUrl, title);
      if (article.image_urls?.length) content = insertImagesIntoContent(content, article.image_urls, title);
    } else {
      try {
        representativeImageUrl = await generateAndUploadThumbnail(title, article.title, 'blue');
        if (representativeImageUrl) content = insertRepresentativeImageIntoContent(content, representativeImageUrl, title);
      } catch { /* 썸네일은 선택사항 */ }
    }

    const wordCount = content.replace(/<[^>]+>/g, '').length;

    await supabase
      .from('bossai_rewrite_articles')
      .update({
        rewritten_title: title,
        rewritten_meta: meta,
        rewritten_content: content,
        representative_image_url: representativeImageUrl,
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
      data: { id: article.id, title, word_count: wordCount },
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
