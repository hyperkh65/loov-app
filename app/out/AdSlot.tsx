'use client';
import { useEffect } from 'react';

export default function AdSlot() {
  useEffect(() => {
    try { ((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ||= []).push({}); } catch {}
  }, []);
  return <ins className="adsbygoogle" style={{ display: 'block', minHeight: 250 }} data-ad-client="ca-pub-8940400388075870" data-ad-slot="9071434254" data-ad-format="auto" data-full-width-responsive="true" />;
}
