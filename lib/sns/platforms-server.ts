/**
 * SNS 플랫폼 서버 전용 함수 (미디어 업로드 · 게시 · 댓글)
 * API Route 에서만 import 해야 함 (Buffer 사용)
 */
import type { Platform } from './platforms';

// ── 공통 유틸 ─────────────────────────────────────────

async function downloadMedia(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('미디어 다운로드 실패');
  const ab = await res.arrayBuffer();
  return { buffer: Buffer.from(ab), contentType: res.headers.get('content-type') || 'image/jpeg' };
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|avi|webm)(\?|$)/i.test(url);
}

// ── Twitter 미디어 업로드 (v1.1 simple upload) ────────

export async function uploadMediaToTwitter(accessToken: string, mediaUrl: string): Promise<string> {
  const { buffer } = await downloadMedia(mediaUrl);
  const form = new URLSearchParams();
  form.append('media_data', buffer.toString('base64'));

  const res = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  if (!res.ok) throw new Error(`Twitter 미디어 업로드 실패: ${await res.text()}`);
  return (await res.json()).media_id_string;
}

// ── LinkedIn 미디어 업로드 ─────────────────────────────

export async function uploadMediaToLinkedIn(
  accessToken: string,
  platformUserId: string,
  mediaUrl: string,
): Promise<string> {
  const { buffer, contentType } = await downloadMedia(mediaUrl);

  const regRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: `urn:li:person:${platformUserId}`,
        serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
      },
    }),
  });
  if (!regRes.ok) throw new Error(`LinkedIn 미디어 등록 실패: ${await regRes.text()}`);
  const { value } = await regRes.json();
  const uploadUrl =
    value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  const assetUrn = value.asset;

  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': contentType },
    body: new Uint8Array(buffer),
  });
  return assetUrn;
}

// ── 플랫폼별 게시 (미디어 포함) ───────────────────────

export async function postToTwitterWithMedia(
  accessToken: string,
  content: string,
  mediaUrls?: string[],
): Promise<{ id: string }> {
  const body: Record<string, unknown> = { text: content.substring(0, 280) };

  if (mediaUrls?.length) {
    const mediaIds: string[] = [];
    for (const url of mediaUrls.slice(0, 4)) {
      try {
        mediaIds.push(await uploadMediaToTwitter(accessToken, url));
      } catch (e) {
        console.warn('Twitter 미디어 업로드 건너뜀:', e);
      }
    }
    if (mediaIds.length) body.media = { media_ids: mediaIds };
  }

  const res = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Twitter 포스팅 실패: ${await res.text()}`);
  return { id: (await res.json()).data.id };
}

export async function postToThreadsWithMedia(
  accessToken: string,
  userId: string,
  content: string,
  mediaUrls?: string[],
): Promise<{ id: string }> {
  let containerBody: Record<string, unknown>;

  if (mediaUrls?.length === 1) {
    const isVideo = isVideoUrl(mediaUrls[0]);
    containerBody = {
      media_type: isVideo ? 'VIDEO' : 'IMAGE',
      [isVideo ? 'video_url' : 'image_url']: mediaUrls[0],
      text: content.substring(0, 500),
      access_token: accessToken,
    };
  } else if (mediaUrls && mediaUrls.length > 1) {
    const childIds: string[] = [];
    for (const url of mediaUrls.slice(0, 10)) {
      const cr = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_type: 'IMAGE', image_url: url, is_carousel_item: true, access_token: accessToken }),
      });
      if (cr.ok) childIds.push((await cr.json()).id);
    }
    containerBody = { media_type: 'CAROUSEL', children: childIds.join(','), text: content.substring(0, 500), access_token: accessToken };
  } else {
    containerBody = { media_type: 'TEXT', text: content.substring(0, 500), access_token: accessToken };
  }

  const createRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(containerBody),
  });
  if (!createRes.ok) throw new Error(`Threads 컨테이너 생성 실패: ${await createRes.text()}`);
  const { id: containerId } = await createRes.json();

  const publishRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
  });
  if (!publishRes.ok) throw new Error(`Threads 게시 실패: ${await publishRes.text()}`);
  return { id: (await publishRes.json()).id };
}

export async function postToFacebookWithMedia(
  accessToken: string,
  content: string,
  mediaUrls?: string[],
): Promise<{ id: string }> {
  const pagesRes = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`);
  if (!pagesRes.ok) throw new Error('Facebook 페이지 목록 조회 실패');
  const { data: pages } = await pagesRes.json();
  const pageToken = pages?.[0]?.access_token || accessToken;
  const pageId = pages?.[0]?.id || 'me';

  if (mediaUrls?.length === 1) {
    const res = await fetch(`https://graph.facebook.com/v18.0/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: mediaUrls[0], message: content, access_token: pageToken, published: true }),
    });
    if (!res.ok) throw new Error(`Facebook 사진 포스팅 실패: ${await res.text()}`);
    return { id: (await res.json()).id };
  } else if (mediaUrls && mediaUrls.length > 1) {
    const photoIds: string[] = [];
    for (const url of mediaUrls.slice(0, 10)) {
      const pr = await fetch(`https://graph.facebook.com/v18.0/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, access_token: pageToken, published: false }),
      });
      if (pr.ok) photoIds.push((await pr.json()).id);
    }
    const res = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: content,
        attached_media: photoIds.map((id) => ({ media_fbid: id })),
        access_token: pageToken,
      }),
    });
    if (!res.ok) throw new Error(`Facebook 멀티 사진 포스팅 실패: ${await res.text()}`);
    return { id: (await res.json()).id };
  } else {
    const res = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: content, access_token: pageToken }),
    });
    if (!res.ok) throw new Error(`Facebook 포스팅 실패: ${await res.text()}`);
    return { id: (await res.json()).id };
  }
}

