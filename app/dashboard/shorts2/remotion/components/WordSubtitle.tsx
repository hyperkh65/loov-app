'use client';

import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

interface Word {
  word: string;
  start: number; // ms
  end: number;   // ms
}

interface Props {
  words: Word[];
  style?: {
    position: 'top' | 'bottom';
    color: string;
    highlightColor: string;
    bgColor: string;
    fontSize: number;
    bold: boolean;
  };
}

export function WordSubtitle({ words, style }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;

  const s = style ?? {
    position: 'bottom',
    color: '#ffffff',
    highlightColor: '#FFD700',
    bgColor: 'rgba(0,0,0,0.65)',
    fontSize: 42,
    bold: true,
  };

  if (!words.length) return null;

  // 현재 시간 기준 표시할 단어 그룹 (±1.5초 창)
  const WINDOW = 1500; // ms
  const visible = words.filter(w => w.start <= currentMs + WINDOW && w.end >= currentMs - 300);
  if (!visible.length) return null;

  const posStyle: React.CSSProperties =
    s.position === 'bottom'
      ? { bottom: 120, left: 0, right: 0 }
      : { top: 80, left: 0, right: 0 };

  return (
    <div style={{
      position: 'absolute', ...posStyle,
      display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
      gap: 6, padding: '0 40px',
    }}>
      {visible.map((w, i) => {
        const isActive = currentMs >= w.start && currentMs <= w.end;
        const isPast = currentMs > w.end;

        // 단어별 페이드인 애니메이션
        const opacity = interpolate(currentMs, [w.start - 50, w.start + 80], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        });

        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              backgroundColor: isActive ? s.highlightColor : s.bgColor,
              color: isActive ? '#000' : s.color,
              fontSize: s.fontSize,
              fontWeight: s.bold ? 900 : 700,
              fontFamily: '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
              padding: '4px 12px',
              borderRadius: 8,
              opacity: isPast ? 0.5 : opacity,
              transform: isActive ? 'scale(1.08)' : 'scale(1)',
              transition: 'all 0.1s',
              letterSpacing: -0.5,
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
}
