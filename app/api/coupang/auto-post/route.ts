import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { postToPlatformWithMedia, postCommentOnOwnPost } from '@/lib/sns/platforms-server';
import type { Platform } from '@/lib/sns/platforms';
import { GoogleGenerativeAI } from '@google/generative-ai';

const COUPANG_DISCLOSURE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

async function generateHookContent(
  productName: string,
  price: number,
  firstReview: string,
  platform: Platform,
  aiApiKey?: string,
): Promise<string> {
  const charLimit: Record<Platform, number> = { twitter: 240, threads: 480, facebook: 1000, instagram: 1800, linkedin: 2000 };
  const limit = charLimit[platform];

  const platformStyle: Record<Platform, string> = {
    threads: '줄바꿈으로 리듬감. 2~4줄 짧은 문장. 이모지 1~2개 포인트만.',
    twitter: '한 방에 꽂히는 한 줄 + 해시태그 2~3개. 군더더기 없이.',
    instagram: '감각적 구어체. 이모지 풍부. 해시태그 8~10개.',
    facebook: '친한 친구에게 카톡으로 알려주듯. 자연스럽게.',
    linkedin: '가치 중심 추천. 전문적이지만 딱딱하지 않게.',
  };

  const systemPrompt = `너는 온라인 MD야. 상품을 누구보다 잘 알고, 실제 사용한 사람의 경험에서 가장 핵심적인 한 줄을 뽑아내는 능력이 있어.

절대 쓰면 안 되는 단어:
- 후기, 리뷰, 상품평, 홍보, 광고, 추천드립니다, 구매했습니다, 사용해봤습니다
- "좋은 제품입니다", "만족스럽습니다" 같은 공허한 말

글쓰기 원칙:
- 첫 줄이 전부야. 읽자마자 "어? 나 이거 필요한데?" 또는 "헐 진짜?" 하게 만들어
- 실제 경험에서 나온 구체적 포인트를 첫 줄로 (막연한 표현 금지)
- "솔직히", "진짜로", "이거 왜 진작에", "이 가격에 이게?" 같은 톤
- 가격은 자연스럽게 — 놀라운 가성비 느낌으로
- 사고 싶어지는 이유 하나만 명확하게
- 링크는 댓글에 달 거니까 본문에 절대 넣지 마
- ${platformStyle[platform]}
- ${limit}자 이내. 글만 출력.`;

  const userPrompt = `상품: ${productName}
가격: ${price.toLocaleString()}원
실제 구매자 경험 (여기서 핵심만 뽑아내):
"${(firstReview || '완전 만족').slice(0, 400)}"

${platform}용 글 써줘.`;

  const apiKey = aiApiKey || process.env.GEMINI_API_KEY;
  const fallback = firstReview
    ? `${firstReview.slice(0, 60).trim()}...\n\n${productName}\n${price.toLocaleString()}원\n\n👇댓글`
    : `${productName}\n${price.toLocaleString()}원\n\n링크 댓글에 👇`;

  if (!apiKey) return fallback;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(systemPrompt + '\n\n' + userPrompt);
    return result.response.text().trim();
  } catch {
    return fallback;
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const {
    productName, productUrl, price, affiliateUrl,
    imageUrls, firstReview, platforms, aiApiKey,
    generatedContent: preGenerated,
    threadsAccountIds,
  } = await req.json();

  if (!productName || !platforms?.length)
    return NextResponse.json({ error: '상품명과 플랫폼은 필수입니다' }, { status: 400 });

  const allImages: string[] = (imageUrls || []).filter(Boolean).slice(0, 5);
  const threadsCommentText = `👉 구매링크\n${affiliateUrl || ''}\n\n${COUPANG_DISCLOSURE}`;

  const results: { platform: string; account?: string; success: boolean; content?: string; error?: string }[] = [];
  const postIds: Record<string, string> = {};
  const generatedContent: Record<string, string> = {};

  for (const platform of platforms as Platform[]) {
    // Threads 멀티계정: 선택된 계정 목록이 있으면 각각 발행
    if (platform === 'threads' && Array.isArray(threadsAccountIds) && threadsAccountIds.length > 0) {
      const { data: conns } = await supabase
        .from('sns_connections')
        .select('access_token, platform_user_id, platform_username, is_active')
        .eq('user_id', user.id)
        .eq('platform', 'threads')
        .eq('is_active', true)
        .in('platform_user_id', threadsAccountIds);

      if (!conns?.length) {
        results.push({ platform, success: false, error: '선택된 Threads 계정을 찾을 수 없습니다' });
        continue;
      }

      let baseContent = (preGenerated as Record<string, string> | undefined)?.['threads']
        || await generateHookContent(productName, price || 0, firstReview || '', 'threads', aiApiKey);
      generatedContent['threads'] = baseContent;

      for (const conn of conns) {
        try {
          const { id: platformPostId } = await postToPlatformWithMedia(
            'threads', conn.access_token, conn.platform_user_id || '', baseContent, allImages,
          );
          postIds[`threads_${conn.platform_user_id}`] = platformPostId;

          if (affiliateUrl) {
            try {
              await postCommentOnOwnPost(
                'threads', conn.access_token, conn.platform_user_id || '',
                platformPostId, threadsCommentText, allImages.slice(0, 1),
              );
            } catch (e) {
              console.warn(`[threads] 댓글 달기 실패 (${conn.platform_username}):`, e);
            }
          }

          results.push({ platform, account: conn.platform_username || conn.platform_user_id, success: true, content: baseContent });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          results.push({ platform, account: conn.platform_username || conn.platform_user_id, success: false, error: message });
        }
      }
      continue;
    }

    // 그 외 플랫폼: 첫 번째 활성 계정 사용
    const { data: conn } = await supabase
      .from('sns_connections')
      .select('access_token, platform_user_id, is_active')
      .eq('user_id', user.id)
      .eq('platform', platform)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!conn) {
      results.push({ platform, success: false, error: '연결되지 않은 플랫폼' });
      continue;
    }

    try {
      let baseContent = (preGenerated as Record<string, string> | undefined)?.[platform]
        || await generateHookContent(productName, price || 0, firstReview || '', platform, aiApiKey);

      // Facebook: 본문에 링크 + 공시 직접 포함 (댓글 X)
      if (platform === 'facebook' && affiliateUrl) {
        baseContent = `${baseContent}\n\n👉 구매링크\n${affiliateUrl}\n\n${COUPANG_DISCLOSURE}`;
      }

      generatedContent[platform] = baseContent;

      const { id: platformPostId } = await postToPlatformWithMedia(
        platform, conn.access_token, conn.platform_user_id || '', baseContent, allImages,
      );
      postIds[platform] = platformPostId;

      // Threads 단일계정 (threadsAccountIds 미지정 시)
      if (platform === 'threads' && affiliateUrl) {
        try {
          await postCommentOnOwnPost(
            platform, conn.access_token, conn.platform_user_id || '',
            platformPostId, threadsCommentText, allImages.slice(0, 1),
          );
        } catch (e) {
          console.warn(`[threads] 댓글 달기 실패:`, e);
        }
      }

      // Twitter / Instagram / LinkedIn
      if (['twitter', 'instagram', 'linkedin'].includes(platform) && affiliateUrl) {
        try {
          await postCommentOnOwnPost(
            platform, conn.access_token, conn.platform_user_id || '',
            platformPostId, `👉 구매링크\n${affiliateUrl}\n\n${COUPANG_DISCLOSURE}`,
          );
        } catch (e) {
          console.warn(`[${platform}] 댓글 달기 실패:`, e);
        }
      }

      results.push({ platform, success: true, content: baseContent });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ platform, success: false, error: message });
    }
  }

  // 이력 저장
  const successPlatforms = results.filter(r => r.success).map(r => r.platform);
  if (successPlatforms.length > 0) {
    await supabase.from('coupang_post_history').insert({
      user_id: user.id,
      product_name: productName,
      product_url: productUrl || '',
      affiliate_url: affiliateUrl || '',
      image_urls: allImages,
      first_review: firstReview || '',
      platforms: successPlatforms,
      generated_content: generatedContent,
      post_ids: postIds,
    });
  }

  return NextResponse.json({ results });
}
