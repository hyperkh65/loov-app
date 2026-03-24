import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const THEMES = {
  blue:   { bg: '#080C18', bg2: '#0D1B4A', accent: '#FDB913', text: '#ffffff', sub: 'rgba(255,255,255,0.75)', dim: 'rgba(255,255,255,0.38)' },
  dark:   { bg: '#09090F', bg2: '#1a1a2e', accent: '#e94560', text: '#ffffff', sub: 'rgba(255,255,255,0.72)', dim: 'rgba(255,255,255,0.35)' },
  warm:   { bg: '#120505', bg2: '#3B0E0A', accent: '#F9CA24', text: '#ffffff', sub: 'rgba(255,255,255,0.72)', dim: 'rgba(255,255,255,0.38)' },
  green:  { bg: '#030F0E', bg2: '#004D40', accent: '#FFCA28', text: '#ffffff', sub: 'rgba(255,255,255,0.72)', dim: 'rgba(255,255,255,0.35)' },
  purple: { bg: '#0A0414', bg2: '#2D1155', accent: '#F8C471', text: '#ffffff', sub: 'rgba(255,255,255,0.72)', dim: 'rgba(255,255,255,0.35)' },
};
type ThemeKey = keyof typeof THEMES;

async function loadFont(): Promise<ArrayBuffer | null> {
  // Try Pretendard from jsDelivr, fallback to Noto Sans KR
  for (const url of [
    'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/Pretendard-Bold.woff',
    'https://fonts.gstatic.com/s/notosanskr/v36/PbyxFmXiEBPT4ITbgNA5Cgm20xz64px_1hVWr0wuPNGmlQNMEfD4.0.woff2',
  ]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (res.ok) return res.arrayBuffer();
    } catch { /* try next */ }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type     = searchParams.get('type') || 'content';
  const title    = searchParams.get('title') || '';
  const body     = searchParams.get('body') || '';
  const num      = Number(searchParams.get('num') || '1');
  const total    = Number(searchParams.get('total') || '6');
  const themeKey = (searchParams.get('theme') || 'blue') as ThemeKey;
  const brand    = searchParams.get('brand') || '2days.kr';
  let points: string[] = [];
  try { points = JSON.parse(searchParams.get('points') || '[]'); } catch { /* ignore */ }

  const c = THEMES[themeKey] ?? THEMES.blue;
  const fontData = await loadFont();
  const imgOpts: ConstructorParameters<typeof ImageResponse>[1] = {
    width: 1080, height: 1080,
    ...(fontData ? { fonts: [{ name: 'PF', data: fontData, weight: 700 as const }] } : {}),
  };
  const ff = fontData ? 'PF, sans-serif' : 'sans-serif';
  const numStr = String(num).padStart(2, '0');

  /* ── TITLE CARD ── */
  if (type === 'title') {
    return new ImageResponse(
      <div style={{ width: 1080, height: 1080, background: `linear-gradient(145deg, ${c.bg} 0%, ${c.bg2} 100%)`, display: 'flex', flexDirection: 'column', fontFamily: ff, position: 'relative', overflow: 'hidden' }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -200, right: -200, width: 700, height: 700, borderRadius: '50%', background: `${c.accent}08`, display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: -300, left: -200, width: 800, height: 800, borderRadius: '50%', background: `${c.accent}05`, display: 'flex' }} />
        {/* Big decorative number */}
        <div style={{ position: 'absolute', bottom: -60, right: -10, fontSize: 500, fontWeight: 900, color: c.accent, opacity: 0.05, lineHeight: 1, display: 'flex' }}>01</div>

        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '72px 80px 0' }}>
          <div style={{ width: 54, height: 54, background: c.accent, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 900, color: c.bg2 }}>2D</div>
          <span style={{ color: c.dim, fontSize: 28, fontWeight: 700 }}>{brand}</span>
        </div>

        {/* Center */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 80px', textAlign: 'center' }}>
          <div style={{ width: 180, height: 8, background: c.accent, borderRadius: 4, marginBottom: 56, display: 'flex' }} />
          <div style={{ fontSize: 96, fontWeight: 900, color: c.text, lineHeight: 1.1, letterSpacing: -2, maxWidth: 940, display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>{title}</div>
          {body && <div style={{ marginTop: 40, fontSize: 42, color: c.sub, lineHeight: 1.6, maxWidth: 820, display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>{body}</div>}
          {/* Dots */}
          <div style={{ marginTop: 72, display: 'flex', gap: 12 }}>
            {Array.from({ length: total }, (_, i) => (
              <div key={i} style={{ width: i === 0 ? 40 : 12, height: 12, borderRadius: 6, background: i === 0 ? c.accent : 'rgba(255,255,255,0.22)', display: 'flex' }} />
            ))}
          </div>
        </div>
        <div style={{ height: 14, background: c.accent, display: 'flex' }} />
      </div>,
      imgOpts,
    );
  }

  /* ── BRAND CARD ── */
  if (type === 'brand') {
    const bpts = points.length > 0 ? points : ['📲 팔로우하고 매일 유용한 정보 받기', '💾 저장해두고 필요할 때 꺼내보기', '🔗 친구에게 공유해서 함께 성장하기'];
    return new ImageResponse(
      <div style={{ width: 1080, height: 1080, background: `linear-gradient(160deg, ${c.bg2} 0%, ${c.bg} 55%, ${c.bg2} 100%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: ff, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', bottom: -180, right: -180, width: 700, height: 700, borderRadius: '50%', background: `${c.accent}07`, display: 'flex' }} />
        {/* Logo */}
        <div style={{ width: 160, height: 160, background: c.accent, borderRadius: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 72, fontWeight: 900, color: c.bg2, marginBottom: 48 }}>2D</div>
        <div style={{ fontSize: 96, fontWeight: 900, color: c.text, letterSpacing: -2, display: 'flex' }}>{title}</div>
        <div style={{ fontSize: 36, color: c.sub, marginTop: 20, display: 'flex' }}>{body || '오늘의 정보, 내일의 성공'}</div>
        <div style={{ width: 120, height: 6, background: c.accent, borderRadius: 3, margin: '56px 0 48px', display: 'flex' }} />
        {/* CTA rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, width: 880 }}>
          {bpts.slice(0, 3).map((pt, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 24, background: 'rgba(255,255,255,0.08)', borderRadius: 20, padding: '22px 36px', border: `1px solid rgba(255,255,255,0.12)` }}>
              <span style={{ fontSize: 38, display: 'flex', flexShrink: 0 }}>{pt.slice(0, 2)}</span>
              <span style={{ fontSize: 34, color: c.text, fontWeight: 700, display: 'flex' }}>{pt.slice(2).trim()}</span>
            </div>
          ))}
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 14, background: c.accent, display: 'flex' }} />
      </div>,
      imgOpts,
    );
  }

  /* ── CONTENT CARD ── */
  const displayPts = points.length > 0 ? points : body ? [body] : [];

  return new ImageResponse(
    <div style={{ width: 1080, height: 1080, background: `linear-gradient(160deg, ${c.bg} 0%, ${c.bg2} 100%)`, display: 'flex', fontFamily: ff, position: 'relative', overflow: 'hidden' }}>
      {/* Left accent bar */}
      <div style={{ width: 16, background: c.accent, flexShrink: 0, display: 'flex' }} />

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '64px 72px 64px 60px', position: 'relative' }}>
        {/* Large decorative number in background */}
        <div style={{ position: 'absolute', bottom: -60, right: -10, fontSize: 520, fontWeight: 900, color: c.accent, opacity: 0.05, lineHeight: 1, display: 'flex' }}>{numStr}</div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 48 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 38, height: 38, background: c.accent, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: c.bg2 }}>2D</div>
            <span style={{ color: c.dim, fontSize: 24, fontWeight: 700 }}>{brand}</span>
          </div>
          <div style={{ background: c.accent, color: c.bg2, fontSize: 24, fontWeight: 900, padding: '8px 26px', borderRadius: 36, display: 'flex' }}>{num} / {total}</div>
        </div>

        {/* Number badge + Title */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, marginBottom: 24 }}>
          <div style={{ width: 84, height: 84, background: c.accent, borderRadius: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 46, fontWeight: 900, color: c.bg2, flexShrink: 0 }}>{num}</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 68, fontWeight: 900, color: c.text, lineHeight: 1.15, letterSpacing: -1, display: 'flex', flexWrap: 'wrap' }}>{title}</div>
            {body && <div style={{ fontSize: 30, color: c.sub, marginTop: 8, lineHeight: 1.5, display: 'flex', flexWrap: 'wrap' }}>{body}</div>}
          </div>
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', marginBottom: 32 }}>
          <div style={{ width: 80, height: 4, background: c.accent, borderRadius: 2, display: 'flex' }} />
          <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.08)', marginTop: 1, display: 'flex' }} />
        </div>

        {/* Bullet points */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, flex: 1 }}>
          {displayPts.slice(0, 5).map((pt, i) => {
            const hasEmoji = /\p{Emoji}/u.test(pt[0] ?? '');
            const emo = hasEmoji ? pt.slice(0, 2) : '▶';
            const txt = hasEmoji ? pt.slice(2).trim() : pt;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 22, background: 'rgba(255,255,255,0.06)', borderRadius: 18, padding: '20px 28px', borderLeft: `4px solid ${c.accent}` }}>
                <div style={{ width: 56, height: 56, background: `${c.accent}22`, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0, border: `2px solid ${c.accent}55` }}>{emo}</div>
                <span style={{ fontSize: 38, color: c.text, fontWeight: 700, lineHeight: 1.5, display: 'flex', flexWrap: 'wrap', flex: 1 }}>{txt}</span>
              </div>
            );
          })}
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
          {Array.from({ length: total }, (_, i) => (
            <div key={i} style={{ width: i === num - 1 ? 32 : 10, height: 10, borderRadius: 5, background: i === num - 1 ? c.accent : 'rgba(255,255,255,0.22)', display: 'flex' }} />
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 14, background: c.accent, display: 'flex' }} />
    </div>,
    imgOpts,
  );
}
