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
import { searchNaver, searchInlineImages, buildBlogPrompt, parseAiOutput, insertRepresentativeImageIntoContent, insertImagesIntoContent } from '@/lib/blog-content-generator';
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

  // maxDuration(300s)을 넘겨 함수가 강제 종료되면 catch 블록까지 못 가고
  // 'rewriting' 상태에서 영영 멈추는 문제가 실사용 중 확인됨(위즈데이터센터
  // 소스에서 최대 3일 이상 방치된 사례 다수) — 10분 이상 rewriting인 건 죽은
  // 시도로 보고 pending으로 되돌려 다음 라운드에 재시도되게 함
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await supabase
    .from('bossai_rewrite_articles')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .eq('status', 'rewriting')
    .lt('updated_at', staleThreshold);

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
    // 전체 통틀어 가장 오래된 pending 하나만 뽑으면, 백로그가 큰 소스(예:
    // 수십 개씩 쌓인 소스)가 큐를 계속 독점해서 다른 소스의 새 글이 몇 시간이고
    // 뒤로 밀리는 문제가 실사용 중 확인됨 — 소스별로 "가장 최근에 처리된 시각"이
    // 오래된(=한동안 순서를 못 받은) 소스부터 우선 배정하는 라운드로빈으로 변경
    const { data: pendingBySource } = await supabase
      .from('bossai_rewrite_articles')
      .select('source_id, created_at')
      .eq('user_id', ownerId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (pendingBySource?.length) {
      const oldestPendingBySource = new Map<string, string>(); // source_id(또는 'null') -> article created_at(최고참)
      for (const row of pendingBySource) {
        const key = row.source_id ?? 'null';
        if (!oldestPendingBySource.has(key)) oldestPendingBySource.set(key, row.created_at);
      }

      let bestSourceKey = 'null';
      let bestLastServedAt = '9999-12-31'; // 이 소스가 최근에 처리된 적이 있는지 — 없으면 최우선(가장 옛날 취급)
      for (const sourceKey of oldestPendingBySource.keys()) {
        let lastServedAt = '0000-01-01';
        if (sourceKey !== 'null') {
          const { data: lastServed } = await supabase
            .from('bossai_rewrite_articles')
            .select('updated_at')
            .eq('user_id', ownerId)
            .eq('source_id', sourceKey)
            .neq('status', 'pending')
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();
          lastServedAt = lastServed?.updated_at || '0000-01-01';
        }
        if (lastServedAt < bestLastServedAt) {
          bestLastServedAt = lastServedAt;
          bestSourceKey = sourceKey;
        }
      }

      let query = supabase
        .from('bossai_rewrite_articles')
        .select(SELECT_COLS)
        .eq('user_id', ownerId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1);
      query = bestSourceKey === 'null' ? query.is('source_id', null) : query.eq('source_id', bestSourceKey);
      const { data } = await query.single();
      article = data;
    }
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

    // 소스에 따라 스크랩 이미지 대신 항상 자체 썸네일을 생성 (예: 실제 사진이
    // 아니라 사이트 자체의 범용 미리보기 템플릿 배너를 대표이미지로 쓰는 소스)
    let useOwnThumbnail = false;
    if (article.source_id) {
      const { data: source } = await supabase
        .from('bossai_rewrite_sources')
        .select('use_generated_thumbnail')
        .eq('id', article.source_id)
        .single();
      useOwnThumbnail = !!source?.use_generated_thumbnail;
    }

    // 이미지: 원문에서 스크랩된 게 있으면 그걸 쓰고, 없거나(또는 소스 설정상 항상
    // 자체 생성해야 하면) 대표이미지를 새로 생성
    let content = rawContent;
    let representativeImageUrl = useOwnThumbnail ? null : article.representative_image_url;
    if (representativeImageUrl) {
      content = insertRepresentativeImageIntoContent(content, representativeImageUrl, title);
      if (article.image_urls?.length) content = insertImagesIntoContent(content, article.image_urls, title);
    } else {
      try {
        // 배경 없이 그라디언트+텍스트만 넣으면 밋밋해서 임팩트가 없다는 피드백 —
        // "블로그 자동화"(lib/blog-content-generator.ts)가 하던 것과 동일하게
        // 실제 관련 사진을 검색해 배경으로 깔아준다.
        const { thumbUrl: bgImageUrl } = await searchInlineImages(title, 3).catch(() => ({ thumbUrl: undefined }));
        representativeImageUrl = await generateAndUploadThumbnail(title, article.title, 'blue', bgImageUrl);
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
        // 500자는 Ollama 9키 폴백 실패 사유를 다 담기엔 너무 짧아서 항상 key2
        // 근처에서 잘려 나머지 키가 시도됐는지조차 진단이 안 됐음 — 확장
        error_message: String(e).slice(0, 3000),
        updated_at: new Date().toISOString(),
      })
      .eq('id', article.id);

    return NextResponse.json({ ok: false, error: String(e), processed: 0 }, { status: 500 });
  }
}
