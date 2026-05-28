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

/** Instagram 컨테이너 처리 완료 대기 */
async function waitInstagramVideoReady(containerId: string, accessToken: string, maxWaitMs = 90000): Promise<void> {
  const start = Date.now();
  // 첫 폴링 전 2초 대기
  await new Promise(r => setTimeout(r, 2000));
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`https://graph.instagram.com/v21.0/${containerId}?fields=status_code,status&access_token=${accessToken}`);
      const data = await res.json();
      const code = data.status_code ?? data.status;
      if (code === 'FINISHED') return;
      if (code === 'ERROR') throw new Error('Instagram 컨테이너 처리 실패: ' + JSON.stringify(data));
    } catch (e) { if ((e as Error).message?.includes('처리 실패')) throw e; }
    await new Promise(r => setTimeout(r, 3000));
  }
  // 이미지 컨테이너는 타임아웃해도 대부분 게시 가능 — throw 대신 그냥 반환
}

/**
 * Threads 게시물이 API에서 실제로 조회 가능할 때까지 폴링 (최대 60초)
 * 게시 직후엔 인덱싱 지연이 있어 reply_to_id 오류가 발생할 수 있음
 */
export async function waitThreadsPostAccessible(postId: string, accessToken: string): Promise<void> {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 4000));
    try {
      const res = await fetch(
        `https://graph.threads.net/v1.0/${postId}?fields=id&access_token=${accessToken}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (res.ok) {
        const data = await res.json();
        if (data.id === postId) return;
      }
    } catch { /* 계속 폴링 */ }
  }
  // 타임아웃 후에도 5초 추가 대기
  await new Promise(r => setTimeout(r, 5000));
}

/** Threads child 컨테이너가 FINISHED 될 때까지 폴링 (최대 30초) */
async function waitThreadsContainerFinished(containerId: string, accessToken: string): Promise<boolean> {
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const res = await fetch(
        `https://graph.threads.net/v1.0/${containerId}?fields=status,error_message&access_token=${accessToken}`
      );
      if (!res.ok) return false;
      const data = await res.json();
      if (data.status === 'FINISHED') return true;
      if (data.status === 'ERROR') return false;
    } catch {
      return false;
    }
  }
  return false;
}

// ── Twitter 미디어 업로드 (영상: INIT→APPEND→FINALIZE 청크, 이미지: simple) ──

