'use client';

import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Audio,
  Series,
} from 'remotion';

export interface CardSlide {
  type: 'title' | 'content' | 'brand';
  title: string;
  body: string;
  points: string[];
}

const THEMES = {
  blue:   { bg: '#080C18', bg2: '#0D1B4A', accent: '#FDB913', text: '#fff', sub: 'rgba(255,255,255,0.72)', dim: 'rgba(255,255,255,0.38)' },
  dark:   { bg: '#09090F', bg2: '#1a1a2e', accent: '#e94560', text: '#fff', sub: 'rgba(255,255,255,0.70)', dim: 'rgba(255,255,255,0.35)' },
  warm:   { bg: '#120505', bg2: '#3B0E0A', accent: '#F9CA24', text: '#fff', sub: 'rgba(255,255,255,0.72)', dim: 'rgba(255,255,255,0.38)' },
  green:  { bg: '#030F0E', bg2: '#004D40', accent: '#FFCA28', text: '#fff', sub: 'rgba(255,255,255,0.70)', dim: 'rgba(255,255,255,0.35)' },
  purple: { bg: '#0A0414', bg2: '#2D1155', accent: '#F8C471', text: '#fff', sub: 'rgba(255,255,255,0.70)', dim: 'rgba(255,255,255,0.35)' },
};

type ThemeKey = keyof typeof THEMES;

const SLIDE_FRAMES = 150; // 5s per slide at 30fps
const FF = '"Pretendard Variable", "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';

