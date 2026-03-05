import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { postToPlatformWithMedia } from '@/lib/sns/platforms-server';
import type { Platform } from '@/lib/sns/platforms';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { content: directContent, template_id, platforms, media_urls } = await req.json();

  let content: string = directContent || '';
  const templateId: string | null = template_id || null;

  if (!content && template_id) {
    const { data: template } = await supabase
      .from('sns_post_templates')
      .select('content')
      .eq('id', template_id)
      .eq('user_id', user.id)
      .single();
    if (!template) return NextResponse.json({ error: '템플릿을 찾을 수 없습니다' }, { status: 404 });
    content = template.content;
  }

  if (!content?.trim() || !platforms?.length)
    return NextResponse.json({ error: '내용과 플랫폼을 선택해주세요' }, { status: 400 });

  const results: { platform: string; success: boolean; error?: string }[] = [];

  for (const platform of platforms as Platform[]) {
    const { data: conn } = await supabase
      .from('sns_connections')
      .select('access_token, platform_user_id, is_active')
      .eq('user_id', user.id)
      .eq('platform', platform)
      .eq('is_active', true)
      .single();

    if (!conn) {
      results.push({ platform, success: false, error: '연결되지 않은 플랫폼' });
      await supabase.from('sns_post_logs').insert({
        user_id: user.id, template_id: templateId, platform, status: 'failed', error_message: '연결되지 않은 플랫폼',
      });
      continue;
    }

    try {
      const { id: platformPostId } = await postToPlatformWithMedia(
        platform, conn.access_token, conn.platform_user_id || '', content, media_urls,
      );
      results.push({ platform, success: true });
      await supabase.from('sns_post_logs').insert({
        user_id: user.id, template_id: templateId, platform, status: 'success',
        platform_post_id: platformPostId, media_urls: media_urls || [],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ platform, success: false, error: message });
      await supabase.from('sns_post_logs').insert({
        user_id: user.id, template_id: templateId, platform, status: 'failed', error_message: message,
      });
    }
  }

  return NextResponse.json({ results });
}
