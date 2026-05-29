import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { postToPlatformWithMedia, postCommentOnOwnPost, waitThreadsPostAccessible } from '@/lib/sns/platforms-server';
import { generateText } from '@/lib/auto-blog-ai';
import { generateAndUploadThumbnail } from '@/lib/auto-blog-thumbnail';
import type { Platform } from '@/lib/sns/platforms';

export const maxDuration = 300;

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/&#8216;/g, '‘').replace(/&#8217;/g, '’')
    .replace(/&#8220;/g, '“').replace(/&#8221;/g, '”');
}
function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ''));
}

function isRateLimitError(msg: string): boolean {
  return /code["\s:]+(?:4|17|32|613)\b/i.test(msg) ||
    /rate.?limit|request.?limit|throttl|daily.?limit|quota/i.test(msg) ||
    /OAuthException.*(?:4|17|32|613)/i.test(msg);
}

function isInstagramDailyLimit(msg: string): boolean {
  return /INSTAGRAM_DAILY_LIMIT/.test(msg) ||
    /code["\s:]+9\b.*2207069|2207069.*code["\s:]+9/i.test(msg) ||
    /미디어 생성 한도|게시물 한도 초과/.test(msg);
}

async function translateMessage(text: string, targetLang: string): Promise<string> {
  if (targetLang === 'ko') return text;
  const langName = targetLang === 'ja' ? '일본어' : '영어';
  try {
    const translated = await generateText(
      `다음 한국어 SNS 포스트를 ${langName}로 자연스럽게 번역해. 이모지와 줄바꿈은 그대로 유지해. 번역문만 출력:\n\n${text}`,
      'claude'
    );
    return translated?.trim() || text;
  } catch { return text; }
}

function buildHookPrompt(title: string, excerpt: string): string {
  return `아래 블로그 글의 제목과 요약을 보고, SNS에 올릴 후킹 멘트를 작성해.
제목: ${title}
요약: ${excerpt.slice(0, 300)}

[작성 규칙]
1. 반드시 한국어로만 작성
2. 첫 줄: 핵심 내용을 툭 던지는 한 문장 + 이모지 1개
3. 빈 줄 하나
4. 2~3줄: 구어체로 풀어써
5. URL, 광고성 표현 절대 금지
6. 이모지는 첫 줄에만 1개

후킹 멘트만 출력:`;
}

export async function POST(req: NextRequest) {
  const workerSecret = req.headers.get('X-Worker-Secret');
  if (!workerSecret || workerSecret !== process.env.WORKER_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const nowISO = now.toISOString();

  const { data: jobs } = await admin
    .from('bossai_sns_auto_jobs')
    .select('*')
    .eq('status', 'running')
    .lte('next_run_at', nowISO)
    .lte('locked_until', nowISO)
    .order('next_run_at', { ascending: true })
    .limit(3);

  if (!jobs?.length) {
    const { count } = await admin.from('bossai_sns_auto_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'running');
    return NextResponse.json({ processed: false, hasRunningJobs: (count || 0) > 0 });
  }

  const processed: string[] = [];
  let minNextRunMs = Infinity;

  for (const job of jobs) {
    const lockUntil = new Date(Date.now() + 120000).toISOString();
    const { data: locked } = await admin.from('bossai_sns_auto_jobs')
      .update({ locked_until: lockUntil, updated_at: nowISO })
      .eq('id', job.id)
      .lte('locked_until', nowISO)
      .select('id');

    if (!locked?.length) continue;

    try {
      const nextRunMs = await processJob(admin, job);
      processed.push(job.id);
      if (nextRunMs < minNextRunMs) minNextRunMs = nextRunMs;
    } catch (e) {
      console.error(`[sns-auto-job] job ${job.id} 처리 오류:`, e);
      await admin.from('bossai_sns_auto_jobs')
        .update({ locked_until: new Date(Date.now() - 1000).toISOString() })
        .eq('id', job.id);
    }
  }

  return NextResponse.json({
    processed: processed.length > 0,
    hasRunningJobs: true,
    nextRunInMs: minNextRunMs === Infinity ? 5000 : minNextRunMs,
    jobIds: processed,
  });
}

async function processJob(
  admin: ReturnType<typeof createAdminClient>,
  job: Record<string, unknown>
): Promise<number> {
  const {
    id: jobId,
    user_id,
    site_id,
    sns_platforms,
    sns_connection_configs,
    use_ai,
    post_order,
    page_to,
    current_page,
    current_post_index,
    interval_seconds,
    threads_interval_seconds,
    threads_next_run_at,
    total_done,
    total_success,
    total_failed,
  } = job as {
    id: string;
    user_id: string;
    site_id: string;
    sns_platforms: string[];
    sns_connection_configs: { platform: string; platform_user_id: string; language: string }[] | null;
    use_ai: boolean;
    post_order: string;
    page_to: number;
    current_page: number;
    current_post_index: number;
    interval_seconds: number;
    threads_interval_seconds: number | null;
    threads_next_run_at: string | null;
    total_done: number;
    total_success: number;
    total_failed: number;
  };

  // Threads 별도 간격: 아직 시간 안됐는지 확인
  const threadsReady = !threads_interval_seconds || !threads_next_run_at ||
    new Date(threads_next_run_at) <= new Date();

  // WordPress 사이트 자격증명 조회
  const { data: site } = await admin.from('wordpress_sites')
    .select('site_url, wp_username, app_password')
    .eq('id', site_id)
    .single();

  if (!site) {
    await admin.from('bossai_sns_auto_jobs')
      .update({ status: 'stopped', updated_at: new Date().toISOString() })
      .eq('id', jobId);
    return 0;
  }

  // WordPress 글 목록 가져오기
  const auth = 'Basic ' + Buffer.from(`${(site as {wp_username:string}).wp_username}:${(site as {app_password:string}).app_password}`).toString('base64');
  const wpParams = new URLSearchParams({
    '_embed': 'wp:featuredmedia',
    'per_page': '12',
    'page': String(current_page),
    'orderby': 'date',
    'order': post_order === 'asc' ? 'asc' : 'desc',
    'status': 'publish',
  });

  let posts: Record<string, unknown>[] = [];
  try {
    const wpRes = await fetch(`${(site as {site_url:string}).site_url}/wp-json/wp/v2/posts?${wpParams}`, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(15000),
    });
    if (wpRes.ok) posts = await wpRes.json();
  } catch {
    await admin.from('bossai_sns_auto_jobs')
      .update({ locked_until: new Date(Date.now() - 1000).toISOString(), updated_at: new Date().toISOString() })
      .eq('id', jobId);
    return interval_seconds * 1000;
  }

  // 현재 페이지에 글이 없거나 인덱스 초과 → 다음 페이지로
  if (!posts.length || current_post_index >= posts.length) {
    const nextPage = current_page + 1;
    if (!posts.length || nextPage > page_to) {
      await admin.from('bossai_sns_auto_jobs')
        .update({ status: 'completed', locked_until: new Date(Date.now() - 1000).toISOString(), updated_at: new Date().toISOString() })
        .eq('id', jobId);
      return 0;
    }
    await admin.from('bossai_sns_auto_jobs')
      .update({ current_page: nextPage, current_post_index: 0, next_run_at: new Date().toISOString(), locked_until: new Date(Date.now() - 1000).toISOString(), updated_at: new Date().toISOString() })
      .eq('id', jobId);
    return 0;
  }

  // 현재 글 추출
  const rawPost = posts[current_post_index] as Record<string, unknown>;
  const titleRendered = ((rawPost.title as Record<string,unknown>)?.rendered ?? '') as string;
  const excerptRendered = ((rawPost.excerpt as Record<string,unknown>)?.rendered ?? '') as string;
  const embedded = rawPost._embedded as Record<string, unknown[]> | undefined;
  const mediaArr = embedded?.['wp:featuredmedia'];
  const mediaItem = Array.isArray(mediaArr) ? (mediaArr[0] as Record<string, unknown>) : null;
  const featuredImage = (mediaItem?.source_url as string) ?? null;

  const post = {
    title: stripTags(titleRendered),
    excerpt: stripTags(excerptRendered).slice(0, 250),
    link: rawPost.link as string,
    featured_image: featuredImage,
  };

  // 메시지 생성
  let message = [post.title, post.excerpt].filter(Boolean).join('\n\n');
  if (use_ai) {
    try {
      const hook = await generateText(buildHookPrompt(post.title, post.excerpt), 'qwen3');
      if (hook?.trim()) message = hook.trim();
    } catch { /* 기본 메시지 유지 */ }
  }

  // SNS 발행
  const platforms = Array.isArray(sns_platforms) ? sns_platforms : [];
  const publishResults: { platform: string; label: string; success: boolean; error?: string }[] = [];
  const mediaUrls = post.featured_image ? [post.featured_image] : undefined;
  const hook = message.replace(post.link || '', '').replace(/🔗\s*/g, '').replace(/\n{3,}/g, '\n\n').trim();

  // connection configs 없으면 기존 방식(플랫폼명 기반) 폴백
  type ConnCfg = { platform: string; platform_user_id: string; language: string; use_news_card?: boolean; cooldown_until?: string };
  const connConfigs: ConnCfg[] = Array.isArray(sns_connection_configs) && sns_connection_configs.length
    ? sns_connection_configs
    : platforms.map(p => ({ platform: p, platform_user_id: '', language: 'ko' }));

  // 쿨다운 중인 계정 스킵 처리
  const now = new Date();
  let updatedConnConfigs = connConfigs.map(c => ({ ...c }));
  const activeCfgs = connConfigs.filter(c => !c.cooldown_until || new Date(c.cooldown_until) <= now);

  // 쿨다운 중 계정 로그 기록
  const coolingCfgs = connConfigs.filter(c => c.cooldown_until && new Date(c.cooldown_until) > now);
  for (const c of coolingCfgs) {
    const until = new Date(c.cooldown_until!).toLocaleString('ko-KR');
    publishResults.push({ platform: c.platform, label: c.platform, success: false, error: `일일 한도 쿨다운 중 (${until}까지)` });
  }

  const threadsConfigs = activeCfgs.filter(c => c.platform === 'threads');
  const otherConfigs = activeCfgs.filter(c => c.platform !== 'threads');
  let newThreadsNextRunAt: string | null = null;

  // Threads 발행 (별도 간격 체크, 다중 계정 지원)
  if (threadsConfigs.length > 0) {
    if (!threadsReady) {
      // 아직 시간 안됨 - 스킵
    } else {
      for (const cfg of threadsConfigs) {
        let q = admin.from('sns_connections')
          .select('access_token, platform_user_id')
          .eq('user_id', user_id).eq('platform', 'threads').eq('is_active', true);
        if (cfg.platform_user_id) q = q.eq('platform_user_id', cfg.platform_user_id);
        const { data: conn } = await q.limit(1).maybeSingle();

        const label = `threads${cfg.language !== 'ko' ? `(${cfg.language})` : ''}`;
        if (!conn) {
          publishResults.push({ platform: 'threads', label, success: false, error: '연결되지 않은 플랫폼' });
          continue;
        }
        try {
          const translatedHook = await translateMessage(hook, cfg.language);
          const connToken = (conn as {access_token:string}).access_token;
          const connUserId = (conn as {platform_user_id:string}).platform_user_id || '';
          const { id: postId } = await postToPlatformWithMedia(
            'threads' as Platform, connToken, connUserId, translatedHook, mediaUrls
          );

          // 게시물 인덱싱 완료 대기 (고정 15s → API 폴링으로 최대 60s)
          await waitThreadsPostAccessible(postId, connToken);

          // 링크 댓글: 3회 재시도, 10s→20s 백오프
          let commentOk = false;
          let commentErr = '';
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await postCommentOnOwnPost(
                'threads' as Platform, connToken, connUserId,
                postId, `🔗 ${post.link}`, undefined
              );
              commentOk = true;
              break;
            } catch (e) {
              if (attempt < 2) {
                await new Promise(r => setTimeout(r, (attempt + 1) * 10000));
              } else {
                commentErr = e instanceof Error ? e.message : String(e);
                console.warn(`[threads] 링크 댓글 최종 실패 (3회 시도):`, e);
              }
            }
          }
          // 메인 포스트 성공은 댓글 실패와 별개로 기록
          publishResults.push({
            platform: 'threads', label, success: true,
            error: commentOk ? undefined : `링크 댓글 실패: ${commentErr}`,
          });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          publishResults.push({ platform: 'threads', label, success: false, error: errMsg });
          // 레이트 리밋 감지 시 1시간 강제 쿨다운
          if (isRateLimitError(errMsg)) {
            newThreadsNextRunAt = new Date(Date.now() + 3600 * 1000).toISOString();
          }
        }
      }
      // 레이트 리밋으로 이미 쿨다운 설정된 경우 제외하고 정상 간격 적용
      if (!newThreadsNextRunAt && threads_interval_seconds) {
        newThreadsNextRunAt = new Date(Date.now() + threads_interval_seconds * 1000).toISOString();
      }
    }
  }

  // 나머지 플랫폼 발행 (다중 계정 + 번역 지원)
  for (const cfg of otherConfigs) {
    let q = admin.from('sns_connections')
      .select('access_token, platform_user_id')
      .eq('user_id', user_id).eq('platform', cfg.platform).eq('is_active', true);
    if (cfg.platform_user_id) q = q.eq('platform_user_id', cfg.platform_user_id);
    const { data: conn } = await q.limit(1).maybeSingle();

    const label = `${cfg.platform}${cfg.language !== 'ko' ? `(${cfg.language})` : ''}`;
    if (!conn) {
      publishResults.push({ platform: cfg.platform, label, success: false, error: '연결되지 않은 플랫폼' });
      continue;
    }
    try {
      const translatedHook = await translateMessage(hook, cfg.language);
      const content = `${translatedHook}\n\n🔗 ${post.link}`;

      // Instagram 뉴스카드: use_news_card 활성화 시 썸네일 자동 생성
      let postMediaUrls = mediaUrls;
      if (cfg.platform === 'instagram' && cfg.use_news_card) {
        try {
          const newsCardUrl = await generateAndUploadThumbnail(post.title, post.title.slice(0, 20), 'blue', undefined, undefined, undefined, 'square');
          postMediaUrls = [newsCardUrl];
        } catch {
          // 뉴스카드 생성 실패 시 원본 이미지 사용
        }
      }

      await postToPlatformWithMedia(
        cfg.platform as Platform, (conn as {access_token:string}).access_token, (conn as {platform_user_id:string}).platform_user_id || '',
        content, postMediaUrls
      );
      publishResults.push({ platform: cfg.platform, label, success: true });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      publishResults.push({ platform: cfg.platform, label, success: false, error: errMsg });
      // Instagram 일일 한도 초과 → 24시간 쿨다운을 sns_connection_configs에 저장
      if (cfg.platform === 'instagram' && isInstagramDailyLimit(errMsg)) {
        const cooldownUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        updatedConnConfigs = updatedConnConfigs.map(c =>
          c.platform === 'instagram' && c.platform_user_id === cfg.platform_user_id
            ? { ...c, cooldown_until: cooldownUntil }
            : c
        );
      }
    }
  }

  // 결과 로그 저장
  if (publishResults.length) {
    await admin.from('bossai_sns_auto_job_logs').insert(
      publishResults.map(r => ({
        job_id: jobId,
        post_title: post.title,
        post_url: post.link,
        platform: r.label || r.platform,
        success: r.success,
        error_message: r.error || null,
      }))
    );
  }

  // 진행상황 업데이트
  const successCount = publishResults.filter(r => r.success).length;
  const failedCount = publishResults.filter(r => !r.success).length;
  const nextPostIndex = current_post_index + 1;
  const isLastOnPage = nextPostIndex >= posts.length;
  const nextPage = isLastOnPage ? current_page + 1 : current_page;
  const nextIndex = isLastOnPage ? 0 : nextPostIndex;
  const isCompleted = isLastOnPage && nextPage > page_to;
  const nextRunAt = new Date(Date.now() + interval_seconds * 1000).toISOString();

  const updatePayload: Record<string, unknown> = {
    current_page: isCompleted ? current_page : nextPage,
    current_post_index: isCompleted ? current_post_index : nextIndex,
    status: isCompleted ? 'completed' : 'running',
    total_done: total_done + 1,
    total_success: total_success + successCount,
    total_failed: total_failed + failedCount,
    next_run_at: nextRunAt,
    locked_until: new Date(Date.now() - 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (newThreadsNextRunAt) updatePayload.threads_next_run_at = newThreadsNextRunAt;
  // Instagram 쿨다운 등 연결 설정 변경이 있으면 반영
  if (JSON.stringify(updatedConnConfigs) !== JSON.stringify(connConfigs)) {
    updatePayload.sns_connection_configs = updatedConnConfigs;
  }

  await admin.from('bossai_sns_auto_jobs').update(updatePayload).eq('id', jobId);

  return isCompleted ? 0 : interval_seconds * 1000;
}
