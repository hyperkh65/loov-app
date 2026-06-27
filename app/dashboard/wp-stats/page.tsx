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

interface Comment {
  id: number;
  author: string;
  content: string;
  date: string;
  post_id: number;
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
  recent_comments: Comment[];
  error?: string;
}

interface GscRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

type Tab = 'posts' | 'gsc' | 'monthly' | 'categories';

export default function WpStatsPage() {
  const [sites, setSites] = useState<WpSite[]>([]);
  const [selected, setSelected] = useState<WpSite | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [gscRows, setGscRows] = useState<GscRow[] | null>(null);
  const [gscError, setGscError] = useState('');
  const [gscMeta, setGscMeta] = useState<{ needs_scope?: boolean; needs_auth?: boolean; not_registered?: boolean } | null>(null);
  const [loadingGsc, setLoadingGsc] = useState(false);
  const [tab, setTab] = useState<Tab>('posts');

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

  // Load stats on site change
  useEffect(() => {
    if (!selected) return;
    setStats(null);
    setGscRows(null);
    setGscError('');
    setGscMeta(null);
    setLoadingStats(true);
    fetch(`/api/wordpress/stats?site_id=${selected.id}`)
      .then(r => r.json())
      .then(data => setStats(data))
      .catch(e => setStats({ error: String(e) } as StatsData))
      .finally(() => setLoadingStats(false));
  }, [selected]);

  const loadGsc = useCallback(async () => {
    if (!selected) return;
    setLoadingGsc(true);
    setGscError('');
    setGscMeta(null);
    try {
      const res = await fetch(`/api/google/search-console?site_url=${encodeURIComponent(selected.site_url)}`);
      const data = await res.json();
      if (!res.ok) {
        setGscError(data.error || 'GSC 오류');
        setGscMeta({ needs_scope: data.needs_scope, needs_auth: data.needs_auth, not_registered: data.not_registered });
      } else {
        setGscRows(data.rows || []);
      }
    } catch (e) {
      setGscError(String(e));
    } finally {
      setLoadingGsc(false);
    }
  }, [selected]);

  useEffect(() => {
    if (tab === 'gsc' && selected && gscRows === null && !gscError && !loadingGsc) {
      loadGsc();
    }
  }, [tab, selected, gscRows, gscError, loadingGsc, loadGsc]);

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

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">📊 WordPress 통계</h1>
        {selected && (
          <a
            href={selected.site_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline"
          >
            {selected.site_url.replace(/^https?:\/\//, '')} ↗
          </a>
        )}
      </div>

      {/* Site tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5 scrollbar-hide">
        {sites.map(site => (
          <button
            key={site.id}
            onClick={() => { setSelected(site); setTab('posts'); }}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
              selected?.id === site.id
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            🔵 {site.site_name}
          </button>
        ))}
        {sites.length === 0 && (
          <p className="text-sm text-gray-400 py-1">
            등록된 WordPress 사이트가 없습니다.{' '}
            <a href="/dashboard/wordpress" className="text-blue-500 hover:underline">사이트 추가 →</a>
          </p>
        )}
      </div>

      {!selected && sites.length > 0 && (
        <p className="text-gray-400 text-sm">사이트를 선택하세요</p>
      )}

      {selected && (
        <>
          {/* Overview cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {loadingStats ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="bg-gray-100 rounded-xl h-20 animate-pulse" />
              ))
            ) : stats && !stats.error ? (
              <>
                <div className="bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
                  <p className="text-xs text-gray-400 mb-1">전체 글</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.total_posts.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-300 mt-0.5">전체 {stats.total_pages.toLocaleString()}페이지</p>
                </div>
                <div className="bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
                  <p className="text-xs text-gray-400 mb-1">최근 30일 발행</p>
                  <p className="text-2xl font-bold text-green-600">{recentMonthPosts}</p>
                  <p className="text-[10px] text-gray-300 mt-0.5">posts</p>
                </div>
                <div className="bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
                  <p className="text-xs text-gray-400 mb-1">전체 댓글</p>
                  <p className="text-2xl font-bold text-purple-600">{stats.total_comments.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-300 mt-0.5">comments</p>
                </div>
                <div className="bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
                  <p className="text-xs text-gray-400 mb-1">카테고리</p>
                  <p className="text-2xl font-bold text-orange-500">{stats.categories.length}</p>
                  <p className="text-[10px] text-gray-300 mt-0.5">categories</p>
                </div>
              </>
            ) : stats?.error ? (
              <div className="col-span-4 bg-red-50 rounded-xl p-4 text-sm text-red-500">
                ❌ {stats.error}
              </div>
            ) : null}
          </div>

          {/* Tabs */}
          <div className="flex gap-1.5 mb-4 overflow-x-auto scrollbar-hide">
            {([
              { id: 'posts' as Tab, label: '🏆 인기글 Top 20' },
              { id: 'gsc' as Tab, label: '🔍 Search Console' },
              { id: 'monthly' as Tab, label: '📅 월별 통계' },
              { id: 'categories' as Tab, label: '📂 카테고리' },
            ]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  tab === t.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Tab: Top Posts ── */}
          {tab === 'posts' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    인기글 Top 20
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      {stats?.has_view_data ? '(조회수 기준)' : '(댓글 수 기준 — 조회수 플러그인 없음)'}
                    </span>
                  </p>
                </div>
                {!stats?.has_view_data && !loadingStats && (
                  <span className="text-[11px] text-orange-500 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full shrink-0">
                    ⚠️ 조회수 추적 안됨
                  </span>
                )}
              </div>

              {loadingStats ? (
                <div className="p-10 text-center text-gray-300 text-sm animate-pulse">통계 불러오는 중...</div>
              ) : !stats || stats.error ? null : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[500px]">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-400">
                        <th className="px-3 py-2 text-left w-8">#</th>
                        <th className="px-3 py-2 text-left">제목</th>
                        {stats.has_view_data && <th className="px-3 py-2 text-right w-20">조회수</th>}
                        <th className="px-3 py-2 text-right w-16">댓글</th>
                        <th className="px-3 py-2 text-right w-24">발행일</th>
                        <th className="px-3 py-2 text-center w-10">↗</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.top_posts.map((post, i) => (
                        <tr key={post.id} className="border-t border-gray-50 hover:bg-blue-50/30 transition-colors">
                          <td className="px-3 py-2.5 text-gray-300 text-xs font-mono">
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="line-clamp-1 text-gray-700 text-[13px]">{post.title}</span>
                          </td>
                          {stats.has_view_data && (
                            <td className="px-3 py-2.5 text-right text-blue-600 font-semibold text-[13px]">
                              {post.views != null ? post.views.toLocaleString() : '—'}
                            </td>
                          )}
                          <td className="px-3 py-2.5 text-right text-gray-500 text-[13px]">{post.comment_count}</td>
                          <td className="px-3 py-2.5 text-right text-gray-300 text-xs">
                            {post.date?.slice(0, 10)}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <a
                              href={post.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-600 text-sm"
                            >↗</a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Recent comments */}
              {!loadingStats && stats && !stats.error && stats.recent_comments.length > 0 && (
                <div className="border-t border-gray-100 px-4 py-3">
                  <p className="text-xs font-medium text-gray-400 mb-2">💬 최근 댓글</p>
                  <div className="space-y-1.5">
                    {stats.recent_comments.map(c => (
                      <div key={c.id} className="flex gap-2 text-xs text-gray-500">
                        <span className="font-medium text-gray-600 shrink-0">{c.author}</span>
                        <span className="line-clamp-1 text-gray-400">{c.content}</span>
                        <span className="text-gray-300 shrink-0">{c.date?.slice(0, 10)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: GSC ── */}
          {tab === 'gsc' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Google Search Console</p>
                  <p className="text-xs text-gray-400 mt-0.5">최근 90일 · 클릭수 기준 Top 25 페이지</p>
                </div>
                {!loadingGsc && gscRows !== null && (
                  <button onClick={() => { setGscRows(null); loadGsc(); }} className="text-xs text-gray-400 hover:text-gray-600">
                    🔄 새로고침
                  </button>
                )}
              </div>

              {loadingGsc ? (
                <div className="p-10 text-center text-gray-300 text-sm animate-pulse">Google 데이터 불러오는 중...</div>
              ) : gscError ? (
                <div className="p-6 text-center space-y-3">
                  <p className="text-sm text-gray-500">{gscError}</p>
                  {(gscMeta?.needs_scope || gscMeta?.needs_auth) && (
                    <a
                      href="/api/google/connect?return_to=/dashboard/wp-stats"
                      className="inline-block px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700"
                    >
                      🔗 Google 재연결 (Search Console 권한 추가)
                    </a>
                  )}
                  {gscMeta?.not_registered && (
                    <a
                      href="https://search.google.com/search-console"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-xl hover:bg-gray-200"
                    >
                      Search Console에서 사이트 등록 →
                    </a>
                  )}
                </div>
              ) : gscRows?.length === 0 ? (
                <div className="p-10 text-center text-gray-400 text-sm">
                  최근 90일간 데이터가 없습니다
                </div>
              ) : gscRows ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-400">
                        <th className="px-3 py-2 text-left w-8">#</th>
                        <th className="px-3 py-2 text-left">페이지</th>
                        <th className="px-3 py-2 text-right w-20">클릭수</th>
                        <th className="px-3 py-2 text-right w-24">노출수</th>
                        <th className="px-3 py-2 text-right w-16">CTR</th>
                        <th className="px-3 py-2 text-right w-16">순위</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gscRows.map((row, i) => {
                        const path = row.page.replace(selected.site_url.replace(/\/$/, ''), '') || '/'
                        return (
                          <tr key={i} className="border-t border-gray-50 hover:bg-blue-50/30 transition-colors">
                            <td className="px-3 py-2.5 text-gray-300 text-xs">
                              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                            </td>
                            <td className="px-3 py-2.5 max-w-[260px]">
                              <a
                                href={row.page}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline text-[12px] line-clamp-1"
                                title={row.page}
                              >
                                {path}
                              </a>
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold text-blue-600 text-[13px]">
                              {row.clicks.toLocaleString()}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-500 text-[13px]">
                              {row.impressions.toLocaleString()}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-400 text-[13px]">{row.ctr}%</td>
                            <td className="px-3 py-2.5 text-right text-gray-400 text-[13px]">{row.position}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )}

          {/* ── Tab: Monthly ── */}
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
                          style={{ width: `${Math.max(8, (count / maxMonthly) * 100)}%` }}
                        >
                          <span className="text-white text-xs font-semibold">{count}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Summary */}
              {!loadingStats && monthlyEntries.length > 0 && (
                <div className="mt-5 pt-4 border-t border-gray-100 flex gap-6 text-sm text-gray-500">
                  <div>
                    <span className="text-xs text-gray-400">연간 발행</span>
                    <p className="font-semibold text-gray-800">
                      {monthlyEntries.reduce((s, [, v]) => s + v, 0)}개
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">월 평균</span>
                    <p className="font-semibold text-gray-800">
                      {(monthlyEntries.reduce((s, [, v]) => s + v, 0) / monthlyEntries.length).toFixed(1)}개
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">최다 발행</span>
                    <p className="font-semibold text-gray-800">
                      {Math.max(...monthlyEntries.map(([, v]) => v))}개 ({monthlyEntries.find(([, v]) => v === Math.max(...monthlyEntries.map(([, vv]) => vv)))?.[0]})
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Categories ── */}
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
                      <span className="text-xs text-gray-600 w-32 shrink-0 truncate" title={cat.name}>{cat.name}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-400 to-purple-500 rounded-full flex items-center justify-end pr-2.5 transition-all duration-500"
                          style={{ width: `${Math.max(8, (cat.count / maxCatCount) * 100)}%` }}
                        >
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
