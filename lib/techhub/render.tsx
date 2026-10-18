/* eslint-disable @next/next/no-img-element */
/**
 * 서버 렌더링 카드뉴스/대표이미지 — 맥 의존 없음. satori(next/og) → sharp JPEG(인스타 공식 요구) → R2.
 * satori 제약: 모든 다중 자식 div는 flex, 형광펜은 단어별 flex 아이템에 배경색.
 */
import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import type { ReactElement, ReactNode } from 'react';
import { uploadToR2 } from '@/lib/r2-storage';
import type { Slide } from './write';

const YEL = '#FFE14D';
let fonts: Array<{ name: string; data: Buffer; weight: 700 | 900; style: 'normal' }> | null = null;
function loadFonts() {
  if (!fonts) {
    const f = (n: string) => readFileSync(join(process.cwd(), 'public', 'fonts', n));
    fonts = [
      { name: 'P', data: f('Pretendard-Bold.otf'), weight: 700, style: 'normal' },
      { name: 'P', data: f('Pretendard-Black.otf'), weight: 900, style: 'normal' },
    ];
  }
  return fonts;
}

function Rich({ text, size, color, weight = 900, lh = 1.28 }: { text: string; size: number; color: string; weight?: 700 | 900; lh?: number }) {
  // 공백 단위 "단어 그룹" — 형광펜 경계가 단어 중간이면(예: **가능**해졌나) 한 그룹으로 붙여 간격이 벌어지지 않게
  const groups: Array<Array<{ w: string; hl: boolean }>> = [];
  let open = false;
  text.split(/(\*\*[^*]+\*\*)/).forEach(seg => {
    const hl = /^\*\*[^*]+\*\*$/.test(seg);
    const t = seg.replace(/\*\*/g, '');
    if (!t) return;
    t.split(/(\s+)/).forEach(piece => {
      if (!piece) return;
      if (/^\s+$/.test(piece)) { open = false; return; }
      if (!open) groups.push([]);
      groups[groups.length - 1].push({ w: piece, hl });
      open = true;
    });
  });
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', width: '100%' }}>
      {groups.map((g, i) => (
        <div key={i} style={{ display: 'flex', marginRight: size * 0.26, marginBottom: size * 0.06 }}>
          {g.map((x, k) => (
            <div key={k} style={{
              display: 'flex', fontSize: size, fontWeight: weight, lineHeight: lh, letterSpacing: -size * 0.02,
              color: x.hl ? '#111' : color, background: x.hl ? YEL : 'transparent',
              padding: x.hl ? `0 ${size * 0.1}px` : 0, borderRadius: size * 0.1,
            }}>{x.w}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

const Pill = ({ t, dark }: { t: string; dark: boolean }) => (
  <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, color: dark ? '#fff' : '#111', border: `3px solid ${dark ? '#fff' : '#111'}`, borderRadius: 40, padding: '8px 26px' }}>{t}</div>
);

function Frame({ dark, label, page, brand, children }: { dark: boolean; label: string; page: string; brand: string; children: ReactNode }) {
  const fg = dark ? '#fff' : '#111';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, background: dark ? '#0b0b0c' : '#fff', color: fg, padding: '84px 80px', fontFamily: 'P', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pill t={label} dark={dark} />
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: dark ? '#9a9a9a' : '#888' }}>{page}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>{children}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28, fontWeight: 700, color: dark ? '#8a8a8a' : '#999' }}>
        <div style={{ display: 'flex' }}>{brand}</div>
        <div style={{ display: 'flex' }}>넘겨서 보기 →</div>
      </div>
    </div>
  );
}

const Bullets = ({ items, fg, size = 42, max = 3 }: { items?: string[]; fg: string; size?: number; max?: number }) => (
  <div style={{ display: 'flex', flexDirection: 'column', marginTop: 44 }}>
    {(items || []).slice(0, max).map((t, k) => (
      <div key={k} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 26 }}>
        <div style={{ display: 'flex', width: 20, height: 20, background: YEL, marginTop: size * 0.5, marginRight: 22, borderRadius: 4 }} />
        <div style={{ display: 'flex', flex: 1 }}><Rich text={t} size={size} color={fg} weight={700} lh={1.4} /></div>
      </div>
    ))}
  </div>
);

