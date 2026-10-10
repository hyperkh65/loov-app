import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { isMasterEmail } from '@/lib/ai-usage';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isMasterEmail(user.email || '')) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }

  const admin = createAdminClient();

  // sns_connections PK를 (user_id, platform, platform_user_id)로 변경
  const { error } = await admin.rpc('exec_sql' as never, {
    sql: `
      ALTER TABLE public.sns_connections DROP CONSTRAINT IF EXISTS sns_connections_pkey;
      ALTER TABLE public.sns_connections ADD PRIMARY KEY (user_id, platform, platform_user_id);
    `,
  });

  if (error) {
    // rpc가 없는 경우 직접 쿼리
    try {
      await admin.from('sns_connections').select('user_id').limit(1); // connection test
      return NextResponse.json({
        error: 'rpc 방식 실패. Supabase SQL Editor에서 직접 실행 필요',
        sql: 'ALTER TABLE public.sns_connections DROP CONSTRAINT IF EXISTS sns_connections_pkey; ALTER TABLE public.sns_connections ADD PRIMARY KEY (user_id, platform, platform_user_id);',
        detail: error.message,
      }, { status: 500 });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, message: 'sns_connections PK 변경 완료' });
}
