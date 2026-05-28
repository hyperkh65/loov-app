import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { postToPlatformWithMedia, postCommentOnOwnPost, waitThreadsPostAccessible } from '@/lib/sns/platforms-server';
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

  const { content: directContent, template_id, platforms, media_urls, thread_items } = await req.json();

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
      await supabase.from('sns_post_logs').insert({
        user_id: user.id, template_id: templateId, platform, status: 'failed', error_message: '연결되지 않은 플랫폼',
      });
      continue;
    }


    try {
      const { id: platformPostId } = await postToPlatformWithMedia(
        platform, conn.access_token, conn.platform_user_id || '', content, media_urls,
      );
      results.push({ platform, success: true });
      await supabase.from('sns_post_logs').insert({
        user_id: user.id, template_id: templateId, platform, status: 'success',
        platform_post_id: platformPostId, media_urls: media_urls || [],
      });

      // 스레드/댓글 형식 추가 게시
      if (thread_items?.length && platformPostId) {
        // Threads: 게시물 인덱싱 완료될 때까지 폴링 (최대 60초)
        // 고정 대기 대신 API로 직접 접근 가능 여부를 확인
        if (platform === 'threads') await waitThreadsPostAccessible(platformPostId, conn.access_token);

        let prevId = platformPostId;
        let commentSuccess = true;
        let commentError = '';
        const backoffMs = [5000, 10000, 20000, 30000]; // 5회 재시도 백오프
        for (let itemIdx = 0; itemIdx < (thread_items as ThreadItem[]).length; itemIdx++) {
          const item = (thread_items as ThreadItem[])[itemIdx];
          if (!item.content?.trim()) continue;
          // 두 번째 이상 아이템은 3초 대기 (이전 댓글 인덱싱 시간)
          if (itemIdx > 0) await new Promise(r => setTimeout(r, 3000));
          // 5회 재시도, 점진적 백오프: 5s → 10s → 20s → 30s
          let posted = false;
          for (let attempt = 0; attempt < 5; attempt++) {
            try {
              const targetId = platform === 'twitter' ? prevId : platformPostId;
              const { id: commentId } = await postCommentOnOwnPost(
                platform, conn.access_token, conn.platform_user_id || '',
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
        // 댓글 실패 정보를 결과에 반영
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

  return NextResponse.json({ results });
}
