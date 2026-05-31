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
  const size    = searchParams.get('size')    || 'blog';

  // 'blog' = 1200×628 (OGP 표준), 'square' = 1080×1080 (인스타그램)
  const W = size === 'square' ? 1080 : 1200;
  const H = size === 'square' ? 1080 : 628;
  const isBlog = size !== 'square';

  const t = THEMES[color] || THEMES.blue;

  let fontData: ArrayBuffer | undefined;
  try {
    const fontPath = join(process.cwd(), 'public', 'fonts', 'NotoSansKR-Bold.otf');
    fontData = readFileSync(fontPath).buffer as ArrayBuffer;
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
  // 1200×628: 제목 폰트 크기 — 최소 42px 보장
  const fontSizeBlog = len <= 8 ? 78 : len <= 14 ? 68 : len <= 20 ? 58 : len <= 28 ? 50 : len <= 36 ? 44 : 42;
  // 1080×1080: 최소 56px 보장
  const fontSizeSquare = len <= 8 ? 112 : len <= 14 ? 96 : len <= 20 ? 82 : len <= 28 ? 70 : len <= 36 ? 62 : 56;
  const fontSize = isBlog ? fontSizeBlog : fontSizeSquare;

  const fontOpts = {
    width: W, height: H,
    fonts: fontData ? [{ name: 'NotoSansKR', data: fontData, weight: 700 as const, style: 'normal' as const }] : [],
  };

  // ── 뉴스카드 디자인 (배경 이미지 있을 때) ─────────────────────────────
  if (bgUrl) {
    if (isBlog) {
      // 1200×628 뉴스카드
      return new ImageResponse(
        (
          <div style={{
            width: 1200, height: 628,
            display: 'flex', position: 'relative', overflow: 'hidden',
            background: '#111',
            fontFamily: fontData ? 'NotoSansKR' : 'sans-serif',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bgUrl} alt="" style={{
              position: 'absolute', inset: 0,
              width: 1200, height: 628,
              objectFit: 'cover', objectPosition: 'center top',
            }} />
            {/* 전체 어두운 오버레이 — 밝은 배경에서도 글씨 보이도록 */}
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              background: 'rgba(0,0,0,0.38)',
            }} />
            {/* 하단 강한 그라디언트 */}
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              background:
                'linear-gradient(to bottom,' +
                'rgba(0,0,0,0.0) 0%,' +
                'rgba(0,0,0,0.10) 25%,' +
                'rgba(0,0,0,0.50) 48%,' +
                'rgba(0,0,0,0.82) 62%,' +
                'rgba(0,0,0,0.95) 78%,' +
                'rgba(0,0,0,1.0) 100%)',
            }} />
            {keyword && (
              <div style={{ position: 'absolute', top: 36, left: 42, display: 'flex' }}>
                <div style={{
                  display: 'flex', alignItems: 'center',
                  background: t.accent,
                  borderRadius: 6, padding: '8px 22px',
                }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#000', letterSpacing: '0.02em', display: 'flex' }}>
                    {keyword}
                  </div>
                </div>
              </div>
            )}
            <div style={{
              position: 'absolute',
              bottom: 68, left: 0, right: 0,
              display: 'flex', flexDirection: 'column', gap: 12,
              padding: '20px 52px 16px',
              background: 'rgba(0,0,0,0.55)',
            }}>
              <div style={{
                fontSize, fontWeight: 900,
                color: 'white', lineHeight: 1.3,
                wordBreak: 'keep-all', display: 'flex', flexWrap: 'wrap',
                letterSpacing: '-0.025em',
                textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 30px rgba(0,0,0,0.7)',
              }}>
                {title}
              </div>
              {sub && (
                <div style={{
                  fontSize: 26, fontWeight: 700,
                  color: t.accent, letterSpacing: '-0.01em',
                  display: 'flex', flexWrap: 'wrap',
                  wordBreak: 'keep-all',
                  textShadow: `0 0 20px ${t.accent}80`,
                }}>
                  {sub}
                </div>
              )}
            </div>
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 52px', height: 60,
              background: 'rgba(0,0,0,0.80)',
              borderTop: `1px solid rgba(255,255,255,0.12)`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: t.accent, display: 'flex',
                  boxShadow: `0 0 12px ${t.accent}, 0 0 22px ${t.accent}80`,
                }} />
                <div style={{ fontSize: 20, fontWeight: 700, color: `${t.accent}ee`, letterSpacing: '0.08em', display: 'flex' }}>
                  {site || 'BLOG'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {[34, 20, 11, 5].map((w, i) => (
                  <div key={i} style={{
                    width: w, height: 3, borderRadius: 2,
                    background: `linear-gradient(90deg, ${t.accent}, ${t.accent2})`,
                    opacity: 1 - i * 0.22, display: 'flex',
                  }} />
                ))}
              </div>
            </div>
          </div>
        ),
        fontOpts,
      );
    }

    // 1080×1080 뉴스카드 (인스타그램)
    return new ImageResponse(
      (
        <div style={{
          width: 1080, height: 1080,
          display: 'flex', position: 'relative', overflow: 'hidden',
          background: '#111',
          fontFamily: fontData ? 'NotoSansKR' : 'sans-serif',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bgUrl} alt="" style={{
            position: 'absolute', inset: 0,
            width: 1080, height: 1080,
            objectFit: 'cover', objectPosition: 'center top',
          }} />
          {/* 전체 어두운 오버레이 */}
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            background: 'rgba(0,0,0,0.40)',
          }} />
          {/* 하단 강한 그라디언트 */}
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            background:
              'linear-gradient(to bottom,' +
              'rgba(0,0,0,0.0) 0%,' +
              'rgba(0,0,0,0.10) 25%,' +
              'rgba(0,0,0,0.55) 50%,' +
              'rgba(0,0,0,0.85) 65%,' +
              'rgba(0,0,0,0.97) 80%,' +
              'rgba(0,0,0,1.0) 100%)',
          }} />
          {keyword && (
            <div style={{ position: 'absolute', top: 52, left: 52, display: 'flex' }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                background: t.accent, borderRadius: 8, padding: '10px 28px',
              }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#000', letterSpacing: '0.02em', display: 'flex' }}>
                  {keyword}
                </div>
              </div>
            </div>
          )}
          <div style={{
            position: 'absolute', bottom: 86, left: 0, right: 0,
            display: 'flex', flexDirection: 'column', gap: 18,
            padding: '24px 64px 20px',
            background: 'rgba(0,0,0,0.55)',
          }}>
            <div style={{
              fontSize, fontWeight: 900,
              color: 'white', lineHeight: 1.3,
              wordBreak: 'keep-all', display: 'flex', flexWrap: 'wrap',
              letterSpacing: '-0.025em',
              textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 40px rgba(0,0,0,0.7)',
            }}>
              {title}
            </div>
            {sub && (
              <div style={{
                fontSize: 34, fontWeight: 700,
                color: t.accent, letterSpacing: '-0.01em',
                display: 'flex', flexWrap: 'wrap',
                wordBreak: 'keep-all',
                textShadow: `0 0 24px ${t.accent}80`,
              }}>
                {sub}
              </div>
            )}
          </div>
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 64px', height: 86,
            background: 'rgba(0,0,0,0.82)',
            borderTop: `1px solid rgba(255,255,255,0.12)`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 9, height: 9, borderRadius: '50%',
                background: t.accent, display: 'flex',
                boxShadow: `0 0 14px ${t.accent}, 0 0 28px ${t.accent}80`,
              }} />
              <div style={{ fontSize: 26, fontWeight: 700, color: `${t.accent}ee`, letterSpacing: '0.08em', display: 'flex' }}>
                {site || 'BLOG'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[44, 26, 14, 7].map((w, i) => (
                <div key={i} style={{
                  width: w, height: 3, borderRadius: 2,
                  background: `linear-gradient(90deg, ${t.accent}, ${t.accent2})`,
                  opacity: 1 - i * 0.22, display: 'flex',
                }} />
              ))}
            </div>
          </div>
        </div>
      ),
      fontOpts,
    );
  }

  // ── 그라디언트 디자인 (배경 이미지 없을 때) ──────────────────────────
  if (isBlog) {
    // 1200×628 그라디언트
    return new ImageResponse(
      (
        <div style={{
          width: 1200, height: 628,
          display: 'flex', flexDirection: 'column',
          background: `linear-gradient(148deg, ${t.g1} 0%, ${t.g2} 48%, ${t.g3} 100%)`,
          position: 'relative', overflow: 'hidden',
          fontFamily: fontData ? 'NotoSansKR' : 'sans-serif',
        }}>
          {/* 배경 장식 */}
          <div style={{
            position: 'absolute', top: -160, right: -160,
            width: 520, height: 520, borderRadius: '50%',
            border: `2px solid ${t.accent}22`, display: 'flex',
          }} />
          <div style={{
            position: 'absolute', top: -60, right: -60,
            width: 320, height: 320, borderRadius: '50%',
            border: `1px solid ${t.accent}18`, display: 'flex',
          }} />
          <div style={{
            position: 'absolute', bottom: -100, left: -100,
            width: 360, height: 360, borderRadius: '50%',
            border: `2px solid ${t.accent}18`, display: 'flex',
          }} />
          <div style={{
            position: 'absolute', top: -40, right: -20,
            width: 300, height: 300, borderRadius: '50%', display: 'flex',
            background: `radial-gradient(circle, ${t.dim} 0%, transparent 68%)`,
          }} />
          <div style={{
            position: 'absolute', bottom: -30, left: -30,
            width: 220, height: 220, borderRadius: '50%', display: 'flex',
            background: `radial-gradient(circle, ${t.dim} 0%, transparent 68%)`,
          }} />

          {/* 상단 액센트 스트립 */}
          <div style={{
            width: '100%', height: 12, flexShrink: 0, display: 'flex',
            background: `linear-gradient(90deg, ${t.accent} 0%, ${t.accent2} 55%, ${t.accent}30 100%)`,
          }} />

          {/* 코너 브래킷 - 좌상 */}
          <div style={{
            position: 'absolute', top: 40, left: 40,
            width: 38, height: 38, display: 'flex',
            borderTop: `3px solid ${t.accent}65`,
            borderLeft: `3px solid ${t.accent}65`,
          }} />
          {/* 코너 브래킷 - 우하 */}
          <div style={{
            position: 'absolute', bottom: 74, right: 40,
            width: 38, height: 38, display: 'flex',
            borderBottom: `3px solid ${t.accent}65`,
            borderRight: `3px solid ${t.accent}65`,
          }} />

          {/* 우측 수직 도트 */}
          <div style={{
            position: 'absolute', right: 52, top: '50%',
            display: 'flex', flexDirection: 'column', gap: 12,
            transform: 'translateY(-50%)',
          }}>
            {[1, 0.6, 0.35, 0.15].map((o, i) => (
              <div key={i} style={{
                width: 5, height: 5, borderRadius: '50%',
                background: t.accent, opacity: o, display: 'flex',
              }} />
            ))}
          </div>

          {/* 메인 콘텐츠 */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            justifyContent: 'center',
            padding: '24px 100px 20px 68px',
            gap: 22,
          }}>
            {keyword && (
              <div style={{ display: 'flex' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: `linear-gradient(135deg, ${t.accent}22, ${t.accent}0a)`,
                  border: `1.5px solid ${t.accent}70`,
                  borderRadius: 100, padding: '9px 26px',
                  boxShadow: `0 0 24px ${t.accent}28, inset 0 1px 0 rgba(255,255,255,0.08)`,
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: t.accent, display: 'flex',
                    boxShadow: `0 0 10px ${t.accent}, 0 0 20px ${t.accent}90`,
                  }} />
                  <div style={{ fontSize: 24, fontWeight: 800, color: t.accent, letterSpacing: '0.05em', display: 'flex' }}>
                    {keyword}
                  </div>
                </div>
              </div>
            )}

            {/* 구분선 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 54, height: 4, background: t.accent, borderRadius: 2, display: 'flex' }} />
              <div style={{ width: 16, height: 4, background: `${t.accent}70`, borderRadius: 2, display: 'flex' }} />
              <div style={{ width: 8, height: 4, background: `${t.accent}38`, borderRadius: 2, display: 'flex' }} />
            </div>

            {/* 제목 */}
            <div style={{
              fontSize, fontWeight: 900,
              color: 'white', lineHeight: 1.28,
              wordBreak: 'keep-all', display: 'flex', flexWrap: 'wrap',
              textShadow: `0 0 60px rgba(0,0,0,0.9), 0 4px 24px rgba(0,0,0,0.75)`,
              letterSpacing: '-0.02em',
            }}>
              {title}
            </div>

            {sub && (
              <div style={{
                fontSize: 24, color: 'rgba(255,255,255,0.58)',
                lineHeight: 1.5, display: 'flex', flexWrap: 'wrap',
                wordBreak: 'keep-all', letterSpacing: '-0.01em',
              }}>
                {sub}
              </div>
            )}
          </div>

          {/* 하단 바 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 68px', height: 66, flexShrink: 0,
            background: 'rgba(0,0,0,0.52)',
            borderTop: `1px solid rgba(255,255,255,0.07)`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: t.accent, display: 'flex',
                boxShadow: `0 0 14px ${t.accent}, 0 0 28px ${t.accent}80`,
              }} />
              <div style={{ fontSize: 22, fontWeight: 700, color: `${t.accent}dd`, letterSpacing: '0.1em', display: 'flex' }}>
                {site || 'BLOG'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[36, 22, 12, 6].map((w, i) => (
                <div key={i} style={{
                  width: w, height: 3, borderRadius: 2,
                  background: `linear-gradient(90deg, ${t.accent}, ${t.accent2})`,
                  opacity: 1 - i * 0.2, display: 'flex',
                }} />
              ))}
            </div>
          </div>
        </div>
      ),
      fontOpts,
    );
  }

  // 1080×1080 그라디언트 (기존 디자인)
  return new ImageResponse(
    (
      <div style={{
        width: 1080, height: 1080,
        display: 'flex', flexDirection: 'column',
        background: `linear-gradient(148deg, ${t.g1} 0%, ${t.g2} 48%, ${t.g3} 100%)`,
        position: 'relative', overflow: 'hidden',
        fontFamily: fontData ? 'NotoSansKR' : 'sans-serif',
      }}>
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
        <div style={{
          position: 'absolute', bottom: -160, left: -160,
          width: 520, height: 520, borderRadius: '50%',
          border: `2px solid ${t.accent}18`, display: 'flex',
        }} />
        <div style={{
          position: 'absolute', top: -80, right: -40,
          width: 460, height: 460, borderRadius: '50%', display: 'flex',
          background: `radial-gradient(circle, ${t.dim} 0%, transparent 68%)`,
        }} />
        <div style={{
          position: 'absolute', bottom: -60, left: -60,
          width: 340, height: 340, borderRadius: '50%', display: 'flex',
          background: `radial-gradient(circle, ${t.dim} 0%, transparent 68%)`,
        }} />
        <div style={{
          width: '100%', height: 16, flexShrink: 0, display: 'flex',
          background: `linear-gradient(90deg, ${t.accent} 0%, ${t.accent2} 55%, ${t.accent}30 100%)`,
        }} />
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
        <div style={{
          position: 'absolute', top: 56, left: 56,
          width: 52, height: 52, display: 'flex',
          borderTop: `3px solid ${t.accent}65`,
          borderLeft: `3px solid ${t.accent}65`,
        }} />
        <div style={{
          position: 'absolute', bottom: 108, right: 56,
          width: 52, height: 52, display: 'flex',
          borderBottom: `3px solid ${t.accent}65`,
          borderRight: `3px solid ${t.accent}65`,
        }} />
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
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          justifyContent: 'center',
          padding: '48px 120px 40px 84px',
          gap: 36,
        }}>
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
                <div style={{ fontSize: 32, fontWeight: 800, color: t.accent, letterSpacing: '0.05em', display: 'flex' }}>
                  {keyword}
                </div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 72, height: 5, background: t.accent, borderRadius: 3, display: 'flex' }} />
            <div style={{ width: 22, height: 5, background: `${t.accent}70`, borderRadius: 3, display: 'flex' }} />
            <div style={{ width: 10, height: 5, background: `${t.accent}38`, borderRadius: 3, display: 'flex' }} />
          </div>
          <div style={{
            fontSize, fontWeight: 900,
            color: 'white', lineHeight: 1.28,
            wordBreak: 'keep-all', display: 'flex', flexWrap: 'wrap',
            textShadow: `0 0 60px rgba(0,0,0,0.9), 0 4px 24px rgba(0,0,0,0.75), 0 1px 2px rgba(0,0,0,0.5)`,
            letterSpacing: '-0.02em',
          }}>
            {title}
          </div>
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
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 80px', height: 90, flexShrink: 0,
          background: 'rgba(0,0,0,0.52)',
          borderTop: `1px solid rgba(255,255,255,0.07)`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: t.accent, display: 'flex',
              boxShadow: `0 0 18px ${t.accent}, 0 0 36px ${t.accent}80`,
            }} />
            <div style={{ fontSize: 27, fontWeight: 700, color: `${t.accent}dd`, letterSpacing: '0.1em', display: 'flex' }}>
              {site || 'BLOG'}
            </div>
          </div>
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
    fontOpts,
  );
}