export async function postToInstagramWithMedia(
  accessToken: string,
  content: string,
  mediaUrls?: string[],
): Promise<{ id: string }> {
  if (!mediaUrls?.length) throw new Error('Instagram은 이미지가 필요합니다.');

  // Instagram Business 계정 ID 조회
  const igAccRes = await fetch(
    `https://graph.facebook.com/v18.0/me?fields=instagram_business_account&access_token=${accessToken}`,
  );
  if (!igAccRes.ok) throw new Error('Instagram 계정 조회 실패');
  const igAccData = await igAccRes.json();
  const igUserId = igAccData.instagram_business_account?.id;
  if (!igUserId) throw new Error('Instagram Business 계정이 없습니다');

  if (mediaUrls.length === 1) {
    const isVideo = isVideoUrl(mediaUrls[0]);
    const containerRes = await fetch(`https://graph.facebook.com/v18.0/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_type: isVideo ? 'REELS' : 'IMAGE',
        [isVideo ? 'video_url' : 'image_url']: mediaUrls[0],
        caption: content.substring(0, 2200),
        access_token: accessToken,
      }),
    });
    if (!containerRes.ok) throw new Error(`Instagram 미디어 컨테이너 생성 실패: ${await containerRes.text()}`);
    const { id: containerId } = await containerRes.json();

    const pubRes = await fetch(`https://graph.facebook.com/v18.0/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
    });
    if (!pubRes.ok) throw new Error(`Instagram 게시 실패: ${await pubRes.text()}`);
    return { id: (await pubRes.json()).id };
  } else {
    const childIds: string[] = [];
    for (const url of mediaUrls.slice(0, 10)) {
      const cr = await fetch(`https://graph.facebook.com/v18.0/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_type: 'IMAGE', image_url: url, is_carousel_item: true, access_token: accessToken }),
      });
      if (cr.ok) childIds.push((await cr.json()).id);
    }
    const carRes = await fetch(`https://graph.facebook.com/v18.0/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_type: 'CAROUSEL', children: childIds.join(','), caption: content.substring(0, 2200), access_token: accessToken }),
    });
    if (!carRes.ok) throw new Error(`Instagram 캐러셀 생성 실패: ${await carRes.text()}`);
    const { id: carouselId } = await carRes.json();

    const pubRes = await fetch(`https://graph.facebook.com/v18.0/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: carouselId, access_token: accessToken }),
    });
    if (!pubRes.ok) throw new Error(`Instagram 캐러셀 게시 실패: ${await pubRes.text()}`);
    return { id: (await pubRes.json()).id };
  }
}

export async function postToLinkedInWithMedia(
  accessToken: string,
  platformUserId: string,
  content: string,
  mediaUrls?: string[],
): Promise<{ id: string }> {
  const body: Record<string, unknown> = {
    author: `urn:li:person:${platformUserId}`,
    lifecycleState: 'PUBLISHED',
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  if (mediaUrls?.length) {
    const assetUrn = await uploadMediaToLinkedIn(accessToken, platformUserId, mediaUrls[0]);
    body.specificContent = {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: content.substring(0, 3000) },
        shareMediaCategory: 'IMAGE',
        media: [{ status: 'READY', media: assetUrn }],
      },
    };
  } else {
    body.specificContent = {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: content.substring(0, 3000) },
        shareMediaCategory: 'NONE',
      },
    };
  }

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LinkedIn 포스팅 실패: ${await res.text()}`);
  const id = res.headers.get('x-restli-id') || (await res.json()).id || 'unknown';
  return { id };
}

