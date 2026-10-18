/* eslint-disable @next/next/no-img-element */
/**
 * 여행 계정(@armchair_travel_today) 카드뉴스 — 풀블리드 풍경 사진 + 하단 다크 그라데이션 + 큰 제목/작은 본문, 마지막 장 저장 유도 CTA.
 * 실패하면 null → 호출 측이 기존 단일 이미지로 폴백.
 */
import type { ReactElement } from 'react';
import { uploadToR2 } from '@/lib/r2-storage';
import { askJson } from '@/lib/techhub/write';
import { toJpeg, photoData } from '@/lib/techhub/render';
import { generateHqImage, generateAiImage } from '@/lib/blog-content-generator';

const ACC = '#FF8A3D';
const W = 1080, H = 1350;
const strip = (s: unknown) => String(s ?? '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim();

interface Plan { kicker: string; hook: string; points: Array<{ tag: string; title: string; body: string; scene: string }> }
export interface TravelCardOpts { title: string; text: string; photos?: Array<string | null | undefined>; hint?: string; slug: string; brand?: string; handle?: string }

const Bg = ({ photo }: { photo: string | null }) => (
  <>
    {photo ? <img src={photo} width={W} height={H} style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover' }} /> : null}
    <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: W, height: H, backgroundImage: photo
      ? 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.05) 22%, rgba(0,0,0,0.45) 50%, rgba(10,6,4,0.88) 72%, rgba(10,6,4,0.97) 100%)'
      : 'linear-gradient(160deg, #3a2417 0%, #140c08 100%)' }} />
  </>
);

const Head = ({ brand, page }: { brand: string; page: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
    <div style={{ display: 'flex', width: 120 }} />
    <div style={{ display: 'flex', fontSize: 26, fontWeight: 900, letterSpacing: 6, color: 'rgba(255,255,255,0.85)' }}>{brand}</div>
    <div style={{ display: 'flex', width: 120, justifyContent: 'flex-end' }}>
      <div style={{ display: 'flex', fontSize: 24, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.55)', borderRadius: 30, padding: '6px 20px' }}>{page}</div>
    </div>
  </div>
);

function slide(photo: string | null, brand: string, page: string, children: ReactElement): ReactElement {
  return (
    <div style={{ display: 'flex', position: 'relative', width: W, height: H, fontFamily: 'P', backgroundColor: '#140c08' }}>
      <Bg photo={photo} />
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: W, height: H, padding: '56px 64px 96px' }}>
        <Head brand={brand} page={page} />
        {children}
      </div>
    </div>
  );
}

export function travelSlides(brand: string, handle: string, kicker: string, hook: string, points: Plan['points'], photos: Array<string | null>): ReactElement[] {
  const n = points.length + 2;
  const pg = (i: number) => `${i}/${n}`;
  return [
    slide(photos[0], brand, pg(1),
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignSelf: 'flex-start', fontSize: 28, fontWeight: 900, color: '#fff', border: '2px solid rgba(255,255,255,0.8)', borderRadius: 40, padding: '8px 26px', marginBottom: 28 }}>{kicker}</div>
        <div style={{ display: 'flex', fontSize: 84, fontWeight: 900, color: '#fff', lineHeight: 1.22, letterSpacing: -2 }}>{hook}</div>
      </div>),
    ...points.map((p, k) => slide(photos[k + 1], brand, pg(k + 2),
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 28, fontWeight: 900, color: ACC, marginBottom: 18 }}>{p.tag}</div>
        <div style={{ display: 'flex', fontSize: 66, fontWeight: 900, color: '#fff', lineHeight: 1.25, letterSpacing: -1.5 }}>{p.title}</div>
        <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: 'rgba(255,255,255,0.86)', lineHeight: 1.55, marginTop: 26 }}>{p.body}</div>
      </div>)),
    slide(null, brand, pg(n),
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', alignSelf: 'center', marginBottom: 260 }}>
        <div style={{ display: 'flex', fontSize: 76, fontWeight: 900, color: '#fff', textAlign: 'center', lineHeight: 1.3 }}>놓치기 전에</div>
        <div style={{ display: 'flex', fontSize: 76, fontWeight: 900, color: ACC, textAlign: 'center', lineHeight: 1.3 }}>저장해두세요</div>
        <div style={{ display: 'flex', fontSize: 32, fontWeight: 700, color: 'rgba(255,255,255,0.8)', marginTop: 26 }}>알아두면 바로 써먹는 여행 정보, 자주 올려요</div>
        <div style={{ display: 'flex', fontSize: 38, fontWeight: 900, color: '#fff', background: ACC, borderRadius: 50, padding: '16px 56px', marginTop: 44 }}>+ 팔로우</div>
        <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginTop: 26 }}>{handle}</div>
      </div>),
  ];
}

