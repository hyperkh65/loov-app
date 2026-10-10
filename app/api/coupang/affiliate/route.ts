import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import { createAffiliateLinks } from '@/lib/coupang/api';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { productUrl } = await req.json() as { productUrl?: string };
  if (!productUrl) return NextResponse.json({ error: 'productUrl이 필요합니다' }, { status: 400 });

  const accessKey = await getSetting('COUPANG_ACCESS_KEY');
  const secretKey = await getSetting('COUPANG_SECRET_KEY');

  if (!accessKey || !secretKey)
    return NextResponse.json({ error: 'API 키를 먼저 설정해주세요' }, { status: 400 });

  try {
    const links = await createAffiliateLinks([productUrl], accessKey, secretKey);
    return NextResponse.json({ affiliateUrl: links[0] || productUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
