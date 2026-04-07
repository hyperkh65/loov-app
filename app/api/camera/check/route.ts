import { NextRequest, NextResponse } from 'next/server';
import { nasExec, nasExecCustom } from '@/lib/nas-ssh';
import { getSetting } from '@/lib/get-setting';
import { createClient } from '@/lib/supabase-server';
import { getUserSettings, isOwner } from '@/lib/user-settings';

// NAS 연결 체크 (대표님 - env var 사용)
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
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `연결 실패: ${message}` };
  }
}

// NAS 연결 체크 (일반 유저 - 커스텀 SSH 연결)
async function checkNasCustom(options: { host: string; port?: number; username: string; password: string }) {
  try {
    const result = await nasExecCustom('echo "loov-cam-ok"', options);
    const ok = result.stdout.includes('loov-cam-ok') && result.code === 0;
    if (ok) {
      const dir = await nasExecCustom('ls /volume1/web/camera_photos 2>/dev/null | wc -l', options);
      const count = parseInt(dir.stdout.trim()) || 0;
      return { ok: true, message: `SSH 연결 성공 · 저장된 사진 ${count}개` };
    }
    return { ok: false, message: `SSH 응답 오류: ${result.stderr || '알 수 없는 오류'}` };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `연결 실패: ${message}` };
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
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `연결 실패: ${message}` };
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get('target'); // 'nas' | 'notion' | 'all'

  // 현재 로그인 유저 확인
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const owner = user ? isOwner(user.id) : true; // 인증 없으면 owner 모드로 fallback

  if (owner) {
    // 대표님: 기존 env var / app_settings 사용
    const notionApiKey = await getSetting('NOTION_API_KEY') || process.env.NOTION_API_KEY || '';
    const notionCamDbId = await getSetting('NOTION_CAMERA_DB_ID') || process.env.NOTION_CAMERA_DB_ID || '';

    if (target === 'nas') {
      return NextResponse.json(await checkNas());
    }
    if (target === 'notion') {
      return NextResponse.json(await checkNotion(notionApiKey, notionCamDbId));
    }

    const [nas, notion] = await Promise.all([
      checkNas(),
      checkNotion(notionApiKey, notionCamDbId),
    ]);
    return NextResponse.json({ nas, notion });
  } else {
    // 일반 유저: user_settings 읽기
    const userSettings = user ? await getUserSettings(user.id) : null;
    const notionApiKey = userSettings?.notion_api_key || '';
    const notionCamDbId = userSettings?.notion_camera_db_id || '';

    const nasCredentials = userSettings?.nas_ssh_host && userSettings?.nas_ssh_user && userSettings?.nas_ssh_password
      ? {
          host: userSettings.nas_ssh_host,
          port: userSettings.nas_ssh_port ?? 22,
          username: userSettings.nas_ssh_user,
          password: userSettings.nas_ssh_password,
        }
      : null;

    if (target === 'nas') {
      if (!nasCredentials) {
        return NextResponse.json({ ok: false, message: 'NAS 설정 없음 (SSH 정보를 설정하세요)' });
      }
      return NextResponse.json(await checkNasCustom(nasCredentials));
    }
    if (target === 'notion') {
      return NextResponse.json(await checkNotion(notionApiKey, notionCamDbId));
    }

    const [nas, notion] = await Promise.all([
      nasCredentials ? checkNasCustom(nasCredentials) : Promise.resolve({ ok: false, message: 'NAS 미설정' }),
      checkNotion(notionApiKey, notionCamDbId),
    ]);
    return NextResponse.json({ nas, notion });
  }
}
