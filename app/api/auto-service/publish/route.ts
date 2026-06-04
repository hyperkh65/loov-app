import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { generateAndUploadThumbnail } from '@/lib/auto-blog-thumbnail';
import { generateText } from '@/lib/auto-blog-ai';

export const maxDuration = 600;

// WordPress: 이미지 URL → WP 미디어 업로드 → 미디어 ID/URL 반환
async function uploadImageToWordpress(
  imageUrl: string,
  siteUrl: string,
  auth: string,
): Promise<{ id: number; url: string } | null> {
  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
    if (!imgRes.ok) return null;
    const buffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.split('/')[1]?.split(';')[0]?.split('+')[0] || 'jpg';
    const filename = `auto_blog_${Date.now()}.${ext}`;

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

// AI로 SNS 후킹성 반말 캡션 생성
async function generateSnsCaption(
  title: string,
  metaDescription: string,
  keyword: string,
  preferModel: string = 'qwen3',
): Promise<string> {
  const prompt = `다음 블로그 글에 대한 SNS 게시물 문구를 작성해.

제목: ${title}
키워드: ${keyword}
요약: ${metaDescription || title}

[절대 금지 — 아래 규칙을 하나라도 어기면 완전히 실패한 결과물이야]
- 영어 단어 절대 금지: 한국어로 100% 작성. "SNS", "AI", "콘텐츠", "트렌드", "팁", "핵심", "포인트", "체크", "업데이트", "서비스", "바이럴", "임팩트", "컴팩트" 같은 영어 외래어·영문 표기 모두 금지. 순수 한국어 단어만 사용.
- * 기호 절대 금지: 별표(*), 볼드(**) 마크다운 기호 일절 사용 불가.
- AI 냄새 나는 표현 절대 금지: "~해보세요", "~확인해보세요", "~알아보겠습니다", "~살펴보면", "~중요합니다", "~필요합니다", "~있습니다", "~됩니다" 같은 딱딱하고 인공적인 표현 금지.
- 한국 사람이 실제로 안 쓰는 어색한 표현 금지: 번역체, 직역체, 광고 문구 말투 금지.

[작성 규칙]
- 반말 구어체 (예: ~야, ~잖아, ~했대, ~봐봐, ~래, ~거야, ~다고, ~이래)
- 실제 한국인 친구가 카카오톡으로 보내는 것 같은 자연스러운 말투
- 첫 문장은 독자가 클릭하고 싶게 만드는 후킹 멘트 (놀라운 사실, 궁금증 유발)
- 핵심 정보 1~2개 압축
- 이모지 2~3개 적절히 포함
- 150자 이내
- 사실 왜곡·과장 없음
- URL, 해시태그, 따옴표 미포함

문구만 출력해. 설명이나 부연 절대 붙이지 마.`;

  try {
    const result = await generateText(prompt, preferModel);
    const cleaned = result.trim().replace(/^["'"'「『【\[]|["'"'」』】\]]$/g, '').trim();
    if (cleaned.length > 15) return cleaned;
  } catch { /* fallback */ }

  // fallback: 원본 그대로
  return `${title}\n${metaDescription || ''}`.trim();
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
): Promise<string> {
  const imgRegex = /<img([^>]+)src="([^"]+)"([^>]*)>/gi;
  const matches = [...content.matchAll(imgRegex)];
  const urlsToUpload = [...new Set(
    matches.map(m => m[2]).filter(u => u.startsWith('http'))
  )].slice(0, 5); // 최대 5개만 업로드

  if (urlsToUpload.length === 0) return content;

  const results = await Promise.all(
    urlsToUpload.map(url => uploadImageToWordpress(url, siteUrl, auth))
  );

  let processed = content;
  urlsToUpload.forEach((originalUrl, i) => {
    if (results[i]) processed = processed.replaceAll(originalUrl, results[i]!.url);
  });
  return processed;
}

export async function POST(req: NextRequest) {
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

  const { article_id, blog_platforms = [], sns_platforms = [], wp_site_ids = [], backlink_platforms = [] } = await req.json();
  if (!article_id) return NextResponse.json({ error: 'article_id 필요' }, { status: 400 });

  let articleQuery = supabase
    .from('bossai_auto_articles')
    .select('*')
    .eq('id', article_id);
  if (userId) articleQuery = articleQuery.eq('user_id', userId);
  const { data: article, error: fetchErr } = await articleQuery.single();

  if (fetchErr || !article) return NextResponse.json({ error: '글을 찾을 수 없습니다' }, { status: 404 });

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
            // 1. 대표이미지(SVG 썸네일)를 WP 미디어로 먼저 업로드
            let featuredMediaId: number | undefined;
            if (article.representative_image_url) {
              const thumb = await uploadImageToWordpress(article.representative_image_url, site.site_url, auth);
              if (thumb) featuredMediaId = thumb.id;
            }

            // 2. 본문 내 이미지를 WP 미디어로 업로드 + URL 교체
            const wpContent = await uploadContentImages(article.content, site.site_url, auth);

            // 3. 카테고리 "Aboda" 조회 또는 생성
            const catId = await resolveTermId(site.site_url, auth, DEFAULT_CATEGORY, 'categories');

            // 4. 태그: focus_keyword + 추가 키워드
            const tagNames = [
              article.focus_keyword,
              article.keyword !== article.focus_keyword ? article.keyword : null,
            ].filter(Boolean) as string[];
            const tagIds: number[] = [];
            for (const tagName of tagNames) {
              const tid = await resolveTermId(site.site_url, auth, tagName, 'tags');
              if (tid) tagIds.push(tid);
            }

            // 5. 포스트 발행
            // slug: focus_keyword 기반으로 생성 (WordPress 자동 slug 잘림 방지)
            const rawSlug = (article.focus_keyword || article.keyword || article.title)
              .replace(/[,!?\.]/g, '')
              .replace(/\s+/g, '-')
              .toLowerCase()
              .slice(0, 60);
            const postBody: Record<string, unknown> = {
              title: article.title,
              content: wpContent,
              status: 'publish',
              slug: rawSlug,
            };
            if (featuredMediaId) postBody.featured_media = featuredMediaId;
            if (catId) postBody.categories = [catId];
            if (tagIds.length) postBody.tags = tagIds;

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

      // ── AI 후킹성 반말 SNS 캡션 생성 ──────────────────────────
      const aiCaption = await generateSnsCaption(
        article.title,
        article.meta_description || '',
        article.keyword || article.focus_keyword || '',
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

      // Instagram: 뉴스카드 자동 생성 후 발행
      if (instagramIncluded) {
        const instagramCaption = `${aiCaption}${blogLinkText}`.trim();
        let instagramMedia = defaultMediaUrls;
        try {
          const newsCardUrl = await generateAndUploadThumbnail(
            article.title, article.keyword || article.title.slice(0, 20), 'blue',
            undefined, undefined, undefined, 'square'
          );
          instagramMedia = [newsCardUrl];
        } catch { /* 생성 실패 시 기존 이미지 사용 */ }
        const res = await fetch(`${baseUrl}/api/sns/post-now`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
          body: JSON.stringify({ content: instagramCaption, platforms: ['instagram'], media_urls: instagramMedia }),
        });
        const data = await res.json();
        if (data.results) {
          for (const r of data.results) {
            results[`sns_${r.platform}`] = { success: r.success, error: r.error };
          }
        }
      }

      // Threads 외 나머지 플랫폼 (Twitter, Facebook 등): AI 캡션 + 블로그 링크
      if (otherPlatforms.length > 0) {
        // Twitter는 280자 제한 (링크 포함 ~23자 소모) → 캡션 240자 이내로 자름
        const hasTwitter = otherPlatforms.includes('twitter');
        const twitterCaption = hasTwitter
          ? aiCaption.slice(0, 200) + (blogLinkText ? blogLinkText : '')
          : `${aiCaption}${blogLinkText}`.trim();
        const snsContent = hasTwitter && otherPlatforms.length === 1
          ? twitterCaption
          : `${aiCaption}${blogLinkText}`.trim();

        const res = await fetch(`${baseUrl}/api/sns/post-now`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
          body: JSON.stringify({
            content: snsContent,
            platforms: otherPlatforms,
            media_urls: defaultMediaUrls,
          }),
        });
        const data = await res.json();
        if (data.results) {
          for (const r of data.results) {
            results[`sns_${r.platform}`] = { success: r.success, error: r.error };
          }
        }
      }

      // Threads: 본문에 URL 없이 발행 → 블로그 URL은 댓글(reply)로 추가
      if (threadsIncluded) {
        const threadItems = blogUrls.length > 0
          ? [{ content: '🔗 ' + blogUrls.join('\n🔗 ') }]
          : [];
        const res = await fetch(`${baseUrl}/api/sns/post-now`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
          body: JSON.stringify({
            content: aiCaption,
            platforms: ['threads'],
            media_urls: (() => { const img = article.representative_image_url || extractFirstImageUrl(article.content || ''); return img ? [img] : []; })(),
            thread_items: threadItems,
          }),
        });
        const data = await res.json();
        if (data.results) {
          for (const r of data.results) {
            results[`sns_${r.platform}`] = { success: r.success, error: r.error };
          }
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

  const anySuccess = Object.values(results).some(r => r.success);
  const publishedUrls: Record<string, string> = {};
  for (const [k, v] of Object.entries(results)) {
    if (v.success && v.url) publishedUrls[k] = v.url;
  }

  const updateQuery = supabase
    .from('bossai_auto_articles')
    .update({
      status: anySuccess ? 'published' : 'failed',
      blog_platforms,
      sns_platforms,
      published_urls: publishedUrls,
      published_at: anySuccess ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', article_id);
  await (userId ? updateQuery.eq('user_id', userId) : updateQuery);

  return NextResponse.json({ results, published_urls: publishedUrls });
}
