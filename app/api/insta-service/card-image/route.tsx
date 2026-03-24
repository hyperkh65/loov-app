import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const THEMES = {
  blue: {
    bg1: '#1B4FD8', bg2: '#0D1B4A', accent: '#FDB913',
    text: '#ffffff', sub: 'rgba(255,255,255,0.65)', card: '#0F2D7A',
  },
  dark: {
    bg1: '#1a1a2e', bg2: '#0f0f1e', accent: '#e94560',
    text: '#ffffff', sub: 'rgba(255,255,255,0.60)', card: '#16213e',
  },
  warm: {
    bg1: '#C0392B', bg2: '#7B241C', accent: '#F9CA24',
    text: '#ffffff', sub: 'rgba(255,255,255,0.70)', card: '#A93226',
  },
  green: {
    bg1: '#00796B', bg2: '#004D40', accent: '#FFCA28',
    text: '#ffffff', sub: 'rgba(255,255,255,0.65)', card: '#00695C',
  },
  purple: {
    bg1: '#6C3483', bg2: '#4A235A', accent: '#F8C471',
    text: '#ffffff', sub: 'rgba(255,255,255,0.65)', card: '#5B2C6F',
  },
};

type ThemeKey = keyof typeof THEMES;

async function loadFont(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(
      'https://fonts.gstatic.com/s/notosanskr/v36/PbyxFmXiEBPT4ITbgNA5Cgm20xz64px_1hVWr0wuPNGmlQNMEfD4.0.woff2',
      { signal: AbortSignal.timeout(6000) }
    );
    return res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type = searchParams.get('type') || 'content';
  const title = searchParams.get('title') || '';
  const body = searchParams.get('body') || '';
  const num = Number(searchParams.get('num') || '1');
  const total = Number(searchParams.get('total') || '6');
  const themeKey = (searchParams.get('theme') || 'blue') as ThemeKey;
  const brand = searchParams.get('brand') || '2days.kr';

  const c = THEMES[themeKey] ?? THEMES.blue;
  const fontData = await loadFont();

  const imgOptions: ConstructorParameters<typeof ImageResponse>[1] = {
    width: 1080,
    height: 1080,
    ...(fontData ? { fonts: [{ name: 'NotoSansKR', data: fontData, weight: 700 as const }] } : {}),
  };

  const fontFamily = fontData ? 'NotoSansKR, sans-serif' : 'sans-serif';

  /* ── TITLE CARD ── */
  if (type === 'title') {
    return new ImageResponse(
      <div style={{ width: 1080, height: 1080, background: `linear-gradient(135deg, ${c.bg1} 0%, ${c.bg2} 100%)`, display: 'flex', flexDirection: 'column', fontFamily, position: 'relative', overflow: 'hidden' }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -120, right: -120, width: 480, height: 480, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: -180, left: -80, width: 520, height: 520, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', display: 'flex' }} />
        <div style={{ position: 'absolute', top: 200, right: -60, width: 200, height: 200, borderRadius: '50%', background: c.accent, opacity: 0.12, display: 'flex' }} />

        {/* Top brand bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '48px 60px 0' }}>
          <div style={{ width: 44, height: 44, background: c.accent, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900, color: c.bg2 }}>2D</div>
          <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 24, fontWeight: 700 }}>{brand}</span>
        </div>

        {/* Center content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 80px', textAlign: 'center' }}>
          {/* Accent line */}
          <div style={{ width: 64, height: 6, background: c.accent, borderRadius: 3, marginBottom: 44, display: 'flex' }} />
          {/* Main title */}
          <div style={{ fontSize: 76, fontWeight: 900, color: c.text, lineHeight: 1.2, maxWidth: 920, display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>{title}</div>
          {/* Subtitle */}
          {body && (
            <div style={{ marginTop: 36, fontSize: 34, color: c.sub, lineHeight: 1.5, maxWidth: 820, display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>{body}</div>
          )}
          {/* Slide counter */}
          <div style={{ marginTop: 56, display: 'flex', alignItems: 'center', gap: 8 }}>
            {Array.from({ length: total }, (_, i) => (
              <div key={i} style={{ width: i === 0 ? 28 : 10, height: 10, borderRadius: 5, background: i === 0 ? c.accent : 'rgba(255,255,255,0.3)', display: 'flex' }} />
            ))}
          </div>
        </div>

        {/* Bottom accent bar */}
        <div style={{ height: 10, background: c.accent, display: 'flex' }} />
      </div>,
      imgOptions,
    );
  }

  /* ── BRAND CARD ── */
  if (type === 'brand') {
    return new ImageResponse(
      <div style={{ width: 1080, height: 1080, background: `linear-gradient(160deg, ${c.bg2} 0%, ${c.bg1} 60%, ${c.bg2} 100%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily, position: 'relative', overflow: 'hidden' }}>
        {/* Decorative bg shapes */}
        <div style={{ position: 'absolute', top: -200, left: -200, width: 600, height: 600, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: -200, right: -200, width: 700, height: 700, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', display: 'flex' }} />

        {/* Logo mark */}
        <div style={{ width: 140, height: 140, background: c.accent, borderRadius: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 60, fontWeight: 900, color: c.bg2, marginBottom: 40, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>2D</div>

        {/* Brand name */}
        <div style={{ fontSize: 80, fontWeight: 900, color: c.text, letterSpacing: '-1px', display: 'flex' }}>{brand}</div>
        <div style={{ fontSize: 32, color: c.sub, marginTop: 20, display: 'flex' }}>{body || '오늘의 정보, 내일의 성공'}</div>

        {/* Divider */}
        <div style={{ width: 100, height: 5, background: c.accent, borderRadius: 3, margin: '60px 0', display: 'flex' }} />

        {/* CTA */}
        <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: '24px 60px', border: `2px solid ${c.accent}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 30, color: c.text, fontWeight: 700, display: 'flex' }}>팔로우 & 저장하고 유용한 정보 받기</div>
          <div style={{ fontSize: 22, color: c.sub, display: 'flex' }}>매일 새로운 비즈니스 인사이트</div>
        </div>

        {/* Bottom bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 10, background: c.accent, display: 'flex' }} />
      </div>,
      imgOptions,
    );
  }

  /* ── CONTENT CARD ── */
  return new ImageResponse(
    <div style={{ width: 1080, height: 1080, background: `linear-gradient(160deg, ${c.bg2} 0%, #08112e 100%)`, display: 'flex', flexDirection: 'column', fontFamily, padding: '64px 72px', position: 'relative', overflow: 'hidden' }}>
      {/* Decorative accent circle */}
      <div style={{ position: 'absolute', top: -80, right: -80, width: 300, height: 300, borderRadius: '50%', background: c.accent, opacity: 0.08, display: 'flex' }} />
      <div style={{ position: 'absolute', bottom: 60, left: -60, width: 200, height: 200, borderRadius: '50%', background: c.bg1, opacity: 0.5, display: 'flex' }} />

      {/* Header: brand + page counter */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: c.accent, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: c.bg2 }}>2D</div>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 22, fontWeight: 700 }}>{brand}</span>
        </div>
        <div style={{ background: c.accent, color: c.bg2, fontSize: 22, fontWeight: 900, padding: '8px 22px', borderRadius: 30, display: 'flex' }}>
          {num} / {total}
        </div>
      </div>

      {/* Number badge */}
      <div style={{ width: 80, height: 80, background: c.accent, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 900, color: c.bg2, marginBottom: 40 }}>
        {num}
      </div>

      {/* Title */}
      <div style={{ fontSize: 56, fontWeight: 900, color: c.text, lineHeight: 1.25, marginBottom: 40, maxWidth: 920, display: 'flex', flexWrap: 'wrap' }}>
        {title}
      </div>

      {/* Accent line under title */}
      <div style={{ width: 56, height: 5, background: c.accent, borderRadius: 3, marginBottom: 36, display: 'flex' }} />

      {/* Body text */}
      <div style={{ fontSize: 38, color: c.sub, lineHeight: 1.75, maxWidth: 920, display: 'flex', flexWrap: 'wrap' }}>
        {body}
      </div>

      {/* Dot progress */}
      <div style={{ position: 'absolute', bottom: 80, right: 72, display: 'flex', gap: 8 }}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} style={{ width: i === num - 1 ? 28 : 10, height: 10, borderRadius: 5, background: i === num - 1 ? c.accent : 'rgba(255,255,255,0.25)', display: 'flex' }} />
        ))}
      </div>

      {/* Bottom accent bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 10, background: c.accent, display: 'flex' }} />
    </div>,
    imgOptions,
  );
}
