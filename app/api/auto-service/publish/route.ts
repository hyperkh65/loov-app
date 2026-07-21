import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';
import { postToThreadsWithMedia, waitThreadsPostAccessible, postCommentOnOwnPost } from '@/lib/sns/platforms-server';
import iconv from 'iconv-lite';

export const maxDuration = 600;

// Naver Cafe API는 폼 데이터를 EUC-KR로 디코딩 → EUC-KR 퍼센트인코딩으로 전송
// unreserved chars(RFC 3986) 외 모든 바이트를 %XX로 인코딩
function toEucKrEncoded(text: string): string {
  const buf = iconv.encode(text, 'euc-kr');
  const unreserved = /[A-Za-z0-9\-_.~]/;
  let result = '';
  for (const byte of buf) {
    const ch = String.fromCharCode(byte);
    result += unreserved.test(ch) ? ch : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return result;
}

// 본문(HTML 렌더링)은 HTML 엔티티로 변환
function toHtmlEntities(text: string): string {
  let result = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? char.charCodeAt(0);
    result += code > 0x7E ? `&#${code};` : char;
  }
  return result;
}

async function uploadImageToNaverCafe(imageUrl: string, clubId: string, accessToken: string): Promise<string | null> {
  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!imgRes.ok) return null;
    const imgBuf = await imgRes.arrayBuffer();
    const ct = imgRes.headers.get('content-type') || 'image/jpeg';
    const ext = ct.includes('png') ? 'png' : ct.includes('gif') ? 'gif' : ct.includes('webp') ? 'webp' : 'jpg';
    const form = new FormData();
    form.append('image', new Blob([imgBuf], { type: ct }), `image.${ext}`);
    const uploadRes = await fetch(`https://openapi.naver.com/v1/cafe/${clubId}/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    if (!uploadRes.ok) return null;
    const data = await uploadRes.json() as { message?: { result?: { imageUrl?: string } } };
    return data.message?.result?.imageUrl || null;
  } catch { return null; }
}

function toImageSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')   // ASCII만 유지 (한국어 등 비ASCII 제거)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
  return slug || `img-${Date.now()}`;
}

// WordPress: 이미지 URL → WP 미디어 업로드 → 미디어 ID/URL 반환
async function uploadImageToWordpress(
  imageUrl: string,
  siteUrl: string,
  auth: string,
  slug?: string,
): Promise<{ id: number; url: string } | null> {
  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
    if (!imgRes.ok) return null;
    const buffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.split('/')[1]?.split(';')[0]?.split('+')[0] || 'jpg';
    const filename = slug ? `${slug}.${ext}` : `image-${Date.now()}.${ext}`;

    const res = await fetch(`${siteUrl}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': contentType,
      },
      body: buffer,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { id: data.id, url: data.source_url };
  } catch { return null; }
}

// WP 카테고리/태그 이름 → ID 조회 (없으면 생성)
async function resolveTermId(
  siteUrl: string,
  auth: string,
  name: string,
  type: 'categories' | 'tags',
): Promise<number | null> {
  try {
    const search = await fetch(
      `${siteUrl}/wp-json/wp/v2/${type}?search=${encodeURIComponent(name)}&per_page=1`,
      { headers: { Authorization: auth }, signal: AbortSignal.timeout(10_000) },
    );
    if (search.ok) {
      const list = await search.json();
      if (list.length > 0) return list[0].id;
    }
    // 없으면 생성
    const create = await fetch(`${siteUrl}/wp-json/wp/v2/${type}`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(10_000),
    });
    if (create.ok) return (await create.json()).id;
  } catch { /* skip */ }
  return null;
}

type CaptionLanguage = 'ko' | 'en' | 'ja' | 'es';

// 언어별 잘못된 문자 감지
// en/es: CJK(한중일) 전체 금지 / ja: 한국어만 금지(한자는 일본어에 정상) / ko: 체크 안함
const isWrongLang = (s: string, lang: CaptionLanguage): boolean => {
  if (lang === 'ko') return false;
  if (lang === 'ja') return /[가-힯]/.test(s); // 일본어 캡션에 한국어 금지
  return /[぀-ヿ㐀-鿿豈-﫿가-힯]/.test(s); // en/es: CJK 전체 금지
};

