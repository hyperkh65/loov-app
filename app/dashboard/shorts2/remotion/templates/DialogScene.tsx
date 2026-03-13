'use client';

import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { Audio } from 'remotion';
import { WordSubtitle } from '../components/WordSubtitle';

export interface DialogLine { speaker: 'A' | 'B'; text: string; emoji?: string }
export interface DialogSceneProps {
  title?: string;
  lines: DialogLine[];
  speakerA: { name: string; emoji: string; color: string };
  speakerB: { name: string; emoji: string; color: string };
  bgColor?: string;
  audioSrc?: string;
  words?: { word: string; start: number; end: number }[];
  durationInFrames: number;
}

export function DialogScene({
  title, lines, speakerA, speakerB, bgColor = '#13111C',
  audioSrc, words = [], durationInFrames,
}: DialogSceneProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const lineDelay = Math.max(12, Math.floor((durationInFrames * 0.75) / lines.length));
  const titleOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      width, height, background: bgColor,
      display: 'flex', flexDirection: 'column',
      padding: '60px 52px', position: 'relative', overflow: 'hidden',
      fontFamily: '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
    }}>
      {title && (
        <div style={{ fontSize: 44, fontWeight: 900, color: '#fff', marginBottom: 36, opacity: titleOpacity, letterSpacing: -1 }}>
          💬 {title}
        </div>
      )}

      {/* 스피커 정보 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32 }}>
        {[speakerA, speakerB].map((sp, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: 0.75 }}>
            <span style={{ fontSize: 36 }}>{sp.emoji}</span>
            <span style={{ fontSize: 26, fontWeight: 700, color: sp.color }}>{sp.name}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1, overflowY: 'hidden' }}>
        {lines.map((line, i) => {
          const delay = 10 + i * lineDelay;
          const sp = spring({ fps, frame, config: { damping: 18, stiffness: 130 }, delay });
          const isA = line.speaker === 'A';
          const speaker = isA ? speakerA : speakerB;

          return (
            <div key={i} style={{
              display: 'flex', flexDirection: isA ? 'row' : 'row-reverse',
              alignItems: 'flex-end', gap: 14,
              transform: `translateX(${interpolate(sp, [0, 1], [isA ? -60 : 60, 0])}px)`,
              opacity: sp,
            }}>
              {/* 아바타 */}
              <div style={{
                width: 60, height: 60, borderRadius: '50%', flexShrink: 0,
                background: `${speaker.color}33`,
                border: `2px solid ${speaker.color}66`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 32,
              }}>
                {speaker.emoji}
              </div>

              {/* 말풍선 */}
              <div style={{
                maxWidth: '75%',
                background: isA ? `${speakerA.color}22` : `${speakerB.color}22`,
                border: `1.5px solid ${speaker.color}55`,
                borderRadius: isA ? '20px 20px 20px 4px' : '20px 20px 4px 20px',
                padding: '16px 22px',
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: speaker.color, marginBottom: 6 }}>{speaker.name}</div>
                <div style={{ fontSize: 34, color: '#f0f0f0', lineHeight: 1.4 }}>{line.text}</div>
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
