import { postCommentOnOwnPost, waitThreadsPostAccessible } from '@/lib/sns/platforms-server';
import type { Platform } from '@/lib/sns/platforms';

/** 게시 직후 링크 댓글 — 플랫폼 반영 지연을 기다리며 최대 4회 재시도. 실패해도 throw 하지 않고 결과만 돌려줌 */
export async function postLinkComment(platform: Platform, token: string, userId: string, postId: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  let error = '';
  for (let i = 0; i < 4; i++) {
    try {
      if (platform === 'threads') await waitThreadsPostAccessible(postId, token);
      else await new Promise(r => setTimeout(r, 4000));
      const c = await postCommentOnOwnPost(platform, token, userId, postId, text);
      return { ok: true, id: c.id };
    } catch (e) { error = e instanceof Error ? e.message : String(e); await new Promise(r => setTimeout(r, 8000)); }
  }
  return { ok: false, error };
}
