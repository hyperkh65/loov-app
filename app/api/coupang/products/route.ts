import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getGoldboxProducts, searchProducts } from '@/lib/coupang/api';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'goldbox';
  const keyword = searchParams.get('keyword') || '';

  // 저장된 API 키 조회
  const { data: settings } = await supabase
    .from('bossai_company_settings')
    .select('coupang_config')
    .eq('user_id', user.id)
    .maybeSingle();

  const config = settings?.coupang_config as { accessKey?: string; secretKey?: string } | null;
  if (!config?.accessKey || !config?.secretKey)
    return NextResponse.json({ error: '쿠팡파트너스 API 키를 먼저 설정해주세요 (설정 > 쿠팡파트너스)' }, { status: 400 });

  try {
    const products = type === 'search' && keyword
      ? await searchProducts(keyword, config.accessKey, config.secretKey)
      : await getGoldboxProducts(config.accessKey, config.secretKey);

    return NextResponse.json({ products });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
