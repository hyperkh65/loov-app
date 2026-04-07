import { NextRequest, NextResponse } from 'next/server';
import { nasExec } from '@/lib/nas-ssh';
import { getSetting } from '@/lib/get-setting';

// NAS 연결 체크
async function checkNas() {
  try {
    const result = await nasExec('echo "loov-cam-ok"');
    const ok = result.stdout.includes('loov-cam-ok') && result.code === 0;
    if (ok) {
      // 카메라 폴더 존재 여부
      const dir = await nasExec('ls /volume1/web/camera_photos 2>/dev/null | wc -l');
      const count = parseInt(dir.stdout.trim()) || 0;
      return { ok: true, message: `SSH 연결 성공 · 저장된 사진 ${count}개` };
    }
    return { ok: false, message: `SSH 응답 오류: ${result.stderr || '알 수 없는 오류'}` };
  } catch (e: any) {
    return { ok: false, message: `연결 실패: ${e.message}` };
  }
}

// Notion 카메라 DB 체크
async function checkNotion(apiKey: string, dbId: string) {
  if (!apiKey || !dbId) return { ok: false, message: 'API 키 또는 DB ID 미설정' };
  try {
    const cleanDbId = dbId.replace(/-/g, '');
    const res = await fetch(`https://api.notion.com/v1/databases/${cleanDbId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
      },
    });
    if (res.ok) {
      const d = await res.json();
      const title = d.title?.[0]?.plain_text || 'DB';
      return { ok: true, message: `연결 성공 · "${title}"` };
    }
    const err = await res.json();
    return { ok: false, message: `Notion 오류: ${err.message || res.status}` };
  } catch (e: any) {
    return { ok: false, message: `연결 실패: ${e.message}` };
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get('target'); // 'nas' | 'notion' | 'all'

  // 저장된 설정에서 읽기
  const notionApiKey = await getSetting('NOTION_API_KEY') || process.env.NOTION_API_KEY || '';
  const notionCamDbId = await getSetting('NOTION_CAMERA_DB_ID') || process.env.NOTION_CAMERA_DB_ID || '';

  if (target === 'nas') {
    return NextResponse.json(await checkNas());
  }
  if (target === 'notion') {
    return NextResponse.json(await checkNotion(notionApiKey, notionCamDbId));
  }

  // 전체 체크
  const [nas, notion] = await Promise.all([
    checkNas(),
    checkNotion(notionApiKey, notionCamDbId),
  ]);
  return NextResponse.json({ nas, notion });
}
