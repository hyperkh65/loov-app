/**
 * POST /api/cookie-sync — 사장님 PC 크롬 확장(loov-cookie-sync)이 로그인 쿠키를 주기적으로 보내
 * 네이버 블로그(NID_AUT/NID_SES)·티스토리(TSSESSION) 쿠키를 자동 갱신한다.
 * Auth: x-sync-key 헤더 = app_settings.COOKIE_SYNC_KEY
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, x-sync-key' };
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }

export async function POST(req: NextRequest) {
  const key = await getSetting('COOKIE_SYNC_KEY');
  const got = req.headers.get('x-sync-key') || '';
  if (!key || got.length !== key.length || !timingSafeEqual(Buffer.from(got), Buffer.from(key))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: CORS });
  }
  const body = await req.json().catch(() => ({})) as { naver?: { nid_aut?: string; nid_ses?: string }; tistory?: { tssession?: string } };
  const owner = process.env.OWNER_USER_ID!;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const updated: string[] = [];
  const valid = (v?: string) => !!v && v.length < 2000 && /^[\w%+/=.:-]+$/.test(v);

  if (valid(body.naver?.nid_aut) && valid(body.naver?.nid_ses)) {
    const { data } = await admin.from('naver_connections')
      .update({ nid_aut: body.naver!.nid_aut, nid_ses: body.naver!.nid_ses, updated_at: now })
      .eq('user_id', owner).select('id');
    if (data?.length) updated.push('naver');
  }
  if (valid(body.tistory?.tssession)) {
    const { data } = await admin.from('tistory_connections')
      .update({ tssession: body.tistory!.tssession, updated_at: now })
      .eq('user_id', owner).select('id');
    if (data?.length) updated.push('tistory');
  }
  return NextResponse.json({ ok: true, updated }, { headers: CORS });
}
