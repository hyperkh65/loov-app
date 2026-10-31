// POST /api/ddalkak/activate { code, email, deviceId, deviceName } — 번호 등록(처음이면 기간 시작) + 기기 등록 + 서명 인증서 발급
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { hashCode, addMonths, signingKey, signCert, PLANS } from '@/lib/ddalkak-license';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { code?: string; email?: string; deviceId?: string; deviceName?: string };
  const email = String(b.email || '').trim().toLowerCase(), deviceId = String(b.deviceId || ''), code = String(b.code || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('이메일 주소를 확인해 주세요');
  if (deviceId.length < 16 || deviceId.length > 80) return fail('기기 정보가 올바르지 않아요');
  if (code.replace(/[^A-Za-z0-9]/g, '').length < 12) return fail('라이선스 번호를 확인해 주세요');

  const key = await signingKey(false);
  if (!key) return fail('서비스를 준비 중이에요. 잠시 뒤 다시 시도해 주세요', 503);
  const admin = createAdminClient();
  const { data: lic } = await admin.from('ddalkak_licenses').select('*').eq('code_hash', hashCode(code)).maybeSingle();
  if (!lic) return fail('없는 번호예요. 다시 확인해 주세요', 404);
  if (lic.status === 'revoked') return fail('사용이 중지된 번호예요. 판매처에 문의해 주세요', 403);

  const now = new Date();
  if (lic.status === 'unused') { // 처음 등록한 순간부터 기간이 시작된다
    const months = PLANS[lic.plan as keyof typeof PLANS]?.months ?? lic.months;
    const { error } = await admin.from('ddalkak_licenses').update({ status: 'active', email, activated_at: now.toISOString(), expires_at: addMonths(now, months).toISOString() }).eq('id', lic.id).eq('status', 'unused');
    if (error) return fail('등록에 실패했어요. 다시 시도해 주세요', 500);
    lic.status = 'active'; lic.email = email; lic.expires_at = addMonths(now, months).toISOString();
  } else if ((lic.email || '').toLowerCase() !== email) return fail('이미 다른 이메일로 등록된 번호예요', 403);
  if (new Date(lic.expires_at) < now) return fail('이용 기간이 끝난 번호예요. 새 번호로 연장해 주세요', 403);

  const { data: devs } = await admin.from('ddalkak_devices').select('device_id').eq('license_id', lic.id);
  const known = (devs || []).some(d => d.device_id === deviceId);
  if (!known && (devs || []).length >= lic.max_devices) return fail(`이 번호는 기기 ${lic.max_devices}대까지만 쓸 수 있어요. 다른 기기를 해제하려면 판매처에 문의해 주세요`, 403);
  await admin.from('ddalkak_devices').upsert({ license_id: lic.id, device_id: deviceId, device_name: String(b.deviceName || '').slice(0, 60), last_seen: now.toISOString() }, { onConflict: 'license_id,device_id' });

  const cert = signCert(key, { lid: lic.id, email, plan: lic.plan, licExp: new Date(lic.expires_at).getTime(), dev: deviceId });
  return NextResponse.json({ ok: true, cert, plan: lic.plan, planLabel: PLANS[lic.plan as keyof typeof PLANS]?.label, expiresAt: lic.expires_at });
}
