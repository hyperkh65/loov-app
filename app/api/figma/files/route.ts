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

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

type FigmaNode = {
  id: string; name: string; type: string;
  children?: FigmaNode[];
  fills?: { type: string; color?: { r: number; g: number; b: number; a: number } }[];
  style?: {
    fontFamily?: string; fontSize?: number; fontWeight?: number;
    lineHeightPx?: number; letterSpacing?: number; textCase?: string;
  };
};

type FigmaComponent = {
  key: string; name: string; description?: string;
  node_id: string; thumbnail_url?: string;
  containing_frame?: { name?: string; nodeId?: string; pageId?: string; pageName?: string; backgroundColorId?: string; id?: string };
};

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = await getFigmaToken(supabase, user.id);
  if (!token) return NextResponse.json({ error: 'Figma 연동이 필요합니다' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const fileKey = searchParams.get('fileKey');

  const figmaFetch = (path: string) =>
    fetch(`https://api.figma.com/v1${path}`, { headers: { 'X-Figma-Token': token } });

  // ── 파일 정보 + 프레임 목록 ─────────────────────────────────
  if (action === 'file' && fileKey) {
    const res = await figmaFetch(`/files/${fileKey}?depth=2`);
    if (!res.ok) return NextResponse.json({ error: 'Figma 파일을 불러올 수 없습니다' }, { status: 400 });
    const data = await res.json() as {
      name: string;
      lastModified: string;
      thumbnailUrl?: string;
      version: string;
      document: { children: FigmaNode[] };
    };

    const frames = (data.document?.children ?? [])
      .filter(n => n.type === 'CANVAS')
      .flatMap(canvas => (canvas.children ?? []).filter(n => n.type === 'FRAME'))
      .map(f => ({ id: f.id, name: f.name }));

    return NextResponse.json({
      name: data.name,
      lastModified: data.lastModified,
      thumbnailUrl: data.thumbnailUrl,
      version: data.version,
      frames,
    });
  }

  // ── PNG 내보내기 (프레임 / 임의 노드) ──────────────────────
  if (action === 'export' && fileKey) {
    const ids = searchParams.get('frameIds') ?? searchParams.get('nodeIds') ?? '';
    const format = (searchParams.get('format') ?? 'png') as 'png' | 'svg' | 'jpg' | 'pdf';
    const scale = Number(searchParams.get('scale') ?? '2');
    if (!ids) return NextResponse.json({ error: 'ids 필요' }, { status: 400 });

    const res = await figmaFetch(`/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`);
    if (!res.ok) return NextResponse.json({ error: '이미지 내보내기 실패' }, { status: 400 });
    const data = await res.json() as { images: Record<string, string | null>; err?: string };
    return NextResponse.json({ images: data.images });
  }

  // ── 색상 / 텍스트 스타일 추출 ─────────────────────────────
  if (action === 'styles' && fileKey) {
    const res = await figmaFetch(`/files/${fileKey}/styles`);
    if (!res.ok) return NextResponse.json({ error: '스타일 로드 실패' }, { status: 400 });
    const data = await res.json() as {
      meta: { styles: { key: string; node_id: string; name: string; style_type: string; description: string }[] };
    };

    const styles = data.meta?.styles ?? [];
    const fillStyles  = styles.filter(s => s.style_type === 'FILL');
    const textStyles  = styles.filter(s => s.style_type === 'TEXT');
    const effectStyles = styles.filter(s => s.style_type === 'EFFECT');

    // 색상 노드 실제 값 가져오기 (최대 20개)
    const colorNodeIds = fillStyles.slice(0, 20).map(s => s.node_id).join(',');
    let colorPalette: { name: string; hex: string; alpha: number; nodeId: string }[] = [];

    if (colorNodeIds) {
      const nodesRes = await figmaFetch(`/files/${fileKey}/nodes?ids=${encodeURIComponent(colorNodeIds)}`);
      if (nodesRes.ok) {
        const nodesData = await nodesRes.json() as { nodes: Record<string, { document: FigmaNode }> };
        colorPalette = fillStyles.slice(0, 20).map(style => {
          const node = nodesData.nodes[style.node_id]?.document;
          const fill = node?.fills?.[0];
          if (fill?.type === 'SOLID' && fill.color) {
            return {
              name: style.name,
              hex: rgbToHex(fill.color.r, fill.color.g, fill.color.b),
              alpha: fill.color.a,
              nodeId: style.node_id,
            };
          }
          return null;
        }).filter(Boolean) as typeof colorPalette;
      }
    }

    // 텍스트 스타일 (최대 10개)
    const textNodeIds = textStyles.slice(0, 10).map(s => s.node_id).join(',');
    let typography: { name: string; fontFamily: string; fontSize: number; fontWeight: number; nodeId: string }[] = [];

    if (textNodeIds) {
      const nodesRes = await figmaFetch(`/files/${fileKey}/nodes?ids=${encodeURIComponent(textNodeIds)}`);
      if (nodesRes.ok) {
        const nodesData = await nodesRes.json() as { nodes: Record<string, { document: FigmaNode }> };
        typography = textStyles.slice(0, 10).map(style => {
          const node = nodesData.nodes[style.node_id]?.document;
          if (node?.style) {
            return {
              name: style.name,
              fontFamily: node.style.fontFamily ?? '',
              fontSize: node.style.fontSize ?? 16,
              fontWeight: node.style.fontWeight ?? 400,
              nodeId: style.node_id,
            };
          }
          return null;
        }).filter(Boolean) as typeof typography;
      }
    }

    return NextResponse.json({
      colorPalette,
      typography,
      effectCount: effectStyles.length,
      totalStyles: styles.length,
    });
  }

  // ── 컴포넌트 목록 ─────────────────────────────────────────
  if (action === 'components' && fileKey) {
    const res = await figmaFetch(`/files/${fileKey}/components`);
    if (!res.ok) return NextResponse.json({ error: '컴포넌트 로드 실패' }, { status: 400 });
    const data = await res.json() as { meta: { components: FigmaComponent[] } };

    const components = (data.meta?.components ?? []).map(c => ({
      key: c.key,
      name: c.name,
      description: c.description ?? '',
      nodeId: c.node_id,
      group: c.name.includes('/') ? c.name.split('/')[0].trim() : '기타',
    }));

    // 컴포넌트 썸네일 (최대 12개)
    const previewIds = components.slice(0, 12).map(c => c.nodeId).join(',');
    let thumbnails: Record<string, string | null> = {};

    if (previewIds) {
      const imgRes = await figmaFetch(`/images/${fileKey}?ids=${encodeURIComponent(previewIds)}&format=png&scale=1`);
      if (imgRes.ok) {
        const imgData = await imgRes.json() as { images: Record<string, string | null> };
        thumbnails = imgData.images;
      }
    }

    return NextResponse.json({
      components: components.slice(0, 50).map(c => ({
        ...c,
        thumbnail: thumbnails[c.nodeId] ?? null,
      })),
      total: components.length,
    });
  }

  // ── 로컬 변수 (디자인 토큰) ───────────────────────────────
  if (action === 'variables' && fileKey) {
    const res = await figmaFetch(`/files/${fileKey}/variables/local`);
    if (!res.ok) return NextResponse.json({ error: '변수 로드 실패 (Enterprise/Professional 플랜 필요)' }, { status: 400 });
    const data = await res.json() as {
      meta: {
        variables: Record<string, {
          id: string; name: string; resolvedType: string;
          valuesByMode: Record<string, unknown>;
          description: string;
        }>;
        variableCollections: Record<string, {
          id: string; name: string; modes: { modeId: string; name: string }[];
          defaultModeId: string;
        }>;
      };
    };

    const variables = Object.values(data.meta?.variables ?? {});
    const collections = Object.values(data.meta?.variableCollections ?? {});

    const colorVars = variables
      .filter(v => v.resolvedType === 'COLOR')
      .map(v => {
        const collection = collections.find(c =>
          Object.keys(data.meta.variableCollections).some(id =>
            data.meta.variableCollections[id].id === id
          )
        );
        const defaultMode = collection?.defaultModeId ?? Object.keys(v.valuesByMode)[0];
        const val = v.valuesByMode[defaultMode] as { r?: number; g?: number; b?: number; a?: number } | undefined;
        return {
          id: v.id,
          name: v.name,
          hex: val?.r !== undefined ? rgbToHex(val.r, val.g ?? 0, val.b ?? 0) : null,
          alpha: val?.a ?? 1,
          description: v.description,
        };
      }).filter(v => v.hex);

    const numberVars = variables
      .filter(v => v.resolvedType === 'FLOAT')
      .slice(0, 20)
      .map(v => {
        const defaultMode = Object.keys(v.valuesByMode)[0];
        return { id: v.id, name: v.name, value: v.valuesByMode[defaultMode] as number };
      });

    return NextResponse.json({
      colorTokens: colorVars,
      spacingTokens: numberVars,
      totalVariables: variables.length,
      collections: collections.map(c => ({ id: c.id, name: c.name, modes: c.modes })),
    });
  }

  // ── 파일 버전 히스토리 ────────────────────────────────────
  if (action === 'versions' && fileKey) {
    const res = await figmaFetch(`/files/${fileKey}/versions`);
    if (!res.ok) return NextResponse.json({ error: '버전 로드 실패' }, { status: 400 });
    const data = await res.json() as {
      versions: { id: string; created_at: string; label?: string; description?: string; user: { handle: string } }[];
    };

    return NextResponse.json({
      versions: (data.versions ?? []).slice(0, 20).map(v => ({
        id: v.id,
        createdAt: v.created_at,
        label: v.label ?? null,
        description: v.description ?? null,
        user: v.user.handle,
      })),
    });
  }

  // ── 특정 노드 상세 정보 ───────────────────────────────────
  if (action === 'node' && fileKey) {
    const nodeId = searchParams.get('nodeId');
    if (!nodeId) return NextResponse.json({ error: 'nodeId 필요' }, { status: 400 });

    const res = await figmaFetch(`/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}&geometry=paths`);
    if (!res.ok) return NextResponse.json({ error: '노드 로드 실패' }, { status: 400 });
    const data = await res.json() as { nodes: Record<string, { document: FigmaNode }> };

    const node = data.nodes[nodeId]?.document;
    if (!node) return NextResponse.json({ error: '노드를 찾을 수 없습니다' }, { status: 404 });

    // 이미지도 함께 내보내기
    const imgRes = await figmaFetch(`/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=2`);
    const imgData = imgRes.ok ? await imgRes.json() as { images: Record<string, string | null> } : null;

    return NextResponse.json({
      node: {
        id: node.id,
        name: node.name,
        type: node.type,
        fills: node.fills,
        style: node.style,
      },
      imageUrl: imgData?.images?.[nodeId] ?? null,
    });
  }

  // ── 팀 프로젝트 & 파일 목록 ──────────────────────────────
  if (action === 'team-files') {
    const teamId = searchParams.get('teamId');
    if (!teamId) return NextResponse.json({ error: 'teamId 필요' }, { status: 400 });

    const projectsRes = await figmaFetch(`/teams/${teamId}/projects`);
    if (!projectsRes.ok) return NextResponse.json({ error: '팀 프로젝트 로드 실패' }, { status: 400 });
    const projectsData = await projectsRes.json() as { projects: { id: string; name: string }[] };

    const filesPromises = projectsData.projects.slice(0, 5).map(async project => {
      const filesRes = await figmaFetch(`/projects/${project.id}/files`);
      if (!filesRes.ok) return { project: project.name, files: [] };
      const filesData = await filesRes.json() as {
        files: { key: string; name: string; thumbnail_url?: string; last_modified: string }[];
      };
      return {
        project: project.name,
        projectId: project.id,
        files: filesData.files.map(f => ({
          key: f.key,
          name: f.name,
          thumbnail: f.thumbnail_url,
          lastModified: f.last_modified,
        })),
      };
    });

    const projectFiles = await Promise.all(filesPromises);
    return NextResponse.json({ projectFiles });
  }

  return NextResponse.json({ error: 'action 파라미터가 필요합니다 (file|export|styles|components|variables|versions|node|team-files)' }, { status: 400 });
}
