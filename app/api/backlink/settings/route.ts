import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { getSetting, invalidateSettingsCache } from '@/lib/get-setting';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const [mediumToken, tumblrToken, tumblrBlog] = await Promise.all([
    getSetting('MEDIUM_INTEGRATION_TOKEN'),
    getSetting('TUMBLR_ACCESS_TOKEN'),
    getSetting('TUMBLR_BLOG_NAME'),
  ]);

  return NextResponse.json({
    medium_token: mediumToken ? '****' + mediumToken.slice(-6) : '',
    medium_configured: !!mediumToken,
    tumblr_token: tumblrToken ? '****' + tumblrToken.slice(-6) : '',
    tumblr_blog: tumblrBlog || '',
    tumblr_configured: !!(tumblrToken && tumblrBlog),
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { medium_token, tumblr_token, tumblr_blog } = await req.json() as {
    medium_token?: string;
    tumblr_token?: string;
    tumblr_blog?: string;
  };

  const admin = await createAdminClient();
  const { data: existing } = await admin
    .from('app_settings')
    .select('settings')
    .eq('id', 1)
    .single();

  const current = (existing?.settings as Record<string, string>) || {};
  const updated = { ...current };
  if (medium_token !== undefined) updated.MEDIUM_INTEGRATION_TOKEN = medium_token.trim();
  if (tumblr_token !== undefined) updated.TUMBLR_ACCESS_TOKEN = tumblr_token.trim();
  if (tumblr_blog !== undefined) updated.TUMBLR_BLOG_NAME = tumblr_blog.trim();

  const { error } = await admin
    .from('app_settings')
    .update({ settings: updated, updated_at: new Date().toISOString() })
    .eq('id', 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateSettingsCache();
  return NextResponse.json({ success: true });
}
