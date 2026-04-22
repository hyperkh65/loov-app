import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 30;

const THEMES: Record<string, {
  bg1: string; bg2: string; bg3: string;
  accent: string; accentDim: string;
  textColor: string;
}> = {
  blue: {
    bg1: '#020817', bg2: '#0a1628', bg3: '#0f2040',
    accent: '#3b82f6', accentDim: '#1d4ed840',
    textColor: '#e2e8f0',
  },
  dark: {
    bg1: '#09090b', bg2: '#18181b', bg3: '#27272a',
    accent: '#a78bfa', accentDim: '#7c3aed40',
    textColor: '#f4f4f5',
  },
  green: {
    bg1: '#020b07', bg2: '#042812', bg3: '#065525',
    accent: '#22c55e', accentDim: '#16a34a40',
    textColor: '#dcfce7',
  },
  red: {
    bg1: '#0f0203', bg2: '#280a0a', bg3: '#3f1010',
    accent: '#f87171', accentDim: '#dc262640',
    textColor: '#fee2e2',
  },
  orange: {
    bg1: '#0f0700', bg2: '#291500', bg3: '#422000',
    accent: '#fb923c', accentDim: '#ea580c40',
    textColor: '#ffedd5',
  },
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title   = searchParams.get('title')   || '';
  const keyword = searchParams.get('keyword') || '';
  const color   = searchParams.get('color') || 'blue';
  const bgUrl   = searchParams.get('bg') || '';

  const theme = THEMES[color] || THEMES.blue;

  const fontUrl = 'https://fonts.gstatic.com/s/notosanskr/v36/PbykFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzuoyeLTq8H4hfeE.woff2';
  let fontData: ArrayBuffer | undefined;
  try {
    fontData = await fetch(fontUrl, { signal: AbortSignal.timeout(8000) }).then(r => r.ok ? r.arrayBuffer() : undefined);
  } catch { /* fallback */ }

  const titleLen = title.length;
  const fontSize = titleLen <= 10 ? 104 : titleLen <= 16 ? 88 : titleLen <= 24 ? 74 : titleLen <= 32 ? 64 : 54;

  return new ImageResponse(
    (
      <div
        style={{
          width: 1080,
          height: 1080,
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(160deg, ${theme.bg1} 0%, ${theme.bg2} 50%, ${theme.bg3} 100%)`,
          position: 'relative',
          overflow: 'hidden',
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
        {/* 이미지 오버레이: 더 진하게 */}
        {bgUrl && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(160deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.70) 100%)',
            display: 'flex',
          }} />
        )}

        {/* 우상단 글로우 오브 */}
        <div style={{
          position: 'absolute', top: -180, right: -180,
          width: 520, height: 520,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${theme.accent}28 0%, transparent 70%)`,
          display: 'flex',
        }} />

        {/* 좌하단 글로우 오브 */}
        <div style={{
          position: 'absolute', bottom: -120, left: -80,
          width: 360, height: 360,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${theme.accentDim} 0%, transparent 70%)`,
          display: 'flex',
        }} />

        {/* 좌측 세로 액센트 바 */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: 8,
          background: `linear-gradient(180deg, ${theme.accent} 0%, ${theme.accent}60 100%)`,
          display: 'flex',
        }} />

        {/* 상단 헤더 영역 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '52px 70px 0 76px',
        }}>
          {/* 키워드 뱃지 */}
          {keyword && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: `${theme.accent}22`,
              border: `1.5px solid ${theme.accent}66`,
              borderRadius: 100,
              padding: '10px 28px',
            }}>
              <div style={{
                width: 8, height: 8,
                borderRadius: '50%',
                background: theme.accent,
                display: 'flex',
                boxShadow: `0 0 8px ${theme.accent}`,
              }} />
              <div style={{
                fontSize: 30,
                fontWeight: 700,
                color: theme.accent,
                display: 'flex',
                letterSpacing: '0.03em',
              }}>
                {keyword}
              </div>
            </div>
          )}

          {/* 우상단 도트 장식 */}
          <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
            {[1, 0.5, 0.25].map((o, i) => (
              <div key={i} style={{
                width: 10, height: 10,
                borderRadius: '50%',
                background: theme.accent,
                opacity: o,
                display: 'flex',
              }} />
            ))}
          </div>
        </div>

        {/* 메인 콘텐츠 */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '40px 90px 40px 76px',
        }}>
          {/* 제목 위 구분선 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 44,
          }}>
            <div style={{
              width: 56, height: 4,
              background: theme.accent,
              borderRadius: 2,
              display: 'flex',
            }} />
            <div style={{
              width: 12, height: 4,
              background: `${theme.accent}60`,
              borderRadius: 2,
              display: 'flex',
            }} />
            <div style={{
              width: 6, height: 4,
              background: `${theme.accent}30`,
              borderRadius: 2,
              display: 'flex',
            }} />
          </div>

          {/* 제목 */}
          <div style={{
            fontSize: fontSize,
            fontWeight: 700,
            color: 'white',
            lineHeight: 1.38,
            wordBreak: 'keep-all',
            display: 'flex',
            flexWrap: 'wrap',
            textShadow: '0 2px 20px rgba(0,0,0,0.9)',
            letterSpacing: '-0.01em',
          }}>
            {title}
          </div>
        </div>

        {/* 하단 바 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 70px 0 76px',
          height: 90,
          borderTop: `1px solid rgba(255,255,255,0.08)`,
          background: 'rgba(0,0,0,0.35)',
        }}>
          {/* 사이트명 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <div style={{
              width: 6, height: 6,
              borderRadius: '50%',
              background: theme.accent,
              display: 'flex',
              boxShadow: `0 0 10px ${theme.accent}`,
            }} />
            <div style={{
              fontSize: 26,
              fontWeight: 700,
              color: `${theme.accent}cc`,
              display: 'flex',
              letterSpacing: '0.1em',
            }}>
              loov.co.kr
            </div>
          </div>

          {/* 우측 장식 라인 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            {[1, 0.6, 0.3].map((o, i) => (
              <div key={i} style={{
                width: i === 0 ? 32 : i === 1 ? 18 : 10,
                height: 3,
                background: theme.accent,
                opacity: o,
                borderRadius: 2,
                display: 'flex',
              }} />
            ))}
          </div>
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