export async function postToPlatformWithMedia(
  platform: Platform,
  accessToken: string,
  platformUserId: string,
  content: string,
  mediaUrls?: string[],
): Promise<{ id: string }> {
  switch (platform) {
    case 'twitter':   return postToTwitterWithMedia(accessToken, content, mediaUrls);
    case 'threads':   return postToThreadsWithMedia(accessToken, platformUserId, content, mediaUrls);
    case 'facebook':  return postToFacebookWithMedia(accessToken, content, mediaUrls);
    case 'instagram': return postToInstagramWithMedia(accessToken, content, mediaUrls);
    case 'linkedin':  return postToLinkedInWithMedia(accessToken, platformUserId, content, mediaUrls);
  }
}

// ── 댓글 조회 ─────────────────────────────────────────

export interface PlatformComment {
  id: string;
  authorName: string;
  authorHandle: string;
  authorAvatar?: string;
  content: string;
  createdAt: string;
  mediaUrls?: string[];
}

export async function fetchCommentsFromTwitter(
  accessToken: string,
  tweetId: string,
): Promise<PlatformComment[]> {
  const res = await fetch(
    `https://api.twitter.com/2/tweets/search/recent?query=conversation_id:${tweetId}&tweet.fields=author_id,created_at,text&user.fields=name,username,profile_image_url&expansions=author_id&max_results=20`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return [];
  const data = await res.json();
  const usersMap = new Map((data.includes?.users || []).map((u: Record<string, string>) => [u.id, u]));
  return (data.data || []).map((tweet: Record<string, string>) => {
    const user = (usersMap.get(tweet.author_id) || {}) as Record<string, string>;
    return {
      id: tweet.id,
      authorName: user.name || 'Unknown',
      authorHandle: user.username || '',
      authorAvatar: user.profile_image_url,
      content: tweet.text,
      createdAt: tweet.created_at,
    };
  });
}

export async function fetchCommentsFromFacebook(
  accessToken: string,
  postId: string,
): Promise<PlatformComment[]> {
  const res = await fetch(
    `https://graph.facebook.com/v18.0/${postId}/comments?fields=id,from,message,created_time,attachments&access_token=${accessToken}`,
  );
  if (!res.ok) return [];
  const { data } = await res.json();
  return (data || []).map((c: Record<string, unknown>) => ({
    id: c.id as string,
    authorName: (c.from as Record<string, string>)?.name || 'Unknown',
    authorHandle: (c.from as Record<string, string>)?.id || '',
    content: (c.message as string) || '',
    createdAt: c.created_time as string,
    mediaUrls: ((c.attachments as Record<string, unknown>)?.data as Record<string, unknown>[] | undefined)
      ?.map((a) => ((a.media as Record<string, unknown>)?.image as Record<string, string>)?.src)
      .filter(Boolean) as string[],
  }));
}

export async function fetchCommentsFromInstagram(
  accessToken: string,
  mediaId: string,
): Promise<PlatformComment[]> {
  const res = await fetch(
    `https://graph.facebook.com/v18.0/${mediaId}/comments?fields=id,username,text,timestamp&access_token=${accessToken}`,
  );
  if (!res.ok) return [];
  const { data } = await res.json();
  return (data || []).map((c: Record<string, string>) => ({
    id: c.id,
    authorName: c.username || 'Unknown',
    authorHandle: c.username || '',
    content: c.text || '',
    createdAt: c.timestamp,
  }));
}

// ── 댓글 답글 ─────────────────────────────────────────

export async function replyToTwitterComment(
  accessToken: string,
  tweetId: string,
  content: string,
  mediaUrls?: string[],
): Promise<{ id: string }> {
  const body: Record<string, unknown> = {
    text: content.substring(0, 280),
    reply: { in_reply_to_tweet_id: tweetId },
  };
  if (mediaUrls?.length) {
    const mediaIds: string[] = [];
    for (const url of mediaUrls.slice(0, 4)) {
      try { mediaIds.push(await uploadMediaToTwitter(accessToken, url)); } catch { /* skip */ }
    }
    if (mediaIds.length) body.media = { media_ids: mediaIds };
  }
  const res = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Twitter 댓글 달기 실패: ${await res.text()}`);
  return { id: (await res.json()).data.id };
}

export async function replyToFacebookComment(
  accessToken: string,
  commentId: string,
  content: string,
): Promise<{ id: string }> {
  const res = await fetch(`https://graph.facebook.com/v18.0/${commentId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: content, access_token: accessToken }),
  });
  if (!res.ok) throw new Error(`Facebook 답글 실패: ${await res.text()}`);
  return { id: (await res.json()).id };
}

export async function replyToInstagramComment(
  accessToken: string,
  mediaId: string,
  commentId: string,
  content: string,
): Promise<{ id: string }> {
  const res = await fetch(`https://graph.facebook.com/v18.0/${mediaId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: content, comment_id: commentId, access_token: accessToken }),
  });
  if (!res.ok) throw new Error(`Instagram 답글 실패: ${await res.text()}`);
  return { id: (await res.json()).id };
}
