/**
 * Pinterest 발행 공용 로직. app/api/backlink/pinterest(세션 사용자용 HTTP 엔드포인트)와
 * lib/rewrite-publish.ts(자동화 파이프라인)가 공유한다. tumblr-publish.ts와 동일한 패턴.
 */
import { getSetting } from '@/lib/get-setting';

export interface PinterestPublishParams {
  title: string;
  meta_description?: string;
  canonical_url: string;
  representative_image_url?: string | null;
}

export async function publishToPinterest(params: PinterestPublishParams): Promise<{ url?: string }> {
  const { title, meta_description, canonical_url, representative_image_url } = params;
  if (!title || !canonical_url) throw new Error('title, canonical_url 필요');
  if (!representative_image_url) throw new Error('Pinterest 핀 생성에 대표 이미지가 필요합니다');

  const [accessToken, boardId] = await Promise.all([
    getSetting('PINTEREST_ACCESS_TOKEN'),
    getSetting('PINTEREST_BOARD_ID'),
  ]);

  if (!accessToken || !boardId) {
    const missing = [!accessToken && 'Access Token', !boardId && 'Board ID'].filter(Boolean).join(', ');
    throw new Error(`Pinterest 설정 누락: ${missing}`);
  }

  const res = await fetch('https://api.pinterest.com/v5/pins', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      board_id: boardId,
      title: title.slice(0, 100),
      description: (meta_description || '').slice(0, 800),
      link: canonical_url,
      media_source: { source_type: 'image_url', url: representative_image_url },
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Pinterest 오류 (${res.status}): ${data.message || JSON.stringify(data)}`);
  }

  const pinId = data.id;
  const url = pinId ? `https://www.pinterest.com/pin/${pinId}/` : undefined;
  return { url };
}
