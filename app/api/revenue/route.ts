import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import { coupangGet, API_PREFIX } from '@/lib/coupang/api';

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

async function pageAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null }>, max = 20000): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < max; i += 1000) {
    const { data } = await q(i, i + 999);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get('days')) || 14, 1), 30);
  const since = new Date(Date.now() - days * 86400000);
  const admin = createAdminClient();

  // 1) 사이트별 방문/체류시간 (봇 제외)
  const pv = await pageAll<{ host: string; dwell_sec: number | null }>((a, b) =>
    admin.from('bossai_pageviews').select('host, dwell_sec').eq('is_bot', false).gte('created_at', since.toISOString()).range(a, b));
  const sites: Record<string, { views: number; dwellSum: number; dwellN: number }> = {};
  for (const r of pv) {
    const s = (sites[r.host] ||= { views: 0, dwellSum: 0, dwellN: 0 });
    s.views++;
    if ((r.dwell_sec || 0) > 0) { s.dwellSum += r.dwell_sec!; s.dwellN++; }
  }

  // 2) go-link 클릭 (채널별)
  const ev = await pageAll<{ go_link_id: string }>((a, b) =>
    admin.from('bossai_affiliate_click_events').select('go_link_id').gte('clicked_at', since.toISOString()).range(a, b));
  const perLink: Record<string, number> = {};
  for (const e of ev) perLink[e.go_link_id] = (perLink[e.go_link_id] || 0) + 1;
  const ids = Object.keys(perLink);
  const links: Record<string, { platform: string; channel: string }> = {};
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await admin.from('bossai_affiliate_go_links').select('id, platform, content_channel').in('id', ids.slice(i, i + 150));
    for (const l of data || []) links[l.id] = { platform: l.platform, channel: l.content_channel || '-' };
  }
  const clicks: Record<string, number> = {};
  for (const [id, n] of Object.entries(perLink)) {
    const l = links[id]; const k = l ? `${l.platform} / ${l.channel}` : '알 수 없음';
    clicks[k] = (clicks[k] || 0) + n;
  }

  // 3) 쿠팡 파트너스 리포트 (subId별 실제 클릭/수수료)
  let coupang: { subId: string; click: number; commission: number }[] = [];
  let coupangError: string | null = null;
  try {
    const ak = await getSetting('COUPANG_ACCESS_KEY'), sk = await getSetting('COUPANG_SECRET_KEY');
    if (!ak || !sk) throw new Error('쿠팡 API 키 없음');
    const agg: Record<string, { click: number; commission: number }> = {};
    const rep = async (kind: 'clicks' | 'commission', field: 'click' | 'commission') => {
      for (let page = 0; page < 20; page++) {
        const q = `startDate=${ymd(since)}&endDate=${ymd(new Date())}&page=${page}`;
        const r = await coupangGet<{ rCode?: string; data?: { subId?: string; click?: number; commission?: number }[] }>(`${API_PREFIX}/reports/${kind}`, q, ak, sk);
        const rows = Array.isArray(r.data) ? r.data : [];
        for (const x of rows) {
          const a = (agg[x.subId || '(없음)'] ||= { click: 0, commission: 0 });
          a[field] += Number(x[field]) || 0;
        }
        if (rows.length < 50) break;
      }
    };
    await Promise.all([rep('clicks', 'click'), rep('commission', 'commission')]);
    coupang = Object.entries(agg).map(([subId, v]) => ({ subId, ...v })).sort((a, b) => b.commission - a.commission || b.click - a.click);
  } catch (e) { coupangError = String(e).slice(0, 150); }

  return NextResponse.json({
    days,
    sites: Object.entries(sites).map(([host, s]) => ({ host, views: s.views, avgDwell: s.dwellN ? Math.round(s.dwellSum / s.dwellN) : 0 }))
      .sort((a, b) => b.views - a.views),
    clicks: Object.entries(clicks).map(([k, n]) => ({ key: k, clicks: n })).sort((a, b) => b.clicks - a.clicks),
    coupang, coupangError,
  });
}
