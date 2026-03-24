import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const THEMES = {
  blue:   { bg1: '#1B4FD8', bg2: '#0D1B4A', accent: '#FDB913', text: '#ffffff', sub: 'rgba(255,255,255,0.70)', dim: 'rgba(255,255,255,0.45)' },
  dark:   { bg1: '#1a1a2e', bg2: '#0f0f1e', accent: '#e94560', text: '#ffffff', sub: 'rgba(255,255,255,0.68)', dim: 'rgba(255,255,255,0.40)' },
  warm:   { bg1: '#C0392B', bg2: '#7B241C', accent: '#F9CA24', text: '#ffffff', sub: 'rgba(255,255,255,0.72)', dim: 'rgba(255,255,255,0.45)' },
  green:  { bg1: '#00796B', bg2: '#004D40', accent: '#FFCA28', text: '#ffffff', sub: 'rgba(255,255,255,0.70)', dim: 'rgba(255,255,255,0.45)' },
  purple: { bg1: '#6C3483', bg2: '#4A235A', accent: '#F8C471', text: '#ffffff', sub: 'rgba(255,255,255,0.70)', dim: 'rgba(255,255,255,0.45)' },
};

type ThemeKey = keyof typeof THEMES;

async function loadFont(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(
      'https://fonts.gstatic.com/s/notosanskr/v36/PbyxFmXiEBPT4ITbgNA5Cgm20xz64px_1hVWr0wuPNGmlQNMEfD4.0.woff2',
      { signal: AbortSignal.timeout(6000) }
    );
    return res.arrayBuffer();
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type    = searchParams.get('type') || 'content';
  const title   = searchParams.get('title') || '';
  const body    = searchParams.get('body') || '';
  const num     = Number(searchParams.get('num') || '1');
  const total   = Number(searchParams.get('total') || '6');
  const themeKey = (searchParams.get('theme') || 'blue') as ThemeKey;
  const brand   = searchParams.get('brand') || '2days.kr';
  // points passed as JSON-encoded array
  let points: string[] = [];
  try { points = JSON.parse(searchParams.get('points') || '[]'); } catch { /* ignore */ }

  const c = THEMES[themeKey] ?? THEMES.blue;
  const fontData = await loadFont();
  const imgOptions: ConstructorParameters<typeof ImageResponse>[1] = {
    width: 1080,
    height: 1080,
    ...(fontData ? { fonts: [{ name: 'NotoSansKR', data: fontData, weight: 700 as const }] } : {}),
  };
  const ff = fontData ? 'NotoSansKR, sans-serif' : 'sans-serif';

  /* ── TITLE CARD ── */
  if (type === 'title') {
    return new ImageResponse(
      <div style={{ width: 1080, height: 1080, background: `linear-gradient(135deg, ${c.bg1} 0%, ${c.bg2} 100%)`, display: 'flex', flexDirection: 'column', fontFamily: ff, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -140, right: -140, width: 500, height: 500, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: -200, left: -100, width: 560, height: 560, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', display: 'flex' }} />
        {/* Top brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '52px 64px 0' }}>
          <div style={{ width: 48, height: 48, background: c.accent, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, color: c.bg2 }}>2D</div>
          <span style={{ color: c.dim, fontSize: 26, fontWeight: 700 }}>{brand}</span>
        </div>
        {/* Center */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 80px', textAlign: 'center' }}>
          <div style={{ width: 72, height: 7, background: c.accent, borderRadius: 4, marginBottom: 48, display: 'flex' }} />
          <div style={{ fontSize: 84, fontWeight: 900, color: c.text, lineHeight: 1.15, maxWidth: 940, display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>{title}</div>
          {body && <div style={{ marginTop: 40, fontSize: 38, color: c.sub, lineHeight: 1.55, maxWidth: 840, display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>{body}</div>}
          <div style={{ marginTop: 60, display: 'flex', gap: 10 }}>
            {Array.from({ length: total }, (_, i) => (
              <div key={i} style={{ width: i === 0 ? 32 : 12, height: 12, borderRadius: 6, background: i === 0 ? c.accent : 'rgba(255,255,255,0.25)', display: 'flex' }} />
            ))}
          </div>
        </div>
        <div style={{ height: 12, background: c.accent, display: 'flex' }} />
      </div>,
      imgOptions,
    );
  }

  /* ── BRAND CARD ── */
  if (type === 'brand') {
    const brandPoints = points.length > 0 ? points : ['📲 팔로우하고 매일 유용한 정보 받기', '💾 저장해두고 필요할 때 꺼내보기', '🔗 친구에게 공유해서 함께 성장하기'];
    return new ImageResponse(
      <div style={{ width: 1080, height: 1080, background: `linear-gradient(160deg, ${c.bg2} 0%, ${c.bg1} 55%, ${c.bg2} 100%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: ff, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -220, left: -220, width: 650, height: 650, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: -220, right: -220, width: 700, height: 700, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', display: 'flex' }} />
        {/* Logo */}
        <div style={{ width: 150, height: 150, background: c.accent, borderRadius: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 66, fontWeight: 900, color: c.bg2, marginBottom: 44, boxShadow: '0 24px 64px rgba(0,0,0,0.35)' }}>2D</div>
        <div style={{ fontSize: 86, fontWeight: 900, color: c.text, letterSpacing: '-1px', display: 'flex' }}>{title}</div>
        <div style={{ fontSize: 34, color: c.sub, marginTop: 18, display: 'flex' }}>{body || '오늘의 정보, 내일의 성공'}</div>
        <div style={{ width: 110, height: 6, background: c.accent, borderRadius: 3, margin: '52px 0 48px', display: 'flex' }} />
        {/* CTA points */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: 840 }}>
          {brandPoints.map((pt, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20, background: 'rgba(255,255,255,0.08)', borderRadius: 18, padding: '20px 32px', border: `1px solid rgba(255,255,255,0.12)` }}>
              <span style={{ fontSize: 34, display: 'flex', flexShrink: 0 }}>{pt.slice(0, 2)}</span>
              <span style={{ fontSize: 30, color: c.text, fontWeight: 700, display: 'flex' }}>{pt.slice(2).trim()}</span>
            </div>
          ))}
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 12, background: c.accent, display: 'flex' }} />
      </div>,
      imgOptions,
    );
  }

  /* ── CONTENT CARD ── */
  const displayPoints = points.length > 0 ? points : body ? [body] : [];

  return new ImageResponse(
    <div style={{ width: 1080, height: 1080, background: `linear-gradient(160deg, ${c.bg2} 0%, #07101f 100%)`, display: 'flex', flexDirection: 'column', fontFamily: ff, padding: '56px 68px 56px', position: 'relative', overflow: 'hidden' }}>
      {/* Decorative */}
      <div style={{ position: 'absolute', top: -80, right: -80, width: 280, height: 280, borderRadius: '50%', background: c.accent, opacity: 0.07, display: 'flex' }} />
      <div style={{ position: 'absolute', bottom: 20, left: -80, width: 220, height: 220, borderRadius: '50%', background: c.bg1, opacity: 0.4, display: 'flex' }} />

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 48 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 34, height: 34, background: c.accent, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 900, color: c.bg2 }}>2D</div>
          <span style={{ color: c.dim, fontSize: 22, fontWeight: 700 }}>{brand}</span>
        </div>
        <div style={{ background: c.accent, color: c.bg2, fontSize: 22, fontWeight: 900, padding: '8px 24px', borderRadius: 32, display: 'flex' }}>{num} / {total}</div>
      </div>

      {/* Number badge + Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, marginBottom: 32 }}>
        <div style={{ width: 72, height: 72, background: c.accent, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, fontWeight: 900, color: c.bg2, flexShrink: 0 }}>{num}</div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 52, fontWeight: 900, color: c.text, lineHeight: 1.2, display: 'flex', flexWrap: 'wrap' }}>{title}</div>
          {body && <div style={{ fontSize: 28, color: c.sub, marginTop: 8, lineHeight: 1.4, display: 'flex', flexWrap: 'wrap' }}>{body}</div>}
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: '100%', height: 2, background: 'rgba(255,255,255,0.12)', marginBottom: 36, display: 'flex' }}>
        <div style={{ width: 80, height: 2, background: c.accent, display: 'flex' }} />
      </div>

      {/* Bullet points */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, flex: 1 }}>
        {displayPoints.slice(0, 5).map((pt, i) => {
          // Split emoji from text (first 2 chars might be emoji)
          const hasEmoji = /^\p{Emoji}/u.test(pt);
          const emoji = hasEmoji ? pt.slice(0, 2) : '▶';
          const text = hasEmoji ? pt.slice(2).trim() : pt;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 20, background: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: '18px 24px', border: `1px solid rgba(255,255,255,0.10)` }}>
              <div style={{ width: 44, height: 44, background: c.accent, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{emoji}</div>
              <span style={{ fontSize: 30, color: c.text, lineHeight: 1.55, fontWeight: 700, display: 'flex', flexWrap: 'wrap', flex: 1 }}>{text}</span>
            </div>
          );
        })}
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 28 }}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} style={{ width: i === num - 1 ? 28 : 10, height: 10, borderRadius: 5, background: i === num - 1 ? c.accent : 'rgba(255,255,255,0.22)', display: 'flex' }} />
        ))}
      </div>

      {/* Bottom bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 12, background: c.accent, display: 'flex' }} />
    </div>,
    imgOptions,
  );
}
