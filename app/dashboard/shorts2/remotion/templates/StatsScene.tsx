'use client';

import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { Audio } from 'remotion';
import { WordSubtitle } from '../components/WordSubtitle';

export interface StatItem { label: string; value: string; unit?: string; icon?: string; trend?: 'up' | 'down' | 'neutral' }
export interface StatsSceneProps {
  title: string;
  stats: StatItem[];
  bgColor?: string;
  accentColor?: string;
  audioSrc?: string;
  words?: { word: string; start: number; end: number }[];
  durationInFrames: number;
}

export function StatsScene({
  title, stats, bgColor = '#0a0a1a', accentColor = '#00D2FF',
  audioSrc, words = [], durationInFrames,
}: StatsSceneProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cols = stats.length <= 2 ? 1 : 2;

  return (
    <div style={{
      width, height, background: bgColor,
      display: 'flex', flexDirection: 'column',
      padding: '80px 60px', position: 'relative', overflow: 'hidden',
      fontFamily: '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 6,
        background: `linear-gradient(90deg, ${accentColor}, ${accentColor}44)`,
      }} />

      <div style={{ fontSize: 52, fontWeight: 900, color: '#fff', marginBottom: 48, opacity: titleOpacity, letterSpacing: -1 }}>
        📊 {title}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 28, flex: 1,
      }}>
        {stats.map((stat, i) => {
          const delay = 15 + i * 12;
          const cardSpring = spring({ fps, frame, config: { damping: 18 }, delay });
          const numericVal = parseFloat(stat.value.replace(/[^0-9.]/g, ''));
          const animatedNum = isNaN(numericVal)
            ? stat.value
            : interpolate(frame, [delay, delay + 30], [0, numericVal], {
                extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
              }).toFixed(stat.value.includes('.') ? 1 : 0);

          const trendColor = stat.trend === 'up' ? '#00E676' : stat.trend === 'down' ? '#FF5252' : accentColor;
          const trendIcon = stat.trend === 'up' ? '↑' : stat.trend === 'down' ? '↓' : '';

          return (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${accentColor}33`,
              borderRadius: 24, padding: '36px 32px',
              transform: `scale(${cardSpring}) translateY(${interpolate(cardSpring, [0, 1], [30, 0])}px)`,
              opacity: cardSpring,
              boxShadow: `0 8px 32px ${accentColor}22`,
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>{stat.icon ?? '📈'}</div>
              <div style={{ fontSize: 72, fontWeight: 900, color: trendColor, lineHeight: 1, letterSpacing: -2 }}>
                {isNaN(numericVal) ? stat.value : animatedNum}{stat.unit ?? ''} {trendIcon && <span style={{ fontSize: 40 }}>{trendIcon}</span>}
              </div>
              <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.65)', marginTop: 12, lineHeight: 1.3 }}>
                {stat.label}
              </div>
            </div>
          );
        })}
      </div>

      {audioSrc && <Audio src={audioSrc} />}
      {words.length > 0 && <WordSubtitle words={words} />}
    </div>
  );
}
