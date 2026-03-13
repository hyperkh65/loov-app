'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Composition } from 'remotion';
import { TitleScene } from './templates/TitleScene';
import { ListScene } from './templates/ListScene';
import { CardScene } from './templates/CardScene';
import { CodeScene } from './templates/CodeScene';
import { FlowScene } from './templates/FlowScene';
import { DialogScene } from './templates/DialogScene';
import { StatsScene } from './templates/StatsScene';

const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;

export function RemotionRoot() {
  return (
    <>
      <Composition id="TitleScene" component={TitleScene as any}
        durationInFrames={FPS * 8} fps={FPS} width={WIDTH} height={HEIGHT}
        defaultProps={{ title: '제목을 입력하세요', subtitle: '부제목', emoji: '🎬', durationInFrames: FPS * 8 }} />
      <Composition id="ListScene" component={ListScene as any}
        durationInFrames={FPS * 15} fps={FPS} width={WIDTH} height={HEIGHT}
        defaultProps={{ title: '목록 제목', items: ['항목 1', '항목 2', '항목 3'], numbered: true, durationInFrames: FPS * 15 }} />
      <Composition id="CardScene" component={CardScene as any}
        durationInFrames={FPS * 10} fps={FPS} width={WIDTH} height={HEIGHT}
        defaultProps={{ title: '카드 제목', body: '카드 내용을 입력하세요.', durationInFrames: FPS * 10 }} />
      <Composition id="CodeScene" component={CodeScene as any}
        durationInFrames={FPS * 15} fps={FPS} width={WIDTH} height={HEIGHT}
        defaultProps={{ title: '코드 예시', code: 'const hello = "world";\nconsole.log(hello);', language: 'javascript', durationInFrames: FPS * 15 }} />
      <Composition id="FlowScene" component={FlowScene as any}
        durationInFrames={FPS * 15} fps={FPS} width={WIDTH} height={HEIGHT}
        defaultProps={{ title: '흐름도', steps: [{ label: '1단계' }, { label: '2단계' }, { label: '3단계' }], durationInFrames: FPS * 15 }} />
      <Composition id="DialogScene" component={DialogScene as any}
        durationInFrames={FPS * 20} fps={FPS} width={WIDTH} height={HEIGHT}
        defaultProps={{ lines: [{ speaker: 'A', text: '안녕하세요!' }, { speaker: 'B', text: '반갑습니다!' }], speakerA: { name: '나', emoji: '🙋', color: '#6C63FF' }, speakerB: { name: '상대방', emoji: '🤖', color: '#00BCD4' }, durationInFrames: FPS * 20 }} />
      <Composition id="StatsScene" component={StatsScene as any}
        durationInFrames={FPS * 12} fps={FPS} width={WIDTH} height={HEIGHT}
        defaultProps={{ title: '통계', durationInFrames: FPS * 12, stats: [{ label: '월 매출', value: '1200', unit: '만원', icon: '💰', trend: 'up' }] }} />
    </>
  );
}
