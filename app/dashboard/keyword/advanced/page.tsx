'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────
type AdvTab = 'trending' | 'analyze' | 'blog-rank' | 'ai-guide';

interface TrendingItem {
  keyword: string; score: number; sources: string[];
  monthlyTotal: number; monthlyPc: number; monthlyMobile: number;
  competition: string; moneyScore: number; moneyGrade: string;
}
interface TrendingResult {
  results: TrendingItem[];
  sourceStat: { google: number; googleRSS: number; naverNews: number; daum: number };
  fetchedAt: string;
}

interface AnalyzeResult {
  keyword: string;
  monthlyPc: number; monthlyMobile: number; monthlyTotal: number;
  competition: string; cpcEstimate: number;
  moneyScore: number; moneyGrade: 'S'|'A'|'B'|'C'|'D';
  detail: { volScore: number; compScore: number; cpcScore: number; intentScore: number; satScore: number };
  relatedKeywords: Array<{ keyword: string; pc: number; mobile: number; total: number; competition: string }>;
  totalBlogPosts: number; naverBlogCount: number; daumBlogCount: number;
  latestContent: Array<{ title: string; url: string; author?: string; date: string; source: string }>;
  googleRelated: string[];
  trendCurve: Array<{ period: string; ratio: number }>;
  hasAdApi: boolean;
}

interface BlogRankResult {
  posts: Array<{ rank: number; title: string; url: string; author: string; date: string; source: '네이버'|'다음'; isMyBlog: boolean }>;
  naverCount: number; daumCount: number; myRank: number | null;
  topWords: Array<{ word: string; count: number }>;
  totalCount: number;
}

interface ContentGuide {
  title: string; titleVariants: string[];
  contentStructure: string[]; wordCount: number;
  targetAudience: string; seoTips: string[];
  relatedKeywords: string[]; hashtags: string[];
  intro: string; postingTime: string;
  contentType: string; difficulty: string; estimatedTraffic: string;
}

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function MoneyBadge({ grade, score }: { grade: string; score: number }) {
  const cfg: Record<string, { bg: string; text: string; border: string }> = {
    S: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
    A: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
    B: { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-300' },
    C: { bg: 'bg-gray-100',   text: 'text-gray-600',   border: 'border-gray-300' },
    D: { bg: 'bg-red-50',     text: 'text-red-400',    border: 'border-red-200' },
  };
  const c = cfg[grade] || cfg.D;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-black px-2 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
      {grade === 'S' ? '💎' : grade === 'A' ? '🥇' : grade === 'B' ? '🥈' : grade === 'C' ? '🥉' : '⬜'} {grade}등급 {score > 0 && <span className="opacity-70">({score})</span>}
    </span>
  );
}

