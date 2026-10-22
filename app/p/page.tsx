import type { Metadata } from 'next';
import { readShop } from '@/lib/shop';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '쇼츠 상품 모음 — 2days', description: '쇼츠에서 본 상품을 상품번호로 찾아보세요.', robots: { index: false } };

// 유튜브 쇼츠는 설명란 링크가 안 눌린다 → 채널 프로필 링크(loov.co.kr/p)로 이 페이지에 와서 상품번호로 찾는다
export default async function Picks({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = String((await searchParams).q || '').replace(/[^0-9]/g, ''), all = readShop();
  const list = q ? all.filter(x => String(x.no) === q) : all.slice(0, 200);
  return (
    <main className="picks" style={{ boxSizing: 'border-box', maxWidth: 560, margin: '0 auto', padding: '24px 16px 60px', fontFamily: '-apple-system, "Apple SD Gothic Neo", sans-serif', color: '#1b1b1f' }}>
      <style>{'.picks *{box-sizing:border-box}'}</style>
      <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>🛒 쇼츠 상품 모음</h1>
      <p style={{ color: '#666', margin: '0 0 16px', fontSize: 14 }}>영상에 나온 <b>상품번호</b>로 찾아보세요. 최신 상품이 위에 있어요.</p>
      <form style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <input name="q" defaultValue={q} inputMode="numeric" placeholder="상품번호 (예: 37)" style={{ flex: 1, minWidth: 0, padding: '12px 14px', fontSize: 16, border: '1px solid #ddd', borderRadius: 12 }} />
        <button style={{ padding: '0 18px', fontSize: 16, border: 0, borderRadius: 12, background: '#111', color: '#fff' }}>찾기</button>
      </form>
      {q && !list.length && <p>#{q} 상품을 찾지 못했어요. <a href="/p">전체 보기</a></p>}
      {list.map(x => (
        <a key={x.no} id={`p${x.no}`} href={x.link} target="_blank" rel="nofollow sponsored noopener" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, marginBottom: 10, border: '1px solid #eee', borderRadius: 16, color: 'inherit', textDecoration: 'none' }}>
          {x.img ? <img src={x.img} alt="" width={72} height={72} style={{ borderRadius: 12, objectFit: 'cover', flex: 'none' }} /> : <div style={{ width: 72, height: 72, borderRadius: 12, background: '#f2f2f2', flex: 'none' }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#e5484d' }}>#{x.no}</div>
            <div style={{ fontSize: 15, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{x.title}</div>
            {x.price ? <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{x.price.toLocaleString()}원</div> : null}
          </div>
        </a>
      ))}
      <p style={{ fontSize: 12, color: '#999', marginTop: 24, lineHeight: 1.6 }}>이 페이지의 링크는 쿠팡 파트너스 등 제휴 마케팅 링크로, 구매 시 일정액의 수수료를 제공받을 수 있습니다. 가격은 등록 시점 기준이며 바뀔 수 있어요.</p>
    </main>
  );
}
