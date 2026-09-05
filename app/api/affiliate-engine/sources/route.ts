import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

const USAGE_MODES = ['TREND_SIGNAL_ONLY', 'PRODUCT_DISCOVERY', 'LICENSED_MEDIA', 'AFFILIATE_MATCHING', 'CREATIVE_REFERENCE'];
const CONNECTOR_STATUSES = ['CONNECTED', 'REQUIRES_API_KEY', 'REFERENCE_ONLY', 'FUTURE_CONNECTOR'];

export async function GET(req: NextRequest) {
  void req;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data, error } = await supabase
    .from('affiliate_sources')
    .select('*')
    .eq('user_id', user.id)
    .order('priority', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json();
  const { name, source_type } = body;
  if (!name || !source_type) return NextResponse.json({ error: 'name, source_type 필요' }, { status: 400 });
  if (body.usage_mode && !USAGE_MODES.includes(body.usage_mode))
    return NextResponse.json({ error: '잘못된 usage_mode' }, { status: 400 });
  if (body.connector_status && !CONNECTOR_STATUSES.includes(body.connector_status))
    return NextResponse.json({ error: '잘못된 connector_status' }, { status: 400 });

  const { data, error } = await supabase.from('affiliate_sources').insert({
    user_id: user.id,
    name,
    source_type,
    country: body.country || null,
    categories: body.categories || [],
    discovery_method: body.discovery_method || 'MANUAL_IMPORT',
    official_api_available: !!body.official_api_available,
    authentication_required: !!body.authentication_required,
    terms_url: body.terms_url || null,
    rate_limit: body.rate_limit || null,
    enabled: !!body.enabled,
    priority: body.priority ?? 50,
    usage_mode: body.usage_mode || 'REFERENCE_ONLY',
    media_download_allowed: !!body.media_download_allowed,
    commercial_use_status: body.commercial_use_status || 'UNKNOWN',
    connector_status: body.connector_status || 'REFERENCE_ONLY',
    health_status: body.health_status || 'UP',
    notes: body.notes || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { id, ...fields } = await req.json();
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });
  if (fields.usage_mode && !USAGE_MODES.includes(fields.usage_mode))
    return NextResponse.json({ error: '잘못된 usage_mode' }, { status: 400 });
  if (fields.connector_status && !CONNECTOR_STATUSES.includes(fields.connector_status))
    return NextResponse.json({ error: '잘못된 connector_status' }, { status: 400 });

  const allowed = [
    'name', 'source_type', 'country', 'categories', 'discovery_method', 'official_api_available',
    'authentication_required', 'terms_url', 'rate_limit', 'enabled', 'priority', 'usage_mode',
    'media_download_allowed', 'commercial_use_status', 'connector_status', 'health_status', 'notes',
    'last_checked_at',
  ];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) if (k in fields) updates[k] = fields[k];

  const { data, error } = await supabase.from('affiliate_sources')
    .update(updates)
    .eq('id', id).eq('user_id', user.id)
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });
  await supabase.from('affiliate_sources').delete().eq('id', id).eq('user_id', user.id);
  return NextResponse.json({ ok: true });
}
