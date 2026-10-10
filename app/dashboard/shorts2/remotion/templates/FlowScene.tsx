'use client';

import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { Audio } from 'remotion';
import { WordSubtitle } from '../components/WordSubtitle';

export interface FlowStep { label: string; desc?: string; icon?: string; color?: string }
export interface FlowSceneProps {
  title: string;
  steps: FlowStep[];
  bgColor?: string;
  accentColor?: string;
  audioSrc?: string;
  words?: { word: string; start: number; end: number }[];
  durationInFrames: number;
}

export function FlowScene({
  title, steps, bgColor = '#0d1117', accentColor = '#58A6FF',
  audioSrc, words = [], durationInFrames,
}: FlowSceneProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const stepDelay = Math.max(10, Math.floor((durationInFrames * 0.65) / steps.length));
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      width, height, background: bgColor,
      display: 'flex', flexDirection: 'column',
      padding: '64px 56px', position: 'relative', overflow: 'hidden',
      fontFamily: '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
    }}>
      <div style={{ fontSize: 52, fontWeight: 900, color: '#fff', marginBottom: 48, opacity: titleOpacity, letterSpacing: -1 }}>
        🔄 {title}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1, justifyContent: 'center' }}>
        {steps.map((step, i) => {
          const delay = 12 + i * stepDelay;
          const sp = spring({ fps, frame, config: { damping: 16, stiffness: 110 }, delay });
          const arrowOpacity = interpolate(frame, [delay + 8, delay + 20], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          });
          const stepColor = step.color ?? accentColor;

          return (
            <div key={i}>
              {/* 스텝 카드 */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 24,
                background: 'rgba(255,255,255,0.05)',
                border: `2px solid ${stepColor}55`,
                borderRadius: 20, padding: '22px 28px',
                transform: `translateX(${interpolate(sp, [0, 1], [-80, 0])}px) scale(${interpolate(sp, [0, 1], [0.9, 1])})`,
                opacity: sp,
                boxShadow: `0 4px 20px ${stepColor}22`,
              }}>
                {/* 번호 원 */}
                <div style={{
                  minWidth: 56, height: 56, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${stepColor}, ${stepColor}bb)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26, fontWeight: 900, color: '#fff',
                  boxShadow: `0 4px 14px ${stepColor}55`,
                }}>
                  {step.icon ?? i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 40, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{step.label}</div>
                  {step.desc && (
                    <div style={{ fontSize: 28, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>{step.desc}</div>
                  )}
                </div>
                {/* 체크 아이콘 */}
                <div style={{
                  fontSize: 36, opacity: sp,
                  color: stepColor,
                }}>✓</div>
              </div>

              {/* 화살표 */}
              {i < steps.length - 1 && (
                <div style={{
                  textAlign: 'center', fontSize: 36, color: `${accentColor}88`,
                  opacity: arrowOpacity, padding: '8px 0', lineHeight: 1,
                }}>↓</div>
              )}
            </div>
          );
        })}
      </div>

      {audioSrc && <Audio src={audioSrc} />}
      {words.length > 0 && <WordSubtitle words={words} />}
    </div>
  );
}
