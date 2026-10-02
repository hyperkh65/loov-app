/**
 * 우리 스레드 글에 달린 댓글에 자동 답글 — 짧고 긍정적·비공격적, 글 내용을 이해한 답.
 * 스팸으로 안 보이게: 계정당 회차 5개 상한, 답글 사이 간격, 이미 답한 댓글/우리 계정 댓글은 건너뜀.
 */
import { createAdminClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';
import { postCommentOnOwnPost } from '@/lib/sns/platforms-server';

const API = 'https://graph.threads.net/v1.0';
const MAX_PER_ACCOUNT = 5;
const WINDOW_MS = 72 * 3600e3;

type Item = { id: string; text?: string; username?: string; timestamp?: string };
const get = async (path: string, token: string): Promise<{ data?: Item[]; error?: { message: string } }> =>
  (await fetch(`${API}/${path}${path.includes('?') ? '&' : '?'}access_token=${token}`, { signal: AbortSignal.timeout(15_000) })).json();

async function draftReply(postText: string, comment: string): Promise<string | null> {
  const out = (await generateText(
    `너는 스레드 계정 운영자다. 내 글에 달린 댓글에 답글을 단다.\n\n내 글: ${postText.slice(0, 500)}\n댓글: ${comment.slice(0, 300)}\n\n` +
    `[규칙]\n- 글 내용을 이해하고 댓글에 맞춰 답한다. 1~2문장, 60자 이내.\n- 친근하고 긍정적으로, 공감·감사 위주. 반말 섞인 가벼운 말투 OK, 이모지 0~1개.\n` +
    `- 공격·비꼼·논쟁·훈계 금지. 정치·비방·혐오·스팸·광고 댓글이면 답하지 말고 SKIP만 출력.\n` +
    `- 질문이면 아는 범위에서 짧게 답하고, 자세한 건 "원글 댓글 링크에 정리돼 있어요"로 안내. 모르는 사실은 지어내지 마라.\n` +
    `- 링크·해시태그 금지. 답글 텍스트만 출력.`,
    'gemini',
  )).trim().replace(/^["']|["']$/g, '');
  if (!out || /^SKIP\b/i.test(out) || out.length > 120) return null;
  return out;
}

export async function runThreadsReplyAuto(userId: string): Promise<{ replied: number; results: string[] }> {
  const admin = createAdminClient();
  const { data: conns } = await admin.from('sns_connections')
    .select('platform_user_id, platform_username, access_token')
    .eq('user_id', userId).eq('platform', 'threads').eq('is_active', true);
  const ownNames = new Set((conns || []).map(c => (c.platform_username || '').replace(/^@/, '')));
  const results: string[] = [];
  let replied = 0;

  for (const c of conns || []) {
    let count = 0;
    try {
      const posts = await get(`${c.platform_user_id}/threads?fields=id,text,timestamp&limit=10`, c.access_token);
      if (posts.error) { results.push(`${c.platform_username}: ${posts.error.message.slice(0, 80)}`); continue; }
      for (const p of posts.data || []) {
        if (count >= MAX_PER_ACCOUNT) break;
        if (!p.timestamp || Date.now() - new Date(p.timestamp).getTime() > WINDOW_MS) continue;
        const reps = await get(`${p.id}/replies?fields=id,text,username,timestamp`, c.access_token);
        if (reps.error) { results.push(`${c.platform_username}: 댓글 읽기 권한 없음 — SNS 설정에서 재연결 필요`); break; }
        for (const r of reps.data || []) {
          if (count >= MAX_PER_ACCOUNT) break;
          if (!r.text || ownNames.has(r.username || '')) continue;
          const sub = await get(`${r.id}/replies?fields=username`, c.access_token);
          if ((sub.data || []).some(x => ownNames.has(x.username || ''))) continue; // 이미 답함
          const text = await draftReply(p.text || '', r.text).catch(() => null);
          if (!text) continue;
          await postCommentOnOwnPost('threads', c.access_token, c.platform_user_id, r.id, text);
          count++; replied++;
          results.push(`${c.platform_username} ← @${r.username}: ${text}`);
          await new Promise(res => setTimeout(res, 20_000));
        }
      }
    } catch (e) {
      results.push(`${c.platform_username}: 오류 ${(e as Error).message?.slice(0, 80)}`);
    }
  }
  return { replied, results };
}