// AI로 SNS 후킹성 캡션 생성 (다국어 지원)
async function generateSnsCaption(
  title: string,
  metaDescription: string,
  keyword: string,
  preferModel: string = 'qwen3',
  language: CaptionLanguage = 'ko',
): Promise<string> {
  const prompts: Record<CaptionLanguage, string> = {
    ko: `다음 블로그 글에 대한 SNS 게시물 문구를 작성해.

제목: ${title}
키워드: ${keyword}
요약: ${metaDescription || title}

[절대 금지 — 아래 규칙을 하나라도 어기면 완전히 실패한 결과물이야]
- 영어 단어 절대 금지: 한국어로 100% 작성. "SNS", "AI", "콘텐츠", "트렌드", "팁", "핵심", "포인트", "체크", "업데이트", "서비스", "바이럴", "임팩트", "컴팩트" 같은 영어 외래어·영문 표기 모두 금지. 순수 한국어 단어만 사용.
- * 기호 절대 금지: 별표(*), 볼드(**) 마크다운 기호 일절 사용 불가.
- AI 냄새 나는 표현 절대 금지: "~해보세요", "~확인해보세요", "~알아보겠습니다", "~살펴보면", "~중요합니다", "~필요합니다", "~있습니다", "~됩니다" 같은 딱딱하고 인공적인 표현 금지.

[작성 규칙]
- 반말 구어체 (예: ~야, ~잖아, ~했대, ~봐봐, ~래, ~거야, ~다고, ~이래)
- 실제 한국인 친구가 카카오톡으로 보내는 것 같은 자연스러운 말투
- 첫 문장은 독자가 클릭하고 싶게 만드는 후킹 멘트 (놀라운 사실, 궁금증 유발)
- 핵심 정보 1~2개 압축
- 이모지 2~3개 적절히 포함
- 150자 이내
- URL, 해시태그, 따옴표 미포함

문구만 출력해. 설명이나 부연 절대 붙이지 마.`,

    en: `[LANGUAGE RULE - ABSOLUTE]: You MUST write in ENGLISH ONLY. No Korean. No other language. English only.

Write a social media caption in English for the following blog post.

Title: ${title}
Keyword: ${keyword}
Summary: ${metaDescription || title}

Rules:
- Natural, casual English like texting a friend (not formal, not robotic)
- First sentence must hook the reader (surprising fact or intriguing question)
- Include 2-3 emojis naturally
- Under 150 characters
- No hashtags, no URLs, no asterisks, no markdown
- No AI-sounding phrases like "dive into", "delve", "it's important to note", "in conclusion"
- Compress to 1-2 key facts

Output ONLY the English caption text. No Korean. No explanation.`,

    ja: `【言語ルール・絶対厳守】必ず日本語のみで書いてください。韓国語・英語・他の言語は絶対禁止。日本語のみ。

次のブログ記事についてSNS投稿文を日本語で書いてください。

タイトル: ${title}
キーワード: ${keyword}
概要: ${metaDescription || title}

ルール:
- 友達にLINEで送るような自然なカジュアルな日本語
- 最初の一文で読者を引きつける（驚きの事実や疑問を呼び起こす）
- 絵文字2〜3個を自然に含める
- 150文字以内
- ハッシュタグ・URL・アスタリスク・マークダウン禁止
- AIっぽい堅い表現禁止（「ぜひご確認ください」「重要です」等）
- 要点を1〜2個に絞る

日本語のキャプションテキストのみ出力してください。韓国語禁止。`,

    es: `[REGLA DE IDIOMA - ABSOLUTA]: Debes escribir SOLO en español. Nada de coreano. Solo español.

Escribe un pie de foto para redes sociales en español para el siguiente artículo de blog.

Título: ${title}
Palabra clave: ${keyword}
Resumen: ${metaDescription || title}

Reglas:
- Español natural y casual, como un mensaje a un amigo
- La primera frase debe enganchar al lector (dato sorprendente o pregunta intrigante)
- Incluye 2-3 emojis de forma natural
- Menos de 150 caracteres
- Sin hashtags, sin URLs, sin asteriscos, sin markdown
- Sin frases con sabor a IA ("es importante destacar", "en conclusión", etc.)
- Comprime en 1-2 datos clave

Escribe SOLO el texto en español. Sin coreano. Sin explicaciones.`,
  };

  const clean = (r: string) => r.trim().replace(/^["'"'「『【\[]|["'"'」』】\]]$/g, '').trim();
  const fallback = (metaDescription || title).slice(0, 150);

  // 단일 시도에 15초 타임아웃 강제 (callOllama 내부 타임아웃이 9분이라 직접 제한)
  const tryOllamaTimeout = async (model: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('caption_timeout')), 15000);
      generateText(prompts[language], model, undefined, undefined, undefined, undefined,
        language !== 'ko' ? { multilingual: true } : undefined)
        .then(r => { clearTimeout(t); resolve(clean(r)); })
        .catch(e => { clearTimeout(t); reject(e); });
    });
  };

  if (language === 'ko') {
    try { const c = await tryOllamaTimeout(preferModel); if (c.length > 15) return c; } catch { /* ignore */ }
    return `${title}\n${metaDescription || ''}`.trim();
  }

  // 비한국어: 최대 2회 시도(preferModel → llama3.3), 각 15초 타임아웃 — 504 방지
  const modelsToTry = preferModel === 'llama3.3' ? [preferModel] : [preferModel, 'llama3.3'];
  for (const model of modelsToTry) {
    try {
      const c = await tryOllamaTimeout(model);
      if (c.length > 15 && !isWrongLang(c, language)) return c;
      if (c.length > 15) return c; // 언어 검증 실패해도 뭔가 나왔으면 사용
    } catch { /* 다음 모델로 */ }
  }
  return fallback;
}

