'use client';

import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { Audio } from 'remotion';
import { WordSubtitle } from '../components/WordSubtitle';

export interface TitleSceneProps {
  title: string;
  subtitle?: string;
  bgGradient?: [string, string];
  accentColor?: string;
  emoji?: string;
  audioSrc?: string;
  words?: { word: string; start: number; end: number }[];
  durationInFrames: number;
}

export function TitleScene({
  title, subtitle, bgGradient = ['#1a1a2e', '#16213e'],
  accentColor = '#6C63FF', emoji = '🎬', audioSrc, words = [],
}: TitleSceneProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const titleSpring = spring({ fps, frame, config: { damping: 14, stiffness: 100 }, delay: 5 });
  const subtitleOpacity = interpolate(frame, [20, 35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const emojiSpring = spring({ fps, frame, config: { damping: 8, stiffness: 80 }, delay: 0 });
  const lineWidth = interpolate(frame, [15, 45], [0, 220], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      width, height,
      background: `linear-gradient(160deg, ${bgGradient[0]}, ${bgGradient[1]})`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
      fontFamily: '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
    }}>
      {/* 배경 원형 장식 */}
      <div style={{
        position: 'absolute', width: 600, height: 600, borderRadius: '50%',
        background: `radial-gradient(circle, ${accentColor}22, transparent 70%)`,
        top: -100, right: -100,
      }} />
      <div style={{
        position: 'absolute', width: 400, height: 400, borderRadius: '50%',
        background: `radial-gradient(circle, ${accentColor}15, transparent 70%)`,
        bottom: -80, left: -80,
      }} />

      {/* 이모지 */}
      <div style={{
        fontSize: 120,
        transform: `scale(${emojiSpring}) rotate(${interpolate(emojiSpring, [0, 1], [-20, 0])}deg)`,
        marginBottom: 32,
        filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.5))',
      }}>
        {emoji}
      </div>

      {/* 타이틀 */}
      <div style={{
        fontSize: 72, fontWeight: 900, color: '#fff',
        textAlign: 'center', padding: '0 60px', lineHeight: 1.2,
        transform: `translateY(${interpolate(titleSpring, [0, 1], [60, 0])}px)`,
        opacity: titleSpring,
        textShadow: '0 4px 20px rgba(0,0,0,0.6)',
        letterSpacing: -2,
      }}>
        {title}
      </div>

      {/* 구분선 */}
      <div style={{
        width: lineWidth, height: 4, borderRadius: 2,
        background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88)`,
        margin: '28px auto',
      }} />

      {/* 서브타이틀 */}
      {subtitle && (
        <div style={{
          fontSize: 36, color: 'rgba(255,255,255,0.75)', textAlign: 'center',
          padding: '0 80px', opacity: subtitleOpacity, lineHeight: 1.5,
        }}>
          {subtitle}
        </div>
      )}

      {/* 오디오 */}
      {audioSrc && <Audio src={audioSrc} />}

      {/* 단어 자막 */}
      {words.length > 0 && <WordSubtitle words={words} />}
    </div>
  );
}
