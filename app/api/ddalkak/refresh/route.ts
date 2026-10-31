// POST /api/ddalkak/refresh { cert, deviceId } — 앱이 주기적으로 새 인증서를 받아 간다(번호를 다시 입력할 필요 없음)
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { signingKey, signCert, readCert, PLANS } from '@/lib/ddalkak-license';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { cert?: string; deviceId?: string };
  const key = await signingKey(false);
  if (!key) return fail('서비스를 준비 중이에요', 503);
  const old = readCert(key, String(b.cert || ''));
  if (!old || old.dev !== b.deviceId) return fail('인증서가 올바르지 않아요. 번호를 다시 등록해 주세요', 401);

  const admin = createAdminClient();
  const { data: lic } = await admin.from('ddalkak_licenses').select('*').eq('id', old.lid).maybeSingle();
  if (!lic || lic.status === 'revoked') return fail('사용이 중지된 번호예요', 403);
  if (new Date(lic.expires_at) < new Date()) return fail('이용 기간이 끝났어요', 403);
  const { data: dev } = await admin.from('ddalkak_devices').select('id').eq('license_id', lic.id).eq('device_id', old.dev).maybeSingle();
  if (!dev) return fail('이 기기는 해제됐어요. 번호를 다시 등록해 주세요', 403);
  await admin.from('ddalkak_devices').update({ last_seen: new Date().toISOString() }).eq('id', dev.id);

  const cert = signCert(key, { lid: lic.id, email: lic.email, plan: lic.plan, licExp: new Date(lic.expires_at).getTime(), dev: old.dev });
  return NextResponse.json({ ok: true, cert, plan: lic.plan, planLabel: PLANS[lic.plan as keyof typeof PLANS]?.label, expiresAt: lic.expires_at });
}
