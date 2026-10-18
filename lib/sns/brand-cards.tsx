/* eslint-disable @next/next/no-img-element */
/**
 * 2dayskr 브랜드 카드뉴스(블루·심플) — 자동 발행의 SNS(인스타/스레드) 전용. 블로그 본문에는 넣지 않음.
 * 맥/외부 이미지 의존 없음(satori 서버 렌더) — 실패하면 null을 돌려 호출 측이 기존 단일 이미지로 폴백.
 */
import type { ReactElement, ReactNode } from 'react';
import { uploadToR2 } from '@/lib/r2-storage';
import { askJson } from '@/lib/techhub/write';
import { Rich, toJpeg, photoData } from '@/lib/techhub/render';

export type BrandTheme = 'blue' | 'green';
export const THEMES = {
  blue: { A: '#1747FF', N: '#0A1B6B', S: '#CFE0FF', bg: 'linear-gradient(160deg, #2F63FF 0%, #1747FF 45%, #0A1B6B 100%)', light: 'linear-gradient(160deg, #F3F7FF 0%, #E6EEFF 100%)', mute: '#BCD0FF', muteL: '#8AA0D8', sub: '#3A4A86', brand: '2DAYS.KR', handle: '@2dayskr' },
  green: { A: '#16A34A', N: '#053B1B', S: '#CFF5DB', bg: 'linear-gradient(160deg, #2FC25F 0%, #16A34A 45%, #064E24 100%)', light: 'linear-gradient(160deg, #F2FCF5 0%, #E1F7E8 100%)', mute: '#C9F2D6', muteL: '#6FAF86', sub: '#2F6B47', brand: 'ABODA.KR', handle: 'ABODA.KR' },
} as const;
type Theme = (typeof THEMES)[BrandTheme];
const YEL = '#FFE14D';

interface BrandPlan { hook: string; kicker: string; bullets?: string[]; points: Array<{ title: string; body: string }> }

const Shell = ({ T, dark, page, children }: { T: Theme; dark: boolean; page: string; children: ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, padding: '84px 80px', fontFamily: 'P', justifyContent: 'space-between',
    backgroundImage: dark ? T.bg : T.light }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', fontSize: 30, fontWeight: 900, letterSpacing: 4, color: dark ? '#fff' : T.A }}>{T.brand}</div>
      <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: dark ? T.mute : T.muteL }}>{page}</div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>{children}</div>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28, fontWeight: 700, color: dark ? T.mute : T.muteL }}>
      <div style={{ display: 'flex' }}>{T.handle}</div>
      <div style={{ display: 'flex' }}>넘겨서 보기 →</div>
    </div>
  </div>
);

