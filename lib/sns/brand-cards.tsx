/* eslint-disable @next/next/no-img-element */
/**
 * 2dayskr 브랜드 카드뉴스(블루·심플) — 자동 발행의 SNS(인스타/스레드) 전용. 블로그 본문에는 넣지 않음.
 * 맥/외부 이미지 의존 없음(satori 서버 렌더) — 실패하면 null을 돌려 호출 측이 기존 단일 이미지로 폴백.
 */
import type { ReactElement, ReactNode } from 'react';
import { uploadToR2 } from '@/lib/r2-storage';
import { askJson } from '@/lib/techhub/write';
import { Rich, toJpeg } from '@/lib/techhub/render';

const BLUE = '#1747FF';
const NAVY = '#0A1B6B';
const SKY = '#CFE0FF';
const BRAND = '2DAYS.KR';
const HANDLE = '@2dayskr';

interface BrandPlan { hook: string; kicker: string; points: Array<{ title: string; body: string }> }

const Shell = ({ dark, page, children }: { dark: boolean; page: string; children: ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, padding: '84px 80px', fontFamily: 'P', justifyContent: 'space-between',
    background: dark ? BLUE : '#F3F7FF', backgroundImage: dark ? 'linear-gradient(160deg, #2F63FF 0%, #1747FF 45%, #0A1B6B 100%)' : undefined }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', fontSize: 30, fontWeight: 900, letterSpacing: 4, color: dark ? '#fff' : BLUE }}>{BRAND}</div>
      <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: dark ? '#BCD0FF' : '#8AA0D8' }}>{page}</div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>{children}</div>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28, fontWeight: 700, color: dark ? '#BCD0FF' : '#8AA0D8' }}>
      <div style={{ display: 'flex' }}>{HANDLE}</div>
      <div style={{ display: 'flex' }}>넘겨서 보기 →</div>
    </div>
  </div>
);

function slides(plan: BrandPlan): ReactElement[] {
  const n = plan.points.length + 2;
  const pg = (i: number) => `${String(i).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
  const cover = (
    <Shell dark page={pg(1)}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignSelf: 'flex-start', fontSize: 34, fontWeight: 900, color: BLUE, background: '#fff', borderRadius: 40, padding: '10px 30px', marginBottom: 44 }}>{plan.kicker}</div>
        <Rich text={plan.hook} size={112} color="#fff" lh={1.2} hl={SKY} hlFg={NAVY} />
      </div>
    </Shell>
  );
  const body = plan.points.map((p, k) => (
    <Shell key={k} dark={false} page={pg(k + 2)}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', width: 96, height: 96, borderRadius: 48, background: BLUE, color: '#fff', fontSize: 52, fontWeight: 900, alignItems: 'center', justifyContent: 'center', marginBottom: 44 }}>{k + 1}</div>
        <Rich text={p.title} size={72} color={NAVY} lh={1.25} hl={SKY} hlFg={NAVY} />
        <div style={{ display: 'flex', marginTop: 40 }}><Rich text={p.body} size={44} color="#3A4A86" weight={700} lh={1.5} hl={SKY} hlFg={NAVY} /></div>
      </div>
    </Shell>
  ));
  const cta = (
    <Shell dark page={pg(n)}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Rich text="전체 내용은 **댓글 링크**에서 확인하세요" size={84} color="#fff" lh={1.25} hl={SKY} hlFg={NAVY} />
        <div style={{ display: 'flex', marginTop: 56, fontSize: 40, fontWeight: 900, color: '#fff', background: 'rgba(255,255,255,0.16)', borderRadius: 24, padding: '22px 34px', alignSelf: 'flex-start' }}>{HANDLE} 팔로우</div>
        <div style={{ display: 'flex', marginTop: 28, fontSize: 32, fontWeight: 700, color: '#BCD0FF' }}>저장 · 공유가 큰 힘이 돼요</div>
      </div>
    </Shell>
  );
  return [cover, ...body, cta];
}

const strip = (s: unknown) => String(s ?? '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim();

/** 블로그 글 → 블루 브랜드 카드뉴스 6장 URL. 실패 시 null */
export async function buildBrandCards(title: string, contentHtml: string, slug: string): Promise<string[] | null> {
  try { return await makeBrandCards(title, contentHtml, slug); } catch (e) {
    console.error('[brand-cards] 실패→단일 이미지 폴백:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function makeBrandCards(title: string, contentHtml: string, slug: string): Promise<string[]> {
  {
    const text = contentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
    const plan = await askJson<BrandPlan>(
      `블로그 글을 인스타·스레드용 카드뉴스로 압축하세요. 글에 없는 사실·수치는 지어내지 말 것. 이모지 금지.\n\n[제목] ${title}\n[본문] ${text}\n\nJSON만 출력: {"hook":"표지 헤드라인 12~22자, 핵심어 1~2개를 **이렇게** 감싸 강조","kicker":"표지 상단 라벨 2~8자","points":[{"title":"핵심 포인트 제목 12~24자(핵심어 **강조**)","body":"쉬운 설명 2문장 70~110자"} ×정확히 4개]}`,
      v => (v?.hook && v?.kicker && Array.isArray(v.points) && v.points.filter(p => p?.title && p?.body).length >= 3 ? null : '카드 구성 부족'),
    );
    plan.hook = strip(plan.hook).slice(0, 40); plan.kicker = strip(plan.kicker).slice(0, 12);
    plan.points = plan.points.filter(p => p?.title && p?.body).slice(0, 4).map(p => ({ title: strip(p.title).slice(0, 50), body: strip(p.body).slice(0, 160) }));
    const urls: string[] = [];
    const els = slides(plan);
    for (let i = 0; i < els.length; i++) {
      urls.push(await uploadToR2(`brandcards/${slug}/c${String(i + 1).padStart(2, '0')}.jpg`, await toJpeg(els[i], 1080, 1350), 'image/jpeg'));
    }
    if (urls.length < 3) throw new Error('카드 3장 미만');
    return urls;
  }
}
