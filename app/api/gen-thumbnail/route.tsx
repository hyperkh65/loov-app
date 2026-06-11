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
    g1: '#000918', g2: '#001040', g3: '#001a70',
    accent: '#2563eb', accent2: '#93c5fd', dim: 'rgba(37,99,235,0.22)',
  },
  dark: {
    g1: '#05010e', g2: '#10042a', g3: '#1c0748',
    accent: '#c084fc', accent2: '#e879f9', dim: 'rgba(192,132,252,0.18)',
  },
  green: {
    g1: '#000e06', g2: '#002a14', g3: '#003d22',
    accent: '#10b981', accent2: '#6ee7b7', dim: 'rgba(16,185,129,0.2)',
  },
  red: {
    g1: '#120002', g2: '#320006', g3: '#520010',
    accent: '#ef4444', accent2: '#fca5a5', dim: 'rgba(239,68,68,0.18)',
  },
  orange: {
    g1: '#100500', g2: '#2c1000', g3: '#4a1c00',
    accent: '#f97316', accent2: '#fdba74', dim: 'rgba(249,115,22,0.18)',
  },
  violet: {
    g1: '#06000e', g2: '#140028', g3: '#220048',
    accent: '#7c3aed', accent2: '#c4b5fd', dim: 'rgba(124,58,237,0.18)',
  },
  teal: {
    g1: '#000d10', g2: '#002838', g3: '#004258',
    accent: '#0891b2', accent2: '#67e8f9', dim: 'rgba(8,145,178,0.2)',
  },
  golden: {
    g1: '#0c0700', g2: '#281600', g3: '#422400',
    accent: '#d97706', accent2: '#fde68a', dim: 'rgba(217,119,6,0.18)',
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

  const W = 1200;
  const H = size === 'square' ? 1200 : 628;
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

  const fontOpts = {
    width: W, height: H,
    fonts: fontData ? [{ name: 'NotoSansKR', data: fontData, weight: 700 as const, style: 'normal' as const }] : [],
  };

  // ── 풀블리드 매거진 디자인 (배경 이미지 있을 때) ────────────────────────
  if (bgUrl) {
    if (isBlog) {
      // 1200×628 — 글자 크게, 전문 뉴스 스타일
      const fs = len <= 12 ? 84 : len <= 20 ? 72 : len <= 28 ? 62 : len <= 36 ? 54 : 48;

      return new ImageResponse(
        (
          <div style={{
            width: 1200, height: 628,
            display: 'flex',
            position: 'relative', overflow: 'hidden',
            fontFamily: fontData ? 'NotoSansKR' : 'sans-serif',
          }}>
            {/* 풀블리드 배경 이미지 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bgUrl} alt="" style={{
              position: 'absolute', inset: 0,
              width: 1200, height: 628,
              objectFit: 'cover', objectPosition: 'center 30%',
            }} />

            {/* 강력한 그라디언트 오버레이 — 텍스트 가독성 최대화 */}
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.18) 28%, rgba(0,0,0,0.70) 50%, rgba(0,0,0,0.94) 72%, rgba(0,0,0,0.99) 100%)',
            }} />

            {/* 좌측 컬러 틴트 */}
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              background: `linear-gradient(to right, ${t.accent}28 0%, transparent 50%)`,
            }} />

            {/* 상단 두꺼운 액센트 바 */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 14, display: 'flex',
              background: `linear-gradient(90deg, ${t.accent} 0%, ${t.accent2} 50%, ${t.accent}55 100%)`,
            }} />

            {/* 좌측 수직 스트라이프 — 뉴스 스타일 */}
            <div style={{
              position: 'absolute', top: 14, left: 0, bottom: 0, width: 7, display: 'flex',
              background: `linear-gradient(to bottom, ${t.accent}ee 0%, ${t.accent}55 60%, transparent 100%)`,
            }} />

            {/* 키워드 배지 */}
            {keyword && (
              <div style={{ position: 'absolute', top: 24, left: 20, display: 'flex' }}>
                <div style={{
                  display: 'flex', alignItems: 'center',
                  background: t.accent, borderRadius: 5, padding: '9px 22px',
                  boxShadow: `0 4px 20px rgba(0,0,0,0.7), 0 0 28px ${t.accent}55`,
                }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: '0.01em', display: 'flex' }}>
                    {keyword}
                  </div>
                </div>
              </div>
            )}

            {/* 하단 텍스트 블록 */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              display: 'flex', flexDirection: 'column',
              padding: '0 52px 38px 20px',
              gap: 14,
            }}>
              {/* 구분 바 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 64, height: 5, background: t.accent, borderRadius: 3, display: 'flex' }} />
                <div style={{ width: 20, height: 5, background: `${t.accent}70`, borderRadius: 3, display: 'flex' }} />
                <div style={{ width: 10, height: 5, background: `${t.accent}38`, borderRadius: 3, display: 'flex' }} />
              </div>

              {/* 메인 제목 — 크고 강한 그림자 */}
              <div style={{
                fontSize: fs, fontWeight: 900,
                color: 'white', lineHeight: 1.22,
                wordBreak: 'keep-all', display: 'flex', flexWrap: 'wrap', width: '100%',
                textShadow: '0 2px 10px rgba(0,0,0,1), 0 5px 30px rgba(0,0,0,0.98), 3px 3px 0 rgba(0,0,0,0.9)',
                letterSpacing: '-0.028em',
              }}>
                {title}
              </div>

              {/* 서브 제목 — 더 크고 선명하게 */}
              {sub && (
                <div style={{
                  fontSize: 34, fontWeight: 700,
                  color: t.accent2, letterSpacing: '-0.01em',
                  display: 'flex', flexWrap: 'wrap', wordBreak: 'keep-all',
                  textShadow: '0 2px 12px rgba(0,0,0,1)',
                }}>
                  {sub}
                </div>
              )}

              {/* 뉴스 스타일 푸터 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: `${t.accent}28`, border: `1.5px solid ${t.accent}60`,
                  borderRadius: 4, padding: '5px 14px',
                }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: t.accent, display: 'flex',
                    boxShadow: `0 0 8px ${t.accent}, 0 0 16px ${t.accent}80`,
                  }} />
                  <div style={{ fontSize: 18, fontWeight: 800, color: t.accent2, letterSpacing: '0.08em', display: 'flex' }}>
                    {site || 'NEWS'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {[44, 26, 14, 7].map((w, i) => (
                    <div key={i} style={{
                      width: w, height: 3, borderRadius: 2,
                      background: `linear-gradient(90deg,${t.accent},${t.accent2})`,
                      opacity: 1 - i * 0.22, display: 'flex',
                    }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ),
        fontOpts,
      );
    }

    // 1200×1200 풀블리드 매거진
    const fsSq = len <= 8 ? 128 : len <= 14 ? 110 : len <= 20 ? 96 : len <= 28 ? 84 : len <= 36 ? 74 : 66;

    return new ImageResponse(
      (
        <div style={{
          width: 1200, height: 1200,
          display: 'flex',
          position: 'relative', overflow: 'hidden',
          fontFamily: fontData ? 'NotoSansKR' : 'sans-serif',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bgUrl} alt="" style={{
            position: 'absolute', inset: 0,
            width: 1200, height: 1200,
            objectFit: 'cover', objectPosition: 'center 25%',
          }} />

          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.15) 25%, rgba(0,0,0,0.65) 48%, rgba(0,0,0,0.93) 68%, rgba(0,0,0,0.99) 100%)',
          }} />

          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            background: `linear-gradient(to right, ${t.accent}28 0%, transparent 50%)`,
          }} />

          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 18, display: 'flex',
            background: `linear-gradient(90deg, ${t.accent} 0%, ${t.accent2} 50%, ${t.accent}55 100%)`,
          }} />

          <div style={{
            position: 'absolute', top: 18, left: 0, bottom: 0, width: 10, display: 'flex',
            background: `linear-gradient(to bottom, ${t.accent}ee 0%, ${t.accent}55 60%, transparent 100%)`,
          }} />

          {keyword && (
            <div style={{ position: 'absolute', top: 34, left: 24, display: 'flex' }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                background: t.accent, borderRadius: 6, padding: '14px 32px',
                boxShadow: `0 4px 28px rgba(0,0,0,0.75), 0 0 36px ${t.accent}55`,
              }}>
                <div style={{ fontSize: 34, fontWeight: 900, color: '#fff', letterSpacing: '0.01em', display: 'flex' }}>
                  {keyword}
                </div>
              </div>
            </div>
          )}

          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            display: 'flex', flexDirection: 'column',
            padding: '0 64px 64px 24px',
            gap: 22,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 88, height: 6, background: t.accent, borderRadius: 3, display: 'flex' }} />
              <div style={{ width: 28, height: 6, background: `${t.accent}70`, borderRadius: 3, display: 'flex' }} />
              <div style={{ width: 14, height: 6, background: `${t.accent}38`, borderRadius: 3, display: 'flex' }} />
            </div>

            <div style={{
              fontSize: fsSq, fontWeight: 900,
              color: 'white', lineHeight: 1.24,
              wordBreak: 'keep-all', display: 'flex', flexWrap: 'wrap', width: '100%',
              textShadow: '0 2px 10px rgba(0,0,0,1), 0 6px 36px rgba(0,0,0,0.98), 4px 4px 0 rgba(0,0,0,0.9)',
              letterSpacing: '-0.03em',
            }}>
              {title}
            </div>

            {sub && (
              <div style={{
                fontSize: 46, fontWeight: 700,
                color: t.accent2, letterSpacing: '-0.01em',
                display: 'flex', flexWrap: 'wrap', wordBreak: 'keep-all',
                textShadow: '0 2px 12px rgba(0,0,0,1)',
              }}>
                {sub}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                background: `${t.accent}28`, border: `1.5px solid ${t.accent}60`,
                borderRadius: 5, padding: '7px 18px',
              }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: t.accent, display: 'flex',
                  boxShadow: `0 0 12px ${t.accent}, 0 0 24px ${t.accent}80`,
                }} />
                <div style={{ fontSize: 24, fontWeight: 800, color: t.accent2, letterSpacing: '0.08em', display: 'flex' }}>
                  {site || 'NEWS'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {[56, 34, 18, 9].map((w, i) => (
                  <div key={i} style={{
                    width: w, height: 4, borderRadius: 2,
                    background: `linear-gradient(90deg, ${t.accent}, ${t.accent2})`,
                    opacity: 1 - i * 0.22, display: 'flex',
                  }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      ),
      fontOpts,
    );
  }

  // ── 그라디언트 디자인 (배경 이미지 없을 때) ──────────────────────────
  const fontSize = isBlog
    ? (len <= 8 ? 88 : len <= 14 ? 76 : len <= 20 ? 66 : len <= 28 ? 56 : len <= 36 ? 50 : 46)
    : (len <= 8 ? 136 : len <= 14 ? 116 : len <= 20 ? 100 : len <= 28 ? 86 : len <= 36 ? 74 : 64);

  if (isBlog) {
    return new ImageResponse(
      (
        <div style={{
          width: 1200, height: 628,
          display: 'flex', flexDirection: 'column',
          background: `linear-gradient(148deg, ${t.g1} 0%, ${t.g2} 48%, ${t.g3} 100%)`,
          position: 'relative', overflow: 'hidden',
          fontFamily: fontData ? 'NotoSansKR' : 'sans-serif',
        }}>
          {/* 장식 원형들 */}
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

          {/* 상단 액센트 바 */}
          <div style={{
            width: '100%', height: 14, flexShrink: 0, display: 'flex',
            background: `linear-gradient(90deg, ${t.accent} 0%, ${t.accent2} 55%, ${t.accent}30 100%)`,
          }} />

          {/* 좌측 수직 스트라이프 */}
          <div style={{
            position: 'absolute', top: 14, left: 0, bottom: 0, width: 6, display: 'flex',
            background: `linear-gradient(to bottom, ${t.accent}bb, transparent)`,
          }} />

          {/* 코너 장식 */}
          <div style={{
            position: 'absolute', top: 40, left: 20,
            width: 36, height: 36, display: 'flex',
            borderTop: `3px solid ${t.accent}65`, borderLeft: `3px solid ${t.accent}65`,
          }} />
          <div style={{
            position: 'absolute', bottom: 74, right: 40,
            width: 36, height: 36, display: 'flex',
            borderBottom: `3px solid ${t.accent}65`, borderRight: `3px solid ${t.accent}65`,
          }} />

          {/* 우측 도트 */}
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

          {/* 콘텐츠 영역 */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            justifyContent: 'center',
            padding: '24px 100px 20px 24px',
            gap: 20,
          }}>
            {keyword && (
              <div style={{ display: 'flex' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: `linear-gradient(135deg, ${t.accent}28, ${t.accent}0e)`,
                  border: `1.5px solid ${t.accent}70`,
                  borderRadius: 100, padding: '9px 26px',
                  boxShadow: `0 0 24px ${t.accent}28`,
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: t.accent, display: 'flex',
                    boxShadow: `0 0 10px ${t.accent}, 0 0 20px ${t.accent}90`,
                  }} />
                  <div style={{ fontSize: 26, fontWeight: 800, color: t.accent2, letterSpacing: '0.04em', display: 'flex' }}>
                    {keyword}
                  </div>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 56, height: 5, background: t.accent, borderRadius: 3, display: 'flex' }} />
              <div style={{ width: 18, height: 5, background: `${t.accent}70`, borderRadius: 3, display: 'flex' }} />
              <div style={{ width: 8, height: 5, background: `${t.accent}38`, borderRadius: 3, display: 'flex' }} />
            </div>
            <div style={{
              fontSize, fontWeight: 900,
              color: 'white', lineHeight: 1.25,
              wordBreak: 'keep-all', display: 'flex', flexWrap: 'wrap', width: '100%',
              textShadow: `0 0 60px rgba(0,0,0,0.9), 0 4px 24px rgba(0,0,0,0.75)`,
              letterSpacing: '-0.025em',
            }}>
              {title}
            </div>
            {sub && (
              <div style={{
                fontSize: 32, color: t.accent2,
                lineHeight: 1.4, display: 'flex', flexWrap: 'wrap',
                wordBreak: 'keep-all', letterSpacing: '-0.01em', fontWeight: 700,
              }}>
                {sub}
              </div>
            )}
          </div>

          {/* 하단 바 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 68px', height: 64, flexShrink: 0,
            background: 'rgba(0,0,0,0.52)',
            borderTop: `1px solid rgba(255,255,255,0.07)`,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: `${t.accent}22`, border: `1px solid ${t.accent}55`,
              borderRadius: 4, padding: '4px 14px',
            }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: t.accent, display: 'flex',
                boxShadow: `0 0 10px ${t.accent}, 0 0 20px ${t.accent}80`,
              }} />
              <div style={{ fontSize: 20, fontWeight: 800, color: t.accent2, letterSpacing: '0.08em', display: 'flex' }}>
                {site || 'NEWS'}
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

  // 1200×1200 그라디언트
  return new ImageResponse(
    (
      <div style={{
        width: 1200, height: 1200,
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
          width: '100%', height: 18, flexShrink: 0, display: 'flex',
          background: `linear-gradient(90deg, ${t.accent} 0%, ${t.accent2} 55%, ${t.accent}30 100%)`,
        }} />

        <div style={{
          position: 'absolute', top: 18, left: 0, bottom: 0, width: 8, display: 'flex',
          background: `linear-gradient(to bottom, ${t.accent}bb, transparent)`,
        }} />

        <div style={{
          position: 'absolute', top: 56, left: 24,
          width: 50, height: 50, display: 'flex',
          borderTop: `3px solid ${t.accent}65`, borderLeft: `3px solid ${t.accent}65`,
        }} />
        <div style={{
          position: 'absolute', bottom: 108, right: 56,
          width: 50, height: 50, display: 'flex',
          borderBottom: `3px solid ${t.accent}65`, borderRight: `3px solid ${t.accent}65`,
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
          padding: '48px 120px 40px 30px',
          gap: 34,
        }}>
          {keyword && (
            <div style={{ display: 'flex' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                background: `linear-gradient(135deg, ${t.accent}28, ${t.accent}0e)`,
                border: `1.5px solid ${t.accent}70`,
                borderRadius: 100, padding: '13px 36px',
                boxShadow: `0 0 32px ${t.accent}28`,
              }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: t.accent, display: 'flex',
                  boxShadow: `0 0 14px ${t.accent}, 0 0 28px ${t.accent}90`,
                }} />
                <div style={{ fontSize: 34, fontWeight: 800, color: t.accent2, letterSpacing: '0.04em', display: 'flex' }}>
                  {keyword}
                </div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 76, height: 6, background: t.accent, borderRadius: 3, display: 'flex' }} />
            <div style={{ width: 24, height: 6, background: `${t.accent}70`, borderRadius: 3, display: 'flex' }} />
            <div style={{ width: 12, height: 6, background: `${t.accent}38`, borderRadius: 3, display: 'flex' }} />
          </div>
          <div style={{
            fontSize, fontWeight: 900,
            color: 'white', lineHeight: 1.25,
            wordBreak: 'keep-all', display: 'flex', flexWrap: 'wrap', width: '100%',
            textShadow: `0 0 60px rgba(0,0,0,0.9), 0 4px 24px rgba(0,0,0,0.75)`,
            letterSpacing: '-0.025em',
          }}>
            {title}
          </div>
          {sub && (
            <div style={{
              fontSize: 40, color: t.accent2,
              lineHeight: 1.4, display: 'flex', flexWrap: 'wrap',
              wordBreak: 'keep-all', letterSpacing: '-0.01em', fontWeight: 700,
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
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            background: `${t.accent}22`, border: `1px solid ${t.accent}55`,
            borderRadius: 5, padding: '5px 18px',
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: t.accent, display: 'flex',
              boxShadow: `0 0 14px ${t.accent}, 0 0 28px ${t.accent}80`,
            }} />
            <div style={{ fontSize: 26, fontWeight: 800, color: t.accent2, letterSpacing: '0.08em', display: 'flex' }}>
              {site || 'NEWS'}
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
