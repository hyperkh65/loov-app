'use client';

import { useState, useCallback, useRef } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────
type Tab = 'golden' | 'batch' | 'trend' | 'price' | 'blog' | 'exposure';

interface KeywordResult {
  keyword: string;
  monthlyPc: number;
  monthlyMobile: number;
  monthlyTotal: number;
  competition: number;
  blogCompetition: number;
  score: number;
  grade: 'diamond' | 'gold' | 'silver' | 'bronze' | 'normal';
  isRelated?: boolean;
}

interface TrendDataPoint { period: string; ratio: number; }
interface TrendResult { title: string; keywords: string[]; data: TrendDataPoint[]; }

interface PriceResult {
  source: string;
  title: string;
  price: number;
  originalPrice?: number;
  image: string;
  url: string;
  mall: string;
  brand?: string;
}

interface BlogCheckResult {
  blogId: string;
  blogUrl: string;
  status: 'healthy' | 'warning' | 'restricted' | 'unknown';
  statusLabel: string;
  indexedCount?: number;
  recentPosts?: number;
  lastPostDate?: string;
  restrictions: string[];
  warnings: string[];
  score: number;
  details: string;
}

interface ExposureResult {
  keyword: string;
  blogId: string;
  exposed: boolean;
  topRank: number | null;
  statusLabel: string;
  statusColor: string;
  myPosts: Array<{ rank: number; title: string; date: string; url: string }>;
  totalResults: number;
}