function CompBadge({ comp }: { comp: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    high:   { label: '경쟁 높음', cls: 'bg-red-100 text-red-600' },
    medium: { label: '경쟁 중간', cls: 'bg-yellow-100 text-yellow-600' },
    low:    { label: '경쟁 낮음', cls: 'bg-green-100 text-green-600' },
  };
  const c = cfg[comp] || { label: comp || '-', cls: 'bg-gray-100 text-gray-500' };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${c.cls}`}>{c.label}</span>;
}

function fmt(n: number) {
  if (!n) return '-';
  if (n >= 10000) return `${(n/10000).toFixed(1)}만`;
  if (n >= 1000) return `${(n/1000).toFixed(1)}천`;
  return String(n);
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ data }: { data: Array<{ period: string; ratio: number }> }) {
  if (!data.length) return <span className="text-xs text-gray-300">데이터 없음</span>;
  const vals = data.map(d => d.ratio);
  const max = Math.max(...vals, 1);
  const W = 160, H = 40;
  const pts = vals.map((v, i) => `${(i/(vals.length-1))*W},${H-(v/max)*H}`).join(' ');
  const recent = vals.slice(-4);
  const trend = recent[recent.length-1] - recent[0];
  return (
    <div className="flex items-center gap-3">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
        <defs>
          <linearGradient id="sg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3"/>
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#sg)" />
        <polyline points={pts} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <span className={`text-xs font-bold ${trend > 0 ? 'text-green-500' : trend < 0 ? 'text-red-500' : 'text-gray-400'}`}>
        {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} {Math.abs(trend).toFixed(0)}%p
      </span>
    </div>
  );
}

// ── 도넛 차트 ─────────────────────────────────────────────────────────────────
function ScoreDonut({ score, grade }: { score: number; grade: string }) {
  const colors: Record<string, string> = { S: '#8B5CF6', A: '#F59E0B', B: '#3B82F6', C: '#6B7280', D: '#EF4444' };
  const color = colors[grade] || '#6B7280';
  const r = 40, cx = 50, cy = 50;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="relative w-28 h-28">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E5E7EB" strokeWidth="10" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-black" style={{ color }}>{score}</div>
        <div className="text-xs font-bold text-gray-400">{grade}등급</div>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────
export default function AdvancedKeywordPage() {
  const [tab, setTab] = useState<AdvTab>('trending');

  // Trending
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendData, setTrendData] = useState<TrendingResult | null>(null);
  const [trendError, setTrendError] = useState('');
  const [trendFilter, setTrendFilter] = useState<'all'|'S'|'A'|'B'>('all');
  const [aiTrendAnalysis, setAiTrendAnalysis] = useState<{summary?: string; topPicks?: Array<{keyword:string;reason:string;contentIdea:string}>; opportunity?: string} | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Analyze
  const [analyzeKw, setAnalyzeKw] = useState('');
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState('');

  // Blog rank
  const [rankKw, setRankKw] = useState('');
  const [rankMyBlog, setRankMyBlog] = useState('');
  const [rankLoading, setRankLoading] = useState(false);
  const [rankResult, setRankResult] = useState<BlogRankResult | null>(null);
  const [rankError, setRankError] = useState('');
  const [rankSource, setRankSource] = useState<'all'|'naver'|'daum'>('all');

  // AI Guide
  const [guideKw, setGuideKw] = useState('');
  const [guideLoading, setGuideLoading] = useState(false);
  const [guide, setGuide] = useState<ContentGuide | null>(null);
  const [guideError, setGuideError] = useState('');
  const [copiedKw, setCopiedKw] = useState('');

  const copyKw = useCallback((kw: string) => {
    navigator.clipboard.writeText(kw).then(() => {
      setCopiedKw(kw);
      setTimeout(() => setCopiedKw(''), 1500);
    });
  }, []);

  // ── 핸들러 ────────────────────────────────────────────────────────────────

  const fetchTrending = useCallback(async () => {
    setTrendLoading(true); setTrendError(''); setAiTrendAnalysis(null);
    try {
      const res = await fetch('/api/keyword/advanced?action=trending');
      const data = await res.json() as TrendingResult & { error?: string };
      if (data.error) { setTrendError(data.error); return; }
      setTrendData(data);
    } catch (e) { setTrendError(String(e)); }
    finally { setTrendLoading(false); }
  }, []);

  const runAiTrendAnalysis = useCallback(async () => {
    if (!trendData?.results.length) return;
    setAiLoading(true);
    try {
      const keywords = trendData.results.slice(0, 25).map(r => r.keyword);
      const res = await fetch('/api/keyword/advanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'analyze-trending', keywords }),
      });
      const data = await res.json() as { analysis?: typeof aiTrendAnalysis; error?: string };
      if (data.analysis) setAiTrendAnalysis(data.analysis);
    } catch { /* ignore */ }
    finally { setAiLoading(false); }
  }, [trendData]);

  const runAnalyze = useCallback(async () => {
    if (!analyzeKw.trim()) return;
    setAnalyzeLoading(true); setAnalyzeError(''); setAnalyzeResult(null);
    try {
      const res = await fetch('/api/keyword/advanced', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'analyze', keyword: analyzeKw.trim() }),
      });
      const data = await res.json() as AnalyzeResult & { error?: string };
      if (data.error) { setAnalyzeError(data.error); return; }
      setAnalyzeResult(data);
    } catch (e) { setAnalyzeError(String(e)); }
    finally { setAnalyzeLoading(false); }
  }, [analyzeKw]);

  const runBlogRank = useCallback(async () => {
    if (!rankKw.trim()) return;
    setRankLoading(true); setRankError(''); setRankResult(null);
    try {
      const res = await fetch(`/api/keyword/advanced?action=blog-rank&keyword=${encodeURIComponent(rankKw.trim())}&myblog=${encodeURIComponent(rankMyBlog.trim())}`);
      const data = await res.json() as BlogRankResult & { error?: string };
      if (data.error) { setRankError(data.error); return; }
      setRankResult(data);
    } catch (e) { setRankError(String(e)); }
    finally { setRankLoading(false); }
  }, [rankKw, rankMyBlog]);

  const runGuide = useCallback(async () => {
    if (!guideKw.trim()) return;
    setGuideLoading(true); setGuideError(''); setGuide(null);
    try {
      const res = await fetch('/api/keyword/advanced', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'content-guide', keyword: guideKw.trim() }),
      });
      const data = await res.json() as { guide?: ContentGuide; error?: string };
      if (data.error) { setGuideError(data.error); return; }
      if (data.guide) setGuide(data.guide);
    } catch (e) { setGuideError(String(e)); }
    finally { setGuideLoading(false); }
  }, [guideKw]);

  // 페이지 진입 시 자동 로드
  const didLoad = useRef(false);
  useEffect(() => {
    if (!didLoad.current && tab === 'trending') { didLoad.current = true; fetchTrending(); }
  }, [tab, fetchTrending]);

  // ── 탭 정의 ──────────────────────────────────────────────────────────────
  const TABS = [
    { id: 'trending' as AdvTab,  icon: '🔥', label: '실시간 트렌딩', color: 'bg-red-500' },
    { id: 'analyze' as AdvTab,   icon: '🔬', label: '딥 키워드 분석', color: 'bg-indigo-600' },
    { id: 'blog-rank' as AdvTab, icon: '📰', label: '블로그 랭킹',    color: 'bg-emerald-600' },
    { id: 'ai-guide' as AdvTab,  icon: '🤖', label: 'AI 콘텐츠 가이드', color: 'bg-purple-600' },
  ];

  const filteredTrend = trendData?.results.filter(r =>
    trendFilter === 'all' || r.moneyGrade === trendFilter
  ) || [];

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm"
                style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>⚡</span>
              고급 키워드 분석
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">Google Trends + 네이버 + 다음 + Gemini AI · Money Score 알고리즘</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden md:flex items-center gap-1.5 text-[10px] px-2 py-1 bg-green-50 text-green-600 rounded-lg border border-green-100">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              실시간 연동
            </span>
            <a href="/dashboard/settings?tab=naver" className="text-xs text-indigo-600 px-3 py-1.5 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">⚙️ API 설정</a>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex gap-2 mt-4 overflow-x-auto pb-0.5">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                tab === t.id ? `${t.color} text-white shadow-lg` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              <span>{t.icon}</span><span>{t.label}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="p-6 space-y-5">

        {/* ══ 실시간 트렌딩 ═══════════════════════════════════════════════════ */}
        {tab === 'trending' && (
          <div className="space-y-5">
            {/* 컨트롤 */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div>
                  <h2 className="font-black text-base">🔥 실시간 트렌딩 키워드</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Google Trends + 네이버 뉴스 + 다음 웹 · Money Score 자동 계산</p>
                </div>
                <div className="flex gap-2">
                  {trendData && (
                    <button onClick={runAiTrendAnalysis} disabled={aiLoading}
                      className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl disabled:opacity-50">
                      {aiLoading ? '🤖 분석 중...' : '🤖 AI 종합 분석'}
                    </button>
                  )}
                  <button onClick={fetchTrending} disabled={trendLoading}
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-500 hover:bg-red-400 text-white text-sm font-bold rounded-xl disabled:opacity-50">
                    <svg className={`w-4 h-4 ${trendLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    새로고침
                  </button>
                </div>
              </div>

              {/* 소스 통계 */}
              {trendData && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {[
                    { label: 'Google Trends', count: trendData.sourceStat.google, color: 'bg-blue-50 text-blue-600 border-blue-100' },
                    { label: 'Google RSS', count: trendData.sourceStat.googleRSS, color: 'bg-cyan-50 text-cyan-600 border-cyan-100' },
                    { label: '네이버 뉴스', count: trendData.sourceStat.naverNews, color: 'bg-green-50 text-green-600 border-green-100' },
                    { label: '다음/카카오', count: trendData.sourceStat.daum, color: 'bg-yellow-50 text-yellow-600 border-yellow-100' },
                  ].map(s => (
                    <span key={s.label} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${s.color}`}>
                      {s.label} {s.count}건
                    </span>
                  ))}
                  <span className="text-[10px] text-gray-400 flex items-center ml-1">
                    {new Date(trendData.fetchedAt).toLocaleTimeString('ko-KR')} 수집
                  </span>
                </div>
              )}

              {/* 등급 필터 */}
              <div className="flex gap-2 flex-wrap">
                {(['all','S','A','B'] as const).map(f => (
                  <button key={f} onClick={() => setTrendFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      trendFilter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}>
                    {f === 'all' ? '전체' : f === 'S' ? '💎 S등급' : f === 'A' ? '🥇 A등급' : '🥈 B등급'}
                  </button>
                ))}
              </div>

              {trendError && <p className="mt-3 text-sm text-red-600 bg-red-50 p-3 rounded-xl">{trendError}</p>}
            </div>

            {/* AI 분석 결과 */}
            {aiTrendAnalysis && (
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-5 border border-purple-100">
                <h3 className="font-black text-sm text-purple-900 mb-3 flex items-center gap-2">
                  🤖 AI 트렌드 종합 분석
                </h3>
                {aiTrendAnalysis.summary && (
                  <p className="text-sm text-purple-800 leading-relaxed mb-4 bg-white/60 rounded-xl p-3">{aiTrendAnalysis.summary}</p>
                )}
                {aiTrendAnalysis.opportunity && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4">
                    <div className="text-xs font-bold text-yellow-700 mb-1">💡 지금 당장 써야 할 키워드</div>
                    <div className="text-sm text-yellow-900">{aiTrendAnalysis.opportunity}</div>
                  </div>
                )}
                {aiTrendAnalysis.topPicks && (
                  <div className="grid md:grid-cols-3 gap-3">
                    {aiTrendAnalysis.topPicks.map((p, i) => (
                      <div key={i} className="bg-white rounded-xl p-3 border border-purple-100">
                        <div className="font-black text-sm text-purple-700 mb-1">#{i+1} {p.keyword}</div>
                        <div className="text-xs text-gray-500 mb-2">{p.reason}</div>
                        <div className="text-[11px] bg-purple-50 text-purple-600 px-2 py-1 rounded-lg">{p.contentIdea}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 로딩 */}
            {trendLoading && (
              <div className="flex items-center justify-center py-20 gap-3">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex gap-2">
                    {['Google', '네이버', '다음'].map((s, i) => (
                      <div key={s} className="flex items-center gap-1 px-3 py-1.5 bg-white rounded-full border border-gray-200 text-xs text-gray-600"
                        style={{animation:`pulse 1.5s ${i*0.3}s ease-in-out infinite`}}>
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                        {s} 수집 중
                      </div>
                    ))}
                  </div>
                  <div className="text-sm text-gray-400">Google Trends + 네이버 + 다음에서 실시간 데이터 수집 중...</div>
                </div>
              </div>
            )}

            {/* 결과 테이블 */}
            {!trendLoading && filteredTrend.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <span className="font-bold text-sm text-gray-800">
                    트렌딩 키워드 <span className="text-indigo-600">{filteredTrend.length}개</span>
                  </span>
                  <span className="text-xs text-gray-400">클릭 → 딥 분석으로 이동</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-2.5 text-left w-8">#</th>
                        <th className="px-4 py-2.5 text-left">키워드</th>
                        <th className="px-4 py-2.5 text-center">소스</th>
                        <th className="px-4 py-2.5 text-right">월검색</th>
                        <th className="px-4 py-2.5 text-center">경쟁도</th>
                        <th className="px-4 py-2.5 text-center">Money Score</th>
                        <th className="px-4 py-2.5 text-center">수집</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredTrend.slice(0, 50).map((item, i) => (
                        <tr key={i} className="hover:bg-indigo-50/30 transition-colors group cursor-pointer"
                          onClick={() => { setAnalyzeKw(item.keyword); setTab('analyze'); }}>
                          <td className="px-4 py-2.5 text-xs font-black text-gray-300 w-8">
                            {i < 3 ? ['🥇','🥈','🥉'][i] : i+1}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{item.keyword}</div>
                            {item.sources.length > 0 && (
                              <div className="flex gap-1 mt-0.5 flex-wrap">
                                {item.sources.slice(0, 3).map(s => (
                                  <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">{s}</span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <div className="flex justify-center gap-0.5 flex-wrap">
                              {item.sources.includes('google') || item.sources.includes('google_rt') || item.sources.includes('google_rss')
                                ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-500 font-semibold">G</span>
                                : null}
                              {item.sources.includes('naver_news')
                                ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-500 font-semibold">N</span>
                                : null}
                              {item.sources.includes('daum')
                                ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-600 font-semibold">D</span>
                                : null}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-gray-700">{fmt(item.monthlyTotal)}</td>
                          <td className="px-4 py-2.5 text-center"><CompBadge comp={item.competition} /></td>
                          <td className="px-4 py-2.5 text-center">
                            {item.moneyGrade
                              ? <MoneyBadge grade={item.moneyGrade} score={item.moneyScore} />
                              : <span className="text-xs text-gray-300">-</span>
                            }
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <button onClick={e => { e.stopPropagation(); copyKw(item.keyword); }}
                              className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-all ${
                                copiedKw === item.keyword ? 'bg-green-500 text-white' : 'bg-orange-100 hover:bg-orange-500 text-orange-600 hover:text-white'
                              }`}>
                              {copiedKw === item.keyword ? '✓복사' : '수집'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!trendLoading && !trendData && !trendError && (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">🔥</div>
                <div className="font-bold text-gray-600 mb-2">실시간 트렌딩 키워드</div>
                <p className="text-sm text-gray-400 mb-5">Google Trends + 네이버 + 다음에서 지금 핫한 키워드를 수집합니다.</p>
                <button onClick={fetchTrending} className="px-6 py-3 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl text-sm">
                  지금 수집하기
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ 딥 키워드 분석 ══════════════════════════════════════════════════ */}
        {tab === 'analyze' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-5 border border-gray-200">
              <h2 className="font-black text-base mb-1">🔬 딥 키워드 분석</h2>
              <p className="text-xs text-gray-400 mb-4">
                네이버 검색광고 + DataLab + 다음/카카오 + Google Trends 자동완성 → Money Score 종합 산출
              </p>
              <div className="flex gap-2">
                <input value={analyzeKw} onChange={e => setAnalyzeKw(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && runAnalyze()}
                  placeholder="예: 비타민C 영양제"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent" />
                <button onClick={runAnalyze} disabled={analyzeLoading || !analyzeKw.trim()}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl disabled:opacity-50 whitespace-nowrap">
                  {analyzeLoading ? '분석 중...' : '🔬 분석'}
                </button>
              </div>
              {analyzeError && <p className="mt-3 text-sm text-red-600 bg-red-50 p-3 rounded-xl">{analyzeError}</p>}
            </div>

            {analyzeLoading && (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="flex justify-center mb-4 gap-3">
                    {['네이버 광고 API','DataLab','다음/카카오','Google Trends'].map((s, i) => (
                      <div key={s} className="text-[10px] px-2 py-1 bg-white border border-gray-200 rounded-full text-gray-500"
                        style={{animation:`pulse 1.5s ${i*0.2}s ease-in-out infinite`}}>{s}</div>
                    ))}
                  </div>
                  <div className="text-sm text-gray-400">모든 소스에서 병렬로 데이터 수집 중...</div>
                </div>
              </div>
            )}

            {analyzeResult && (
              <div className="space-y-5" style={{animation:'fadeIn 0.4s ease'}}>
                {/* 상단 요약 카드 */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <div className="flex items-start gap-6 flex-wrap">
                    {/* Money Score 도넛 */}
                    <div className="flex flex-col items-center">
                      <ScoreDonut score={analyzeResult.moneyScore} grade={analyzeResult.moneyGrade} />
                      <div className="text-xs text-gray-400 mt-2">Money Score</div>
                    </div>

                    {/* 핵심 지표 */}
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-xl font-black text-gray-900">{analyzeResult.keyword}</h3>
                        <MoneyBadge grade={analyzeResult.moneyGrade} score={analyzeResult.moneyScore} />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          { label: '월 PC 검색', value: fmt(analyzeResult.monthlyPc), color: '#6366F1' },
                          { label: '월 모바일', value: fmt(analyzeResult.monthlyMobile), color: '#8B5CF6' },
                          { label: '월 합계', value: fmt(analyzeResult.monthlyTotal), color: '#EC4899' },
                          { label: 'CPC 추정', value: `₩${analyzeResult.cpcEstimate.toLocaleString()}`, color: '#F59E0B' },
                        ].map(m => (
                          <div key={m.label} className="bg-gray-50 rounded-xl p-3">
                            <div className="text-[10px] text-gray-400 mb-0.5">{m.label}</div>
                            <div className="font-black text-sm" style={{color:m.color}}>{m.value}</div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <CompBadge comp={analyzeResult.competition} />
                        <span className="text-xs text-gray-500">블로그 {analyzeResult.totalBlogPosts}건 (네이버 {analyzeResult.naverBlogCount} + 다음 {analyzeResult.daumBlogCount})</span>
                        {!analyzeResult.hasAdApi && <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">검색광고 API 미설정</span>}
                      </div>
                    </div>

                    {/* Score 상세 */}
                    <div className="w-48">
                      <div className="text-xs font-bold text-gray-500 mb-2">점수 상세</div>
                      {[
                        { label: '검색량', val: analyzeResult.detail.volScore, max: 100, w: 25 },
                        { label: '광고경쟁', val: analyzeResult.detail.compScore, max: 100, w: 20 },
                        { label: 'CPC추정', val: analyzeResult.detail.cpcScore, max: 100, w: 25 },
                        { label: '구매의도', val: analyzeResult.detail.intentScore, max: 100, w: 20 },
                        { label: '포화도역', val: analyzeResult.detail.satScore, max: 100, w: 10 },
                      ].map(d => (
                        <div key={d.label} className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] text-gray-400 w-14 flex-shrink-0">{d.label}</span>
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-indigo-500" style={{width:`${d.val}%`}} />
                          </div>
                          <span className="text-[10px] font-bold text-gray-600 w-8 text-right">{d.val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 트렌드 곡선 */}
                {analyzeResult.trendCurve.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <h3 className="font-bold text-sm mb-3">📈 6개월 검색 트렌드 (네이버 DataLab)</h3>
                    <Sparkline data={analyzeResult.trendCurve} />
                    <div className="flex gap-4 mt-3 text-[11px] text-gray-400">
                      <span>시작: {analyzeResult.trendCurve[0]?.period}</span>
                      <span>종료: {analyzeResult.trendCurve[analyzeResult.trendCurve.length-1]?.period}</span>
                      <span>최고: {Math.max(...analyzeResult.trendCurve.map(d=>d.ratio)).toFixed(1)}</span>
                    </div>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-5">
                  {/* 관련 키워드 */}
                  <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 font-bold text-sm">🔗 관련 키워드 (광고 API)</div>
                    <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                      {analyzeResult.relatedKeywords.map((r, i) => (
                        <div key={i} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 cursor-pointer group"
                          onClick={() => { setAnalyzeKw(r.keyword); runAnalyze(); }}>
                          <span className="text-xs text-gray-300 w-5">{i+1}</span>
                          <span className="flex-1 text-sm font-medium text-gray-800 group-hover:text-indigo-600">{r.keyword}</span>
                          <span className="text-xs text-gray-500">{fmt(r.total)}</span>
                          <CompBadge comp={r.competition} />
                          <button onClick={e => { e.stopPropagation(); copyKw(r.keyword); }}
                            className={`text-[10px] px-1.5 py-0.5 rounded transition-all ${
                              copiedKw === r.keyword ? 'bg-green-500 text-white' : 'bg-gray-100 hover:bg-orange-500 text-gray-500 hover:text-white'
                            }`}>수집</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 최신 콘텐츠 */}
                  <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 font-bold text-sm">📄 최신 콘텐츠 (네이버+다음)</div>
                    <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                      {analyzeResult.latestContent.map((c, i) => (
                        <a key={i} href={c.url} target="_blank" rel="noopener"
                          className="flex items-start gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                            c.source.includes('네이버') ? 'bg-green-100 text-green-600' : c.source.includes('다음') ? 'bg-yellow-100 text-yellow-600' : 'bg-blue-100 text-blue-600'
                          }`}>{c.source.slice(0, 4)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-gray-800 hover:text-indigo-600 leading-snug line-clamp-2">{c.title}</div>
                            <div className="text-[10px] text-gray-400 mt-0.5">{c.author && `${c.author} · `}{c.date}</div>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Google 연관 검색어 */}
                {analyzeResult.googleRelated.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <h3 className="font-bold text-sm mb-3">🔍 Google 연관 검색어</h3>
                    <div className="flex flex-wrap gap-2">
                      {analyzeResult.googleRelated.map((kw, i) => (
                        <button key={i} onClick={() => { setAnalyzeKw(kw); runAnalyze(); }}
                          className="px-3 py-1.5 text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-full border border-blue-100 transition-colors">
                          {kw}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ 블로그 랭킹 ════════════════════════════════════════════════════ */}
        {tab === 'blog-rank' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-5 border border-gray-200">
              <h2 className="font-black text-base mb-1">📰 블로그 상위 랭킹</h2>
              <p className="text-xs text-gray-400 mb-4">네이버 + 다음 블로그 TOP30 수집 · 내 블로그 순위 확인</p>
              <div className="space-y-2">
                <input value={rankKw} onChange={e => setRankKw(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && runBlogRank()}
                  placeholder="키워드 입력 (예: 비타민C 효능)"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-400 focus:border-transparent" />
                <input value={rankMyBlog} onChange={e => setRankMyBlog(e.target.value)}
                  placeholder="내 블로그 URL (선택) — 예: blog.naver.com/myid"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-400 focus:border-transparent" />
                <div className="flex gap-2 justify-between items-center">
                  <div className="flex gap-1.5">
                    {(['all','naver','daum'] as const).map(s => (
                      <button key={s} onClick={() => setRankSource(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          rankSource === s ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}>
                        {s === 'all' ? '전체' : s === 'naver' ? '네이버' : '다음'}
                      </button>
                    ))}
                  </div>
                  <button onClick={runBlogRank} disabled={rankLoading || !rankKw.trim()}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl disabled:opacity-50 text-sm">
                    {rankLoading ? '수집 중...' : '📰 랭킹 수집'}
                  </button>
                </div>
              </div>
              {rankError && <p className="mt-3 text-sm text-red-600 bg-red-50 p-3 rounded-xl">{rankError}</p>}
            </div>

            {rankResult && (
              <div className="space-y-4" style={{animation:'fadeIn 0.4s ease'}}>
                {/* 통계 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: '전체 수집', value: rankResult.totalCount, color: '#6366F1' },
                    { label: '네이버', value: rankResult.naverCount, color: '#03C75A' },
                    { label: '다음', value: rankResult.daumCount, color: '#FFB900' },
                    { label: '내 블로그 순위', value: rankResult.myRank ? `${rankResult.myRank}위` : '미노출', color: rankResult.myRank ? '#10B981' : '#EF4444' },
                  ].map(s => (
                    <div key={s.label} className="bg-white rounded-2xl p-4 border border-gray-200 text-center">
                      <div className="text-xs text-gray-400 mb-1">{s.label}</div>
                      <div className="text-xl font-black" style={{color:s.color}}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* 자주 쓰는 단어 */}
                {rankResult.topWords.length > 0 && (
                  <div className="bg-white rounded-2xl p-5 border border-gray-200">
                    <h3 className="font-bold text-sm mb-3">💡 상위 10위 제목 핵심 단어</h3>
                    <div className="flex flex-wrap gap-2">
                      {rankResult.topWords.map((w, i) => (
                        <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                          style={{
                            background: `rgba(99,102,241,${0.08 + (rankResult.topWords.length - i) / rankResult.topWords.length * 0.15})`,
                            color: '#4F46E5',
                            fontSize: `${10 + (rankResult.topWords.length - i) / rankResult.topWords.length * 4}px`,
                          }}>
                          {w.word}
                          <span className="opacity-60">({w.count})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 포스트 목록 */}
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 font-bold text-sm">블로그 순위</div>
                  <div className="divide-y divide-gray-50">
                    {rankResult.posts
                      .filter(p => rankSource === 'all' || (rankSource === 'naver' ? p.source === '네이버' : p.source === '다음'))
                      .map((p, i) => (
                      <a key={i} href={p.url} target="_blank" rel="noopener"
                        className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors ${p.isMyBlog ? 'bg-green-50 border-l-4 border-green-400' : ''}`}>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 ${
                          i < 3 ? 'text-white' : 'bg-gray-100 text-gray-400'
                        }`} style={i < 3 ? {background:'linear-gradient(135deg,#6366f1,#8b5cf6)'} : {}}>
                          {i+1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-semibold leading-snug line-clamp-1 ${p.isMyBlog ? 'text-green-700' : 'text-gray-800 hover:text-indigo-600'}`}>
                            {p.title} {p.isMyBlog && '⭐'}
                          </div>
                          <div className="text-[10px] text-gray-400 mt-0.5">{p.author} · {p.date}</div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                          p.source === '네이버' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'
                        }`}>{p.source}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ AI 콘텐츠 가이드 ════════════════════════════════════════════════ */}
        {tab === 'ai-guide' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-5 border border-gray-200">
              <h2 className="font-black text-base mb-1">🤖 AI 콘텐츠 가이드</h2>
              <p className="text-xs text-gray-400 mb-4">Gemini AI가 키워드 기반 블로그 콘텐츠 전략을 완벽하게 설계해드립니다.</p>
              <div className="flex gap-2">
                <input value={guideKw} onChange={e => setGuideKw(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && runGuide()}
                  placeholder="예: 다이어트 식단"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent" />
                <button onClick={runGuide} disabled={guideLoading || !guideKw.trim()}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl disabled:opacity-50 whitespace-nowrap">
                  {guideLoading ? 'AI 생성 중...' : '🤖 생성'}
                </button>
              </div>
              {guideError && <p className="mt-3 text-sm text-red-600 bg-red-50 p-3 rounded-xl">{guideError}</p>}
            </div>

            {guideLoading && (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="text-4xl mb-3 animate-bounce">🤖</div>
                  <div className="text-sm text-gray-500">Gemini AI가 콘텐츠 전략을 설계하는 중...</div>
                </div>
              </div>
            )}

            {guide && (
              <div className="space-y-4" style={{animation:'fadeIn 0.4s ease'}}>
                {/* 제목 */}
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl p-5 border border-purple-100">
                  <div className="text-xs font-bold text-purple-500 mb-2">✨ AI 추천 최적 제목</div>
                  <div className="text-lg font-black text-gray-900 mb-3">{guide.title}</div>
                  <div className="flex flex-wrap gap-2">
                    {guide.titleVariants?.map((t, i) => (
                      <button key={i} onClick={() => copyKw(t)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                          copiedKw === t ? 'bg-green-500 text-white border-transparent' : 'bg-white/80 text-purple-700 border-purple-200 hover:bg-purple-100'
                        }`}>
                        {copiedKw === t ? '✓ 복사됨' : `대안 ${i+1}: ${t}`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  {/* 메타 정보 */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-4">
                    <div className="text-xs font-bold text-gray-500 mb-3">📊 콘텐츠 스펙</div>
                    <div className="space-y-2.5">
                      {[
                        { label: '콘텐츠 유형', value: guide.contentType, icon: '📝' },
                        { label: '권장 분량', value: `${guide.wordCount?.toLocaleString()}자`, icon: '📏' },
                        { label: '난이도', value: guide.difficulty, icon: '⚡' },
                        { label: '최적 포스팅', value: guide.postingTime, icon: '⏰' },
                        { label: '예상 유입', value: guide.estimatedTraffic, icon: '📈' },
                        { label: '타겟 독자', value: guide.targetAudience, icon: '👥' },
                      ].map(item => (
                        <div key={item.label} className="flex items-start gap-2">
                          <span className="text-sm">{item.icon}</span>
                          <div>
                            <div className="text-[10px] text-gray-400">{item.label}</div>
                            <div className="text-xs font-semibold text-gray-800">{item.value}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 콘텐츠 구조 */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-4">
                    <div className="text-xs font-bold text-gray-500 mb-3">📋 콘텐츠 구조</div>
                    <ol className="space-y-2">
                      {guide.contentStructure?.map((section, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-[10px]"
                            style={{background:'linear-gradient(135deg,#8B5CF6,#EC4899)'}}>
                            {i+1}
                          </span>
                          <span className="text-gray-700 leading-tight">{section}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* SEO 팁 + 롱테일 */}
                  <div className="space-y-4">
                    <div className="bg-white rounded-2xl border border-gray-200 p-4">
                      <div className="text-xs font-bold text-gray-500 mb-2">🎯 SEO 팁</div>
                      <ul className="space-y-1.5">
                        {guide.seoTips?.map((tip, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                            <span className="text-green-500 flex-shrink-0 mt-0.5">✓</span>{tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-200 p-4">
                      <div className="text-xs font-bold text-gray-500 mb-2">🔑 롱테일 키워드</div>
                      <div className="flex flex-wrap gap-1.5">
                        {guide.relatedKeywords?.map((kw, i) => (
                          <button key={i} onClick={() => copyKw(kw)}
                            className={`text-[10px] px-2 py-1 rounded-full transition-all ${
                              copiedKw === kw ? 'bg-green-500 text-white' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                            }`}>
                            #{kw}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 도입부 + 해시태그 */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <div className="text-xs font-bold text-gray-500 mb-2">✍️ 도입부 샘플</div>
                    <p className="text-sm text-gray-700 leading-relaxed">{guide.intro}</p>
                    <button onClick={() => copyKw(guide.intro || '')}
                      className="mt-3 text-xs text-indigo-600 hover:text-indigo-700 font-semibold">
                      복사 →
                    </button>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <div className="text-xs font-bold text-gray-500 mb-2">🏷️ 추천 해시태그</div>
                    <div className="flex flex-wrap gap-2">
                      {guide.hashtags?.map((tag, i) => (
                        <button key={i} onClick={() => copyKw(`#${tag}`)}
                          className={`text-sm transition-all ${
                            copiedKw === `#${tag}` ? 'text-green-500' : 'text-indigo-500 hover:text-indigo-700'
                          }`}>
                          #{tag}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => copyKw((guide.hashtags || []).map(t => `#${t}`).join(' '))}
                      className="mt-3 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg font-semibold transition-colors">
                      전체 복사
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  );
}
