'use client';

import { useState, useEffect, useCallback } from 'react';

interface WpSite { id: string; site_name: string; site_url: string; is_active: boolean }
interface Post { id: number; title: string; date: string; link: string; comment_count: number; views: number | null; categories: number[] }
interface Category { id: number; name: string; count: number }
interface StatsData {
  site_id: string; site_name: string; site_url: string;
  total_posts: number; total_pages: number;
  categories: Category[]; top_posts: Post[];
  monthly: Record<string, number>;
  has_view_data: boolean; plugin_active: boolean;
  error?: string;
}
interface GscRow { page: string; clicks: number; impressions: number; ctr: number; position: number }
interface GscQRow { query: string; clicks: number; impressions: number; ctr: number; position: number }

type Tab = 'popular' | 'gsc' | 'keywords' | 'monthly' | 'categories';

const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;

export default function WpStatsPage() {
  const [sites, setSites] = useState<WpSite[]>([]);
  const [selected, setSelected] = useState<WpSite | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const [gscRows, setGscRows] = useState<GscRow[] | null>(null);
  const [gscQueries, setGscQueries] = useState<GscQRow[] | null>(null);
  const [gscErr, setGscErr] = useState('');
  const [gscMeta, setGscMeta] = useState<{ needs_scope?: boolean; needs_auth?: boolean; not_registered?: boolean }>({});
  const [loadingGsc, setLoadingGsc] = useState(false);
  const [loadingQ, setLoadingQ] = useState(false);

  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState('');

  const [tab, setTab] = useState<Tab>('popular');

  useEffect(() => {
    fetch('/api/wordpress/sites').then(r => r.json()).then(data => {
      if (Array.isArray(data) && data.length > 0) { setSites(data); setSelected(data[0]); }
    });
  }, []);

  const loadGscRows = useCallback(async (site: WpSite) => {
    setLoadingGsc(true); setGscErr(''); setGscMeta({}); setGscRows(null);
    try {
      const res = await fetch(`/api/google/search-console?site_url=${encodeURIComponent(site.site_url)}&dimension=page`);
      const d = await res.json();
      if (!res.ok) { setGscErr(d.error || 'GSC 오류'); setGscMeta({ needs_scope: d.needs_scope, needs_auth: d.needs_auth, not_registered: d.not_registered }); }
      else setGscRows(d.rows || []);
    } catch (e) { setGscErr(String(e)); }
    setLoadingGsc(false);
  }, []);

  const loadGscQueries = useCallback(async (site: WpSite) => {
    setLoadingQ(true); setGscQueries(null);
    try {
      const res = await fetch(`/api/google/search-console?site_url=${encodeURIComponent(site.site_url)}&dimension=query`);
      const d = await res.json();
      if (res.ok) setGscQueries(d.rows || []);
    } catch { /* ignore */ }
    setLoadingQ(false);
  }, []);

  useEffect(() => {
    if (!selected) return;
    setStats(null); setGscRows(null); setGscQueries(null); setGscErr(''); setGscMeta({}); setInstallMsg(''); setTab('popular');
    setLoadingStats(true);
    fetch(`/api/wordpress/stats?site_id=${selected.id}`)
      .then(r => r.json()).then(setStats).catch(e => setStats({ error: String(e) } as StatsData))
      .finally(() => setLoadingStats(false));
    loadGscRows(selected);
  }, [selected, loadGscRows]);

  useEffect(() => {
    if ((tab === 'gsc' || tab === 'keywords') && selected && gscRows === null && !loadingGsc && !gscErr) loadGscRows(selected);
    if (tab === 'keywords' && selected && gscQueries === null && !loadingQ) loadGscQueries(selected);
  }, [tab, selected, gscRows, loadingGsc, gscErr, gscQueries, loadingQ, loadGscRows, loadGscQueries]);

  const installPlugin = async () => {
    if (!selected) return;
    setInstalling(true); setInstallMsg('');
    try {
      const res = await fetch('/api/wordpress/install-plugin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: selected.id, plugin_slug: 'post-views-counter' }),
      });
      const d = await res.json();
      if (res.ok) {
        setInstallMsg('✅ ' + (d.message || '설치 완료! 이제부터 전체 조회수가 집계됩니다.'));
        // reload stats
        const r2 = await fetch(`/api/wordpress/stats?site_id=${selected.id}`);
        setStats(await r2.json());
      } else { setInstallMsg('❌ ' + (d.error || '설치 실패')); }
    } catch (e) { setInstallMsg('❌ ' + String(e)); }
    setInstalling(false);
  };

  // URL→title map from WP posts (for GSC tab)
  const urlTitleMap = new Map<string, string>();
  if (stats?.top_posts) for (const p of stats.top_posts) if (p.link) urlTitleMap.set(p.link.replace(/\/$/, ''), p.title);

  const monthlyEntries = stats?.monthly ? Object.entries(stats.monthly).sort(([a], [b]) => a.localeCompare(b)).slice(-12) : [];
  const maxMonthly = Math.max(1, ...monthlyEntries.map(([, v]) => v));
  const maxCat = Math.max(1, stats?.categories[0]?.count || 1);
  const recent30 = stats?.monthly ? Object.entries(stats.monthly).filter(([m]) => m >= new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 7)).reduce((s, [, v]) => s + v, 0) : 0;
  const totalGscClicks = gscRows?.reduce((s, r) => s + r.clicks, 0) ?? null;

  const gscConnectUrl = '/api/google/connect?return_to=/dashboard/wp-stats';

  const GscError = () => (
    <div className="p-8 text-center space-y-3">
      <p className="text-sm text-gray-500">{gscErr}</p>
      {(gscMeta.needs_scope || gscMeta.needs_auth) && (
        <a href={gscConnectUrl} className="inline-block px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700">
          🔗 Google 연결하기 (Search Console 권한 포함)
        </a>
      )}
      {gscMeta.not_registered && (
        <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer"
          className="inline-block px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-xl hover:bg-gray-200">
          GSC에서 사이트 등록 →
        </a>
      )}
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">📊 WordPress 통계</h1>
        {selected && <a href={selected.site_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">{selected.site_url.replace(/^https?:\/\//, '')} ↗</a>}
      </div>

      {/* Site selector */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
        {sites.map(s => (
          <button key={s.id} onClick={() => setSelected(s)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${selected?.id === s.id ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
            🔵 {s.site_name}
          </button>
        ))}
        {!sites.length && <p className="text-sm text-gray-400 py-1">등록된 사이트 없음. <a href="/dashboard/wordpress" className="text-blue-500 hover:underline">사이트 추가 →</a></p>}
      </div>

      {selected && (
        <>
          {/* Overview cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {loadingStats ? [...Array(4)].map((_, i) => <div key={i} className="bg-gray-100 rounded-xl h-20 animate-pulse" />) :
            stats?.error ? <div className="col-span-4 bg-red-50 rounded-xl p-4 text-sm text-red-500">❌ {stats.error}</div> :
            stats ? <>
              <div className="bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
                <p className="text-xs text-gray-400 mb-1">전체 글</p>
                <p className="text-2xl font-bold text-blue-600">{stats.total_posts.toLocaleString()}</p>
                <p className="text-[10px] text-gray-300 mt-0.5">WordPress posts</p>
              </div>
              <div className="bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
                <p className="text-xs text-gray-400 mb-1">최근 30일 발행</p>
                <p className="text-2xl font-bold text-green-600">{recent30}</p>
                <p className="text-[10px] text-gray-300 mt-0.5">new posts</p>
              </div>
              <div className="bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
                <p className="text-xs text-gray-400 mb-1">
                  {stats.plugin_active ? '전체 조회수 Top1' : 'GSC 클릭 (90일)'}
                </p>
                {stats.plugin_active ? (
                  <p className="text-2xl font-bold text-orange-500">{(stats.top_posts[0]?.views ?? 0).toLocaleString()}</p>
                ) : loadingGsc ? (
                  <p className="text-2xl font-bold text-orange-400 animate-pulse">…</p>
                ) : totalGscClicks !== null ? (
                  <p className="text-2xl font-bold text-orange-500">{totalGscClicks.toLocaleString()}</p>
                ) : (
                  <p className="text-lg font-bold text-gray-300">—</p>
                )}
                <p className="text-[10px] text-gray-300 mt-0.5">{stats.plugin_active ? '1위 글' : 'Google only'}</p>
              </div>
              <div className="bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
                <p className="text-xs text-gray-400 mb-1">카테고리</p>
                <p className="text-2xl font-bold text-purple-500">{stats.categories.length}</p>
                <p className="text-[10px] text-gray-300 mt-0.5">categories</p>
              </div>
            </> : null}
          </div>

          {/* Tabs */}
          <div className="flex gap-1.5 mb-4 overflow-x-auto">
            {([
              { id: 'popular' as Tab, label: stats?.plugin_active ? '🏆 인기글 (전체 조회수)' : '🏆 인기글 (GSC)' },
              { id: 'gsc' as Tab, label: '🔍 GSC 트래픽' },
              { id: 'keywords' as Tab, label: '🔑 인기 키워드' },
              { id: 'monthly' as Tab, label: '📅 월별' },
              { id: 'categories' as Tab, label: '📂 카테고리' },
            ] as { id: Tab; label: string }[]).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── 인기글 ── */}
          {tab === 'popular' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    {stats?.plugin_active ? '인기글 Top 25 — 전체 조회수 (모든 트래픽 소스)' : '인기글 Top 25 — Google 클릭수 기준'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {stats?.plugin_active
                      ? '구글·빙·네이버·SNS·직접 접속 포함 서버 사이드 집계'
                      : '⚠️ Google Search Console 기준 (빙·네이버·SNS 미포함) · 최근 90일'}
                  </p>
                </div>
                {/* Plugin install button */}
                {!loadingStats && stats && !stats.plugin_active && (
                  <button onClick={installPlugin} disabled={installing}
                    className="shrink-0 px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50 whitespace-nowrap">
                    {installing ? '설치 중…' : '📦 전체 조회수 설치'}
                  </button>
                )}
              </div>

              {installMsg && (
                <div className={`px-4 py-2 text-xs border-b ${installMsg.startsWith('✅') ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                  {installMsg}
                </div>
              )}

              {/* Plugin not installed → show GSC data with explanation */}
              {!stats?.plugin_active && (
                <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 flex items-center gap-2">
                  <span>💡</span>
                  <span>"전체 조회수 설치" 버튼으로 <strong>Post Views Counter</strong> 플러그인을 설치하면 빙·네이버·SNS 포함 전체 방문자 수를 볼 수 있어요.</span>
                </div>
              )}

              {/* Content: plugin views or GSC rows */}
              {stats?.plugin_active ? (
                // Plugin views
                loadingStats ? <div className="p-10 text-center text-gray-300 text-sm animate-pulse">조회수 불러오는 중...</div> :
                !stats.top_posts.length ? <div className="p-10 text-center text-gray-400 text-sm">글이 없습니다</div> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[480px]">
                      <thead><tr className="bg-gray-50 text-xs text-gray-400">
                        <th className="px-3 py-2 text-left w-10">#</th>
                        <th className="px-3 py-2 text-left">제목</th>
                        <th className="px-3 py-2 text-right w-24">전체 조회수</th>
                        <th className="px-3 py-2 text-right w-24 hidden md:table-cell">발행일</th>
                        <th className="px-3 py-2 text-center w-10">↗</th>
                      </tr></thead>
                      <tbody>
                        {stats.top_posts.map((p, i) => (
                          <tr key={p.id} className="border-t border-gray-50 hover:bg-blue-50/30 transition-colors">
                            <td className="px-3 py-2.5 text-gray-300 text-xs">{medal(i)}</td>
                            <td className="px-3 py-2.5"><span className="line-clamp-1 text-gray-800 text-[13px]">{p.title}</span></td>
                            <td className="px-3 py-2.5 text-right font-bold text-blue-600 text-[13px]">{(p.views ?? 0).toLocaleString()}</td>
                            <td className="px-3 py-2.5 text-right text-gray-300 text-xs hidden md:table-cell">{p.date?.slice(0, 10)}</td>
                            <td className="px-3 py-2.5 text-center"><a href={p.link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-600">↗</a></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                // GSC rows (fallback)
                loadingGsc ? <div className="p-10 text-center text-gray-300 text-sm animate-pulse">Google 데이터 불러오는 중...</div> :
                gscErr ? <GscError /> :
                gscRows?.length === 0 ? <div className="p-10 text-center text-gray-400 text-sm">최근 90일간 클릭 데이터가 없습니다</div> :
                gscRows ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[480px]">
                      <thead><tr className="bg-gray-50 text-xs text-gray-400">
                        <th className="px-3 py-2 text-left w-10">#</th>
                        <th className="px-3 py-2 text-left">페이지</th>
                        <th className="px-3 py-2 text-right w-20">클릭수</th>
                        <th className="px-3 py-2 text-right w-16 hidden md:table-cell">CTR</th>
                        <th className="px-3 py-2 text-right w-16 hidden md:table-cell">순위</th>
                        <th className="px-3 py-2 text-center w-10">↗</th>
                      </tr></thead>
                      <tbody>
                        {gscRows.map((row, i) => {
                          const path = row.page.replace(selected.site_url.replace(/\/$/, ''), '') || '/';
                          const title = urlTitleMap.get(row.page.replace(/\/$/, ''));
                          return (
                            <tr key={i} className="border-t border-gray-50 hover:bg-blue-50/30 transition-colors">
                              <td className="px-3 py-2.5 text-gray-300 text-xs">{medal(i)}</td>
                              <td className="px-3 py-2.5 max-w-[240px] md:max-w-[380px]">
                                {title ? <span className="text-gray-800 text-[13px] line-clamp-1">{title}</span>
                                  : <span className="text-gray-500 text-[12px] font-mono line-clamp-1">{path}</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right font-bold text-blue-600 text-[13px]">{row.clicks.toLocaleString()}</td>
                              <td className="px-3 py-2.5 text-right text-gray-400 text-[13px] hidden md:table-cell">{row.ctr}%</td>
                              <td className="px-3 py-2.5 text-right text-gray-400 text-[13px] hidden md:table-cell">{row.position}</td>
                              <td className="px-3 py-2.5 text-center"><a href={row.page} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-600">↗</a></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null
              )}
            </div>
          )}

          {/* ── GSC 트래픽 ── */}
          {tab === 'gsc' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Google Search Console 트래픽</p>
                  <p className="text-xs text-gray-400 mt-0.5">구글 검색 유입만 · 최근 90일 · 클릭수 Top 25</p>
                </div>
                {!loadingGsc && gscRows !== null && <button onClick={() => loadGscRows(selected)} className="text-xs text-gray-400 hover:text-gray-600">🔄</button>}
              </div>
              {loadingGsc ? <div className="p-10 text-center text-gray-300 text-sm animate-pulse">불러오는 중...</div> :
               gscErr ? <GscError /> :
               gscRows?.length === 0 ? <div className="p-10 text-center text-gray-400 text-sm">데이터 없음</div> :
               gscRows ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead><tr className="bg-gray-50 text-xs text-gray-400">
                      <th className="px-3 py-2 text-left w-10">#</th>
                      <th className="px-3 py-2 text-left">페이지</th>
                      <th className="px-3 py-2 text-right w-20">클릭수</th>
                      <th className="px-3 py-2 text-right w-24">노출수</th>
                      <th className="px-3 py-2 text-right w-16">CTR</th>
                      <th className="px-3 py-2 text-right w-16">순위</th>
                      <th className="px-3 py-2 text-center w-10">↗</th>
                    </tr></thead>
                    <tbody>
                      {gscRows.map((row, i) => {
                        const path = row.page.replace(selected.site_url.replace(/\/$/, ''), '') || '/';
                        const title = urlTitleMap.get(row.page.replace(/\/$/, ''));
                        return (
                          <tr key={i} className="border-t border-gray-50 hover:bg-blue-50/30 transition-colors">
                            <td className="px-3 py-2.5 text-gray-300 text-xs">{medal(i)}</td>
                            <td className="px-3 py-2.5 max-w-[200px] md:max-w-[320px]">
                              {title ? <span className="text-gray-800 text-[13px] line-clamp-1">{title}</span>
                                : <span className="text-gray-500 text-[12px] font-mono line-clamp-1" title={row.page}>{path}</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold text-blue-600 text-[13px]">{row.clicks.toLocaleString()}</td>
                            <td className="px-3 py-2.5 text-right text-gray-400 text-[13px]">{row.impressions.toLocaleString()}</td>
                            <td className="px-3 py-2.5 text-right text-gray-400 text-[13px]">{row.ctr}%</td>
                            <td className="px-3 py-2.5 text-right text-gray-400 text-[13px]">{row.position}</td>
                            <td className="px-3 py-2.5 text-center"><a href={row.page} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-600">↗</a></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
               ) : null}
            </div>
          )}

          {/* ── 인기 키워드 ── */}
          {tab === 'keywords' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-800">인기 검색 키워드 (Google)</p>
                <p className="text-xs text-gray-400 mt-0.5">최근 90일 · 클릭수 Top 25</p>
              </div>
              {gscErr && (gscMeta.needs_scope || gscMeta.needs_auth) ? <GscError /> :
               loadingQ ? <div className="p-10 text-center text-gray-300 text-sm animate-pulse">불러오는 중...</div> :
               gscQueries?.length === 0 ? <div className="p-10 text-center text-gray-400 text-sm">데이터 없음</div> :
               gscQueries ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[440px]">
                    <thead><tr className="bg-gray-50 text-xs text-gray-400">
                      <th className="px-3 py-2 text-left w-10">#</th>
                      <th className="px-3 py-2 text-left">키워드</th>
                      <th className="px-3 py-2 text-right w-20">클릭수</th>
                      <th className="px-3 py-2 text-right w-24 hidden md:table-cell">노출수</th>
                      <th className="px-3 py-2 text-right w-16 hidden md:table-cell">CTR</th>
                      <th className="px-3 py-2 text-right w-16">순위</th>
                    </tr></thead>
                    <tbody>
                      {gscQueries.map((r, i) => (
                        <tr key={i} className="border-t border-gray-50 hover:bg-blue-50/30 transition-colors">
                          <td className="px-3 py-2.5 text-gray-300 text-xs">{medal(i)}</td>
                          <td className="px-3 py-2.5 text-gray-800 text-[13px]">{r.query}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-blue-600 text-[13px]">{r.clicks.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right text-gray-400 text-[13px] hidden md:table-cell">{r.impressions.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right text-gray-400 text-[13px] hidden md:table-cell">{r.ctr}%</td>
                          <td className="px-3 py-2.5 text-right text-gray-400 text-[13px]">{r.position}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
               ) : null}
            </div>
          )}

          {/* ── 월별 ── */}
          {tab === 'monthly' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm font-semibold text-gray-800 mb-4">📅 월별 발행 현황 (최근 12개월)</p>
              {loadingStats ? <div className="text-gray-300 text-sm animate-pulse text-center py-8">불러오는 중...</div> :
               !monthlyEntries.length ? <p className="text-gray-300 text-sm text-center py-8">데이터 없음</p> : (
                <div className="space-y-2.5">
                  {monthlyEntries.map(([month, count]) => (
                    <div key={month} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-16 shrink-0 tabular-nums">{month}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full flex items-center justify-end pr-2.5"
                          style={{ width: `${Math.max(8, (count / maxMonthly) * 100)}%` }}>
                          <span className="text-white text-xs font-semibold">{count}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!loadingStats && monthlyEntries.length > 0 && (
                <div className="mt-5 pt-4 border-t border-gray-100 flex gap-6 text-sm">
                  <div><p className="text-xs text-gray-400">연간 발행</p><p className="font-semibold text-gray-800">{monthlyEntries.reduce((s, [, v]) => s + v, 0)}개</p></div>
                  <div><p className="text-xs text-gray-400">월 평균</p><p className="font-semibold text-gray-800">{(monthlyEntries.reduce((s, [, v]) => s + v, 0) / monthlyEntries.length).toFixed(1)}개</p></div>
                  <div><p className="text-xs text-gray-400">최다 발행</p><p className="font-semibold text-gray-800">{monthlyEntries.reduce((a, b) => b[1] > a[1] ? b : a, monthlyEntries[0])?.[0]} ({Math.max(...monthlyEntries.map(([, v]) => v))}개)</p></div>
                </div>
              )}
            </div>
          )}

          {/* ── 카테고리 ── */}
          {tab === 'categories' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm font-semibold text-gray-800 mb-4">📂 카테고리별 글 수</p>
              {loadingStats ? <div className="text-gray-300 text-sm animate-pulse text-center py-8">불러오는 중...</div> :
               !stats?.categories.length ? <p className="text-gray-300 text-sm text-center py-8">카테고리 없음</p> : (
                <div className="space-y-2.5">
                  {stats.categories.map(cat => (
                    <div key={cat.id} className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 w-36 shrink-0 truncate" title={cat.name}>{cat.name}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-purple-400 to-purple-500 rounded-full flex items-center justify-end pr-2.5"
                          style={{ width: `${Math.max(8, (cat.count / maxCat) * 100)}%` }}>
                          <span className="text-white text-xs font-semibold">{cat.count}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
