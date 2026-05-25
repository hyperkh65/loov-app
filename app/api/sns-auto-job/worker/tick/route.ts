import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { postToPlatformWithMedia, postCommentOnOwnPost } from '@/lib/sns/platforms-server';
import { generateText } from '@/lib/auto-blog-ai';
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
  const publishResults: { platform: string; success: boolean; error?: string }[] = [];
  const mediaUrls = post.featured_image ? [post.featured_image] : undefined;
  const hook = message.replace(post.link || '', '').replace(/🔗\s*/g, '').replace(/\n{3,}/g, '\n\n').trim();

  const threadsInList = platforms.includes('threads');
  const others = platforms.filter(p => p !== 'threads');
  let newThreadsNextRunAt: string | null = null;

  // Threads 발행 (별도 간격 체크)
  if (threadsInList) {
    if (!threadsReady) {
      // 아직 시간 안됨 - 로그 없이 스킵 (실패 아님)
    } else {
      const { data: conn } = await admin.from('sns_connections')
        .select('access_token, platform_user_id')
        .eq('user_id', user_id).eq('platform', 'threads').eq('is_active', true)
        .limit(1).maybeSingle();

      if (!conn) {
        publishResults.push({ platform: 'threads', success: false, error: '연결되지 않은 플랫폼' });
      } else {
        try {
          const { id: postId } = await postToPlatformWithMedia(
            'threads' as Platform, (conn as {access_token:string}).access_token, (conn as {platform_user_id:string}).platform_user_id || '',
            hook, mediaUrls
          );
          await new Promise(r => setTimeout(r, 15000));
          await postCommentOnOwnPost(
            'threads' as Platform, (conn as {access_token:string}).access_token, (conn as {platform_user_id:string}).platform_user_id || '',
            postId, `🔗 ${post.link}`, undefined
          );
          publishResults.push({ platform: 'threads', success: true });
          // Threads 별도 간격 다음 실행 시간 설정
          if (threads_interval_seconds) {
            newThreadsNextRunAt = new Date(Date.now() + threads_interval_seconds * 1000).toISOString();
          }
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          publishResults.push({ platform: 'threads', success: false, error: errMsg });
          // API 오류(6xx)면 더 긴 간격으로 재시도 예약
          if (threads_interval_seconds) {
            newThreadsNextRunAt = new Date(Date.now() + threads_interval_seconds * 1000).toISOString();
          }
        }
      }
    }
  }

  // 나머지 플랫폼 발행
  for (const platform of others) {
    const { data: conn } = await admin.from('sns_connections')
      .select('access_token, platform_user_id')
      .eq('user_id', user_id).eq('platform', platform).eq('is_active', true)
      .limit(1).maybeSingle();

    if (!conn) {
      publishResults.push({ platform, success: false, error: '연결되지 않은 플랫폼' });
      continue;
    }
    try {
      const content = `${hook}\n\n🔗 ${post.link}`;
      await postToPlatformWithMedia(
        platform as Platform, (conn as {access_token:string}).access_token, (conn as {platform_user_id:string}).platform_user_id || '',
        content, mediaUrls
      );
      publishResults.push({ platform, success: true });
    } catch (e) {
      publishResults.push({ platform, success: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // 결과 로그 저장
  if (publishResults.length) {
    await admin.from('bossai_sns_auto_job_logs').insert(
      publishResults.map(r => ({
        job_id: jobId,
        post_title: post.title,
        post_url: post.link,
        platform: r.platform,
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

  await admin.from('bossai_sns_auto_jobs').update(updatePayload).eq('id', jobId);

  return isCompleted ? 0 : interval_seconds * 1000;
}
