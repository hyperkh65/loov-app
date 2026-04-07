import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getUserSettings, saveUserSettings, isOwner, UserSettings } from '@/lib/user-settings';

function maskValue(val: string | undefined, prefixLen = 0): string {
  if (!val) return '';
  if (prefixLen > 0 && val.length > prefixLen) {
    return val.slice(0, prefixLen) + '••••••';
  }
  return '••••••••';
}

export async function GET() {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const settings = await getUserSettings(user.id);

    // 민감 정보 마스킹
    const masked = settings ? {
      nas_ssh_host: settings.nas_ssh_host || '',
      nas_ssh_port: settings.nas_ssh_port ?? 22,
      nas_ssh_user: settings.nas_ssh_user || '',
      nas_ssh_password: settings.nas_ssh_password ? '••••••••' : '',
      nas_web_base_url: settings.nas_web_base_url || '',
      notion_api_key: settings.notion_api_key ? maskValue(settings.notion_api_key, 7) : '',
      notion_camera_db_id: settings.notion_camera_db_id || '',
      cctv_streams: settings.cctv_streams || [],
      storage_type: settings.storage_type || 'r2',
      camera_secret_password: settings.camera_secret_password ? '••••' : '',
      plan: settings.plan || 'free',
      plan_expires_at: settings.plan_expires_at || '',
      stripe_customer_id: settings.stripe_customer_id ? maskValue(settings.stripe_customer_id, 4) : '',
      stripe_subscription_id: settings.stripe_subscription_id ? maskValue(settings.stripe_subscription_id, 4) : '',
    } : null;

    const hasNas = !!(settings?.nas_ssh_host && settings?.nas_ssh_user && settings?.nas_ssh_password);
    const hasNotion = !!(settings?.notion_api_key && settings?.notion_camera_db_id);

    return NextResponse.json({ settings: masked, hasNas, hasNotion });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    // 대표님 설정은 이 API를 통해 변경 불가
    if (isOwner(user.id)) {
      return NextResponse.json({ error: '대표님 설정은 환경변수로 관리됩니다' }, { status: 403 });
    }

    const body = await req.json() as Partial<UserSettings>;

    // 기존 설정 읽기
    const existing = await getUserSettings(user.id) || {};

    // 빈 값('')이면 기존 값 유지, 값이 있으면 업데이트
    const updates: Partial<UserSettings> = {};

    if (body.nas_ssh_host !== undefined && body.nas_ssh_host !== '') updates.nas_ssh_host = body.nas_ssh_host;
    if (body.nas_ssh_port !== undefined) updates.nas_ssh_port = body.nas_ssh_port;
    if (body.nas_ssh_user !== undefined && body.nas_ssh_user !== '') updates.nas_ssh_user = body.nas_ssh_user;
    // 비밀번호: 마스킹된 값(•)이면 기존 값 유지
    if (body.nas_ssh_password !== undefined && body.nas_ssh_password !== '' && !body.nas_ssh_password.includes('•')) {
      updates.nas_ssh_password = body.nas_ssh_password;
    }
    if (body.nas_web_base_url !== undefined && body.nas_web_base_url !== '') updates.nas_web_base_url = body.nas_web_base_url;
    if (body.nas_web_base_url === '') updates.nas_web_base_url = '';

    if (body.notion_api_key !== undefined && body.notion_api_key !== '' && !body.notion_api_key.includes('•')) {
      updates.notion_api_key = body.notion_api_key;
    }
    if (body.notion_camera_db_id !== undefined && body.notion_camera_db_id !== '') updates.notion_camera_db_id = body.notion_camera_db_id;

    if (body.cctv_streams !== undefined) updates.cctv_streams = body.cctv_streams;
    if (body.storage_type !== undefined) updates.storage_type = body.storage_type;

    if (body.camera_secret_password !== undefined && body.camera_secret_password !== '' && !body.camera_secret_password.includes('•')) {
      updates.camera_secret_password = body.camera_secret_password;
    }

    // user_id는 강제로 현재 유저
    const toSave = { ...existing, ...updates };
    delete toSave.user_id; // saveUserSettings가 userId를 별도 인수로 받음

    await saveUserSettings(user.id, toSave);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
