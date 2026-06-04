import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { getSetting, invalidateSettingsCache } from '@/lib/get-setting';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const [mediumToken, consumerKey, consumerSecret, accessToken, accessTokenSecret, blogName, pinterestToken, pinterestBoardId, linkedinToken] = await Promise.all([
    getSetting('MEDIUM_INTEGRATION_TOKEN'),
    getSetting('TUMBLR_CONSUMER_KEY'),
    getSetting('TUMBLR_CONSUMER_SECRET'),
    getSetting('TUMBLR_ACCESS_TOKEN'),
    getSetting('TUMBLR_ACCESS_TOKEN_SECRET'),
    getSetting('TUMBLR_BLOG_NAME'),
    getSetting('PINTEREST_ACCESS_TOKEN'),
    getSetting('PINTEREST_BOARD_ID'),
    getSetting('LINKEDIN_ACCESS_TOKEN'),
  ]);

  const tumblrConfigured = !!(consumerKey && consumerSecret && accessToken && accessTokenSecret && blogName);

  return NextResponse.json({
    medium_token: mediumToken ? '****' + mediumToken.slice(-6) : '',
    medium_configured: !!mediumToken,
    tumblr_consumer_key: consumerKey ? consumerKey.slice(0, 6) + '••••••' : '',
    tumblr_blog: blogName || '',
    tumblr_configured: tumblrConfigured,
    pinterest_configured: !!(pinterestToken && pinterestBoardId),
    pinterest_board_id: pinterestBoardId || '',
    linkedin_configured: !!linkedinToken,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { medium_token, tumblr_consumer_key, tumblr_consumer_secret, tumblr_access_token, tumblr_access_token_secret, tumblr_blog, pinterest_access_token, pinterest_board_id, linkedin_access_token } = await req.json() as {
    medium_token?: string;
    tumblr_consumer_key?: string;
    tumblr_consumer_secret?: string;
    tumblr_access_token?: string;
    tumblr_access_token_secret?: string;
    tumblr_blog?: string;
    pinterest_access_token?: string;
    pinterest_board_id?: string;
    linkedin_access_token?: string;
  };

  const admin = await createAdminClient();
  const { data: existing } = await admin
    .from('app_settings')
    .select('settings')
    .eq('id', 1)
    .single();

  const current = (existing?.settings as Record<string, string>) || {};
  const updated = { ...current };
  if (medium_token?.trim()) updated.MEDIUM_INTEGRATION_TOKEN = medium_token.trim();
  if (tumblr_consumer_key?.trim()) updated.TUMBLR_CONSUMER_KEY = tumblr_consumer_key.trim();
  if (tumblr_consumer_secret?.trim()) updated.TUMBLR_CONSUMER_SECRET = tumblr_consumer_secret.trim();
  if (tumblr_access_token?.trim()) updated.TUMBLR_ACCESS_TOKEN = tumblr_access_token.trim();
  if (tumblr_access_token_secret?.trim()) updated.TUMBLR_ACCESS_TOKEN_SECRET = tumblr_access_token_secret.trim();
  if (tumblr_blog !== undefined) updated.TUMBLR_BLOG_NAME = tumblr_blog.trim();
  if (pinterest_access_token?.trim()) updated.PINTEREST_ACCESS_TOKEN = pinterest_access_token.trim();
  if (pinterest_board_id !== undefined) updated.PINTEREST_BOARD_ID = pinterest_board_id.trim();
  if (linkedin_access_token?.trim()) updated.LINKEDIN_ACCESS_TOKEN = linkedin_access_token.trim();

  const { error } = await admin
    .from('app_settings')
    .update({ settings: updated, updated_at: new Date().toISOString() })
    .eq('id', 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateSettingsCache();
  return NextResponse.json({ success: true });
}
