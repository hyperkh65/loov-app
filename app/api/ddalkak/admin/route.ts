// 딸깍 라이선스 관리(운영자 전용): 목록 / 발급 / 중지. 번호 원문은 발급 응답에서 한 번만 보여 준다.
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { isMasterEmail } from '@/lib/ai-usage';
import { PLANS, hashCode, newCode, signingKey, type PlanId } from '@/lib/ddalkak-license';

async function guard() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  return user && isMasterEmail(user.email || '') ? user : null;
}
const deny = () => NextResponse.json({ error: '권한 없음' }, { status: 403 });

export async function GET() {
  if (!await guard()) return deny();
  const admin = createAdminClient();
  const { data: lics, error } = await admin.from('ddalkak_licenses').select('id, code_hint, plan, status, email, activated_at, expires_at, max_devices, memo, created_at').order('created_at', { ascending: false }).limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: devs } = await admin.from('ddalkak_devices').select('license_id, device_name, last_seen');
  const by: Record<string, { name: string; last: string }[]> = {};
  for (const d of devs || []) (by[d.license_id] ||= []).push({ name: d.device_name || '(이름 없음)', last: d.last_seen });
  return NextResponse.json({ plans: PLANS, items: (lics || []).map(l => ({ ...l, devices: by[l.id] || [] })) });
}

export async function POST(req: NextRequest) {
  if (!await guard()) return deny();
  const b = await req.json().catch(() => ({})) as { action?: string; plan?: PlanId; count?: number; memo?: string; maxDevices?: number; id?: string };
  const admin = createAdminClient();
  if (b.action === 'revoke' && b.id) {
    const { error } = await admin.from('ddalkak_licenses').update({ status: 'revoked' }).eq('id', b.id);
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (b.action === 'issue') {
    const plan = b.plan && PLANS[b.plan] ? b.plan : null, count = Math.max(1, Math.min(100, Math.round(Number(b.count) || 1)));
    if (!plan) return NextResponse.json({ error: '기간을 골라 주세요' }, { status: 400 });
    await signingKey(true); // 서명 키가 없으면 지금 만든다
    const codes = Array.from({ length: count }, () => newCode());
    const { error } = await admin.from('ddalkak_licenses').insert(codes.map(c => ({ code_hash: hashCode(c), code_hint: c.slice(-4), plan, months: PLANS[plan].months, max_devices: Math.max(1, Math.min(5, Math.round(Number(b.maxDevices) || 2))), memo: String(b.memo || '').slice(0, 100) || null })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, plan, label: PLANS[plan].label, codes });
  }
  return NextResponse.json({ error: '알 수 없는 요청' }, { status: 400 });
}
