import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { youtubeAccess, uploadShort } from '@/lib/shorts-youtube';
import { postToPlatformWithMedia, postCommentOnOwnPost, waitThreadsPostAccessible } from '@/lib/sns/platforms-server';
import { logSnsPost } from '@/lib/sns/account-rotation';

export const maxDuration = 300;

// @2dayskr 계정 (sns_connections.platform_user_id)
const TARGETS = [{ platform: 'threads', id: '25203934249239577' }, { platform: 'instagram', id: '34489947500650071' }] as const;

// 발행 대기(source='hold') 영상을 [발행] 클릭 한 번으로 YouTube + Threads + Instagram에 올린다.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
  const admin = createAdminClient();
  const { id } = await req.json().catch(() => ({}));
  const now = () => new Date().toISOString();

  // 중복 클릭 방지: 대기/실패 상태일 때만 'uploading'으로 선점
  const { data: job } = await admin.from('shorts_jobs').update({ status: 'uploading', updated_at: now() })
    .eq('id', String(id)).eq('user_id', user.id).eq('source', 'hold').in('status', ['created', 'failed']).select('*').maybeSingle();
  if (!job) return NextResponse.json({ error: '발행할 수 없는 상태예요(이미 발행했거나 없음)' }, { status: 409 });

  const notes: string[] = [];
  let ytUrl: string | null = null, ytId: string | null = null, posted = 0;
  try {
    const res = await fetch(job.video_url);
    if (!res.ok) throw new Error(`영상 읽기 실패 ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const caption: string = job.description || '';
    const tags = (caption.match(/#[^\s#]+/g) || []).map((t: string) => t.slice(1)).join(',');

    try {
      const conn = await youtubeAccess(admin, user.id, job.phrase || '');
      const r = await uploadShort(conn.accessToken, { buf, title: job.title || '쇼츠', description: caption, tags });
      ytUrl = r.url; ytId = r.videoId;
    } catch (e) { notes.push('YouTube: ' + (e as Error).message); }

    const { data: conns } = await admin.from('sns_connections').select('platform, platform_user_id, access_token').eq('user_id', user.id).eq('is_active', true);
    for (const t of TARGETS) {
      const c = (conns || []).find(x => x.platform === t.platform && x.platform_user_id === t.id);
      if (!c) { notes.push(`${t.platform}: 연결 없음`); continue; }
      try {
        let p: { id: string };
        if (t.platform === 'threads') { // 스레드: 캡션은 본문 글로, 영상(+BGM 출처)은 그 글의 댓글로
          const credit = caption.split('\n').filter(l => (l.startsWith('🎵') || l.startsWith('📷'))).join('\n');
          const text = caption.split('\n').filter(l => !(l.startsWith('🎵') || l.startsWith('📷'))).join('\n').trim();
          p = await postToPlatformWithMedia('threads', c.access_token, c.platform_user_id, text, []);
          await waitThreadsPostAccessible(p.id, c.access_token);
          await postCommentOnOwnPost('threads', c.access_token, c.platform_user_id, p.id, credit || '▶ 영상으로 보기', [job.video_url]);
        } else p = await postToPlatformWithMedia(t.platform, c.access_token, c.platform_user_id, caption, [job.video_url]);
        posted++;
        await admin.from('sns_post_logs').insert({ user_id: user.id, platform: t.platform, status: 'success', platform_post_id: p.id });
        logSnsPost(admin, t.platform, c.platform_user_id).catch(() => {});
      } catch (e) {
        const m = (e as Error).message;
        notes.push(`${t.platform}: ${m}`);
        await admin.from('sns_post_logs').insert({ user_id: user.id, platform: t.platform, status: 'failed', error_message: `[shorts] ${m}`.slice(0, 500) });
      }
    }
  } catch (e) { notes.push((e as Error).message); }

  const ok = !!ytUrl || posted > 0;
  const error = notes.join(' | ').slice(0, 300) || null;
  await admin.from('shorts_jobs').update({
    status: ok ? 'uploaded' : 'failed', uploaded_at: ok ? now() : null, error,
    ...(ytUrl ? { video_id: ytId, video_url: ytUrl } : {}), updated_at: now(),
  }).eq('id', job.id);
  return NextResponse.json({ ok, youtube: ytUrl, sns: posted, notes });
}