// ── Grade config ───────────────────────────────────────────────────────────────
const GRADE_CONFIG = {
  diamond: { label: '💎 다이아', bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-300', desc: '최상위 황금키워드' },
  gold:    { label: '🥇 황금',   bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300', desc: '고기회 키워드' },
  silver:  { label: '🥈 은',     bg: 'bg-gray-100',   text: 'text-gray-600',   border: 'border-gray-300',   desc: '중간 기회' },
  bronze:  { label: '🥉 동',     bg: 'bg-orange-50',  text: 'text-orange-600', border: 'border-orange-200', desc: '경쟁 낮음' },
  normal:  { label: '⬜ 일반',   bg: 'bg-white',      text: 'text-gray-400',   border: 'border-gray-200',   desc: '기회 낮음' },
};

function GradeBadge({ grade }: { grade: KeywordResult['grade'] }) {
  const c = GRADE_CONFIG[grade];
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}>{c.label}</span>;
}

function formatNum(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}천`;
  return String(n);
}

// ── Mini sparkline ─────────────────────────────────────────────────────────────
function Sparkline({ data }: { data: TrendDataPoint[] }) {
  if (!data.length) return null;
  const vals = data.map(d => d.ratio);
  const max = Math.max(...vals, 1);
  const W = 120, H = 32;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - (v / max) * H}`).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function KeywordPage() {
  const [tab, setTab] = useState<Tab>('golden');

  // Golden keyword
  const [seedKeyword, setSeedKeyword] = useState('');
  const [goldenLoading, setGoldenLoading] = useState(false);
  const [goldenResults, setGoldenResults] = useState<KeywordResult[]>([]);
  const [goldenError, setGoldenError] = useState('');

  // Batch analysis
  const [batchInput, setBatchInput] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchResults, setBatchResults] = useState<KeywordResult[]>([]);
  const [batchError, setBatchError] = useState('');

  // Trend
  const [trendInput, setTrendInput] = useState('');
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendResults, setTrendResults] = useState<TrendResult[]>([]);
  const [trendError, setTrendError] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const suggestTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Price comparison
  const [priceQuery, setPriceQuery] = useState('');
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceResults, setPriceResults] = useState<PriceResult[]>([]);
  const [priceSource, setPriceSource] = useState<'all' | 'naver' | 'coupang'>('all');
  const [priceError, setPriceError] = useState('');

  // Blog checker
  const [blogUrl, setBlogUrl] = useState('');
  const [blogLoading, setBlogLoading] = useState(false);
  const [blogResult, setBlogResult] = useState<BlogCheckResult | null>(null);
  const [blogError, setBlogError] = useState('');

  // Exposure check
  const [expKeyword, setExpKeyword] = useState('');
  const [expBlog, setExpBlog] = useState('');
  const [expLoading, setExpLoading] = useState(false);
  const [expResult, setExpResult] = useState<ExposureResult | null>(null);
  const [expError, setExpError] = useState('');

  // ── Handlers ────────────────────────────────────────────────────────────────

  const runGolden = useCallback(async () => {
    if (!seedKeyword.trim()) return;
    setGoldenLoading(true); setGoldenError(''); setGoldenResults([]);
    try {
      const res = await fetch('/api/keyword/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: [seedKeyword.trim()], mode: 'golden' }),
      });
      const data = await res.json() as { results?: KeywordResult[]; error?: string; hasAdApi?: boolean };
      if (data.error) { setGoldenError(data.error); return; }
      if (!data.hasAdApi) setGoldenError('⚠️ 검색광고 API 미설정 — 검색량 데이터 없음. 설정 > 네이버 API에서 등록하세요.');
      setGoldenResults(data.results || []);
    } catch (e) {
      setGoldenError(String(e));
    } finally {
      setGoldenLoading(false);
    }
  }, [seedKeyword]);

  const runBatch = useCallback(async () => {
    const keywords = batchInput.split('\n').map(k => k.trim()).filter(Boolean);
    if (!keywords.length) return;
    setBatchLoading(true); setBatchError(''); setBatchResults([]);
    try {
      const res = await fetch('/api/keyword/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords, mode: 'batch' }),
      });
      const data = await res.json() as { results?: KeywordResult[]; error?: string };
      if (data.error) { setBatchError(data.error); return; }
      setBatchResults(data.results || []);
    } catch (e) {
      setBatchError(String(e));
    } finally {
      setBatchLoading(false);
    }
  }, [batchInput]);

  const runTrend = useCallback(async () => {
    const keywords = trendInput.split(',').map(k => k.trim()).filter(Boolean).slice(0, 5);
    if (!keywords.length) return;
    setTrendLoading(true); setTrendError(''); setTrendResults([]);
    try {
      const res = await fetch('/api/keyword/trend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords }),
      });
      const data = await res.json() as { results?: TrendResult[]; error?: string };
      if (data.error) { setTrendError(data.error); return; }
      setTrendResults(data.results || []);
    } catch (e) {
      setTrendError(String(e));
    } finally {
      setTrendLoading(false);
    }
  }, [trendInput]);

  const fetchSuggestions = useCallback((q: string) => {
    if (suggestTimeout.current) clearTimeout(suggestTimeout.current);
    if (!q.trim()) { setSuggestions([]); return; }
    suggestTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/keyword/trend?q=${encodeURIComponent(q)}`);
        const data = await res.json() as { suggestions?: string[] };
        setSuggestions(data.suggestions || []);
      } catch { /* ignore */ }
    }, 400);
  }, []);

  const runPrice = useCallback(async () => {
    if (!priceQuery.trim()) return;
    setPriceLoading(true); setPriceError(''); setPriceResults([]);
    try {
      const res = await fetch(`/api/keyword/price?q=${encodeURIComponent(priceQuery.trim())}&source=${priceSource}`);
      const data = await res.json() as { results?: PriceResult[]; error?: string; hasNaverApi?: boolean };
      if (data.error) { setPriceError(data.error); return; }
      if (!data.hasNaverApi) setPriceError('⚠️ 네이버 API 미설정 — 설정 > 네이버 API에서 등록하세요.');
      setPriceResults(data.results || []);
    } catch (e) {
      setPriceError(String(e));
    } finally {
      setPriceLoading(false);
    }
  }, [priceQuery, priceSource]);

  const runBlogCheck = useCallback(async () => {
    if (!blogUrl.trim()) return;
    setBlogLoading(true); setBlogError(''); setBlogResult(null);
    try {
      const res = await fetch(`/api/blog/check?url=${encodeURIComponent(blogUrl.trim())}`);
      const data = await res.json() as BlogCheckResult & { error?: string };
      if (data.error) { setBlogError(data.error); return; }
      setBlogResult(data);
    } catch (e) {
      setBlogError(String(e));
    } finally {
      setBlogLoading(false);
    }
  }, [blogUrl]);

  const runExposure = useCallback(async () => {
    if (!expKeyword.trim() || !expBlog.trim()) return;
    setExpLoading(true); setExpError(''); setExpResult(null);
    try {
      const res = await fetch(`/api/blog/exposure?keyword=${encodeURIComponent(expKeyword.trim())}&blog=${encodeURIComponent(expBlog.trim())}`);
      const data = await res.json() as ExposureResult & { error?: string };
      if (data.error) { setExpError(data.error); return; }
      setExpResult(data);
    } catch (e) {
      setExpError(String(e));
    } finally {
      setExpLoading(false);
    }
  }, [expKeyword, expBlog]);

  // ── Render ───────────────────────────────────────────────────────────────────

  const TABS: { id: Tab; icon: string; label: string; desc: string }[] = [
    { id: 'golden',   icon: '💎', label: '황금키워드',   desc: '기회 높은 키워드 발굴' },
    { id: 'batch',    icon: '📊', label: '키워드 분석',  desc: '여러 키워드 일괄 분석' },
    { id: 'trend',    icon: '📈', label: '트렌드',        desc: '네이버 검색 트렌드' },
    { id: 'price',    icon: '💰', label: '최저가 비교',  desc: '네이버·쿠팡 가격 비교' },
    { id: 'blog',     icon: '🩺', label: '블로그 판독기', desc: '블로그 건강 상태 진단' },
    { id: 'exposure', icon: '🔍', label: '노출 체크',    desc: '키워드 순위 확인' },
  ];

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-gray-900">🔑 키워드 & 마케팅 도구</h1>
            <p className="text-sm text-gray-400">황금키워드 · 트렌드 · 가격비교 · 블로그 진단</p>
          </div>
          <a href="/dashboard/settings?tab=naver" className="text-xs text-indigo-600 hover:underline px-3 py-1.5 bg-indigo-50 rounded-lg">⚙️ 네이버 API 설정</a>
        </div>
      </header>

      <div className="p-6">
        {/* Tab bar */}
        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all ${
                tab === t.id ? 'bg-gray-900 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}>
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* ── Golden Keyword ── */}
        {tab === 'golden' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-200">
              <h2 className="font-black text-lg mb-1">💎 황금키워드 발굴</h2>
              <p className="text-sm text-gray-500 mb-4">시드 키워드를 입력하면 관련 키워드를 분석해 기회 점수로 정렬합니다.<br />
                <span className="text-xs">점수 = 월검색량 ÷ (블로그 문서수 / 1000) — 높을수록 경쟁 대비 검색량이 큰 기회 키워드</span>
              </p>
              <div className="flex gap-2">
                <input value={seedKeyword} onChange={e => setSeedKeyword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && runGolden()}
                  placeholder="예: 다이어트 보조제"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-yellow-400 focus:border-transparent" />
                <button onClick={runGolden} disabled={goldenLoading || !seedKeyword.trim()}
                  className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-white font-bold rounded-xl disabled:opacity-50 whitespace-nowrap">
                  {goldenLoading ? '분석 중...' : '🔍 분석'}
                </button>
              </div>
              {goldenError && <p className="mt-3 text-sm text-amber-600 bg-amber-50 p-3 rounded-xl">{goldenError}</p>}
            </div>

            {goldenResults.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div className="font-bold text-gray-800">키워드 분석 결과 {goldenResults.length}건</div>
                  <div className="flex gap-2 text-xs">
                    {Object.entries(GRADE_CONFIG).map(([k, v]) => (
                      <span key={k} className={`px-2 py-0.5 rounded-full border ${v.bg} ${v.text} ${v.border}`}>{v.label}</span>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="text-left px-6 py-3">키워드</th>
                        <th className="text-right px-4 py-3">월검색(PC)</th>
                        <th className="text-right px-4 py-3">월검색(모바일)</th>
                        <th className="text-right px-4 py-3">합계</th>
                        <th className="text-right px-4 py-3">블로그 문서</th>
                        <th className="text-right px-4 py-3">기회점수</th>
                        <th className="text-center px-4 py-3">등급</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {goldenResults.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-3 font-semibold text-gray-800">
                            {r.keyword}
                            {r.isRelated && <span className="ml-1 text-xs text-gray-400">관련</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">{formatNum(r.monthlyPc)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{formatNum(r.monthlyMobile)}</td>
                          <td className="px-4 py-3 text-right font-semibold">{formatNum(r.monthlyTotal)}</td>
                          <td className="px-4 py-3 text-right text-gray-500">{formatNum(r.blogCompetition)}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-black ${r.grade === 'diamond' ? 'text-cyan-600' : r.grade === 'gold' ? 'text-yellow-600' : 'text-gray-500'}`}>
                              {r.score.toFixed(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center"><GradeBadge grade={r.grade} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Grade guide */}
            <div className="grid grid-cols-5 gap-3">
              {Object.entries(GRADE_CONFIG).map(([k, v]) => (
                <div key={k} className={`p-4 rounded-2xl border ${v.bg} ${v.border}`}>
                  <div className={`font-bold text-sm ${v.text}`}>{v.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{v.desc}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {k === 'diamond' && '점수 > 200, 월검색 > 5,000'}
                    {k === 'gold' && '점수 > 100, 월검색 > 1,000'}
                    {k === 'silver' && '점수 > 50, 월검색 > 200'}
                    {k === 'bronze' && '점수 > 10'}
                    {k === 'normal' && '점수 ≤ 10'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Batch Analysis ── */}
        {tab === 'batch' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-200">
              <h2 className="font-black text-lg mb-1">📊 키워드 일괄 분석</h2>
              <p className="text-sm text-gray-500 mb-4">분석할 키워드를 한 줄에 하나씩 입력하세요. (최대 20개)</p>
              <textarea value={batchInput} onChange={e => setBatchInput(e.target.value)}
                rows={8}
                placeholder={'다이어트 보조제\n비타민C 영양제\n프로바이오틱스 추천\n콜라겐 효능\n마그네슘 부족 증상'}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm resize-none focus:ring-2 focus:ring-indigo-400" />
              <div className="mt-3 flex justify-end">
                <button onClick={runBatch} disabled={batchLoading || !batchInput.trim()}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl disabled:opacity-50">
                  {batchLoading ? '분석 중...' : '📊 일괄 분석'}
                </button>
              </div>
              {batchError && <p className="mt-3 text-sm text-amber-600 bg-amber-50 p-3 rounded-xl">{batchError}</p>}
            </div>

            {batchResults.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 font-bold text-gray-800">분석 결과 {batchResults.length}건</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="text-left px-6 py-3">키워드</th>
                        <th className="text-right px-4 py-3">월검색(PC)</th>
                        <th className="text-right px-4 py-3">월검색(모바일)</th>
                        <th className="text-right px-4 py-3">합계</th>
                        <th className="text-right px-4 py-3">웹문서</th>
                        <th className="text-right px-4 py-3">블로그</th>
                        <th className="text-right px-4 py-3">점수</th>
                        <th className="text-center px-4 py-3">등급</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {batchResults.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-6 py-3 font-semibold text-gray-800">{r.keyword}</td>
                          <td className="px-4 py-3 text-right text-gray-500">{formatNum(r.monthlyPc)}</td>
                          <td className="px-4 py-3 text-right text-gray-500">{formatNum(r.monthlyMobile)}</td>
                          <td className="px-4 py-3 text-right font-semibold">{formatNum(r.monthlyTotal)}</td>
                          <td className="px-4 py-3 text-right text-gray-400">{formatNum(r.competition)}</td>
                          <td className="px-4 py-3 text-right text-gray-400">{formatNum(r.blogCompetition)}</td>
                          <td className="px-4 py-3 text-right font-bold text-indigo-600">{r.score.toFixed(1)}</td>
                          <td className="px-4 py-3 text-center"><GradeBadge grade={r.grade} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Trend ── */}
        {tab === 'trend' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-200">
              <h2 className="font-black text-lg mb-1">📈 네이버 검색 트렌드</h2>
              <p className="text-sm text-gray-500 mb-4">최대 5개 키워드를 쉼표로 구분해 트렌드를 비교합니다.</p>
              <div className="relative mb-3">
                <input value={trendInput}
                  onChange={e => { setTrendInput(e.target.value); fetchSuggestions(e.target.value.split(',').pop()?.trim() || ''); }}
                  onKeyDown={e => e.key === 'Enter' && runTrend()}
                  placeholder="예: 다이어트, 헬스, 홈트레이닝"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400" />
                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl mt-1 shadow-lg z-10 overflow-hidden">
                    {suggestions.slice(0, 8).map(s => (
                      <button key={s} onClick={() => {
                        const parts = trendInput.split(',');
                        parts[parts.length - 1] = s;
                        setTrendInput(parts.join(','));
                        setSuggestions([]);
                      }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={runTrend} disabled={trendLoading || !trendInput.trim()}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl disabled:opacity-50">
                {trendLoading ? '데이터 로딩 중...' : '📈 트렌드 분석'}
              </button>
              {trendError && <p className="mt-3 text-sm text-red-600 bg-red-50 p-3 rounded-xl">{trendError}</p>}
            </div>

            {trendResults.length > 0 && (
              <div className="grid gap-4">
                {trendResults.map((r, i) => {
                  const max = Math.max(...r.data.map(d => d.ratio), 1);
                  const recent = r.data.slice(-3);
                  const avg = recent.reduce((s, d) => s + d.ratio, 0) / recent.length;
                  const trend = avg > 60 ? '🔥 상승' : avg > 30 ? '📊 보통' : '📉 하락';
                  return (
                    <div key={i} className="bg-white rounded-2xl p-6 border border-gray-200">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="font-black text-lg text-gray-800">{r.title}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{r.keywords.join(', ')}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold">{trend}</span>
                          <Sparkline data={r.data} />
                        </div>
                      </div>
                      {/* Bar chart */}
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {r.data.map((d, j) => (
                          <div key={j} className="flex items-center gap-2 text-xs">
                            <span className="w-20 text-gray-400 flex-shrink-0">{d.period}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                              <div className="h-full rounded-full bg-indigo-500 transition-all"
                                style={{ width: `${(d.ratio / max) * 100}%` }} />
                            </div>
                            <span className="w-8 text-right text-gray-600 font-medium">{d.ratio}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Price Comparison ── */}
        {tab === 'price' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-200">
              <h2 className="font-black text-lg mb-1">💰 최저가 비교</h2>
              <p className="text-sm text-gray-500 mb-4">상품명을 검색하면 네이버쇼핑 · 쿠팡 최저가를 비교합니다.</p>
              <div className="flex gap-2 mb-3">
                {(['all', 'naver', 'coupang'] as const).map(s => (
                  <button key={s} onClick={() => setPriceSource(s)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${priceSource === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {s === 'all' ? '전체' : s === 'naver' ? '🟢 네이버' : '🛒 쿠팡'}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={priceQuery} onChange={e => setPriceQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && runPrice()}
                  placeholder="예: 에어프라이어 10L"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-400" />
                <button onClick={runPrice} disabled={priceLoading || !priceQuery.trim()}
                  className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl disabled:opacity-50">
                  {priceLoading ? '검색 중...' : '검색'}
                </button>
              </div>
              {priceError && <p className="mt-3 text-sm text-amber-600 bg-amber-50 p-3 rounded-xl">{priceError}</p>}
            </div>

            {priceResults.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {priceResults.map((r, i) => (
                  <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                    className="bg-white rounded-2xl border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all overflow-hidden flex flex-col">
                    {r.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image} alt={r.title} className="w-full h-40 object-contain bg-gray-50 p-2" />
                    )}
                    <div className="p-4 flex flex-col flex-1">
                      <div className="text-xs text-indigo-600 font-semibold mb-1">{r.source === 'naver' ? '🟢 네이버' : '🛒 쿠팡'} · {r.mall}</div>
                      <div className="text-sm font-semibold text-gray-800 line-clamp-2 flex-1 mb-2">{r.title}</div>
                      <div className="flex items-end gap-2">
                        <span className="text-xl font-black text-indigo-600">{r.price.toLocaleString()}원</span>
                        {r.originalPrice && r.originalPrice > r.price && (
                          <span className="text-xs text-gray-400 line-through mb-0.5">{r.originalPrice.toLocaleString()}원</span>
                        )}
                      </div>
                      {i === 0 && <span className="mt-1 text-xs text-green-600 font-bold">🏷️ 최저가</span>}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Blog Check ── */}
        {tab === 'blog' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-200">
              <h2 className="font-black text-lg mb-1">🩺 블로그 판독기</h2>
              <p className="text-sm text-gray-500 mb-4">네이버 블로그 URL 또는 아이디를 입력하면 저품질·제한 여부를 진단합니다.</p>
              <div className="flex gap-2">
                <input value={blogUrl} onChange={e => setBlogUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && runBlogCheck()}
                  placeholder="예: https://blog.naver.com/myblog 또는 myblog"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400" />
                <button onClick={runBlogCheck} disabled={blogLoading || !blogUrl.trim()}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl disabled:opacity-50">
                  {blogLoading ? '진단 중...' : '🩺 진단'}
                </button>
              </div>
              {blogError && <p className="mt-3 text-sm text-red-600 bg-red-50 p-3 rounded-xl">{blogError}</p>}
            </div>

            {blogResult && (
              <div className={`bg-white rounded-2xl p-6 border-2 ${blogResult.status === 'healthy' ? 'border-green-400' : blogResult.status === 'warning' ? 'border-yellow-400' : blogResult.status === 'restricted' ? 'border-red-400' : 'border-gray-300'}`}>
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <div className="text-2xl font-black mb-1">{blogResult.statusLabel}</div>
                    <a href={blogResult.blogUrl} target="_blank" rel="noopener" className="text-sm text-indigo-600 hover:underline">{blogResult.blogUrl}</a>
                  </div>
                  {/* Score circle */}
                  <div className="flex flex-col items-center">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-black border-4 ${
                      blogResult.score >= 70 ? 'border-green-400 text-green-600' : blogResult.score >= 40 ? 'border-yellow-400 text-yellow-600' : 'border-red-400 text-red-600'
                    }`}>
                      {Math.round(blogResult.score)}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">블로그 점수</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6 text-center">
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <div className="text-xl font-black text-indigo-600">{(blogResult.indexedCount || 0).toLocaleString()}</div>
                    <div className="text-xs text-gray-500">검색 노출 수</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <div className="text-xl font-black text-gray-700">{blogResult.recentPosts || 0}</div>
                    <div className="text-xs text-gray-500">최근 게시물</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <div className="text-sm font-bold text-gray-700">{blogResult.lastPostDate || '—'}</div>
                    <div className="text-xs text-gray-500">최근 발행일</div>
                  </div>
                </div>

                {blogResult.restrictions.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <div className="text-xs font-bold text-red-600 uppercase tracking-wider">제한 사항</div>
                    {blogResult.restrictions.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-red-700 bg-red-50 p-3 rounded-xl">{r}</div>
                    ))}
                  </div>
                )}
                {blogResult.warnings.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-yellow-600 uppercase tracking-wider">경고</div>
                    {blogResult.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-yellow-700 bg-yellow-50 p-3 rounded-xl">{w}</div>
                    ))}
                  </div>
                )}
                {blogResult.restrictions.length === 0 && blogResult.warnings.length === 0 && (
                  <div className="text-sm text-green-700 bg-green-50 p-4 rounded-xl">✅ 특이사항 없음. 블로그가 정상 운영 중입니다.</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Exposure Check ── */}
        {tab === 'exposure' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-200">
              <h2 className="font-black text-lg mb-1">🔍 포스팅 노출 체크</h2>
              <p className="text-sm text-gray-500 mb-4">키워드 검색 시 내 블로그가 몇 위에 노출되는지 확인합니다.</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">검색 키워드</label>
                  <input value={expKeyword} onChange={e => setExpKeyword(e.target.value)}
                    placeholder="예: 다이어트 보조제 추천"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">블로그 ID</label>
                  <input value={expBlog} onChange={e => setExpBlog(e.target.value)}
                    placeholder="예: myblogid (blog.naver.com/myblogid)"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400" />
                </div>
                <button onClick={runExposure} disabled={expLoading || !expKeyword.trim() || !expBlog.trim()}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl disabled:opacity-50">
                  {expLoading ? '확인 중...' : '🔍 노출 체크'}
                </button>
                {expError && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{expError}</p>}
              </div>
            </div>

            {expResult && (
              <div className={`bg-white rounded-2xl p-6 border-2 ${expResult.exposed ? 'border-green-400' : 'border-red-300'}`}>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <div className="text-2xl font-black">{expResult.statusLabel}</div>
                    <div className="text-sm text-gray-500 mt-1">
                      키워드 "{expResult.keyword}" · 블로그 {expResult.blogId}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">전체 결과</div>
                    <div className="font-bold">{expResult.totalResults.toLocaleString()}건</div>
                  </div>
                </div>

                {expResult.myPosts.length > 0 ? (
                  <div className="space-y-3">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">내 포스팅 노출 목록</div>
                    {expResult.myPosts.map((p, i) => (
                      <a key={i} href={p.url} target="_blank" rel="noopener"
                        className="flex items-center gap-4 p-4 bg-green-50 rounded-xl hover:bg-green-100 transition-colors">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg flex-shrink-0 ${
                          p.rank <= 3 ? 'bg-yellow-400 text-white' : 'bg-green-200 text-green-700'
                        }`}>{p.rank}</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-gray-800 truncate"
                            dangerouslySetInnerHTML={{ __html: p.title }} />
                          <div className="text-xs text-gray-400">{p.date}</div>
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-3">😞</div>
                    <div className="font-semibold">상위 100건 내 미노출</div>
                    <div className="text-sm mt-1">해당 키워드로 블로그가 노출되지 않고 있습니다</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
