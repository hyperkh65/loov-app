import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

// Supabase SQL (최초 1회):
// create table if not exists bossai_deploy_log (
//   id bigserial primary key,
//   sha text,
//   branch text default 'main',
//   status text not null, -- queued | building | deploying | success | failed
//   step text,
//   message text,
//   triggered_by text,
//   created_at timestamptz default now(),
//   updated_at timestamptz default now()
// );

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 });

  const { secret, status, step, message, sha, branch, triggered_by } = body;

  // 시크릿 검증
  const expected = process.env.DEPLOY_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  if (status === 'queued') {
    // 새 배포 레코드 생성
    const { data, error } = await supabase
      .from('bossai_deploy_log')
      .insert({ sha, branch: branch ?? 'main', status, step, message, triggered_by })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  // 기존 레코드 업데이트 (같은 sha의 최신 것)
  const { data: existing } = await supabase
    .from('bossai_deploy_log')
    .select('id')
    .eq('sha', sha)
    .order('id', { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    await supabase
      .from('bossai_deploy_log')
      .update({ status, step, message, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    // sha 없이 호출된 경우 새로 생성
    await supabase
      .from('bossai_deploy_log')
      .insert({ sha, branch: branch ?? 'main', status, step, message, triggered_by });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('bossai_deploy_log')
    .select('*')
    .order('id', { ascending: false })
    .limit(20);
  return NextResponse.json(data ?? []);
}
