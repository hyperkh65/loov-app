import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { fetchOgMetadata, detectSourcePlatform } from '@/lib/affiliate-engine/safe-fetch';

const PLATFORM_SOURCE_NAME: Record<string, string> = {
  tiktok: 'TikTok Creative Center',
  youtube: 'YouTube / YouTube Shorts',
  instagram: 'Instagram 공개 발견',
  amazon: 'Amazon 베스트셀러',
  aliexpress: 'AliExpress',
  coupang: 'Coupang Partners',
  pinterest: 'Pinterest 트렌드',
  douyin: 'Douyin',
  xiaohongshu: 'Xiaohongshu (샤오홍슈)',
  taobao: 'Taobao / Tmall',
  '1688': '1688',
};

/** 관리자가 붙여넣은 URL로부터 소스를 식별하고, 합법적으로 접근 가능한 메타데이터(OG 태그)만
 * 수집해 affiliate_source_items에 REFERENCE 항목으로 저장한다. 영상/이미지 파일은 절대
 * 다운로드하지 않는다 — 권리 미확인 미디어는 원본 URL만 참조로 남는다 (섹션 15, 47). */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: 'url 필요' }, { status: 400 });

  const platform = detectSourcePlatform(url);
  const sourceName = PLATFORM_SOURCE_NAME[platform];

  let sourceId: string | null = null;
  if (sourceName) {
    const { data: src } = await supabase
      .from('affiliate_sources')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', sourceName)
      .maybeSingle();
    sourceId = src?.id || null;
  }
  if (!sourceId) {
    // 매칭되는 등록 소스가 없으면 "수동 입력" 소스를 upsert
    const { data: manual } = await supabase
      .from('affiliate_sources')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', '수동 URL 입력')
      .maybeSingle();
    if (manual) {
      sourceId = manual.id;
    } else {
      const { data: created, error: createErr } = await supabase.from('affiliate_sources').insert({
        user_id: user.id, name: '수동 URL 입력', source_type: 'manual',
        discovery_method: 'MANUAL_IMPORT', usage_mode: 'CREATIVE_REFERENCE',
        connector_status: 'REFERENCE_ONLY', commercial_use_status: 'UNKNOWN',
        enabled: true, priority: 10,
        notes: '관리자가 직접 붙여넣은 URL들이 자동으로 여기에 모입니다.',
      }).select('id').single();
      if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });
      sourceId = created.id;
    }
  }

  let meta;
  try {
    meta = await fetchOgMetadata(url);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const { data: item, error } = await supabase.from('affiliate_source_items').insert({
    user_id: user.id,
    source_id: sourceId,
    url,
    title: meta.title || null,
    description: meta.description || null,
    thumbnail_url: meta.image || null,
    raw_metrics: {},
    status: 'NEW',
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...item, detected_platform: platform });
}

export async function GET(req: NextRequest) {
  void req;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data, error } = await supabase
    .from('affiliate_source_items')
    .select('*, affiliate_sources(name, connector_status)')
    .eq('user_id', user.id)
    .order('discovered_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
