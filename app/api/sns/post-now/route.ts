import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { postToPlatform, Platform } from '@/lib/sns/platforms';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { template_id, platforms } = await req.json();
  if (!template_id || !platforms?.length) return NextResponse.json({ error: '템플릿과 플랫폼을 선택해주세요' }, { status: 400 });

  const admin = createAdminClient();
  const { data: template } = await admin.from('sns_post_templates').select('*').eq('id', template_id).eq('user_id', user.id).single();
  if (!template) return NextResponse.json({ error: '템플릿을 찾을 수 없습니다' }, { status: 404 });

  const results: { platform: string; success: boolean; error?: string }[] = [];

  for (const platform of platforms as Platform[]) {
    const { data: conn } = await admin.from('sns_connections').select('access_token, platform_user_id, is_active').eq('user_id', user.id).eq('platform', platform).eq('is_active', true).single();

    if (!conn) {
      results.push({ platform, success: false, error: '연결되지 않은 플랫폼' });
      await admin.from('sns_post_logs').insert({ user_id: user.id, template_id, platform, status: 'failed', error_message: '연결되지 않은 플랫폼' });
      continue;
    }

    try {
      const { id: platformPostId } = await postToPlatform(platform, conn.access_token, conn.platform_user_id || '', template.content);
      results.push({ platform, success: true });
      await admin.from('sns_post_logs').insert({ user_id: user.id, template_id, platform, status: 'success', platform_post_id: platformPostId });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ platform, success: false, error: message });
      await admin.from('sns_post_logs').insert({ user_id: user.id, template_id, platform, status: 'failed', error_message: message });
    }
  }

  return NextResponse.json({ results });
}
