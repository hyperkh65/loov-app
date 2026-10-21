import { NextRequest, NextResponse, after } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { youtubeAccess, uploadShort, inboxAuthed } from '@/lib/shorts-youtube';
import { postToPlatformWithMedia, postCommentOnOwnPost, waitThreadsPostAccessible } from '@/lib/sns/platforms-server';
import { logSnsPost } from '@/lib/sns/account-rotation';

export const maxDuration = 300;

// @2dayskr 계정 (sns_connections.platform_user_id)
const TARGETS = [{ platform: 'threads', id: '25203934249239577' }, { platform: 'instagram', id: '34489947500650071' }] as const;
// 딸깍 제휴 상품 영상(hold_prod_…)은 @seanonthemail 스레드로만 (사용자 확정: 인스타 제외)
const PROD_TARGETS = [{ platform: 'threads', id: '28733238669628153' }] as const;
const MONGLE_IG = '@mongle.by.2days';

// 발행 대기(source='hold') 영상을 [발행] 클릭 한 번으로 YouTube + Threads + Instagram에 올린다.
export async function POST(req: NextRequest) {
  // 대시보드 [발행](로그인) 또는 딸깍 자동 발행(Bearer 딸깍 토큰 → 소유자)
  const supabase = await createClient();
  const { data: { user: sessionUser } } = await supabase.auth.getUser();
  const user = sessionUser || (inboxAuthed(req) && process.env.OWNER_USER_ID ? { id: process.env.OWNER_USER_ID } : null);
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
  const admin = createAdminClient();
  // comment: 제품 링크 등 — 본문 대신 댓글로 단다(본문 링크는 노출이 줄어서). 댓글을 못 다는 곳은 본문 끝에 붙인다
  const { id, comment: rawComment } = await req.json().catch(() => ({}));
  const comment = typeof rawComment === 'string' ? rawComment.slice(0, 480) : '';
  const now = () => new Date().toISOString();

  // 중복 클릭 방지: 대기/실패 상태일 때만 'uploading'으로 선점
  // 'uploading'이 10분 넘게 그대로면 서버 재시작 등으로 끊긴 것 → 다시 발행 허용
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: job } = await admin.from('shorts_jobs').update({ status: 'uploading', updated_at: now() })
    .eq('id', String(id)).eq('user_id', user.id).eq('source', 'hold')
    .or(`status.in.(created,failed),and(status.eq.uploading,updated_at.lt.${stale})`).select('*').maybeSingle();
  if (!job) return NextResponse.json({ error: '발행할 수 없는 상태예요(이미 발행했거나 없음)' }, { status: 409 });

  // 딸깍 자동 발행은 응답을 기다리지 않는다(유튜브+SNS가 1~3분이라 프록시가 504로 끊으면서 스레드 영상 댓글이 빠지던 문제). 결과는 shorts_jobs.error에 남는다
  const run = async () => {
    const notes: string[] = [];
    let ytUrl: string | null = null, ytId: string | null = null, posted = 0;
    try {
      const res = await fetch(job.video_url);
      if (!res.ok) throw new Error(`영상 읽기 실패 ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const caption: string = job.description || '';
      const tags = (caption.match(/#[^\s#]+/g) || []).map((t: string) => t.slice(1)).join(',');

      const isMongle = String(job.id).startsWith('hold_mongle_'); // 몽글 꿀팁 릴스: 유튜브 없이 @mongle.by.2days 인스타로만
      if (!isMongle) try {
        const conn = await youtubeAccess(admin, user.id, job.phrase || '');
        const r = await uploadShort(conn.accessToken, { buf, title: job.title || '쇼츠', description: comment ? `${caption}\n\n${comment}` : caption, tags, comment }); // 유튜브 댓글은 force-ssl 권한이 있어야 달려서 설명란에도 둔다
        ytUrl = r.url; ytId = r.videoId;
      } catch (e) { notes.push('YouTube: ' + (e as Error).message); }

      const { data: conns } = await admin.from('sns_connections').select('platform, platform_user_id, platform_username, access_token').eq('user_id', user.id).eq('is_active', true).order('updated_at', { ascending: false });
      // 상품 영상: 스레드는 @seanonthemail, 그 밖에 연결된 SNS(인스타 제외)는 플랫폼마다 한 계정씩(최근 연결 우선)
      type Pf = Parameters<typeof postToPlatformWithMedia>[0];
      const prodTargets = [...PROD_TARGETS as readonly { platform: Pf; id: string }[]];
      for (const pf of ['facebook', 'twitter', 'bluesky', 'linkedin', 'telegram'] as const) {
        const c = (conns || []).find(x => x.platform === pf); if (c) prodTargets.push({ platform: pf as Pf, id: c.platform_user_id });
      }
      const mongle = (conns || []).find(x => x.platform === 'instagram' && x.platform_username === MONGLE_IG);
      const mongleTargets = mongle ? [{ platform: 'instagram' as Pf, id: mongle.platform_user_id }] : [];
      if (isMongle && !mongle) notes.push(`instagram: ${MONGLE_IG} 연결 없음`);
      for (const t of isMongle ? mongleTargets : String(job.id).startsWith('hold_prod_') ? prodTargets : TARGETS) {
        const c = (conns || []).find(x => x.platform === t.platform && x.platform_user_id === t.id);
        if (!c) { notes.push(`${t.platform}: 연결 없음`); continue; }
        try {
          let p: { id: string };
          const isProd = String(job.id).startsWith('hold_prod_');
          if (isProd && ['threads', 'twitter', 'facebook'].includes(t.platform)) { // 상품 영상: 후킹 멘트+영상을 한 글로, 제휴 링크는 댓글로
            p = await postToPlatformWithMedia(t.platform, c.access_token, c.platform_user_id, caption, [job.video_url]);
            if (comment) {
              if (t.platform === 'threads') await waitThreadsPostAccessible(p.id, c.access_token);
              await postCommentOnOwnPost(t.platform, c.access_token, c.platform_user_id, p.id, comment).catch(e => notes.push(`${t.platform} 링크 댓글: ${(e as Error).message}`));
            }
          } else if (t.platform === 'threads') { // 스레드: 캡션은 본문 글로, 영상(+BGM 출처)은 그 글의 댓글로
            const credit = caption.split('\n').filter(l => (l.startsWith('🎵') || l.startsWith('📷'))).join('\n');
            const text = caption.split('\n').filter(l => !(l.startsWith('🎵') || l.startsWith('📷'))).join('\n').trim();
            p = await postToPlatformWithMedia('threads', c.access_token, c.platform_user_id, text, []);
            await waitThreadsPostAccessible(p.id, c.access_token);
            await postCommentOnOwnPost('threads', c.access_token, c.platform_user_id, p.id, credit || '▶ 영상으로 보기', [job.video_url]);
            if (comment) await postCommentOnOwnPost('threads', c.access_token, c.platform_user_id, p.id, comment).catch(e => notes.push('threads 링크 댓글: ' + (e as Error).message));
          } else if (comment && ['twitter', 'facebook'].includes(t.platform)) {
            p = await postToPlatformWithMedia(t.platform, c.access_token, c.platform_user_id, caption, [job.video_url]);
            await postCommentOnOwnPost(t.platform, c.access_token, c.platform_user_id, p.id, comment).catch(e => notes.push(`${t.platform} 링크 댓글: ${(e as Error).message}`));
          } else p = await postToPlatformWithMedia(t.platform, c.access_token, c.platform_user_id, comment ? `${caption}\n\n${comment}` : caption, [job.video_url]);
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
    return { ok, youtube: ytUrl, sns: posted, notes };
  };
  if (!sessionUser) { after(run); return NextResponse.json({ ok: true, queued: true }); }
  return NextResponse.json(await run());
}

// 발행 대기 카드 삭제(발행 전·실패한 것만). R2 파일은 남겨도 무해해서 지우지 않는다.
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id') || '';
  const { data } = await createAdminClient().from('shorts_jobs').delete().eq('id', id).eq('user_id', user.id).eq('source', 'hold').in('status', ['created', 'failed']).select('id');
  return data?.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: '지울 수 없는 상태예요' }, { status: 409 });
}
