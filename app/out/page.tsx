import Script from 'next/script';
import type { Metadata } from 'next';
import AdSlot from './AdSlot';

export const metadata: Metadata = { title: '관련 사이트로 이동', robots: { index: false, follow: false } };

export default async function Out({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  const { u = '' } = await searchParams;
  let url: URL | null = null;
  try { const x = new URL(u); if (/^https?:$/.test(x.protocol)) url = x; } catch {}

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '40px 16px', fontFamily: 'system-ui,sans-serif', color: '#1f2933' }}>
      <Script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8940400388075870" crossOrigin="anonymous" strategy="afterInteractive" />
      <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>관련 사이트로 이동합니다</h1>
      {url ? (
        <>
          <p style={{ margin: '0 0 20px', wordBreak: 'break-all', color: '#52606d' }}>이동할 곳: <b>{url.hostname}</b></p>
          <AdSlot />
          <a href={url.href} rel="nofollow noopener noreferrer" style={{ display: 'block', margin: '24px 0 0', padding: '14px', textAlign: 'center', background: '#1a73e8', color: '#fff', borderRadius: 8, fontWeight: 700, textDecoration: 'none' }}>
            {url.hostname} 바로 가기
          </a>
        </>
      ) : <p>올바르지 않은 주소입니다.</p>}
    </main>
  );
}
