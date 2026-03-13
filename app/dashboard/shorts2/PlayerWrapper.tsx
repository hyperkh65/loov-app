'use client';

import { Player } from '@remotion/player';
import { TitleScene } from './remotion/templates/TitleScene';
import { ListScene } from './remotion/templates/ListScene';
import { CardScene } from './remotion/templates/CardScene';
import { CodeScene } from './remotion/templates/CodeScene';
import { FlowScene } from './remotion/templates/FlowScene';
import { DialogScene } from './remotion/templates/DialogScene';
import { StatsScene } from './remotion/templates/StatsScene';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const COMPONENTS: Record<string, React.FC<any>> = {
  title:  TitleScene,
  list:   ListScene,
  card:   CardScene,
  code:   CodeScene,
  flow:   FlowScene,
  dialog: DialogScene,
  stats:  StatsScene,
};

export default function PlayerWrapper({
  type, sceneProps, durationInFrames,
}: {
  type: string;
  sceneProps: Record<string, unknown>;
  durationInFrames: number;
}) {
  const Component = COMPONENTS[type];
  if (!Component) return null;

  return (
    <Player
      component={Component}
      inputProps={sceneProps}
      durationInFrames={Math.max(1, durationInFrames)}
      fps={30}
      compositionWidth={1080}
      compositionHeight={1920}
      style={{ width: '100%', height: '100%' }}
      controls={false}
      loop
      autoPlay
    />
  );
}
