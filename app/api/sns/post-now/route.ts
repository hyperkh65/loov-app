import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { postToPlatformWithMedia, postCommentOnOwnPost, waitThreadsPostAccessible } from '@/lib/sns/platforms-server';
import { getSetting } from '@/lib/get-setting';
import type { Platform } from '@/lib/sns/platforms';

// Threads 댓글 대기(15s) + 재시도(최대 30s) + 영상처리(30s) → 여유있게 설정
export const maxDuration = 300;

interface ThreadItem {
  content: string;
  media_urls?: string[];
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { content: directContent, template_id, platforms, media_urls, thread_items, account_ids } = await req.json();

  let content: string = directContent || '';
  const templateId: string | null = template_id || null;

  if (!content && template_id) {
    const { data: template } = await supabase
      .from('sns_post_templates')
      .select('content')
      .eq('id', template_id)
      .eq('user_id', user.id)
      .single();
    if (!template) return NextResponse.json({ error: '템플릿을 찾을 수 없습니다' }, { status: 404 });
    content = template.content;
  }

  if (!content?.trim() || !platforms?.length)
    return NextResponse.json({ error: '내용과 플랫폼을 선택해주세요' }, { status: 400 });

  const results: { platform: string; success: boolean; error?: string }[] = [];

  for (const platform of platforms as Platform[]) {
    let connQuery = supabase
      .from('sns_connections')
      .select('access_token, refresh_token, token_expires_at, platform_user_id, is_active')
      .eq('user_id', user.id)
      .eq('platform', platform)
      .eq('is_active', true);
    if (account_ids?.length) connQuery = connQuery.in('platform_user_id', account_ids);
    const { data: connList } = await connQuery;

    if (!connList?.length) {
      results.push({ platform, success: false, error: '연결되지 않은 플랫폼' });
      await supabase.from('sns_post_logs').insert({
        user_id: user.id, template_id: templateId, platform, status: 'failed', error_message: '연결되지 않은 플랫폼',
      });
      continue;
    }

    for (const conn of connList) {
      // Twitter OAuth 2.0 토큰 만료 시 자동 갱신
      let activeToken = conn.access_token;
      if (platform === 'twitter' && conn.refresh_token) {
        const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
        const needsRefresh = expiresAt < Date.now() + 5 * 60 * 1000;
        if (needsRefresh) {
          try {
            const [dbTwId, dbTwSecret] = await Promise.all([getSetting('TWITTER_CLIENT_ID'), getSetting('TWITTER_CLIENT_SECRET')]);
            const twId = dbTwId || process.env.TWITTER_CLIENT_ID || '';
            const twSecret = dbTwSecret || process.env.TWITTER_CLIENT_SECRET || '';
            const creds = Buffer.from(`${twId}:${twSecret}`).toString('base64');
            const refreshRes = await fetch('https://api.twitter.com/2/oauth2/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${creds}` },
              body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: conn.refresh_token,
                client_id: twId,
              }),
            });
            if (refreshRes.ok) {
              const refreshData = await refreshRes.json() as { access_token: string; refresh_token?: string; expires_in?: number };
              activeToken = refreshData.access_token;
              const newExpires = refreshData.expires_in
                ? new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
                : null;
              await supabase.from('sns_connections').update({
                access_token: activeToken,
                refresh_token: refreshData.refresh_token || conn.refresh_token,
                token_expires_at: newExpires,
                updated_at: new Date().toISOString(),
              }).eq('user_id', user.id).eq('platform', 'twitter').eq('platform_user_id', conn.platform_user_id);
            } else {
              const errText = await refreshRes.text();
              results.push({ platform, success: false, error: `Twitter 토큰 갱신 실패 — 재연결 필요: ${errText.slice(0, 100)}` });
              await supabase.from('sns_connections').update({ is_active: false }).eq('user_id', user.id).eq('platform', 'twitter').eq('platform_user_id', conn.platform_user_id);
              await supabase.from('sns_post_logs').insert({
                user_id: user.id, template_id: templateId, platform, status: 'failed', error_message: 'token_refresh_failed',
              });
              continue;
            }
          } catch (refreshErr) {
            results.push({ platform, success: false, error: `Twitter 토큰 갱신 오류: ${String(refreshErr)}` });
            continue;
          }
        }
      }

      try {
        const { id: platformPostId } = await postToPlatformWithMedia(
          platform, activeToken, conn.platform_user_id || '', content, media_urls,
        );
        results.push({ platform, success: true });
        await supabase.from('sns_post_logs').insert({
          user_id: user.id, template_id: templateId, platform, status: 'success',
          platform_post_id: platformPostId, media_urls: media_urls || [],
        });

        if (thread_items?.length && platformPostId) {
          if (platform === 'threads') await waitThreadsPostAccessible(platformPostId, activeToken);

          let prevId = platformPostId;
          let commentSuccess = true;
          let commentError = '';
          const backoffMs = [5000, 10000, 20000, 30000];
          for (let itemIdx = 0; itemIdx < (thread_items as ThreadItem[]).length; itemIdx++) {
            const item = (thread_items as ThreadItem[])[itemIdx];
            if (!item.content?.trim()) continue;
            if (itemIdx > 0) await new Promise(r => setTimeout(r, 3000));
            let posted = false;
            for (let attempt = 0; attempt < 5; attempt++) {
              try {
                const targetId = platform === 'twitter' ? prevId : platformPostId;
                const { id: commentId } = await postCommentOnOwnPost(
                  platform, activeToken, conn.platform_user_id || '',
                  targetId, item.content, item.media_urls,
                );
                if (platform === 'twitter') prevId = commentId;
                posted = true;
                break;
              } catch (e) {
                if (attempt < 4) {
                  await new Promise(r => setTimeout(r, backoffMs[attempt] ?? 30000));
                } else {
                  commentSuccess = false;
                  commentError = e instanceof Error ? e.message : String(e);
                  console.warn(`[${platform}] 댓글 게시 최종 실패 (5회 시도):`, e);
                }
              }
            }
            void posted;
          }
          if (!commentSuccess) {
            results[results.length - 1] = {
              ...results[results.length - 1],
              error: `발행 성공, 링크 댓글 실패: ${commentError}`,
            };
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ platform, success: false, error: message });
        await supabase.from('sns_post_logs').insert({
          user_id: user.id, template_id: templateId, platform, status: 'failed', error_message: message,
        });
      }
    }
  }

  return NextResponse.json({ results });
}
