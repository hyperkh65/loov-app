'use client';

import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { Audio } from 'remotion';
import { WordSubtitle } from '../components/WordSubtitle';

export interface CardSceneProps {
  title: string;
  body: string;
  imageUrl?: string;
  tag?: string;
  bgColor?: string;
  accentColor?: string;
  emoji?: string;
  audioSrc?: string;
  words?: { word: string; start: number; end: number }[];
  durationInFrames: number;
}

export function CardScene({
  title, body, imageUrl, tag, bgColor = '#111827', accentColor = '#F59E0B',
  emoji, audioSrc, words = [],
}: CardSceneProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const cardSpring = spring({ fps, frame, config: { damping: 14, stiffness: 90 }, delay: 5 });
  const bodyOpacity = interpolate(frame, [25, 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      width, height, background: bgColor,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '60px 48px', position: 'relative', overflow: 'hidden',
      fontFamily: '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
    }}>
      {/* 배경 블러 이미지 */}
      {imageUrl && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          filter: 'blur(20px) brightness(0.3)',
        }} />
      )}

      {/* 카드 */}
      <div style={{
        width: '100%', maxWidth: 860,
        background: 'rgba(255,255,255,0.08)',
        backdropFilter: 'blur(20px)',
        border: `2px solid ${accentColor}55`,
        borderRadius: 32, overflow: 'hidden',
        transform: `scale(${cardSpring}) translateY(${interpolate(cardSpring, [0, 1], [80, 0])}px)`,
        opacity: cardSpring,
        boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px ${accentColor}22`,
        position: 'relative',
      }}>
        {/* 이미지 영역 */}
        {imageUrl && (
          <div style={{ height: 300, overflow: 'hidden' }}>
            <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        <div style={{ padding: '40px 48px' }}>
          {/* 태그 */}
          {tag && (
            <div style={{
              display: 'inline-block',
              background: `${accentColor}33`, color: accentColor,
              fontSize: 26, fontWeight: 700, padding: '6px 20px',
              borderRadius: 100, marginBottom: 20,
              border: `1px solid ${accentColor}55`,
            }}>
              {tag}
            </div>
          )}

          {/* 제목 */}
          <div style={{
            fontSize: emoji ? 52 : 60, fontWeight: 900, color: '#fff',
            lineHeight: 1.25, letterSpacing: -1, marginBottom: 20,
          }}>
            {emoji && <span style={{ marginRight: 12 }}>{emoji}</span>}
            {title}
          </div>

          {/* 본문 */}
          <div style={{
            fontSize: 36, color: 'rgba(255,255,255,0.75)',
            lineHeight: 1.6, opacity: bodyOpacity,
          }}>
            {body}
          </div>
        </div>

        {/* 하단 악센트 바 */}
        <div style={{ height: 6, background: `linear-gradient(90deg, ${accentColor}, ${accentColor}44)` }} />
      </div>

      {audioSrc && <Audio src={audioSrc} />}
      {words.length > 0 && <WordSubtitle words={words} />}
    </div>
  );
}
