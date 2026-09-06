import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

/**
 * GET /api/rewrite/square-image?src=<원본 이미지 URL>
 * 인스타그램 발행용 — 원본 사진을 그대로 1080x1080 정사각형으로 센터크롭해서 반환.
 * (인스타그램 API는 종횡비가 0.8~1.91 범위를 벗어난 이미지를 거부함)
 */
export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get('src');
  if (!src) return new Response('src 필요', { status: 400 });

  return new ImageResponse(
    (
      <div style={{ width: 1080, height: 1080, display: 'flex' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={1080} height={1080} style={{ objectFit: 'cover', width: '100%', height: '100%' }} alt="" />
      </div>
    ),
    { width: 1080, height: 1080 },
  );
}
