import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 30;

const GRAD: Record<string, [string, string]> = {
  blue:  ['#0d2447', '#1a3a6b'],
  dark:  ['#1a1a1a', '#2d2d2d'],
  green: ['#0a2010', '#1a4a20'],
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title   = searchParams.get('title')   || '';
  const keyword = searchParams.get('keyword') || '';
  const color   = (searchParams.get('color')  || 'blue') as 'blue' | 'dark' | 'green';
  const bgUrl   = searchParams.get('bg')      || '';

  // Noto Sans KR Bold 폰트 로드 (Google Fonts CDN)
  const fontUrl = 'https://fonts.gstatic.com/s/notosanskr/v36/PbykFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzuoyeLTq8H4hfeE.woff2';
  let fontData: ArrayBuffer | undefined;
  try {
    fontData = await fetch(fontUrl, { signal: AbortSignal.timeout(8000) }).then(r => r.ok ? r.arrayBuffer() : undefined);
  } catch { /* 폰트 없으면 폴백 */ }

  const [c1, c2] = GRAD[color] || GRAD.blue;

  return new ImageResponse(
    (
      <div
        style={{
          width: 1080,
          height: 1080,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: bgUrl ? 'transparent' : `linear-gradient(135deg, ${c1}, ${c2})`,
          position: 'relative',
          fontFamily: fontData ? 'NotoSansKR' : 'sans-serif',
        }}
      >
        {/* 배경 이미지 */}
        {bgUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bgUrl}
            alt=""
            style={{ position: 'absolute', inset: 0, width: 1080, height: 1080, objectFit: 'cover' }}
          />
        )}
        {/* 어두운 오버레이 */}
        <div style={{
          position: 'absolute', inset: 0,
          background: bgUrl ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.2)',
          display: 'flex',
        }} />
        {/* 상단 골드 바 */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 14, background: '#f0b429', display: 'flex' }} />
        {/* 하단 골드 바 */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 14, background: '#f0b429', display: 'flex' }} />

        {/* 제목 */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 80px',
          textAlign: 'center',
          zIndex: 10,
        }}>
          <div style={{
            fontSize: title.length <= 10 ? 110 : title.length <= 18 ? 90 : title.length <= 26 ? 76 : 64,
            fontWeight: 700,
            color: 'white',
            lineHeight: 1.35,
            textShadow: '0 4px 24px rgba(0,0,0,0.95)',
            wordBreak: 'keep-all',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}>
            {title}
          </div>
          {keyword && (
            <div style={{
              marginTop: 40,
              background: 'rgba(240,180,41,0.9)',
              borderRadius: 32,
              padding: '12px 36px',
              fontSize: 32,
              fontWeight: 700,
              color: '#1a1a1a',
              display: 'flex',
            }}>
              {keyword}
            </div>
          )}
        </div>

        {/* 워터마크 */}
        <div style={{
          position: 'absolute',
          bottom: 30,
          color: 'rgba(255,255,255,0.4)',
          fontSize: 22,
          display: 'flex',
        }}>
          loov.co.kr
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
      fonts: fontData ? [{ name: 'NotoSansKR', data: fontData, weight: 700, style: 'normal' }] : [],
    },
  );
}