function cardEl(s: Slide, i: number, total: number, brand: string): ReactElement {
  const dark = i % 2 === 1;
  const fg = dark ? '#fff' : '#111';
  const mute = dark ? '#c8c8c8' : '#444';
  const line = dark ? '#3a3a3a' : '#ddd';
  const page = `${String(i + 2).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  const body = s.body ? <div style={{ display: 'flex', marginTop: 34 }}><Rich text={s.body} size={42} color={mute} weight={700} lh={1.5} /></div> : null;
  let inner: ReactElement;
  if (s.type === 'stat') {
    inner = <div style={{ display: 'flex', flexDirection: 'column' }}><Rich text={s.title} size={170} color={fg} lh={1.1} />{body}<Bullets items={s.items} fg={fg} /></div>;
  } else if (s.type === 'steps' && s.items?.length) {
    inner = (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Rich text={s.title} size={62} color={fg} />
        {body}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40 }}>
          {s.items.slice(0, 4).map((t, k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 30 }}>
              <div style={{ display: 'flex', width: 68, height: 68, borderRadius: 34, background: YEL, color: '#111', fontSize: 34, fontWeight: 900, alignItems: 'center', justifyContent: 'center', marginRight: 24 }}>{k + 1}</div>
              <div style={{ display: 'flex', flex: 1, paddingTop: 4 }}><Rich text={t} size={41} color={fg} weight={700} lh={1.4} /></div>
            </div>
          ))}
        </div>
      </div>
    );
  } else if (s.type === 'compare' && s.rows?.length) {
    const h = s.heads || ['기존', '이번'];
    const cell = (t: string, w: number, strong = false, hl = false) => (
      <div style={{ display: 'flex', width: w, fontSize: 38, fontWeight: strong ? 900 : 700, color: hl ? '#111' : fg, background: hl ? YEL : 'transparent', padding: hl ? '10px 14px' : '10px 14px', borderRadius: 8, lineHeight: 1.3 }}>{t.replace(/\*\*/g, '')}</div>
    );
    inner = (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Rich text={s.title} size={62} color={fg} />
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 44, borderTop: `3px solid ${fg}` }}>
          <div style={{ display: 'flex', padding: '16px 0', borderBottom: `2px solid ${line}` }}>
            {cell('', 220)}{cell(h[0], 380, true)}{cell(h[1], 380, true)}
          </div>
          {s.rows.slice(0, 4).map((r, k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', padding: '20px 0', borderBottom: `2px solid ${line}` }}>
              {cell(r[0], 220, true)}{cell(r[1], 380)}{cell(r[2], 380, true, true)}
            </div>
          ))}
        </div>
      </div>
    );
  } else if (s.type === 'summary') {
    inner = (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Rich text={s.title} size={74} color={fg} />
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 44 }}>
          {(s.items || []).slice(0, 5).map((t, k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'flex-start', padding: '24px 0', borderBottom: `2px solid ${line}` }}>
              <div style={{ display: 'flex', width: 48, height: 48, borderRadius: 24, background: YEL, color: '#111', fontSize: 28, fontWeight: 900, alignItems: 'center', justifyContent: 'center', marginRight: 22, marginTop: 2 }}>✓</div>
              <div style={{ display: 'flex', flex: 1 }}><Rich text={t} size={40} color={fg} weight={700} lh={1.35} /></div>
            </div>
          ))}
        </div>
      </div>
    );
  } else {
    inner = <div style={{ display: 'flex', flexDirection: 'column' }}><Rich text={s.title} size={s.type === 'warn' ? 68 : 72} color={fg} />{body}<Bullets items={s.items} fg={fg} /></div>;
  }
  return <Frame dark={dark} label={s.type === 'warn' && !s.label.includes('주의') ? `주의 · ${s.label}` : s.label} page={page} brand={brand}>{inner}</Frame>;
}

function coverEl(o: { photo: string | null; hook: string; kicker: string; brand: string; w: number; h: number; page?: string }): ReactElement {
  const { photo, hook, kicker, brand, w, h } = o;
  const portrait = h > w;
  const fs = portrait ? 104 : 66;
  const pad = portrait ? 72 : 48;
  return (
    <div style={{ display: 'flex', position: 'relative', width: w, height: h, background: '#0b0b0c', fontFamily: 'P' }}>
      {photo && <img src={photo} width={w} height={h} style={{ position: 'absolute', top: 0, left: 0, width: w, height: h, objectFit: 'cover' }} />}
      <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: w, height: h, backgroundImage: photo ? 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0.55) 58%, rgba(0,0,0,0.92) 100%)' : 'linear-gradient(135deg, #111 0%, #2a2300 100%)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: w, height: h, padding: pad }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: portrait ? 34 : 24, fontWeight: 900, color: '#111', background: YEL, borderRadius: 40, padding: portrait ? '10px 30px' : '6px 22px' }}>{kicker}</div>
          <div style={{ display: 'flex', fontSize: portrait ? 30 : 22, fontWeight: 900, color: '#fff', letterSpacing: 4 }}>{o.page || brand}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Rich text={hook} size={fs} color="#fff" lh={1.2} />
          {portrait && <div style={{ display: 'flex', marginTop: 28, fontSize: 32, fontWeight: 700, color: '#d8d8d8' }}>{brand} · 넘겨서 보기 →</div>}
        </div>
      </div>
    </div>
  );
}

function sourceEl(photo: string | null, source: string, title: string, page: string, brand: string): ReactElement {
  return (
    <Frame dark={false} label="출처" page={page} brand={brand}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {photo && <img src={photo} width={920} height={560} style={{ width: 920, height: 560, objectFit: 'cover', borderRadius: 24, border: '4px solid #111' }} />}
        <div style={{ display: 'flex', marginTop: 36 }}><Rich text={title} size={44} color="#111" /></div>
        <div style={{ display: 'flex', marginTop: 16, fontSize: 32, fontWeight: 700, color: '#666' }}>출처 · {source}</div>
      </div>
    </Frame>
  );
}

function ctaEl(brand: string, handle: string, total: number): ReactElement {
  return (
    <Frame dark label="FOLLOW" page={`${String(total).padStart(2, '0')} / ${String(total).padStart(2, '0')}`} brand={brand}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Rich text="매일 **가장 핫한** 과학·AI·전자제품 소식을 쉽게" size={80} color="#fff" />
        <div style={{ display: 'flex', marginTop: 44, fontSize: 54, fontWeight: 900, color: YEL }}>{handle}</div>
        <div style={{ display: 'flex', marginTop: 20, fontSize: 36, fontWeight: 700, color: '#bdbdbd' }}>팔로우하고 놓치지 마세요</div>
      </div>
    </Frame>
  );
}

async function toJpeg(el: ReactElement, w: number, h: number): Promise<Buffer> {
  const png = await new ImageResponse(el, { width: w, height: h, fonts: loadFonts() }).arrayBuffer();
  return sharp(Buffer.from(png)).jpeg({ quality: 90 }).toBuffer();
}

/** 원격 사진 → 지정 크기로 잘라 data URI. 받기 실패 시 null(→ 호출 측이 폴백) */
export async function photoData(url: string | null | undefined, w: number, h: number): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', Referer: new URL(url).origin + '/' }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const buf = await sharp(Buffer.from(await res.arrayBuffer())).resize(w, h, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer();
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch { return null; }
}

const put = (key: string, buf: Buffer) => uploadToR2(`techhub/${key}.jpg`, buf, 'image/jpeg');

export interface CardInput { slides: Slide[]; hook: string; kicker: string; brand: string; handle: string; coverPhotoUrl: string | null; source: { name: string; title: string; imageUrl: string | null }; slug: string }

/** 반환: 와이드 대표(블로그), 카드뉴스 전체 URL(표지→본문→출처→CTA). 개별 카드 실패는 건너뜀 */
export async function renderAll(i: CardInput): Promise<{ wideCover: string; cards: string[] }> {
  const total = i.slides.length + 3; // 표지 + 본문 + 출처 + CTA
  const [wideBg, tallBg, srcPhoto] = await Promise.all([
    photoData(i.coverPhotoUrl, 1200, 630), photoData(i.coverPhotoUrl, 1080, 1350), photoData(i.source.imageUrl, 920, 560),
  ]);
  const wideCover = await put(`${i.slug}/cover-wide`, await toJpeg(coverEl({ photo: wideBg, hook: i.hook, kicker: i.kicker, brand: i.brand, w: 1200, h: 630 }), 1200, 630));
  const jobs: Array<[string, ReactElement]> = [
    ['c01', coverEl({ photo: tallBg, hook: i.hook, kicker: i.kicker, brand: i.brand, w: 1080, h: 1350 })],
    ...i.slides.map((s, k): [string, ReactElement] => [`c${String(k + 2).padStart(2, '0')}`, cardEl(s, k, total, i.brand)]),
    [`c${String(total - 1).padStart(2, '0')}`, sourceEl(srcPhoto, i.source.name, i.source.title, `${String(total - 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, i.brand)],
    [`c${String(total).padStart(2, '0')}`, ctaEl(i.brand, i.handle, total)],
  ];
  const cards: string[] = [];
  for (const [name, el] of jobs) {
    try { cards.push(await put(`${i.slug}/${name}`, await toJpeg(el, 1080, 1350))); } catch (e) { console.error('[techhub] 카드 렌더 실패', name, e); }
  }
  if (cards.length < 3) throw new Error('카드뉴스 렌더 실패(3장 미만)');
  return { wideCover, cards };
}
