import { NextRequest, NextResponse } from 'next/server';
import { inboxAuthed } from '@/lib/shorts-youtube';
import { upsertShop } from '@/lib/shop';

// 딸깍이 상품 영상을 만들 때 상품번호·이름·제휴 링크를 등록한다(딸깍 토큰)
export async function POST(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  const b = await req.json().catch(() => ({})) as { no?: number; title?: string; link?: string; img?: string; price?: number };
  const no = Math.floor(Number(b.no)), link = String(b.link || '');
  if (!(no > 0) || !/^https:\/\//.test(link) || !b.title) return NextResponse.json({ error: '형식 오류' }, { status: 400 });
  upsertShop({ no, title: String(b.title).slice(0, 120), link, img: /^https:\/\//.test(String(b.img || '')) ? String(b.img) : undefined, price: Number(b.price) || undefined, at: Date.now() });
  return NextResponse.json({ ok: true, no });
}
