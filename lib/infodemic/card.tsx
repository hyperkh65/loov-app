/* eslint-disable @next/next/no-img-element */
/**
 * 정보 카드 이미지(저작권 없는 직접 그림) — 서버에서 satori(next/og) → sharp JPEG → R2. 맥 불필요.
 * 대표 이미지(1200x630)와 본문 정보 카드(1080 폭)를 만든다. 얼굴·로고·외부 사진은 쓰지 않는다.
 */
import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { uploadToR2 } from '@/lib/r2-storage';
import type { InfoCard } from './write';

const THEMES = [
  { bg: '#101a33', fg: '#ffffff', acc: '#ffd84a', sub: '#a9b7d9', card: '#1b2a4d' },
  { bg: '#13251f', fg: '#ffffff', acc: '#6df0a8', sub: '#a8c9bb', card: '#1d3a30' },
  { bg: '#2a1530', fg: '#ffffff', acc: '#ff8fd1', sub: '#d3b3d8', card: '#3d2045' },
  { bg: '#1f1f23', fg: '#ffffff', acc: '#7fd0ff', sub: '#b4b8c2', card: '#2c2d33' },
] as const;
const themeOf = (seed: string) => THEMES[[...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % THEMES.length];

let fonts: Array<{ name: string; data: Buffer; weight: 700 | 900; style: 'normal' }> | null = null;
function loadFonts() {
  if (!fonts) {
    const f = (n: string) => readFileSync(join(process.cwd(), 'public', 'fonts', n));
    fonts = [{ name: 'P', data: f('Pretendard-Bold.otf'), weight: 700, style: 'normal' }, { name: 'P', data: f('Pretendard-Black.otf'), weight: 900, style: 'normal' }];
  }
  return fonts;
}

async function toJpeg(el: React.ReactElement, width: number, height: number): Promise<Buffer> {
  const png = Buffer.from(await new ImageResponse(el, { width, height, fonts: loadFonts() }).arrayBuffer());
  return sharp(png).jpeg({ quality: 88 }).toBuffer();
}

const fit = (s: string, max: number) => ([...s].length > max ? [...s].slice(0, max - 1).join('') + '…' : s);

/** 대표 이미지 1200x630 */
export async function renderCover(title: string, kicker: string, key: string): Promise<string> {
  const T = themeOf(title);
  const size = [...title].length > 26 ? 66 : 78;
  const el = (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 1200, height: 630, background: T.bg, color: T.fg, padding: '64px 72px', fontFamily: 'P' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: T.bg, background: T.acc, borderRadius: 40, padding: '8px 26px' }}>{fit(kicker || '정보 정리', 14)}</div>
      </div>
      <div style={{ display: 'flex', fontSize: size, fontWeight: 900, lineHeight: 1.22, letterSpacing: -2, wordBreak: 'keep-all' }}>{fit(title, 44)}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 28, fontWeight: 700, color: T.sub }}>
        <div style={{ display: 'flex' }}>여러 출처로 확인한 정보만 정리했어요</div>
        <div style={{ display: 'flex', color: T.acc, fontWeight: 900 }}>미라쿨</div>
      </div>
    </div>
  );
  return uploadToR2(`miracool/infodemic/${key}-cover.jpg`, await toJpeg(el, 1200, 630), 'image/jpeg');
}

/** 본문 정보 카드(표 형태) */
export async function renderInfoCard(card: InfoCard, key: string): Promise<string> {
  const T = themeOf(card.headline);
  const rows = card.rows.slice(0, 6);
  const h = 250 + rows.length * 118 + 90;
  const el = (
    <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: h, background: T.bg, color: T.fg, padding: '60px 64px', fontFamily: 'P' }}>
      <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, color: T.acc }}>{fit(card.kicker || '정보 카드', 16)}</div>
      <div style={{ display: 'flex', fontSize: 58, fontWeight: 900, lineHeight: 1.2, marginTop: 12, marginBottom: 34, letterSpacing: -1.5, wordBreak: 'keep-all' }}>{fit(card.headline, 22)}</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', background: T.card, borderRadius: 24, padding: '0 30px', height: 100, marginBottom: 18 }}>
          <div style={{ display: 'flex', width: 220, fontSize: 30, fontWeight: 700, color: T.sub }}>{fit(r.k, 8)}</div>
          <div style={{ display: 'flex', flex: 1, fontSize: 38, fontWeight: 900, color: T.fg, wordBreak: 'keep-all' }}>{fit(r.v, 24)}</div>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 24, fontWeight: 700, color: T.sub, marginTop: 'auto' }}>미라쿨 · 공개된 출처 기준</div>
    </div>
  );
  return uploadToR2(`miracool/infodemic/${key}-card.jpg`, await toJpeg(el, 1080, h), 'image/jpeg');
}