/* ── Single slide component ── */
function SingleSlide({
  slide, theme, slideIndex, totalSlides,
}: {
  slide: CardSlide; theme: ThemeKey; slideIndex: number; totalSlides: number;
}) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const c = THEMES[theme] ?? THEMES.blue;

  // Entrance spring
  const enter = spring({ fps, frame, config: { damping: 18, stiffness: 120, mass: 0.8 } });
  const translateY = interpolate(enter, [0, 1], [60, 0]);
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });

  const pts = slide.points?.slice(0, 5) ?? [];

  /* ── TITLE SLIDE ── */
  if (slide.type === 'title') {
    const lineGrow = interpolate(frame, [20, 50], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return (
      <div style={{ width, height, background: `linear-gradient(145deg, ${c.bg} 0%, ${c.bg2} 100%)`, display: 'flex', flexDirection: 'column', fontFamily: FF, position: 'relative', overflow: 'hidden', opacity }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -200, right: -200, width: 700, height: 700, borderRadius: '50%', background: `${c.accent}08`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -300, left: -200, width: 800, height: 800, borderRadius: '50%', background: `${c.accent}05`, pointerEvents: 'none' }} />
        {/* Large decorative text */}
        <div style={{ position: 'absolute', bottom: -60, right: -20, fontSize: 500, fontWeight: 900, color: c.accent, opacity: 0.04, lineHeight: 1, userSelect: 'none', pointerEvents: 'none' }}>01</div>

        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '72px 80px 0', transform: `translateY(${translateY}px)` }}>
          <div style={{ width: 54, height: 54, background: c.accent, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 900, color: c.bg2 }}>2D</div>
          <span style={{ color: c.dim, fontSize: 28, fontWeight: 700, letterSpacing: 1 }}>2days.kr</span>
        </div>

        {/* Center content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 80px', textAlign: 'center', transform: `translateY(${translateY}px)` }}>
          {/* Accent line animated */}
          <div style={{ width: `${lineGrow}%`, height: 8, background: c.accent, borderRadius: 4, marginBottom: 56, maxWidth: 180 }} />
          <div style={{ fontSize: 96, fontWeight: 900, color: c.text, lineHeight: 1.1, letterSpacing: -2, maxWidth: 920 }}>{slide.title}</div>
          {slide.body && (
            <div style={{ marginTop: 40, fontSize: 42, color: c.sub, lineHeight: 1.6, maxWidth: 800, opacity: interpolate(frame, [30, 55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
              {slide.body}
            </div>
          )}
          {/* Progress dots */}
          <div style={{ marginTop: 72, display: 'flex', gap: 12 }}>
            {Array.from({ length: totalSlides }, (_, i) => (
              <div key={i} style={{ width: i === 0 ? 36 : 12, height: 12, borderRadius: 6, background: i === 0 ? c.accent : 'rgba(255,255,255,0.22)' }} />
            ))}
          </div>
        </div>
        {/* Bottom accent */}
        <div style={{ height: 14, background: c.accent }} />
      </div>
    );
  }

  /* ── BRAND SLIDE ── */
  if (slide.type === 'brand') {
    const bpts = pts.length > 0 ? pts : ['📲 팔로우하고 매일 유용한 정보 받기', '💾 저장해두고 필요할 때 꺼내보기', '🔗 친구에게 공유해서 함께 성장하기'];
    return (
      <div style={{ width, height, background: `linear-gradient(160deg, ${c.bg2} 0%, ${c.bg} 55%, ${c.bg2} 100%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: FF, position: 'relative', overflow: 'hidden', opacity }}>
        <div style={{ position: 'absolute', bottom: -180, right: -180, width: 700, height: 700, borderRadius: '50%', background: `${c.accent}07`, pointerEvents: 'none' }} />

        <div style={{ transform: `translateY(${translateY}px)`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 160, height: 160, background: c.accent, borderRadius: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 72, fontWeight: 900, color: c.bg2, marginBottom: 48, boxShadow: `0 32px 80px ${c.accent}55` }}>2D</div>
          <div style={{ fontSize: 96, fontWeight: 900, color: c.text, letterSpacing: -2 }}>{slide.title}</div>
          <div style={{ fontSize: 36, color: c.sub, marginTop: 20 }}>{slide.body || '오늘의 정보, 내일의 성공'}</div>
          <div style={{ width: 120, height: 6, background: c.accent, borderRadius: 3, margin: '56px 0 52px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, width: 880 }}>
            {bpts.map((pt, i) => {
              const ptOpacity = interpolate(frame, [30 + i * 18, 48 + i * 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
              const ptX = interpolate(frame, [30 + i * 18, 48 + i * 18], [-30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 24, background: 'rgba(255,255,255,0.08)', borderRadius: 20, padding: '22px 36px', border: `1px solid rgba(255,255,255,0.12)`, opacity: ptOpacity, transform: `translateX(${ptX}px)` }}>
                  <span style={{ fontSize: 36 }}>{pt.slice(0, 2)}</span>
                  <span style={{ fontSize: 34, color: c.text, fontWeight: 700 }}>{pt.slice(2).trim()}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 14, background: c.accent }} />
      </div>
    );
  }

  /* ── CONTENT SLIDE ── */
  const displayPts = pts.length > 0 ? pts : slide.body ? [slide.body] : [];
  const numStr = String(slideIndex + 1).padStart(2, '0');

  return (
    <div style={{ width, height, background: `linear-gradient(160deg, ${c.bg} 0%, ${c.bg2} 100%)`, display: 'flex', fontFamily: FF, position: 'relative', overflow: 'hidden', opacity }}>
      {/* Left accent bar */}
      <div style={{ width: 16, background: c.accent, flexShrink: 0, height: '100%' }} />

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '64px 72px 64px 60px', position: 'relative' }}>
        {/* Decorative large number */}
        <div style={{ position: 'absolute', bottom: -40, right: -10, fontSize: 520, fontWeight: 900, color: c.accent, opacity: 0.05, lineHeight: 1, userSelect: 'none', pointerEvents: 'none' }}>{numStr}</div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 52, transform: `translateY(${translateY}px)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 38, height: 38, background: c.accent, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: c.bg2 }}>2D</div>
            <span style={{ color: c.dim, fontSize: 24, fontWeight: 700, letterSpacing: 0.5 }}>2days.kr</span>
          </div>
          <div style={{ background: c.accent, color: c.bg2, fontSize: 24, fontWeight: 900, padding: '8px 26px', borderRadius: 36 }}>{slideIndex + 1} / {totalSlides}</div>
        </div>

        {/* Number + Title */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, marginBottom: 28, transform: `translateY(${translateY}px)` }}>
          <div style={{ width: 80, height: 80, background: c.accent, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42, fontWeight: 900, color: c.bg2, flexShrink: 0, boxShadow: `0 8px 24px ${c.accent}44` }}>
            {slideIndex + 1}
          </div>
          <div>
            <div style={{ fontSize: 66, fontWeight: 900, color: c.text, lineHeight: 1.15, letterSpacing: -1 }}>{slide.title}</div>
            {slide.body && (
              <div style={{ fontSize: 30, color: c.sub, marginTop: 10, lineHeight: 1.5 }}>{slide.body}</div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 36, transform: `translateY(${translateY}px)` }}>
          <div style={{ width: 80, height: 4, background: c.accent, borderRadius: 2 }} />
          <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.08)' }} />
        </div>

        {/* Points — stagger in */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
          {displayPts.slice(0, 5).map((pt, i) => {
            const delay = 22 + i * 20;
            const ptOpacity = interpolate(frame, [delay, delay + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            const ptX = interpolate(frame, [delay, delay + 18], [-40, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            const hasEmoji = /\p{Emoji}/u.test(pt[0] ?? '');
            const emo = hasEmoji ? pt.slice(0, 2) : '▶';
            const txt = hasEmoji ? pt.slice(2).trim() : pt;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20, background: 'rgba(255,255,255,0.06)', borderRadius: 18, padding: '20px 28px', borderLeft: `4px solid ${c.accent}`, opacity: ptOpacity, transform: `translateX(${ptX}px)` }}>
                <div style={{ width: 52, height: 52, background: `${c.accent}22`, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0, border: `2px solid ${c.accent}55` }}>{emo}</div>
                <span style={{ fontSize: 36, color: c.text, fontWeight: 700, lineHeight: 1.5, flex: 1 }}>{txt}</span>
              </div>
            );
          })}
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 28 }}>
          {Array.from({ length: totalSlides }, (_, i) => (
            <div key={i} style={{ width: i === slideIndex ? 32 : 10, height: 10, borderRadius: 5, background: i === slideIndex ? c.accent : 'rgba(255,255,255,0.22)', transition: 'width 0.3s' }} />
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 14, background: c.accent }} />
    </div>
  );
}

export interface CardNewsSceneProps {
  slides: CardSlide[];
  theme: ThemeKey;
  bgmUrl?: string;
  durationInFrames: number;
}

export function CardNewsScene({ slides, theme = 'blue', bgmUrl }: CardNewsSceneProps) {
  const { width, height } = useVideoConfig();
  return (
    <div style={{ width, height, position: 'relative', overflow: 'hidden' }}>
      {bgmUrl && <Audio src={bgmUrl} volume={0.6} />}
      <Series>
        {(slides.length > 0 ? slides : [{ type: 'title' as const, title: '슬라이드를 생성하세요', body: '', points: [] }]).map((slide, i) => (
          <Series.Sequence key={i} durationInFrames={SLIDE_FRAMES}>
            <SingleSlide slide={slide} theme={theme} slideIndex={i} totalSlides={Math.max(1, slides.length)} />
          </Series.Sequence>
        ))}
      </Series>
    </div>
  );
}