export async function uploadMediaToTwitter(accessToken: string, mediaUrl: string): Promise<string> {
  const { buffer, contentType } = await downloadMedia(mediaUrl);
  const isVideo = contentType.startsWith('video/') || isVideoUrl(mediaUrl);

  if (!isVideo) {
    // 이미지: simple base64 업로드
    const form = new URLSearchParams();
    form.append('media_data', buffer.toString('base64'));
    const res = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!res.ok) throw new Error(`Twitter 이미지 업로드 실패: ${await res.text()}`);
    return (await res.json()).media_id_string;
  }

  // 영상: INIT → APPEND → FINALIZE 청크 업로드
  const totalBytes = buffer.length;
  const mediaType = contentType || 'video/mp4';

  // INIT
  const initRes = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      command: 'INIT', total_bytes: String(totalBytes),
      media_type: mediaType, media_category: 'tweet_video',
    }).toString(),
  });
  if (!initRes.ok) throw new Error(`Twitter 영상 INIT 실패: ${await initRes.text()}`);
  const { media_id_string: mediaId } = await initRes.json();

  // APPEND (5MB 청크)
  const CHUNK = 5 * 1024 * 1024;
  for (let seg = 0; seg * CHUNK < totalBytes; seg++) {
    const chunk = buffer.slice(seg * CHUNK, (seg + 1) * CHUNK);
    const form = new FormData();
    form.append('command', 'APPEND');
    form.append('media_id', mediaId);
    form.append('segment_index', String(seg));
    form.append('media', new Blob([chunk], { type: mediaType }));
    const appendRes = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    if (!appendRes.ok) throw new Error(`Twitter 영상 APPEND 실패: ${await appendRes.text()}`);
  }

  // FINALIZE
  const finalRes = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ command: 'FINALIZE', media_id: mediaId }).toString(),
  });
  if (!finalRes.ok) throw new Error(`Twitter 영상 FINALIZE 실패: ${await finalRes.text()}`);

  // 처리 완료 대기
  let processing = (await finalRes.json()).processing_info;
  while (processing?.state === 'pending' || processing?.state === 'in_progress') {
    await new Promise(r => setTimeout(r, (processing.check_after_secs || 3) * 1000));
    const statusRes = await fetch(
      `https://upload.twitter.com/1.1/media/upload.json?command=STATUS&media_id=${mediaId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    processing = (await statusRes.json()).processing_info;
  }
  if (processing?.state === 'failed') throw new Error('Twitter 영상 처리 실패');

  return mediaId;
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

// R2 URL → litterbox.catbox.moe에 임시 업로드 (72h) 후 URL 반환
// Meta 서버가 loov.co.kr(한국 ISP IP)에 접근 불가 → 신뢰된 글로벌 CDN 경유
async function toMetaSafeUrl(url: string): Promise<string> {
  if (!url) return url;
  const isR2 = url.includes('r2.dev') || url.includes('r2.cloudflarestorage.com');
  if (!isR2) return url;

  try {
    // R2에서 이미지 다운로드
    const imgRes = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!imgRes.ok) return url;

    const buffer = await imgRes.arrayBuffer();
    const blob = new Blob([buffer], { type: imgRes.headers.get('content-type') || 'image/jpeg' });
    const filename = url.split('/').pop() || 'image.jpg';

    // litterbox.catbox.moe에 업로드 (72h 임시 호스팅)
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('time', '72h');
    form.append('fileToUpload', blob, filename);

    const uploadRes = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30000),
    });

    if (!uploadRes.ok) return url;
    const cdnUrl = (await uploadRes.text()).trim();
    if (cdnUrl.startsWith('https://')) return cdnUrl;
    return url;
  } catch {
    return url; // 실패 시 원본 URL 반환
  }
}

export async function postToThreadsWithMedia(
  accessToken: string,
  userId: string,
  content: string,
  mediaUrls?: string[],
): Promise<{ id: string }> {
  // R2 URL → litterbox CDN 업로드 (Meta 서버가 loov.co.kr에 접근 불가 문제 해결)
  if (mediaUrls) mediaUrls = await Promise.all(mediaUrls.map(toMetaSafeUrl));

  let containerBody: Record<string, unknown>;

  let needsWait = false;

  if (mediaUrls?.length === 1) {
    const isVideo = isVideoUrl(mediaUrls[0]);
    containerBody = {
      media_type: isVideo ? 'VIDEO' : 'IMAGE',
      [isVideo ? 'video_url' : 'image_url']: mediaUrls[0],
      text: content.substring(0, 500),
      access_token: accessToken,
    };
    // 영상은 반드시 처리 완료 대기 필요
    needsWait = isVideo;
  } else if (mediaUrls && mediaUrls.length > 1) {
    const childIds: string[] = [];
    for (const url of mediaUrls.slice(0, 10)) {
      const isVideo = isVideoUrl(url);
      const cr = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: isVideo ? 'VIDEO' : 'IMAGE',
          [isVideo ? 'video_url' : 'image_url']: url,
          is_carousel_item: true,
          access_token: accessToken,
        }),
      });
      if (!cr.ok) continue;
      const { id: childId } = await cr.json();
      const ready = await waitThreadsContainerFinished(childId, accessToken);
      if (ready) childIds.push(childId);
    }
    if (childIds.length === 0) {
      containerBody = { media_type: 'TEXT', text: content.substring(0, 500), access_token: accessToken };
    } else if (childIds.length === 1) {
      const isVideo = isVideoUrl(mediaUrls[0]);
      containerBody = {
        media_type: isVideo ? 'VIDEO' : 'IMAGE',
        [isVideo ? 'video_url' : 'image_url']: mediaUrls[0],
        text: content.substring(0, 500),
        access_token: accessToken,
      };
      needsWait = isVideo;
    } else {
      containerBody = { media_type: 'CAROUSEL', children: childIds.join(','), text: content.substring(0, 500), access_token: accessToken };
    }
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

  // 영상은 Threads 서버가 처리 완료할 때까지 대기 (필수)
  if (needsWait) {
    const ready = await waitThreadsContainerFinished(containerId, accessToken);
    if (!ready) throw new Error('Threads 영상 처리 타임아웃 (30초 초과) — 잠시 후 재시도하세요');
  }

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
  linkUrl?: string,
): Promise<{ id: string }> {
  const pagesRes = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`);
  if (!pagesRes.ok) throw new Error('Facebook 페이지 목록 조회 실패');
  const { data: pages } = await pagesRes.json();
  const pageToken = pages?.[0]?.access_token || accessToken;
  const pageId = pages?.[0]?.id || 'me';

  if (mediaUrls?.length === 1) {
    const url = mediaUrls[0];
    if (isVideoUrl(url)) {
      // 영상: /videos 엔드포인트 (file_url로 직접 전달)
      const res = await fetch(`https://graph.facebook.com/v18.0/${pageId}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_url: url, description: content, access_token: pageToken, published: true }),
      });
      if (!res.ok) throw new Error(`Facebook 영상 포스팅 실패: ${await res.text()}`);
      return { id: (await res.json()).id };
    } else {
      // 이미지: /photos 엔드포인트
      const res = await fetch(`https://graph.facebook.com/v18.0/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, message: content, access_token: pageToken, published: true }),
      });
      if (!res.ok) throw new Error(`Facebook 사진 포스팅 실패: ${await res.text()}`);
      return { id: (await res.json()).id };
    }
  } else if (mediaUrls && mediaUrls.length > 1) {
    // 영상이 포함되어 있으면 첫 번째 영상만 단독 포스팅
    const videoUrl = mediaUrls.find(u => isVideoUrl(u));
    if (videoUrl) {
      const res = await fetch(`https://graph.facebook.com/v18.0/${pageId}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_url: videoUrl, description: content, access_token: pageToken, published: true }),
      });
      if (!res.ok) throw new Error(`Facebook 영상 포스팅 실패: ${await res.text()}`);
      return { id: (await res.json()).id };
    }
    // 이미지만: 멀티 사진 포스팅
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
    // 텍스트 전용 (링크 있으면 link 파라미터로 미리보기 카드 생성)
    const body: Record<string, unknown> = { message: content, access_token: pageToken };
    if (linkUrl) body.link = linkUrl;
    const res = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Facebook 포스팅 실패: ${await res.text()}`);
    return { id: (await res.json()).id };
  }
}

