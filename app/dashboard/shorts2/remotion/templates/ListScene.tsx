'use client';

import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { Audio } from 'remotion';
import { WordSubtitle } from '../components/WordSubtitle';

export interface ListSceneProps {
  title: string;
  items: string[];
  bgColor?: string;
  accentColor?: string;
  emoji?: string;
  numbered?: boolean;
  audioSrc?: string;
  words?: { word: string; start: number; end: number }[];
  durationInFrames: number;
}

export function ListScene({
  title, items, bgColor = '#0f0f1a', accentColor = '#6C63FF',
  emoji = '📋', numbered = true, audioSrc, words = [], durationInFrames,
}: ListSceneProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // 아이템당 등장 프레임 계산
  const itemDelay = Math.max(8, Math.floor((durationInFrames * 0.6) / items.length));
  const titleSpring = spring({ fps, frame, config: { damping: 14 }, delay: 3 });

  return (
    <div style={{
      width, height, background: bgColor,
      display: 'flex', flexDirection: 'column',
      padding: '80px 64px', position: 'relative', overflow: 'hidden',
      fontFamily: '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
    }}>
      {/* 배경 장식 */}
      <div style={{
        position: 'absolute', top: -60, right: -60, width: 320, height: 320,
        borderRadius: '50%', background: `${accentColor}18`,
      }} />

      {/* 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20, marginBottom: 60,
        transform: `translateX(${interpolate(titleSpring, [0, 1], [-80, 0])}px)`,
        opacity: titleSpring,
      }}>
        <span style={{ fontSize: 72 }}>{emoji}</span>
        <div>
          <div style={{ fontSize: 54, fontWeight: 900, color: '#fff', lineHeight: 1.1, letterSpacing: -1 }}>
            {title}
          </div>
          <div style={{ width: 100, height: 4, background: accentColor, borderRadius: 2, marginTop: 10 }} />
        </div>
      </div>

      {/* 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, flex: 1 }}>
        {items.map((item, i) => {
          const delay = 15 + i * itemDelay;
          const itemSpring = spring({ fps, frame, config: { damping: 16, stiffness: 120 }, delay });
          const isVisible = frame > delay;

          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 20,
              transform: `translateX(${interpolate(itemSpring, [0, 1], [-100, 0])}px)`,
              opacity: isVisible ? itemSpring : 0,
            }}>
              {/* 번호/불릿 */}
              <div style={{
                minWidth: 52, height: 52, borderRadius: '50%',
                background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, fontWeight: 900, color: '#fff',
                boxShadow: `0 4px 16px ${accentColor}55`,
              }}>
                {numbered ? i + 1 : '•'}
              </div>
              {/* 텍스트 */}
              <div style={{
                flex: 1, fontSize: 40, fontWeight: 700, color: '#f0f0f0',
                lineHeight: 1.3, letterSpacing: -0.5,
              }}>
                {item}
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