export async function makeTravelCards(o: TravelCardOpts): Promise<string[]> {
  const brand = o.brand || 'ARMCHAIR TRAVEL';
  const handle = o.handle || '@armchair_travel_today';
  const plan = await askJson<Plan>(
    `여행 글을 인스타·스레드용 카드뉴스로 압축하세요. 글에 없는 가격·시간·주소·후기·방문 경험은 지어내지 말 것. 이모지 금지. 존댓말 또는 명사형.\n${o.hint ? `[구성 지침] ${o.hint}\n` : ''}\n[제목] ${o.title}\n[본문] ${o.text.slice(0, 3800)}\n\nJSON만 출력: {"kicker":"표지 라벨 4~12자 (예: 서울 근교 단풍)","hook":"표지 헤드라인 14~26자, 저장하고 싶게","points":[{"tag":"소제목 라벨 4~14자 (지역·유형)","title":"핵심 제목 14~26자","body":"쉬운 설명 2문장 60~100자","scene":"English, 15-25 words, scenery photo prompt for this card (landscape/place/food/hotel exterior, NO people, NO text)"} ×정확히 5개]}`,
    v => (v?.hook && v?.kicker && Array.isArray(v.points) && v.points.filter(p => p?.title && p?.body).length >= 4 ? null : '카드 구성 부족'),
  );
  const points = plan.points.filter(p => p?.title && p?.body).slice(0, 5).map(p => ({ tag: strip(p.tag).slice(0, 18), title: strip(p.title).slice(0, 40), body: strip(p.body).slice(0, 130), scene: String(p.scene || '').slice(0, 200) }));
  const hook = strip(plan.hook).slice(0, 44), kicker = strip(plan.kicker).slice(0, 16);

  // 사진: 호출 측이 준 사진을 순서대로(표지→본문), 모자라는 장만 AI 풍경으로 채움
  const given = (o.photos || []).filter((x): x is string => !!x);
  const slots = [points[0].scene, ...points.map(p => p.scene)];
  const urls = await Promise.all(slots.map(async (scene, i) => given[i] || (await generateHqImage(`${scene}, cinematic travel photography, golden hour, no people, no text`).catch(() => null)) || (await generateAiImage(scene).catch(() => null))));
  const photos = await Promise.all(urls.map(u => photoData(u, W, H)));

  const els = travelSlides(brand, handle, kicker, hook, points, photos);
  const out: string[] = [];
  for (let i = 0; i < els.length; i++) out.push(await uploadToR2(`travelcards/${o.slug}/c${String(i + 1).padStart(2, '0')}.jpg`, await toJpeg(els[i], W, H), 'image/jpeg'));
  if (out.length < 3) throw new Error('카드 3장 미만');
  return out;
}

export async function buildTravelCards(o: TravelCardOpts): Promise<string[] | null> {
  try { return await Promise.race([makeTravelCards(o), new Promise<null>(r => setTimeout(() => r(null), 150_000))]); } catch (e) {
    console.error('[travel-cards] 실패→단일 이미지 폴백:', e instanceof Error ? e.message : e);
    return null;
  }
}

export const htmlToText = (h: string) => h.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