// 1장: 라벨 + 큰 헤드라인 + 사진 + 핵심 3줄을 한 장에 — 사진이 없으면 큰 라벨 블록으로 대체
function summaryCover(plan: BrandPlan, T: Theme, photo: string | null, page: string): ReactElement {
  const bullets = (plan.bullets && plan.bullets.length >= 3 ? plan.bullets : plan.points.map(p => p.title)).slice(0, 3);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, padding: '64px 60px 56px', fontFamily: 'P', backgroundImage: T.bg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 900, letterSpacing: 4, color: '#fff' }}>{T.brand}</div>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: T.mute }}>{page}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', background: T.N, borderRadius: 28, padding: '34px 40px 30px' }}>
        <div style={{ display: 'flex', alignSelf: 'flex-start', fontSize: 32, fontWeight: 900, color: T.N, background: YEL, borderRadius: 40, padding: '8px 28px', marginBottom: 22 }}>{plan.kicker}</div>
        <Rich text={plan.hook} size={92} color="#fff" lh={1.18} hl={YEL} hlFg={T.N} />
      </div>
      {photo
        ? <img src={photo} width={960} height={470} style={{ display: 'flex', width: 960, height: 470, objectFit: 'cover', borderRadius: 28, border: '6px solid #fff', marginTop: 26 }} />
        : <div style={{ display: 'flex', width: 960, height: 470, borderRadius: 28, border: '6px solid #fff', marginTop: 26, alignItems: 'center', justifyContent: 'center', fontSize: 150, fontWeight: 900, color: '#fff', background: 'rgba(255,255,255,0.14)' }}>{plan.kicker}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', background: T.N, borderRadius: 28, padding: '26px 36px', marginTop: 26 }}>
        {bullets.map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', marginTop: i ? 16 : 0 }}>
            <div style={{ display: 'flex', width: 14, height: 14, borderRadius: 7, background: YEL, marginRight: 22, flexShrink: 0 }} />
            <Rich text={b} size={40} color="#fff" weight={700} lh={1.3} hl={YEL} hlFg={T.N} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function slides(plan: BrandPlan, T: Theme, photo: string | null): ReactElement[] {
  const n = plan.points.length + 2;
  const pg = (i: number) => `${String(i).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
  // 요약형 표지는 aboda(초록)만 — 2dayskr(파랑)은 기존 표지 유지(사용자 확정 2026-10-18)
  const cover = T === THEMES.green ? summaryCover(plan, T, photo, pg(1)) : (
    <Shell T={T} dark page={pg(1)}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignSelf: 'flex-start', fontSize: 34, fontWeight: 900, color: T.A, background: '#fff', borderRadius: 40, padding: '10px 30px', marginBottom: 44 }}>{plan.kicker}</div>
        <Rich text={plan.hook} size={112} color="#fff" lh={1.2} hl={T.S} hlFg={T.N} />
      </div>
    </Shell>
  );
  const body = plan.points.map((p, k) => (
    <Shell key={k} T={T} dark={false} page={pg(k + 2)}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', width: 110, height: 110, borderRadius: 55, background: T.A, color: '#fff', fontSize: 60, fontWeight: 900, alignItems: 'center', justifyContent: 'center', marginBottom: 40 }}>{k + 1}</div>
        <Rich text={p.title} size={80} color={T.N} lh={1.25} hl={T.S} hlFg={T.N} />
        <div style={{ display: 'flex', marginTop: 36, paddingLeft: 28, borderLeft: `8px solid ${T.A}` }}><Rich text={p.body} size={50} color={T.sub} weight={700} lh={1.5} hl={T.S} hlFg={T.N} /></div>
      </div>
    </Shell>
  ));
  const cta = (
    <Shell T={T} dark page={pg(n)}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Rich text="전체 내용은 **댓글 링크**에서 확인하세요" size={84} color="#fff" lh={1.25} hl={T.S} hlFg={T.N} />
        <div style={{ display: 'flex', marginTop: 56, fontSize: 40, fontWeight: 900, color: '#fff', background: 'rgba(255,255,255,0.16)', borderRadius: 24, padding: '22px 34px', alignSelf: 'flex-start' }}>{T.handle} 팔로우</div>
        <div style={{ display: 'flex', marginTop: 28, fontSize: 32, fontWeight: 700, color: T.mute }}>저장 · 공유가 큰 힘이 돼요</div>
      </div>
    </Shell>
  );
  return [cover, ...body, cta];
}

const strip = (s: unknown) => String(s ?? '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim();

/** 블로그 글 → 블루 브랜드 카드뉴스 6장 URL. 실패 시 null */
export async function buildBrandCards(title: string, contentHtml: string, slug: string, opts: { theme?: BrandTheme; imageUrl?: string | null } = {}): Promise<string[] | null> {
  try { return await makeBrandCards(title, contentHtml, slug, opts); } catch (e) {
    console.error('[brand-cards] 실패→단일 이미지 폴백:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function makeBrandCards(title: string, contentHtml: string, slug: string, opts: { theme?: BrandTheme; imageUrl?: string | null } = {}): Promise<string[]> {
  {
    const text = contentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
    const plan = await askJson<BrandPlan>(
      `블로그 글을 인스타·스레드용 카드뉴스로 압축하세요. 글에 없는 사실·수치는 지어내지 말 것. 이모지 금지.\n\n[제목] ${title}\n[본문] ${text}\n\nJSON만 출력: {"hook":"표지 헤드라인 12~22자, 핵심어 1~2개를 **이렇게** 감싸 강조","kicker":"표지 상단 라벨 2~8자","bullets":["표지 하단 핵심 한 줄 14~22자(핵심어 **강조**, 문장 끝 마침표 없음) ×정확히 3개"],"points":[{"title":"핵심 포인트 제목 12~24자(핵심어 **강조**)","body":"쉬운 설명 2문장 60~100자"} ×정확히 4개]}`,
      v => (v?.hook && v?.kicker && Array.isArray(v.points) && v.points.filter(p => p?.title && p?.body).length >= 3 ? null : '카드 구성 부족'),
    );
    plan.hook = strip(plan.hook).slice(0, 40); plan.kicker = strip(plan.kicker).slice(0, 12);
    plan.points = plan.points.filter(p => p?.title && p?.body).slice(0, 4).map(p => ({ title: strip(p.title).slice(0, 50), body: strip(p.body).slice(0, 120) }));
    plan.bullets = (Array.isArray(plan.bullets) ? plan.bullets : []).map(b => strip(b).slice(0, 40)).filter(Boolean).slice(0, 3);
    const T = THEMES[opts.theme || 'blue'];
    const photo = T === THEMES.green ? await photoData(opts.imageUrl, 960, 470) : null;
    const urls: string[] = [];
    const els = slides(plan, T, photo);
    for (let i = 0; i < els.length; i++) {
      urls.push(await uploadToR2(`brandcards/${slug}/c${String(i + 1).padStart(2, '0')}.jpg`, await toJpeg(els[i], 1080, 1350), 'image/jpeg'));
    }
    if (urls.length < 3) throw new Error('카드 3장 미만');
    return urls;
  }
}
