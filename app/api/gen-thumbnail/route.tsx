import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export const maxDuration = 30;

const THEMES: Record<string, {
  g1: string; g2: string; g3: string;
  accent: string; accent2: string;
  dim: string;
}> = {
  blue: {
    g1: '#000b26', g2: '#001858', g3: '#002a8a',
    accent: '#60a5fa', accent2: '#38bdf8', dim: 'rgba(96,165,250,0.18)',
  },
  dark: {
    g1: '#05010e', g2: '#10042a', g3: '#1c0748',
    accent: '#c084fc', accent2: '#e879f9', dim: 'rgba(192,132,252,0.18)',
  },
  green: {
    g1: '#000e06', g2: '#002a14', g3: '#004428',
    accent: '#34d399', accent2: '#6ee7b7', dim: 'rgba(52,211,153,0.18)',
  },
  red: {
    g1: '#120002', g2: '#320006', g3: '#520010',
    accent: '#fb7185', accent2: '#fda4af', dim: 'rgba(251,113,133,0.18)',
  },
  orange: {
    g1: '#100500', g2: '#2c1000', g3: '#4a1c00',
    accent: '#fb923c', accent2: '#fdba74', dim: 'rgba(251,146,60,0.18)',
  },
  violet: {
    g1: '#06000e', g2: '#140028', g3: '#220048',
    accent: '#a78bfa', accent2: '#c4b5fd', dim: 'rgba(167,139,250,0.18)',
  },
  teal: {
    g1: '#000d10', g2: '#002838', g3: '#004258',
    accent: '#2dd4bf', accent2: '#99f6e4', dim: 'rgba(45,212,191,0.18)',
  },
  golden: {
    g1: '#0c0700', g2: '#281600', g3: '#422400',
    accent: '#fbbf24', accent2: '#fde68a', dim: 'rgba(251,191,36,0.18)',
  },
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title   = searchParams.get('title')   || '';
  const keyword = searchParams.get('keyword') || '';
  const color   = searchParams.get('color')   || 'blue';
  const bgUrl   = searchParams.get('bg')      || '';
  const site    = searchParams.get('site')    || '';
  const sub     = searchParams.get('sub')     || '';

  const t = THEMES[color] || THEMES.blue;

  let fontData: ArrayBuffer | undefined;
  try {
    const fontPath = join(process.cwd(), 'public', 'fonts', 'NotoSansKR-Bold.otf');
    fontData = readFileSync(fontPath).buffer;
  } catch {
    try {
      const res = await fetch(
        'https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/KR/NotoSansKR-Bold.otf',
        { signal: AbortSignal.timeout(8000) }
      );
      if (res.ok) fontData = await res.arrayBuffer();
    } catch { /* fallback sans-serif */ }
  }

  const len = title.length;
  const fontSize = len <= 8 ? 108 : len <= 14 ? 90 : len <= 20 ? 78 : len <= 28 ? 66 : len <= 36 ? 56 : 48;

  return new ImageResponse(
    (
      <div
        style={{
          width: 1080, height: 1080,
          display: 'flex', flexDirection: 'column',
          background: `linear-gradient(148deg, ${t.g1} 0%, ${t.g2} 48%, ${t.g3} 100%)`,
          position: 'relative', overflow: 'hidden',
          fontFamily: fontData ? 'NotoSansKR' : 'sans-serif',
        }}
      >
        {/* 배경 이미지 */}
        {bgUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bgUrl} alt="" style={{ position: 'absolute', inset: 0, width: 1080, height: 1080, objectFit: 'cover' }} />
        )}
        {bgUrl && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            background: `linear-gradient(148deg, ${t.g1}f0 0%, ${t.g2}d0 50%, ${t.g3}c0 100%)`,
          }} />
        )}

        {/* ── 배경 장식 ── */}

        {/* 우상단 큰 원 아웃라인 */}
        <div style={{
          position: 'absolute', top: -220, right: -220,
          width: 760, height: 760, borderRadius: '50%',
          border: `2px solid ${t.accent}22`, display: 'flex',
        }} />
        <div style={{
          position: 'absolute', top: -100, right: -100,
          width: 480, height: 480, borderRadius: '50%',
          border: `1px solid ${t.accent}18`, display: 'flex',
        }} />

        {/* 좌하단 원 아웃라인 */}
        <div style={{
          position: 'absolute', bottom: -160, left: -160,
          width: 520, height: 520, borderRadius: '50%',
          border: `2px solid ${t.accent}18`, display: 'flex',
        }} />

        {/* 글로우 블롭 - 우상단 */}
        <div style={{
          position: 'absolute', top: -80, right: -40,
          width: 460, height: 460, borderRadius: '50%', display: 'flex',
          background: `radial-gradient(circle, ${t.dim} 0%, transparent 68%)`,
        }} />

        {/* 글로우 블롭 - 좌하단 */}
        <div style={{
          position: 'absolute', bottom: -60, left: -60,
          width: 340, height: 340, borderRadius: '50%', display: 'flex',
          background: `radial-gradient(circle, ${t.dim} 0%, transparent 68%)`,
        }} />

        {/* 글로우 블롭 - 중앙 우측 (깊이감) */}
        <div style={{
          position: 'absolute', top: 380, right: -80,
          width: 260, height: 260, borderRadius: '50%', display: 'flex',
          background: `radial-gradient(circle, ${t.accent}0f 0%, transparent 70%)`,
        }} />

        {/* ── 상단 액센트 스트립 ── */}
        <div style={{
          width: '100%', height: 16, flexShrink: 0, display: 'flex',
          background: `linear-gradient(90deg, ${t.accent} 0%, ${t.accent2} 55%, ${t.accent}30 100%)`,
        }} />

        {/* 상단 보조 라인들 */}
        <div style={{
          position: 'absolute', top: 28, left: 80,
          width: 280, height: 2, display: 'flex',
          background: `linear-gradient(90deg, ${t.accent}55, transparent)`,
        }} />
        <div style={{
          position: 'absolute', top: 38, left: 80,
          width: 160, height: 1, display: 'flex',
          background: `linear-gradient(90deg, ${t.accent}30, transparent)`,
        }} />

        {/* 코너 브래킷 - 좌상 */}
        <div style={{
          position: 'absolute', top: 56, left: 56,
          width: 52, height: 52, display: 'flex',
          borderTop: `3px solid ${t.accent}65`,
          borderLeft: `3px solid ${t.accent}65`,
        }} />

        {/* 코너 브래킷 - 우하 */}
        <div style={{
          position: 'absolute', bottom: 108, right: 56,
          width: 52, height: 52, display: 'flex',
          borderBottom: `3px solid ${t.accent}65`,
          borderRight: `3px solid ${t.accent}65`,
        }} />

        {/* 우측 수직 도트 장식 */}
        <div style={{
          position: 'absolute', right: 72, top: '50%',
          display: 'flex', flexDirection: 'column', gap: 16,
          transform: 'translateY(-50%)',
        }}>
          {[1, 0.6, 0.35, 0.15].map((o, i) => (
            <div key={i} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: t.accent, opacity: o, display: 'flex',
            }} />
          ))}
        </div>

        {/* ── 메인 콘텐츠 ── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          justifyContent: 'center',
          padding: '48px 120px 40px 84px',
          gap: 36,
        }}>

          {/* 키워드 뱃지 */}
          {keyword && (
            <div style={{ display: 'flex' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                background: `linear-gradient(135deg, ${t.accent}22, ${t.accent}0a)`,
                border: `1.5px solid ${t.accent}70`,
                borderRadius: 100, padding: '13px 36px',
                boxShadow: `0 0 32px ${t.accent}28, 0 0 64px ${t.accent}10, inset 0 1px 0 rgba(255,255,255,0.08)`,
              }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: t.accent, display: 'flex',
                  boxShadow: `0 0 14px ${t.accent}, 0 0 28px ${t.accent}90`,
                }} />
                <div style={{
                  fontSize: 32, fontWeight: 800,
                  color: t.accent, letterSpacing: '0.05em', display: 'flex',
                }}>
                  {keyword}
                </div>
              </div>
            </div>
          )}

          {/* 구분선 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 72, height: 5, background: t.accent, borderRadius: 3, display: 'flex' }} />
            <div style={{ width: 22, height: 5, background: `${t.accent}70`, borderRadius: 3, display: 'flex' }} />
            <div style={{ width: 10, height: 5, background: `${t.accent}38`, borderRadius: 3, display: 'flex' }} />
          </div>

          {/* 제목 */}
          <div style={{
            fontSize, fontWeight: 900,
            color: 'white', lineHeight: 1.28,
            wordBreak: 'keep-all', display: 'flex', flexWrap: 'wrap',
            textShadow: `0 0 60px rgba(0,0,0,0.9), 0 4px 24px rgba(0,0,0,0.75), 0 1px 2px rgba(0,0,0,0.5)`,
            letterSpacing: '-0.02em',
          }}>
            {title}
          </div>

          {/* 서브타이틀 */}
          {sub && (
            <div style={{
              fontSize: 30, color: 'rgba(255,255,255,0.58)',
              lineHeight: 1.5, display: 'flex', flexWrap: 'wrap',
              wordBreak: 'keep-all', letterSpacing: '-0.01em',
            }}>
              {sub}
            </div>
          )}
        </div>

        {/* ── 하단 바 ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 80px', height: 90, flexShrink: 0,
          background: 'rgba(0,0,0,0.52)',
          borderTop: `1px solid rgba(255,255,255,0.07)`,
        }}>
          {/* 사이트명 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: t.accent, display: 'flex',
              boxShadow: `0 0 18px ${t.accent}, 0 0 36px ${t.accent}80`,
            }} />
            <div style={{
              fontSize: 27, fontWeight: 700,
              color: `${t.accent}dd`, letterSpacing: '0.1em', display: 'flex',
            }}>
              {site || 'BLOG'}
            </div>
          </div>

          {/* 우측 장식 바 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {[46, 28, 16, 8].map((w, i) => (
              <div key={i} style={{
                width: w, height: 4, borderRadius: 2,
                background: `linear-gradient(90deg, ${t.accent}, ${t.accent2})`,
                opacity: 1 - i * 0.2, display: 'flex',
              }} />
            ))}
          </div>
        </div>
      </div>
    ),
    {
      width: 1080, height: 1080,
      fonts: fontData ? [{ name: 'NotoSansKR', data: fontData, weight: 700, style: 'normal' }] : [],
    },
  );
}
