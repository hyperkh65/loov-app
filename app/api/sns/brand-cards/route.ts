import { NextRequest, NextResponse } from 'next/server';
import { inboxAuthed } from '@/lib/shorts-youtube';
import { buildBrandCards } from '@/lib/sns/brand-cards';

export const maxDuration = 120;

// 점검용 — 발행 없이 블루 브랜드 카드뉴스만 생성해 URL 반환
export async function POST(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { title, content } = await req.json();
  const cards = await buildBrandCards(String(title || ''), String(content || ''), `test-${Date.now().toString(36)}`);
  return NextResponse.json({ cards });
}