// 본문 HTML에서 첫 번째 이미지 URL 추출
function extractFirstImageUrl(content: string): string | null {
  const m = content.match(/<img[^>]+src="([^"]+)"/i);
  return m ? m[1] : null;
}

// 콘텐츠 내 이미지를 WP 미디어로 병렬 업로드 후 URL 교체 (최대 5개)
async function uploadContentImages(
  content: string,
  siteUrl: string,
  auth: string,
  titleSlug?: string,
): Promise<string> {
  const imgRegex = /<img([^>]+)src="([^"]+)"([^>]*)>/gi;
  const matches = [...content.matchAll(imgRegex)];
  const urlsToUpload = [...new Set(
    matches.map(m => m[2]).filter(u => u.startsWith('http'))
  )].slice(0, 5); // 최대 5개만 업로드

  if (urlsToUpload.length === 0) return content;

  const results = await Promise.all(
    urlsToUpload.map((url, i) => uploadImageToWordpress(url, siteUrl, auth, titleSlug ? `${titleSlug}-${i + 1}` : undefined))
  );

  let processed = content;
  urlsToUpload.forEach((originalUrl, i) => {
    if (results[i]) processed = processed.replaceAll(originalUrl, results[i]!.url);
  });
  return processed;
}

export async function POST(req: NextRequest) {
  try {
  // CRON_SECRET bypass: GitHub Actions 예약 발행용
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!(cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`);

  const supabase = isCron ? await createAdminClient() : await createClient();

  let userId: string | undefined;
  if (!isCron) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
    userId = user.id;
  }
  // cron의 경우 article에서 user_id 추출 (언어 설정 조회에 필요)

  let body: { article_id?: string; blog_platforms?: string[]; sns_platforms?: string[]; wp_site_ids?: string[]; backlink_platforms?: string[]; tistory_blog_ids?: string[]; naver_cafe_menu_id?: string; naver_cafe_open_yn?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: '요청 파싱 실패' }, { status: 400 }); }
  const { article_id, blog_platforms = [], sns_platforms = [], wp_site_ids = [], backlink_platforms = [], tistory_blog_ids = [], naver_cafe_menu_id, naver_cafe_open_yn = 'Y' } = body;
  if (!article_id) return NextResponse.json({ error: 'article_id 필요' }, { status: 400 });

  let articleQuery = supabase
    .from('bossai_auto_articles')
    .select('*')
    .eq('id', article_id);
  if (userId) articleQuery = articleQuery.eq('user_id', userId);
  const { data: article, error: fetchErr } = await articleQuery.single();

  if (fetchErr || !article) return NextResponse.json({ error: '글을 찾을 수 없습니다' }, { status: 404 });

  // cron 실행 시 article의 user_id로 userId 보완 (언어 설정 조회)
  if (!userId && article.user_id) userId = article.user_id;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`;
  const results: Record<string, { success: boolean; url?: string; error?: string }> = {};
  const cookieHeader = req.headers.get('cookie') || '';

  for (const platform of blog_platforms) {
    try {
      if (platform === 'naver') {
        const res = await fetch(`${baseUrl}/api/naver/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
          body: JSON.stringify({
            title: article.title,
            content: article.content,
            tags: article.focus_keyword ? [article.focus_keyword] : [],
          }),
        });
        const data = await res.json();
        results.naver = res.ok ? { success: true, url: data.url } : { success: false, error: data.error };

      } else if (platform === 'tistory') {
        const { data: tistoryConns } = await supabase
          .from('tistory_connections')
          .select('id, blog_name, blog_url')
          .eq('user_id', userId!)
          .eq('is_active', true)
          .limit(1);
        const tConn = tistoryConns?.[0];
        if (!tConn) {
          results.tistory = { success: false, error: '활성화된 티스토리 블로그 없음' };
        } else {
          const res = await fetch(`${baseUrl}/api/tistory/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
            body: JSON.stringify({
              blog_id: tConn.id,
              title: article.title,
              content: article.content,
              tags: article.focus_keyword ? [article.focus_keyword] : [],
            }),
          });
          const data = await res.json();
          results.tistory = res.ok ? { success: true, url: data.url } : { success: false, error: data.error };
        }

      } else if (platform === 'blogger') {
        const res = await fetch(`${baseUrl}/api/blogger/posts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
          body: JSON.stringify({
            title: article.title,
            content: article.content,
            labels: article.focus_keyword ? [article.focus_keyword] : [],
          }),
        });
        const data = await res.json();
        results.blogger = res.ok ? { success: true, url: data.url } : { success: false, error: data.error };

      } else if (platform === 'wordpress') {
        // 선택된 사이트 ID로 조회, 없으면 사용자 전체 WP 사이트 조회
        let sitesQuery = supabase
          .from('wordpress_sites')
          .select('id, site_name, site_url, wp_username, app_password');
        if (userId) sitesQuery = sitesQuery.eq('user_id', userId);

        if (wp_site_ids.length > 0) {
          sitesQuery = sitesQuery.in('id', wp_site_ids);
        }

        const { data: sites } = await sitesQuery;

        if (!sites?.length) {
          results.wordpress = { success: false, error: 'WordPress 사이트가 등록되지 않았습니다. WordPress 관리에서 사이트를 추가하세요.' };
          continue;
        }

        // 기본 카테고리 이름 (대시보드 설정에서 추후 변경 가능)
        const DEFAULT_CATEGORY = 'Aboda';

        for (const site of sites) {
          const auth = 'Basic ' + Buffer.from(`${site.wp_username}:${site.app_password}`).toString('base64');
          const siteKey = `wordpress_${site.site_name}`;

          try {
            const titleSlug = toImageSlug(article.focus_keyword || article.title || '');

            // 1. 대표이미지(SVG 썸네일)를 WP 미디어로 먼저 업로드
            let featuredMediaId: number | undefined;
            if (article.representative_image_url) {
              const thumb = await uploadImageToWordpress(article.representative_image_url, site.site_url, auth, titleSlug);
              if (thumb) featuredMediaId = thumb.id;
            }

            // 2. 본문 내 이미지를 WP 미디어로 업로드 + URL 교체
            const wpContent = await uploadContentImages(article.content, site.site_url, auth, titleSlug);

            // 3. 카테고리 "Aboda" 조회 또는 생성
            const catId = await resolveTermId(site.site_url, auth, DEFAULT_CATEGORY, 'categories');

            // 4. 포스트 발행
            // slug: focus_keyword 기반으로 생성 (WordPress 자동 slug 잘림 방지)
            const rawSlug = (article.focus_keyword || article.keyword || article.title)
              .replace(/[,!?\.]/g, '')
              .replace(/\s+/g, '-')
              .toLowerCase()
              .slice(0, 60);
            const focusKeyword = (article.focus_keyword || article.keyword || '').trim();
            const postBody: Record<string, unknown> = {
              title: article.title,
              content: wpContent,
              status: 'publish',
              slug: rawSlug,
              meta: {
                rank_math_focus_keyword: focusKeyword,
                rank_math_title: article.title || '',
                rank_math_description: article.meta_description || '',
              },
            };
            if (featuredMediaId) postBody.featured_media = featuredMediaId;
            if (catId) postBody.categories = [catId];

            const res = await fetch(`${site.site_url}/wp-json/wp/v2/posts`, {
              method: 'POST',
              headers: { Authorization: auth, 'Content-Type': 'application/json' },
              body: JSON.stringify(postBody),
              signal: AbortSignal.timeout(120_000),
            });

            if (res.ok) {
              const post = await res.json();
              results[siteKey] = { success: true, url: post.link };
            } else {
              const errText = await res.text();
              results[siteKey] = { success: false, error: `WP 오류(${res.status}): ${errText.slice(0, 200)}` };
            }
          } catch (siteErr) {
            results[siteKey] = { success: false, error: siteErr instanceof Error ? siteErr.message : String(siteErr) };
          }
        }
      }
    } catch (err) {
      results[platform] = { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // 티스토리 개별 블로그 발행
  for (const blogId of tistory_blog_ids) {
    const resultKey = `tistory_${blogId}`;
    try {
      const res = await fetch(`${baseUrl}/api/tistory/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify({
          user_id: userId,
          blog_id: blogId,
          title: article.title,
          content: article.content,
          tags: article.focus_keyword ? [article.focus_keyword] : [],
        }),
      });
      const data = await res.json();
      results[resultKey] = res.ok ? { success: true, url: data.url } : { success: false, error: data.error };
    } catch (err) {
      results[resultKey] = { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // SNS 발행
  if (sns_platforms.length > 0) {
    try {
      // ── Preflight: SNS 연결 상태 사전 확인 ──────────────────
      if (userId) {
        const { data: conns } = await supabase
          .from('sns_connections')
          .select('platform, is_active, access_token')
          .eq('user_id', userId)
          .in('platform', sns_platforms);

        for (const p of sns_platforms as string[]) {
          const conn = conns?.find(c => c.platform === p);
          if (!conn) {
            results[`sns_${p}`] = { success: false, error: '연결되지 않은 플랫폼 — SNS 연결 페이지에서 연결하세요' };
          } else if (!conn.is_active || !conn.access_token) {
            results[`sns_${p}`] = { success: false, error: '토큰 만료 또는 비활성 — SNS 연결 페이지에서 재연결하세요' };
          }
        }
        // 이미 실패로 마킹된 플랫폼은 발행에서 제외
        const validPlatforms = sns_platforms.filter((p: string) => !results[`sns_${p}`]);
        if (validPlatforms.length === 0) {
          return NextResponse.json({ results });
        }
        // 유효한 플랫폼만으로 계속 진행
        sns_platforms.length = 0;
        sns_platforms.push(...validPlatforms);
      }

      // ── AI 후킹성 반말 SNS 캡션 생성 (한국어 기본) ─────────────
      const captionModel = article.ai_model === 'openai' || article.ai_model?.startsWith('gpt') ? 'openai'
        : article.ai_model === 'openrouter' ? 'openrouter'
        : 'qwen3';

      // SNS 번역 모델: 설정에서 읽기 (기본값 llama3.3 — 다국어 지시 준수 우수)
      let snsCaptionModel = 'llama3.3';
      if (userId) {
        const { data: autoSettings } = await supabase
          .from('bossai_auto_settings')
          .select('sns_caption_model')
          .eq('user_id', userId)
          .maybeSingle();
        if (autoSettings?.sns_caption_model) snsCaptionModel = autoSettings.sns_caption_model;
      }

      const aiCaption = await generateSnsCaption(
        article.title,
        article.meta_description || '',
        article.keyword || article.focus_keyword || '',
        captionModel,
      );


      // 블로그 URL 수집: 현재 요청 결과 + 이미 DB에 저장된 기존 발행 URL 합산
      const existingBlogUrls = Object.entries(article.published_urls || {})
        .filter(([k]) => !k.startsWith('sns_'))
        .map(([, v]) => v as string)
        .filter(Boolean);
      const newBlogUrls = Object.entries(results)
        .filter(([k, v]) => !k.startsWith('sns_') && v.success && v.url)
        .map(([, v]) => v.url!);
      const blogUrls = [...new Set([...existingBlogUrls, ...newBlogUrls])];
      const blogLinkText = blogUrls.length > 0 ? '\n\n🔗 ' + blogUrls.join('\n🔗 ') : '';

      const threadsIncluded = sns_platforms.includes('threads');
      const instagramIncluded = sns_platforms.includes('instagram');
      const otherPlatforms = sns_platforms.filter((p: string) => p !== 'threads' && p !== 'instagram');
      const defaultMediaUrls = (() => { const img = article.representative_image_url || extractFirstImageUrl(article.content || ''); return img ? [img] : []; })();

      // Instagram: 블로그 대표이미지로 발행
      if (instagramIncluded) {
        try {
          const instagramCaption = `${aiCaption}${blogLinkText}`.trim();
          const res = await fetch(`${baseUrl}/api/sns/post-now`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
            body: JSON.stringify({ content: instagramCaption, platforms: ['instagram'], media_urls: defaultMediaUrls }),
          });
          const text = await res.text();
          try {
            const data = JSON.parse(text);
            if (data.results) {
              for (const r of data.results) {
                results[`sns_${r.platform}`] = { success: r.success, error: r.error };
              }
            } else if (!res.ok) {
              results['sns_instagram'] = { success: false, error: data.error || `HTTP ${res.status}` };
            }
          } catch {
            results['sns_instagram'] = { success: false, error: `서버 오류 (${res.status})` };
          }
        } catch (err) {
          results['sns_instagram'] = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
      }

      // Threads 외 나머지 플랫폼 (Twitter, Facebook 등): AI 캡션 + 블로그 링크
      if (otherPlatforms.length > 0) {
        try {
          // Twitter는 280자 제한 (링크 포함 ~23자 소모) → 캡션 240자 이내로 자름
          const hasTwitter = otherPlatforms.includes('twitter');
          const snsContent = hasTwitter && otherPlatforms.length === 1
            ? aiCaption.slice(0, 200) + blogLinkText
            : `${aiCaption}${blogLinkText}`.trim();

          const res = await fetch(`${baseUrl}/api/sns/post-now`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
            body: JSON.stringify({ content: snsContent, platforms: otherPlatforms, media_urls: defaultMediaUrls }),
          });
          const text = await res.text();
          try {
            const data = JSON.parse(text);
            if (data.results) {
              for (const r of data.results) {
                results[`sns_${r.platform}`] = { success: r.success, error: r.error };
              }
            } else if (!res.ok) {
              for (const p of otherPlatforms) {
                results[`sns_${p}`] = { success: false, error: data.error || `HTTP ${res.status}` };
              }
            }
          } catch {
            for (const p of otherPlatforms) {
              results[`sns_${p}`] = { success: false, error: `서버 오류 (${res.status})` };
            }
          }
        } catch (err) {
          for (const p of otherPlatforms) {
            results[`sns_${p}`] = { success: false, error: err instanceof Error ? err.message : String(err) };
          }
        }
      }

      // Threads: 각 계정(메인+extra)에 직접 발행 — 병렬 처리로 타임아웃 방지
      if (threadsIncluded && userId) {
        try {
          const { data: threadsConns } = await supabase
            .from('sns_connections')
            .select('platform_user_id, access_token, extra')
            .eq('user_id', userId)
            .eq('platform', 'threads')
            .eq('is_active', true);

          type ThreadsAcc = { platform_user_id: string; access_token: string; caption_language: CaptionLanguage };
          const allAccounts: ThreadsAcc[] = [];
          for (const conn of threadsConns || []) {
            const extra = conn.extra as Record<string, unknown> | null;
            if (conn.access_token && conn.platform_user_id) {
              allAccounts.push({
                platform_user_id: conn.platform_user_id,
                access_token: conn.access_token,
                caption_language: ((extra?.caption_language) as CaptionLanguage) || 'ko',
              });
            }
            const extraAccounts = Array.isArray(extra?.extra_accounts)
              ? (extra!.extra_accounts as { platform_user_id: string; access_token: string; caption_language?: string; is_active?: boolean }[])
              : [];
            for (const acc of extraAccounts) {
              if (acc.is_active === false || !acc.access_token || !acc.platform_user_id) continue;
              allAccounts.push({
                platform_user_id: acc.platform_user_id,
                access_token: acc.access_token,
                caption_language: (acc.caption_language as CaptionLanguage) || 'ko',
              });
            }
          }

          const threadsMediaUrls = (() => {
            const img = article.representative_image_url || extractFirstImageUrl(article.content || '');
            return img ? [img] : [];
          })();
          const blogLinkComment = blogUrls.length > 0 ? '🔗 ' + blogUrls.join('\n🔗 ') : '';

          // ① 언어별 캡션 병렬 생성 (순차 → 병렬로 변경, 3언어 × 15초 → 15초로 단축)
          const uniqueLangs = [...new Set(allAccounts.map(a => a.caption_language))];
          const captionEntries = await Promise.all(
            uniqueLangs.map(async (lang): Promise<[CaptionLanguage, string]> => {
              if (lang === 'ko') return [lang, aiCaption];
              // 비한국어: 설정된 SNS 번역 모델 사용 (기본 llama3.3)
              return [lang, await generateSnsCaption(
                article.title, article.meta_description || '',
                article.keyword || article.focus_keyword || '',
                snsCaptionModel, lang,
              )];
            })
          );
          const captionCache: Partial<Record<CaptionLanguage, string>> = Object.fromEntries(captionEntries);
          if (!captionCache['ko']) captionCache['ko'] = aiCaption;

          // ② 모든 계정 병렬 발행
          const commentErrors: string[] = [];
          const commentSuccesses: number[] = [];
          const accountResults = await Promise.allSettled(
            allAccounts.map(async (acc) => {
              const caption = captionCache[acc.caption_language] || aiCaption;
              const { id: postId } = await postToThreadsWithMedia(
                acc.access_token, acc.platform_user_id, caption,
                threadsMediaUrls.length > 0 ? threadsMediaUrls : undefined,
              );

              // ③ 댓글: 게시물 접근 가능 확인(최대 20초 폴링) 후 댓글 게시
              if (blogLinkComment) {
                // 최대 20초 폴링 — 게시물이 조회 가능해질 때까지 대기
                const pollDeadline = Date.now() + 20000;
                while (Date.now() < pollDeadline) {
                  await new Promise(r => setTimeout(r, 4000));
                  try {
                    const ck = await fetch(
                      `https://graph.threads.net/v1.0/${postId}?fields=id&access_token=${acc.access_token}`,
                      { signal: AbortSignal.timeout(4000) },
                    );
                    if (ck.ok) { const d = await ck.json(); if (d.id) break; }
                  } catch { /* 계속 폴링 */ }
                }
                // 접근 가능 여부와 무관하게 댓글 시도 (실패 에러 전문 캡처)
                let commentOk = false;
                try {
                  await postCommentOnOwnPost('threads', acc.access_token, acc.platform_user_id, postId, blogLinkComment);
                  commentOk = true;
                } catch (e1) {
                  // 5초 후 1회 재시도
                  try {
                    await new Promise(r => setTimeout(r, 5000));
                    await postCommentOnOwnPost('threads', acc.access_token, acc.platform_user_id, postId, blogLinkComment);
                    commentOk = true;
                  } catch (e2) {
                    commentErrors.push(`[${String(e2).slice(0, 400)}]`);
                  }
                }
                if (commentOk) commentSuccesses.push(1);
              }
              return postId;
            })
          );

          const anyThreadsSuccess = accountResults.some(r => r.status === 'fulfilled');
          const threadsErrors = accountResults
            .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
            .map((r, i) => `acc${i + 1}: ${String(r.reason).slice(0, 80)}`);

          // 디버그 노트: 항상 댓글 상태 포함
          const threadsNote = !blogLinkComment
            ? '[URL없음: 블로그를 함께 발행하거나 이전 발행기록이 있어야 댓글이 달립니다]'
            : commentErrors.length > 0
              ? `[댓글 실패(${commentErrors.join(' | ')})]`
              : commentSuccesses.length > 0
                ? `[댓글 ${commentSuccesses.length}개 게시됨]`
                : '[댓글 미시도]';
          results['sns_threads'] = anyThreadsSuccess
            ? { success: true, error: threadsNote }
            : { success: false, error: allAccounts.length === 0 ? 'Threads 계정 없음' : threadsErrors.join(' | ') };
        } catch (err) {
          results['sns_threads'] = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
      }
    } catch (err) {
      results.sns = { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ── 백링크 발행 (Medium, Tumblr) ──────────────────────────────
  if (backlink_platforms.length > 0) {
    // 발행된 블로그 URL 중 첫 번째를 canonical_url로 사용
    const firstBlogUrl = Object.values(results).find(r => r.success && r.url)?.url
      || Object.values(article.published_urls || {}).find(Boolean) as string | undefined;

    const backlinkPayload = {
      title: article.title,
      meta_description: article.meta_description || '',
      keyword: article.keyword || '',
      canonical_url: firstBlogUrl || `${baseUrl}/`,
      representative_image_url: article.representative_image_url || undefined,
    };

    await Promise.allSettled(
      (backlink_platforms as string[]).map(async (platform) => {
        try {
          const res = await fetch(`${baseUrl}/api/backlink/${platform}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
            body: JSON.stringify(backlinkPayload),
            signal: AbortSignal.timeout(60_000),
          });
          const data = await res.json();
          results[`backlink_${platform}`] = res.ok
            ? { success: true, url: data.url }
            : { success: false, error: data.error || '백링크 실패' };
        } catch (err) {
          results[`backlink_${platform}`] = { success: false, error: String(err) };
        }
      })
    );
  }

  // ── 네이버 카페 발행 ──────────────────────────────────────────────────────────
  if (naver_cafe_menu_id && userId) {
    try {
      const adminSupa = createAdminClient();
      const { data: conn } = await adminSupa
        .from('naver_cafe_connections')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (conn?.club_id && conn.access_token) {
        let accessToken: string = conn.access_token;

        const needsRefresh = !conn.token_expires_at || new Date(conn.token_expires_at) < new Date(Date.now() + 60_000);
        if (needsRefresh) {
          if (conn.refresh_token) {
            const rfRes = await fetch('https://nid.naver.com/oauth2.0/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: process.env.NAVER_CLIENT_ID!,
                client_secret: process.env.NAVER_CLIENT_SECRET!,
                refresh_token: conn.refresh_token,
              }),
            });
            if (rfRes.ok) {
              const rfData = await rfRes.json() as { access_token?: string; expires_in?: number };
              if (rfData.access_token) {
                accessToken = rfData.access_token;
                await adminSupa.from('naver_cafe_connections').update({
                  access_token: rfData.access_token,
                  token_expires_at: new Date(Date.now() + (rfData.expires_in || 3600) * 1000).toISOString(),
                  updated_at: new Date().toISOString(),
                }).eq('user_id', userId);
              }
            }
          }
        }

        const cleanTitle = (article.title || '')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
          .replace(/&#(\d+);/g, (_: string, n: string) => String.fromCharCode(parseInt(n)))
          .replace(/<[^>]+>/g, '').trim();

        const rawText = (article.content || '')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
          .replace(/\n{3,}/g, '\n\n').trim();
        const excerpt = rawText.slice(0, 400) + (rawText.length > 400 ? '...' : '');

        const blogUrl = results.naver?.url || results.tistory?.url || results.blogger?.url
          || Object.values(results).find(r => r.success && r.url)?.url
          || (Object.values(article.published_urls || {}).find(Boolean) as string | undefined);

        const cafeImageUrl = article.representative_image_url
          ? await uploadImageToNaverCafe(String(article.representative_image_url), String(conn.club_id), accessToken)
          : null;

        const cafeLink = blogUrl ? `\n\n[원문 보기] ${blogUrl}` : '';
        const keyword = article.focus_keyword ? `\n\n#${(article.focus_keyword as string).replace(/\s+/g, '')}` : '';
        let cafeContent = excerpt + cafeLink + keyword;
        if (cafeImageUrl) cafeContent = `<img src="${cafeImageUrl}"><br><br>${cafeContent}`;

        // Naver Cafe API는 multipart/form-data 형식 요구 (URLSearchParams x-www-form-urlencoded 거부)
        const cafeForm = new FormData();
        cafeForm.append('subject', cleanTitle);
        cafeForm.append('content', toHtmlEntities(cafeContent));
        cafeForm.append('openYn', naver_cafe_open_yn);

        const cafeApiUrl = `https://openapi.naver.com/v1/cafe/${conn.club_id}/menu/${naver_cafe_menu_id}/articles`;
        const cafeRes = await fetch(cafeApiUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: cafeForm,
          signal: AbortSignal.timeout(30_000),
        });

        const cafeRawText = await cafeRes.text();
        let cafeData: { message?: { '@service'?: string; result?: { articleId?: number; code?: string; message?: string } }; errorCode?: string; errorMessage?: string } = {};
        try { cafeData = JSON.parse(cafeRawText); } catch {}

        const naverErrCode = cafeData.message?.result?.code || cafeData.errorCode;
        const naverErrMsg = cafeData.message?.result?.message || cafeData.errorMessage;
        // Naver 403: result 없이 message만 오는 경우 (앱 권한 미등록)
        const naverService = cafeData.message?.['@service'];
        const hasNaverError = !cafeRes.ok || (naverErrCode && naverErrCode !== '0');

        if (cafeRes.ok && !hasNaverError) {
          const cafeArticleId = cafeData.message?.result?.articleId;
          const cafeSlug = (conn.cafe_url as string | null) || (conn.club_id as string);
          const cafeUrl = cafeArticleId ? `https://cafe.naver.com/${cafeSlug}/articles/${cafeArticleId}` : undefined;
          try {
            await adminSupa.from('naver_cafe_history').insert({
              user_id: userId,
              club_id: conn.club_id,
              article_id: cafeArticleId ? String(cafeArticleId) : null,
              article_url: cafeUrl || null,
              title: article.title,
              menu_id: String(naver_cafe_menu_id),
              menu_name: (conn.menu_list as { menuId: number; menuName: string }[] | null)?.find(m => String(m.menuId) === String(naver_cafe_menu_id))?.menuName || null,
              open_yn: naver_cafe_open_yn,
            });
          } catch {}
          results.naver_cafe = { success: true, url: cafeUrl };
        } else {
          const errDetail = naverErrMsg || (naverService ? `서비스(${naverService}) 접근 거부 — developers.naver.com 앱에서 카페 API 권한 확인 필요` : cafeRawText.slice(0, 200));
          results.naver_cafe = { success: false, error: `카페 발행 실패 (HTTP ${cafeRes.status}) [${naverErrCode || '권한없음'}] ${errDetail}`.trim() };
        }
      } else {
        results.naver_cafe = { success: false, error: '카페 연결 없음 또는 club_id 미설정' };
      }
    } catch (cafErr) {
      results.naver_cafe = { success: false, error: cafErr instanceof Error ? cafErr.message : String(cafErr) };
    }
  }

  const anySuccess = Object.values(results).some(r => r.success);
  const publishedUrls: Record<string, string> = {};
  for (const [k, v] of Object.entries(results)) {
    if (v.success && v.url) publishedUrls[k] = v.url;
  }
  // 기존 블로그 URL 보존: Threads만 재발행해도 WordPress URL 등이 사라지지 않도록 병합
  const mergedPublishedUrls = { ...(article.published_urls || {}), ...publishedUrls };

  const updateQuery = supabase
    .from('bossai_auto_articles')
    .update({
      status: anySuccess ? 'published' : 'failed',
      blog_platforms,
      sns_platforms,
      published_urls: mergedPublishedUrls,
      published_at: anySuccess ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', article_id);
  await (userId ? updateQuery.eq('user_id', userId) : updateQuery);

  return NextResponse.json({ results, published_urls: publishedUrls });
  } catch (fatalErr) {
    return NextResponse.json({ error: fatalErr instanceof Error ? fatalErr.message : String(fatalErr), results: {} }, { status: 500 });
  }
}
