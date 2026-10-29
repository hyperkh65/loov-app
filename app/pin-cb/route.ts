/**
 * GET /pin-cb — 핀터레스트 OAuth 승인 뒤 돌아오는 주소. 로그인한 LOOV 사용자만.
 * code를 앱 비밀 키(설정에 저장)로 토큰으로 바꿔 PINTEREST_ACCESS_TOKEN/REFRESH_TOKEN에 저장한다.
 * 토큰·비밀 키는 화면이나 대화에 나오지 않는다. (핀 쓰기 권한 확보 + 자동 갱신, 2026-10-29)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { getSetting, invalidateSettingsCache } from '@/lib/get-setting';

const APP_ID = '1583709', REDIRECT = 'https://loov.co.kr/pin-cb';
const page = (msg: string, ok: boolean) => new NextResponse(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;padding:24px;line-height:1.6"><h2>${ok ? '✅' : '⚠️'} 핀터레스트 연결</h2><p>${msg}</p><p><a href="/dashboard/settings">설정으로 돌아가기</a></p>`,
  { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8' } });

export async function GET(req: NextRequest) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return page('LOOV에 로그인한 상태에서 다시 시도해 주세요.', false);
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return page('승인 코드가 없어요. 설정에서 "핀터레스트 승인하기"를 다시 눌러 주세요.', false);
  const secret = await getSetting('PINTEREST_APP_SECRET');
  if (!secret) return page('앱 비밀 키가 아직 저장되지 않았어요. 설정에서 앱 비밀 키를 저장한 뒤 다시 승인해 주세요.', false);

  const res = await fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${APP_ID}:${secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT }),
    signal: AbortSignal.timeout(20_000),
  });
  const d = await res.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; scope?: string; expires_in?: number; message?: string };
  if (!res.ok || !d.access_token) return page(`토큰 교환 실패(${res.status}): ${d.message || '앱 비밀 키 또는 승인 코드를 확인해 주세요'}`, false);

  const admin = await createAdminClient();
  const { data: cur } = await admin.from('app_settings').select('settings').eq('id', 1).single();
  const next: Record<string, string> = { ...((cur?.settings as Record<string, string>) || {}), PINTEREST_ACCESS_TOKEN: d.access_token, PINTEREST_TOKEN_EXPIRES: String(Date.now() + (d.expires_in || 0) * 1000) };
  if (d.refresh_token) next.PINTEREST_REFRESH_TOKEN = d.refresh_token;
  const { error } = await admin.from('app_settings').update({ settings: next, updated_at: new Date().toISOString() }).eq('id', 1);
  if (error) return page('저장 실패: ' + error.message, false);
  invalidateSettingsCache();
  const scopes = (d.scope || '').split(/[ ,]+/);
  return page(`토큰을 저장했어요. 권한: ${d.scope || '-'}. ${scopes.includes('pins:write') ? '핀 쓰기 권한이 있어요.' : '⚠️ pins:write 권한이 없어요.'} ${d.refresh_token ? '자동 갱신도 켜졌어요.' : ''}`, scopes.includes('pins:write'));
}
