import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

async function getFigmaToken(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('bossai_figma_connections')
    .select('access_token')
    .eq('user_id', userId)
    .single();
  return data?.access_token ?? null;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = await getFigmaToken(supabase, user.id);
  if (!token) return NextResponse.json({ error: 'Figma 연동이 필요합니다' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const fileKey = searchParams.get('fileKey');

  // 파일 정보 조회
  if (action === 'file' && fileKey) {
    const res = await fetch(`https://api.figma.com/v1/files/${fileKey}?depth=1`, {
      headers: { 'X-Figma-Token': token },
    });
    if (!res.ok) return NextResponse.json({ error: 'Figma 파일을 불러올 수 없습니다' }, { status: 400 });
    const data = await res.json() as { name: string; document: { children: { id: string; name: string; type: string }[] } };

    type FigmaNode = { id: string; name: string; type: string; children?: FigmaNode[] };
    const frames = (data.document?.children ?? [] as FigmaNode[])
      .filter((n: FigmaNode) => n.type === 'CANVAS')
      .flatMap((canvas: FigmaNode) => (canvas.children ?? []).filter((n: FigmaNode) => n.type === 'FRAME'))
      .map((f: FigmaNode) => ({ id: f.id, name: f.name }));

    return NextResponse.json({ name: data.name, frames });
  }

  // 프레임 PNG 내보내기
  if (action === 'export' && fileKey) {
    const frameIds = searchParams.get('frameIds') ?? '';
    if (!frameIds) return NextResponse.json({ error: 'frameIds 필요' }, { status: 400 });

    const res = await fetch(
      `https://api.figma.com/v1/images/${fileKey}?ids=${frameIds}&format=png&scale=2`,
      { headers: { 'X-Figma-Token': token } }
    );
    if (!res.ok) return NextResponse.json({ error: '이미지 내보내기 실패' }, { status: 400 });
    const data = await res.json() as { images: Record<string, string> };
    return NextResponse.json({ images: data.images });
  }

  return NextResponse.json({ error: 'action 파라미터가 필요합니다' }, { status: 400 });
}
