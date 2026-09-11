/**
 * LinkedIn 발행 공용 로직. app/api/backlink/linkedin(세션 사용자용 HTTP 엔드포인트)와
 * lib/rewrite-publish.ts(자동화 파이프라인, admin 클라이언트 + 고정 userId)가 공유한다.
 * 토큰은 이미 설정돼 있었는데(LINKEDIN_ACCESS_TOKEN) 자동화 파이프라인 어디서도
 * 호출하지 않아 실제로는 한 번도 안 쓰이고 있었음 — 백링크/추가 유입 경로
 * 확보를 위해 rewrite-publish.ts에 연결.
 */
import { getSetting } from '@/lib/get-setting';

export interface LinkedInPublishParams {
  title: string;
  meta_description?: string;
  keyword?: string;
  canonical_url: string;
}

export async function publishToLinkedIn(params: LinkedInPublishParams): Promise<{ url?: string }> {
  const { title, meta_description, keyword, canonical_url } = params;
  if (!title || !canonical_url) throw new Error('title, canonical_url 필요');

  const accessToken = await getSetting('LINKEDIN_ACCESS_TOKEN');
  if (!accessToken) throw new Error('LinkedIn Access Token 누락 — 설정 페이지에서 입력해주세요');

  let personId: string | undefined;
  const userinfoRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (userinfoRes.ok) {
    const d = await userinfoRes.json() as { sub?: string };
    personId = d.sub;
  }
  if (!personId) {
    const meRes = await fetch('https://api.linkedin.com/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!meRes.ok) throw new Error('LinkedIn 인증 실패 — Access Token을 확인해주세요 (만료 여부 확인 / w_member_social 스코프 필요)');
    const meData = await meRes.json() as { id?: string };
    personId = meData.id;
  }
  if (!personId) throw new Error('LinkedIn 프로필 ID 조회 실패 — openid 또는 r_liteprofile 스코프가 필요합니다');
  const personUrn = `urn:li:person:${personId}`;

  const tags = keyword ? `#${keyword.split(' ')[0].replace(/[^a-zA-Z0-9가-힣]/g, '')}` : '';
  const commentary = `${title}\n\n${meta_description || ''}\n\n${tags}`.trim();

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: personUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: commentary },
          shareMediaCategory: 'ARTICLE',
          media: [{
            status: 'READY',
            description: { text: (meta_description || '').slice(0, 256) },
            originalUrl: canonical_url,
            title: { text: title.slice(0, 200) },
          }],
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`LinkedIn 오류 (${res.status}): ${data.message || JSON.stringify(data)}`);

  const postId = res.headers.get('X-RestLi-Id') || data.id;
  const url = postId ? `https://www.linkedin.com/feed/update/${postId}` : undefined;
  return { url };
}
