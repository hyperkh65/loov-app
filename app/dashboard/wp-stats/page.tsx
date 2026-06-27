'use client';

import { useState, useEffect, useCallback } from 'react';

interface WpSite {
  id: string;
  site_name: string;
  site_url: string;
  is_active: boolean;
}

interface Post {
  id: number;
  title: string;
  date: string;
  link: string;
  comment_count: number;
  views: number | null;
  categories: number[];
}

interface Category {
  id: number;
  name: string;
  count: number;
}

interface StatsData {
  site_id: string;
  site_name: string;
  site_url: string;
  total_posts: number;
  total_pages: number;
  total_comments: number;
  categories: Category[];
  top_posts: Post[];
  monthly: Record<string, number>;
  has_view_data: boolean;
  error?: string;
}

interface GscRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GscQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GscState {
  rows: GscRow[] | null;
  queries: GscQueryRow[] | null;
  error: string;
  needs_scope: boolean;
  needs_auth: boolean;
  not_registered: boolean;
  loading_rows: boolean;
  loading_queries: boolean;
}

type Tab = 'popular' | 'keywords' | 'monthly' | 'categories';

const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;

export default function WpStatsPage() {
  const [sites, setSites] = useState<WpSite[]>([]);
  const [selected, setSelected] = useState<WpSite | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [gsc, setGsc] = useState<GscState>({
    rows: null, queries: null, error: '',
    needs_scope: false, needs_auth: false, not_registered: false,
    loading_rows: false, loading_queries: false,
  });
  const [tab, setTab] = useState<Tab>('popular');

  // Load site list
  useEffect(() => {
    fetch('/api/wordpress/sites')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setSites(data);
          setSelected(data[0]);
        }
      });
  }, []);

  const fetchGscRows = useCallback(async (site: WpSite) => {
    setGsc(prev => ({ ...prev, loading_rows: true, error: '', needs_scope: false, needs_auth: false, not_registered: false, rows: null }));
    try {
      const res = await fetch(`/api/google/search-console?site_url=${encodeURIComponent(site.site_url)}&dimension=page`);
      const data = await res.json();
      if (!res.ok) {
        setGsc(prev => ({
          ...prev, loading_rows: false, error: data.error || 'GSC 오류',
          needs_scope: !!data.needs_scope, needs_auth: !!data.needs_auth, not_registered: !!data.not_registered,
        }));
      } else {
        setGsc(prev => ({ ...prev, loading_rows: false, rows: data.rows || [] }));
      }
    } catch (e) {
      setGsc(prev => ({ ...prev, loading_rows: false, error: String(e) }));
    }
  }, []);

  const fetchGscQueries = useCallback(async (site: WpSite) => {
    setGsc(prev => ({ ...prev, loading_queries: true, queries: null }));
    try {
      const res = await fetch(`/api/google/search-console?site_url=${encodeURIComponent(site.site_url)}&dimension=query`);
      const data = await res.json();
      if (res.ok) {
        setGsc(prev => ({ ...prev, loading_queries: false, queries: data.rows || [] }));
      } else {
        setGsc(prev => ({ ...prev, loading_queries: false }));
      }
    } catch {
      setGsc(prev => ({ ...prev, loading_queries: false }));
    }
  }, []);

  // When site changes: load WP stats + GSC rows simultaneously
  useEffect(() => {
    if (!selected) return;
    setStats(null);
    setGsc({ rows: null, queries: null, error: '', needs_scope: false, needs_auth: false, not_registered: false, loading_rows: false, loading_queries: false });
    setTab('popular');

    setLoadingStats(true);
    fetch(`/api/wordpress/stats?site_id=${selected.id}`)
      .then(r => r.json())
      .then(data => setStats(data))
      .catch(e => setStats({ error: String(e) } as StatsData))
      .finally(() => setLoadingStats(false));

    fetchGscRows(selected);
  }, [selected, fetchGscRows]);

  // Load keyword queries when keywords tab opened
  useEffect(() => {
    if (tab === 'keywords' && selected && gsc.queries === null && !gsc.loading_queries && !gsc.error) {
      fetchGscQueries(selected);
    }
  }, [tab, selected, gsc.queries, gsc.loading_queries, gsc.error, fetchGscQueries]);

  // URL→title map from WP posts
  const urlTitleMap = new Map<string, string>();
  if (stats?.top_posts) {
    for (const p of stats.top_posts) {
      if (p.link) urlTitleMap.set(p.link.replace(/\/$/, ''), p.title);
    }
  }

  const getTitle = (url: string) => {
    const clean = url.replace(/\/$/, '');
    return urlTitleMap.get(clean) || null;
  };

  // Monthly chart
  const monthlyEntries = stats?.monthly
    ? Object.entries(stats.monthly).sort(([a], [b]) => a.localeCompare(b)).slice(-12)
    : [];
  const maxMonthly = Math.max(1, ...monthlyEntries.map(([, v]) => v));
  const maxCatCount = Math.max(1, stats?.categories[0]?.count || 1);

  const recentMonthPosts = stats?.monthly
    ? Object.entries(stats.monthly)
        .filter(([m]) => m >= new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 7))
        .reduce((s, [, v]) => s + v, 0)
    : 0;

  const totalGscClicks = gsc.rows?.reduce((s, r) => s + r.clicks, 0) ?? null;

  const gscConnectUrl = '/api/google/connect?return_to=/dashboard/wp-stats';

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">📊 WordPress 통계</h1>
        {selected && (
          <a href={selected.site_url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline">
            {selected.site_url.replace(/^https?:\/\//, '')} ↗
          </a>
        )}
      </div>

      {/* Site selector */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
        {sites.map(site => (
          <button key={site.id}
            onClick={() => setSelected(site)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
              selected?.id === site.id
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}>
            🔵 {site.site_name}
          </button>
        ))}
        {sites.length === 0 && (
          <p className="text-sm text-gray-400 py-1">
            등록된 사이트 없음.{' '}
            <a href="/dashboard/wordpress" className="text-blue-500 hover:underline">사이트 추가 →</a>
          </p>
        )}
      </div>

      {selected && (
        <>
          {/* Overview cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {loadingStats ? (
              [...Array(4)].map((_, i) => <div key={i} className="bg-gray-100 rounded-xl h-20 animate-pulse" />)
            ) : stats?.error ? (
              <div className="col-span-4 bg-red-50 rounded-xl p-4 text-sm text-red-500">❌ {stats.error}</div>
            ) : stats ? (
              <>
                <div className="bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
                  <p className="text-xs text-gray-400 mb-1">전체 글</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.total_posts.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-300 mt-0.5">WordPress posts</p>
                </div>
                <div className="bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
                  <p className="text-xs text-gray-400 mb-1">최근 30일 발행</p>
                  <p className="text-2xl font-bold text-green-600">{recentMonthPosts}</p>
                  <p className="text-[10px] text-gray-300 mt-0.5">new posts</p>
                </div>
                <div className="bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
                  <p className="text-xs text-gray-400 mb-1">GSC 클릭수 (90일)</p>
                  {gsc.loading_rows ? (
                    <p className="text-2xl font-bold text-orange-400 animate-pulse">…</p>
                  ) : totalGscClicks !== null ? (
                    <p className="text-2xl font-bold text-orange-500">{totalGscClicks.toLocaleString()}</p>
                  ) : (
                    <p className="text-lg font-bold text-gray-300">—</p>
                  )}
                  <p className="text-[10px] text-gray-300 mt-0.5">Search Console</p>
                </div>
                <div className="bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
                  <p className="text-xs text-gray-400 mb-1">카테고리</p>
                  <p className="text-2xl font-bold text-purple-500">{stats.categories.length}</p>
                  <p className="text-[10px] text-gray-300 mt-0.5">categories</p>
                </div>
              </>
            ) : null}
          </div>

          {/* Tabs */}
          <div className="flex gap-1.5 mb-4 overflow-x-auto">
            {([
              { id: 'popular' as Tab, label: '🏆 인기글 (뷰 수)' },
              { id: 'keywords' as Tab, label: '🔑 인기 키워드' },
              { id: 'monthly' as Tab, label: '📅 월별 통계' },
              { id: 'categories' as Tab, label: '📂 카테고리' },
            ]).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  tab === t.id ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── 인기글 (GSC 클릭수 기준) ── */}
          {tab === 'popular' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">인기글 Top 25</p>
                  <p className="text-xs text-gray-400 mt-0.5">Google Search Console 클릭수 기준 · 최근 90일</p>
                </div>
                {!gsc.loading_rows && gsc.rows !== null && (
                  <button onClick={() => fetchGscRows(selected)}
                    className="text-xs text-gray-400 hover:text-gray-600">🔄</button>
                )}
              </div>

              {gsc.loading_rows ? (
                <div className="p-10 text-center text-gray-300 text-sm animate-pulse">Google 데이터 불러오는 중...</div>
              ) : gsc.error ? (
                <div className="p-8 text-center space-y-3">
                  <p className="text-sm text-gray-500">{gsc.error}</p>
                  {(gsc.needs_scope || gsc.needs_auth) && (
                    <a href={gscConnectUrl}
                      className="inline-block px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700">
                      🔗 Google 연결하기 (Search Console 권한 포함)
                    </a>
                  )}
                  {gsc.not_registered && (
                    <div className="space-y-2">
                      <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer"
                        className="inline-block px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-xl hover:bg-gray-200">
                        Search Console에서 사이트 등록 →
                      </a>
                      <p className="text-xs text-gray-400">등록 후 데이터가 쌓이는 데 수일이 걸릴 수 있습니다</p>
                    </div>
                  )}
                </div>
              ) : gsc.rows?.length === 0 ? (
                <div className="p-10 text-center text-gray-400 text-sm">최근 90일간 클릭 데이터가 없습니다</div>
              ) : gsc.rows ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-400">
                        <th className="px-3 py-2 text-left w-10">#</th>
                        <th className="px-3 py-2 text-left">페이지</th>
                        <th className="px-3 py-2 text-right w-20">클릭수</th>
                        <th className="px-3 py-2 text-right w-24 hidden md:table-cell">노출수</th>
                        <th className="px-3 py-2 text-right w-16 hidden md:table-cell">CTR</th>
                        <th className="px-3 py-2 text-right w-16 hidden md:table-cell">순위</th>
                        <th className="px-3 py-2 text-center w-10">↗</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gsc.rows.map((row, i) => {
                        const path = row.page.replace(selected.site_url.replace(/\/$/, ''), '') || '/'
                        const title = getTitle(row.page)
                        return (
                          <tr key={i} className="border-t border-gray-50 hover:bg-blue-50/30 transition-colors">
                            <td className="px-3 py-2.5 text-gray-300 text-xs">{medal(i)}</td>
                            <td className="px-3 py-2.5 max-w-[240px] md:max-w-[360px]">
                              {title ? (
                                <span className="text-gray-800 text-[13px] line-clamp-1" title={title}>{title}</span>
                              ) : (
                                <span className="text-gray-500 text-[12px] line-clamp-1 font-mono" title={row.page}>{path}</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold text-blue-600 text-[13px]">
                              {row.clicks.toLocaleString()}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-400 text-[13px] hidden md:table-cell">
                              {row.impressions.toLocaleString()}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-400 text-[13px] hidden md:table-cell">{row.ctr}%</td>
                            <td className="px-3 py-2.5 text-right text-gray-400 text-[13px] hidden md:table-cell">{row.position}</td>
                            <td className="px-3 py-2.5 text-center">
                              <a href={row.page} target="_blank" rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-600">↗</a>
                            </td>
                          </tr>
                        )
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
                <p className="text-sm font-semibold text-gray-800">인기 검색 키워드 Top 25</p>
                <p className="text-xs text-gray-400 mt-0.5">Google Search Console 클릭수 기준 · 최근 90일</p>
              </div>

              {gsc.error && (gsc.needs_scope || gsc.needs_auth) ? (
                <div className="p-8 text-center space-y-3">
                  <p className="text-sm text-gray-500">{gsc.error}</p>
                  <a href={gscConnectUrl}
                    className="inline-block px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700">
                    🔗 Google 연결하기
                  </a>
                </div>
              ) : gsc.loading_queries ? (
                <div className="p-10 text-center text-gray-300 text-sm animate-pulse">키워드 데이터 불러오는 중...</div>
              ) : gsc.queries?.length === 0 ? (
                <div className="p-10 text-center text-gray-400 text-sm">최근 90일간 키워드 데이터가 없습니다</div>
              ) : gsc.queries ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-400">
                        <th className="px-3 py-2 text-left w-10">#</th>
                        <th className="px-3 py-2 text-left">키워드</th>
                        <th className="px-3 py-2 text-right w-20">클릭수</th>
                        <th className="px-3 py-2 text-right w-24 hidden md:table-cell">노출수</th>
                        <th className="px-3 py-2 text-right w-16 hidden md:table-cell">CTR</th>
                        <th className="px-3 py-2 text-right w-16">순위</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gsc.queries.map((row, i) => (
                        <tr key={i} className="border-t border-gray-50 hover:bg-blue-50/30 transition-colors">
                          <td className="px-3 py-2.5 text-gray-300 text-xs">{medal(i)}</td>
                          <td className="px-3 py-2.5 text-gray-800 text-[13px]">{row.query}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-blue-600 text-[13px]">
                            {row.clicks.toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-400 text-[13px] hidden md:table-cell">
                            {row.impressions.toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-400 text-[13px] hidden md:table-cell">{row.ctr}%</td>
                          <td className="px-3 py-2.5 text-right text-gray-400 text-[13px]">{row.position}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )}

          {/* ── 월별 통계 ── */}
          {tab === 'monthly' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm font-semibold text-gray-800 mb-4">📅 월별 발행 현황 (최근 12개월)</p>
              {loadingStats ? (
                <div className="text-gray-300 text-sm animate-pulse text-center py-8">불러오는 중...</div>
              ) : monthlyEntries.length === 0 ? (
                <p className="text-gray-300 text-sm text-center py-8">데이터 없음</p>
              ) : (
                <div className="space-y-2.5">
                  {monthlyEntries.map(([month, count]) => (
                    <div key={month} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-16 shrink-0 tabular-nums">{month}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full flex items-center justify-end pr-2.5 transition-all duration-500"
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
                  <div>
                    <p className="text-xs text-gray-400">연간 발행</p>
                    <p className="font-semibold text-gray-800">{monthlyEntries.reduce((s, [, v]) => s + v, 0)}개</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">월 평균</p>
                    <p className="font-semibold text-gray-800">
                      {(monthlyEntries.reduce((s, [, v]) => s + v, 0) / monthlyEntries.length).toFixed(1)}개
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">최다 발행월</p>
                    <p className="font-semibold text-gray-800">
                      {monthlyEntries.reduce((a, b) => b[1] > a[1] ? b : a, monthlyEntries[0])?.[0]}
                      {' '}({Math.max(...monthlyEntries.map(([, v]) => v))}개)
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 카테고리 ── */}
          {tab === 'categories' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm font-semibold text-gray-800 mb-4">📂 카테고리별 글 수</p>
              {loadingStats ? (
                <div className="text-gray-300 text-sm animate-pulse text-center py-8">불러오는 중...</div>
              ) : !stats?.categories.length ? (
                <p className="text-gray-300 text-sm text-center py-8">카테고리 없음</p>
              ) : (
                <div className="space-y-2.5">
                  {stats.categories.map(cat => (
                    <div key={cat.id} className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 w-36 shrink-0 truncate" title={cat.name}>{cat.name}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-400 to-purple-500 rounded-full flex items-center justify-end pr-2.5 transition-all duration-500"
                          style={{ width: `${Math.max(8, (cat.count / maxCatCount) * 100)}%` }}>
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
