'use client';

import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { Audio } from 'remotion';
import { WordSubtitle } from '../components/WordSubtitle';

export interface CodeSceneProps {
  title: string;
  code: string;
  language?: string;
  highlightLines?: number[];
  explanation?: string;
  bgColor?: string;
  accentColor?: string;
  audioSrc?: string;
  words?: { word: string; start: number; end: number }[];
  durationInFrames: number;
}

// 간단한 토큰 컬러링
function colorizeCode(code: string, lang: string): { text: string; color: string }[][] {
  const lines = code.split('\n');
  const keywords: Record<string, string[]> = {
    javascript: ['const','let','var','function','return','if','else','for','while','class','import','export','from','async','await','new','this','true','false','null','undefined'],
    python: ['def','return','if','else','elif','for','while','class','import','from','as','True','False','None','and','or','not','in','is'],
    default: ['function','return','if','else','for','while','class','const','let','var','import','export'],
  };
  const kws = new Set(keywords[lang] ?? keywords.default);

  return lines.map(line => {
    const tokens: { text: string; color: string }[] = [];
    // 문자열
    const strRegex = /(".*?"|'.*?'|`.*?`)/g;
    // 주석
    if (line.trim().startsWith('//') || line.trim().startsWith('#')) {
      tokens.push({ text: line, color: '#6A9955' });
      return tokens;
    }
    let last = 0;
    let match;
    const regex = /(".*?"|'.*?'|`.*?`|\b\w+\b)/g;
    while ((match = regex.exec(line)) !== null) {
      if (match.index > last) tokens.push({ text: line.slice(last, match.index), color: '#D4D4D4' });
      const word = match[0];
      if ((word.startsWith('"') || word.startsWith("'") || word.startsWith('`'))) {
        tokens.push({ text: word, color: '#CE9178' });
      } else if (kws.has(word)) {
        tokens.push({ text: word, color: '#569CD6' });
      } else if (/^\d+$/.test(word)) {
        tokens.push({ text: word, color: '#B5CEA8' });
      } else {
        tokens.push({ text: word, color: '#D4D4D4' });
      }
      last = match.index + word.length;
    }
    if (last < line.length) tokens.push({ text: line.slice(last), color: '#D4D4D4' });
    return tokens.length ? tokens : [{ text: line, color: '#D4D4D4' }];
  });
}

export function CodeScene({
  title, code, language = 'javascript', highlightLines = [],
  explanation, bgColor = '#1E1E1E', accentColor = '#007ACC',
  audioSrc, words = [],
}: CodeSceneProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const headerSpring = spring({ fps, frame, config: { damping: 14 }, delay: 3 });
  const codeLines = colorizeCode(code, language);
  const visibleLines = Math.round(interpolate(frame, [10, 50], [0, codeLines.length], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  }));

  return (
    <div style={{
      width, height, background: bgColor,
      display: 'flex', flexDirection: 'column',
      padding: '60px 48px', position: 'relative',
      fontFamily: '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
    }}>
      {/* 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32,
        opacity: headerSpring,
        transform: `translateY(${interpolate(headerSpring, [0, 1], [-20, 0])}px)`,
      }}>
        <span style={{ fontSize: 52 }}>💻</span>
        <div>
          <div style={{ fontSize: 48, fontWeight: 900, color: '#fff', letterSpacing: -1 }}>{title}</div>
          <div style={{
            display: 'inline-block', marginTop: 6, padding: '3px 14px',
            background: `${accentColor}33`, color: accentColor,
            fontSize: 22, fontWeight: 700, borderRadius: 6,
          }}>{language}</div>
        </div>
      </div>

      {/* 코드 블록 */}
      <div style={{
        flex: 1, background: '#252526', borderRadius: 16, overflow: 'hidden',
        border: '1px solid #3C3C3C',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        {/* 맥 스타일 창 버튼 */}
        <div style={{ display: 'flex', gap: 8, padding: '14px 20px', background: '#323233' }}>
          {['#FF5F57','#FFBD2E','#28C840'].map((c, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: c }} />
          ))}
          <span style={{ color: '#888', fontSize: 18, marginLeft: 12 }}>{language}</span>
        </div>

        <div style={{ padding: '24px 28px', overflowY: 'hidden' }}>
          {codeLines.slice(0, visibleLines).map((tokens, lineIdx) => {
            const isHighlighted = highlightLines.includes(lineIdx + 1);
            return (
              <div key={lineIdx} style={{
                display: 'flex', alignItems: 'flex-start', gap: 20,
                padding: '3px 8px', borderRadius: 4, marginBottom: 2,
                background: isHighlighted ? `${accentColor}22` : 'transparent',
                borderLeft: isHighlighted ? `3px solid ${accentColor}` : '3px solid transparent',
              }}>
                <span style={{ color: '#555', fontSize: 22, minWidth: 30, textAlign: 'right', userSelect: 'none' }}>
                  {lineIdx + 1}
                </span>
                <span style={{ fontFamily: '"Fira Code", "Consolas", monospace', fontSize: 26, lineHeight: 1.5 }}>
                  {tokens.map((t, ti) => (
                    <span key={ti} style={{ color: t.color }}>{t.text}</span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 설명 */}
      {explanation && (
        <div style={{
          marginTop: 24, fontSize: 34, color: 'rgba(255,255,255,0.8)',
          lineHeight: 1.5, textAlign: 'center',
          opacity: interpolate(frame, [40, 55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}>
          💡 {explanation}
        </div>
      )}

      {audioSrc && <Audio src={audioSrc} />}
      {words.length > 0 && <WordSubtitle words={words} />}
    </div>
  );
}
