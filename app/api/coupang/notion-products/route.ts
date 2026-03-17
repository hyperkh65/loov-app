import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

function getProp(page: Record<string, unknown>, key: string, type: string): unknown {
  const props = page.properties as Record<string, Record<string, unknown>> | undefined;
  const prop = props?.[key];
  if (!prop) return null;
  if (type === 'title') return (prop.title as { plain_text: string }[])?.[0]?.plain_text ?? '';
  if (type === 'number') return prop.number ?? 0;
  if (type === 'url') return prop.url ?? '';
  if (type === 'rich_text') return (prop.rich_text as { plain_text: string }[])?.[0]?.plain_text ?? '';
  if (type === 'date') return (prop.date as { start: string })?.start ?? '';
  return null;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const apiKey = searchParams.get('apiKey');
  const dbId = searchParams.get('dbId');

  if (!apiKey || !dbId) return NextResponse.json({ error: 'apiKey, dbId 필요' }, { status: 400 });

  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({ page_size: 100, sorts: [{ property: '수집일', direction: 'descending' }] }),
  });

  if (!res.ok) {
    const err = await res.json();
    return NextResponse.json({ error: err.message || 'Notion API 오류' }, { status: res.status });
  }

  const data = await res.json();
  const products = (data.results as Record<string, unknown>[]).map((page) => ({
    id: page.id as string,
    name: getProp(page, '상품명', 'title'),
    price: getProp(page, '가격', 'number'),
    partnerLink: getProp(page, '파트너스링크', 'url'),
    originalUrl: getProp(page, '원본링크', 'url'),
    review1: getProp(page, '리뷰1', 'rich_text'),
    review2: getProp(page, '리뷰2', 'rich_text'),
    image1: getProp(page, '사진1', 'url'),
    image2: getProp(page, '사진2', 'url'),
    image3: getProp(page, '사진3', 'url'),
    image4: getProp(page, '사진4', 'url'),
    image5: getProp(page, '사진5', 'url'),
    collectedAt: getProp(page, '수집일', 'date'),
  }));

  return NextResponse.json({ products });
}

export async function POST(req: NextRequest) {
  // Notion 설정 저장
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { apiKey, dbId } = await req.json();
  await supabase.from('bossai_company_settings').upsert(
    { user_id: user.id, coupang_notion_config: { apiKey, dbId } },
    { onConflict: 'user_id' },
  );
  return NextResponse.json({ success: true });
}