function parseInstagramError(body: string): string {
  try {
    const j = JSON.parse(body);
    const e = j.error || j;
    const code = e.code;
    const sub = e.error_subcode;
    const userMsg = e.error_user_msg || e.error_user_title;
    if (code === 9 && sub === 2207069) return `[INSTAGRAM_DAILY_LIMIT] 하루 게시물 한도 초과 (25개/일). 내일 다시 시도하세요.`;
    if (code === 9) return `[INSTAGRAM_LIMIT] 게시 한도 초과. ${userMsg || '잠시 후 다시 시도하세요.'}`;
    if (code === 190) return `[INSTAGRAM_TOKEN] 액세스 토큰 만료. SNS 연결 페이지에서 재연결하세요.`;
    if (code === 10 || code === 200) return `[INSTAGRAM_PERMISSION] 권한 부족. 앱 권한을 확인하세요.`;
    return userMsg || e.message || body;
  } catch { return body; }
}

export async function postToInstagramWithMedia(
  accessToken: string,
  content: string,
  mediaUrls?: string[],
): Promise<{ id: string }> {
  if (!mediaUrls?.length) throw new Error('Instagram은 이미지 또는 영상이 필요합니다.');

  // R2 URL → litterbox CDN 업로드 (Meta 서버가 loov.co.kr에 접근 불가 문제 해결)
  mediaUrls = await Promise.all(mediaUrls.map(toMetaSafeUrl));

  // Standalone Instagram API (graph.instagram.com/v21.0)
  // 연결 토큰은 api.instagram.com/oauth/authorize를 통해 발급된 standalone 토큰
  const meRes = await fetch(`https://graph.instagram.com/v21.0/me?fields=id&access_token=${accessToken}`);
  if (!meRes.ok) throw new Error(`Instagram 사용자 조회 실패: ${await meRes.text()}`);
  const { id: igUserId } = await meRes.json();
  if (!igUserId) throw new Error('Instagram 사용자 ID를 가져올 수 없습니다');

  if (mediaUrls.length === 1) {
    const isVideo = isVideoUrl(mediaUrls[0]);
    const body: Record<string, unknown> = {
      caption: content.substring(0, 2200),
      access_token: accessToken,
    };
    if (isVideo) {
      body.media_type = 'REELS';
      body.video_url = mediaUrls[0];
      body.share_to_feed = true;
    } else {
      body.media_type = 'IMAGE';
      body.image_url = mediaUrls[0];
    }

    const containerRes = await fetch(`https://graph.instagram.com/v21.0/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!containerRes.ok) throw new Error(parseInstagramError(await containerRes.text()));
    const { id: containerId } = await containerRes.json();

    // 영상은 처리 완료까지 대기
    if (isVideo) await waitInstagramVideoReady(containerId, accessToken);

    const pubRes = await fetch(`https://graph.instagram.com/v21.0/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
    });
    if (!pubRes.ok) throw new Error(parseInstagramError(await pubRes.text()));
    return { id: (await pubRes.json()).id };

  } else {
    // 캐러셀: child 컨테이너 생성 후 각각 FINISHED 대기
    const childIds: string[] = [];
    for (const url of mediaUrls.slice(0, 10)) {
      const cr = await fetch(`https://graph.instagram.com/v21.0/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_type: 'IMAGE', image_url: url, is_carousel_item: true, access_token: accessToken }),
      });
      if (!cr.ok) {
        console.warn('Instagram child container 생성 실패:', await cr.text());
        continue;
      }
      const { id: childId } = await cr.json();
      // 각 child 컨테이너가 FINISHED 될 때까지 대기 (최대 30초)
      await waitInstagramVideoReady(childId, accessToken, 30000).catch(() => { /* 이미지는 빠르게 완료되므로 타임아웃 무시 */ });
      childIds.push(childId);
    }
    if (!childIds.length) throw new Error('Instagram 캐러셀: 이미지 컨테이너 생성 실패');

    // 캐러셀 컨테이너 생성
    const carRes = await fetch(`https://graph.instagram.com/v21.0/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_type: 'CAROUSEL', children: childIds.join(','), caption: content.substring(0, 2200), access_token: accessToken }),
    });
    if (!carRes.ok) throw new Error(parseInstagramError(await carRes.text()));
    const { id: carouselId } = await carRes.json();

    // 캐러셀 컨테이너도 FINISHED 대기 (최대 60초)
    await waitInstagramVideoReady(carouselId, accessToken, 60000);

    // 게시
    const pubRes = await fetch(`https://graph.instagram.com/v21.0/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: carouselId, access_token: accessToken }),
    });
    if (!pubRes.ok) throw new Error(parseInstagramError(await pubRes.text()));
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
    case 'instagram':
      if (!mediaUrls?.length) throw new Error('Instagram 건너뜀: 이미지가 없습니다 (Instagram은 이미지 필수)');
      return postToInstagramWithMedia(accessToken, content, mediaUrls);
    case 'linkedin':  return postToLinkedInWithMedia(accessToken, platformUserId, content, mediaUrls);
  }
}

// ── 자기 게시물에 댓글/스레드 형식 추가 ──────────────────

export async function postCommentOnOwnPost(
  platform: Platform,
  accessToken: string,
  platformUserId: string,
  postId: string,
  content: string,
  mediaUrls?: string[],
): Promise<{ id: string }> {
  switch (platform) {
    case 'twitter':
      // 트위터: 이전 트윗에 답글 (체인 스레드)
      return replyToTwitterComment(accessToken, postId, content, mediaUrls);

    case 'threads': {
      // 스레드: reply_to_id로 답글 (이미지 있으면 함께 첨부)
      let containerBody: Record<string, unknown>;
      if (mediaUrls && mediaUrls.length > 1) {
        // 다중 이미지: 캐러셀 댓글
        const childIds: string[] = [];
        for (const url of mediaUrls.slice(0, 10)) {
          const cr = await fetch(`https://graph.threads.net/v1.0/${platformUserId}/threads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ media_type: 'IMAGE', image_url: url, is_carousel_item: true, access_token: accessToken }),
          });
          if (!cr.ok) continue;
          const { id: childId } = await cr.json();
          const ready = await waitThreadsContainerFinished(childId, accessToken);
          if (ready) childIds.push(childId);
        }
        containerBody = childIds.length > 1
          ? { media_type: 'CAROUSEL', children: childIds.join(','), text: content.substring(0, 500), reply_to_id: postId, access_token: accessToken }
          : { media_type: 'TEXT', text: content.substring(0, 500), reply_to_id: postId, access_token: accessToken };
      } else if (mediaUrls?.length === 1) {
        const isVideo = isVideoUrl(mediaUrls[0]);
        containerBody = {
          media_type: isVideo ? 'VIDEO' : 'IMAGE',
          [isVideo ? 'video_url' : 'image_url']: mediaUrls[0],
          text: content.substring(0, 500),
          reply_to_id: postId,
          access_token: accessToken,
        };
      } else {
        containerBody = { media_type: 'TEXT', text: content.substring(0, 500), reply_to_id: postId, access_token: accessToken };
      }
      const cr = await fetch(`https://graph.threads.net/v1.0/${platformUserId}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(containerBody),
      });
      if (!cr.ok) throw new Error(`Threads 댓글 생성 실패: ${await cr.text()}`);
      const { id: containerId } = await cr.json();
      // 미디어 포함 컨테이너는 처리 완료 대기 필요
      const needsContainerWait = containerBody.media_type !== 'TEXT';
      if (needsContainerWait) await waitThreadsContainerFinished(containerId, accessToken);
      const pr = await fetch(`https://graph.threads.net/v1.0/${platformUserId}/threads_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
      });
      if (!pr.ok) throw new Error(`Threads 댓글 게시 실패: ${await pr.text()}`);
      return { id: (await pr.json()).id };
    }

    case 'facebook':
      return replyToFacebookComment(accessToken, postId, content);

    case 'instagram': {
      // Standalone Instagram API로 댓글 (graph.instagram.com, message 필드)
      const res = await fetch(`https://graph.instagram.com/v21.0/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content.substring(0, 2200), access_token: accessToken }),
      });
      if (!res.ok) throw new Error(parseInstagramError(await res.text()));
      return { id: (await res.json()).id };
    }

    case 'linkedin': {
      // LinkedIn: socialActions API로 댓글
      const res = await fetch(`https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postId)}/comments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          actor: `urn:li:person:${platformUserId}`,
          message: { text: content.substring(0, 1250) },
        }),
      });
      if (!res.ok) throw new Error(`LinkedIn 댓글 실패: ${await res.text()}`);
      const id = res.headers.get('x-restli-id') || (await res.json()).id || 'unknown';
      return { id };
    }
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
