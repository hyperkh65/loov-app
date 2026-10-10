'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  Activity, Search, Filter, Grid3X3, List, RefreshCw,
  ExternalLink, TrendingUp, TrendingDown, BarChart3,
  Globe, Building2, Package, DollarSign, Layers
} from 'lucide-react'

interface Product {
  id: string; name: string; price: number; maker: string
  category: string; image_url?: string; product_url?: string
  origin?: 'korea' | 'china' | 'unknown'; maker_type?: string
  collected_at: string
}

interface Report {
  generated_at: string; total_count: number; ai_commentary?: string
  total_makers?: number; total_categories?: number
  avg_price?: number; median_price?: number; min_price?: number; max_price?: number
  products_with_link?: number
  origin?: { korea: number; china: number; unknown: number; korea_pct: number; china_pct: number }
  price_tiers?: Record<string, number>
  category_stats?: Array<{ name: string; count: number; avg_price: number; min_price: number; max_price: number; median_price: number; korea_pct: number }>
  maker_stats?: Array<{ name: string; count: number; avg_price: number; origin: string; maker_type: string; categories: string[] }>
  maker_type_dist?: Record<string, number>
  price_percentiles?: Record<string, number>
  top_category?: string; top_maker?: string
}

const C = '#00e5ff', C2 = '#ff00d4', CG = '#4efaa6', CW = '#ffcc00', CDANGER = '#ff4e4e'
const BG = '#05050a', CARD = 'rgba(20,20,30,0.6)', BORDER = 'rgba(255,255,255,0.08)', SEC = 'rgba(255,255,255,0.45)'

const card = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20, ...extra,
})

function StatCard({ label, value, sub, color = C, icon }: { label: string; value: string | number; sub?: string; color?: string; icon?: React.ReactNode }) {
  return (
    <div style={{ ...card(), position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: color }} />
      <div style={{ fontSize: 9, color: SEC, fontWeight: 800, marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color, display: 'flex', alignItems: 'center', gap: 8 }}>{value}{icon}</div>
      {sub && <div style={{ fontSize: 10, color: SEC, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function OriginBadge({ origin }: { origin?: string }) {
  const map: Record<string, { label: string; color: string }> = {
    korea: { label: '국산', color: CG },
    china: { label: '중국산', color: CDANGER },
    unknown: { label: '미상', color: SEC },
  }
  const o = map[origin || 'unknown'] || map.unknown
  return (
    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: `${o.color}20`, color: o.color, fontWeight: 800 }}>
      {o.label}
    </span>
  )
}

function BarRow({ label, value, max, color, suffix = '' }: { label: string; value: number; max: number; color: string; suffix?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: '#ddd' }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{typeof value === 'number' ? value.toLocaleString() : value}{suffix}</span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

type ViewTab = 'overview' | 'products' | 'makers' | 'categories'

export default function LedIntelPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [scraping, setScraping] = useState(false)
  const [scrapeMsg, setScrapeMsg] = useState('')
  const [viewTab, setViewTab] = useState<ViewTab>('overview')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [originFilter, setOriginFilter] = useState<'all' | 'korea' | 'china' | 'unknown'>('all')
  const [priceMax, setPriceMax] = useState(500000)
  const [sort, setSort] = useState('latest')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const res = await fetch('/api/led/intel')
      if (res.ok) {
        const json = await res.json()
        setProducts(json.products || [])
        setReport(json.report || null)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function startScrape() {
    setScraping(true)
    setScrapeMsg('GitHub Actions 트리거 중...')
    try {
      const res = await fetch('/api/led/trigger', { method: 'POST' })
      const json = await res.json()
      setScrapeMsg(json.ok ? '✅ 수집 시작됨 (약 10~15분 후 새로고침)' : `❌ ${json.error}`)
    } catch { setScrapeMsg('❌ 실패') }
    setScraping(false)
  }

  const categories = useMemo(() => ['all', ...new Set(products.map(p => p.category).filter(Boolean))], [products])

  const filtered = useMemo(() => {
    return products.filter(p => {
      const q = searchQuery.toLowerCase()
      return (activeCategory === 'all' || p.category === activeCategory)
        && (originFilter === 'all' || p.origin === originFilter)
        && p.price <= priceMax
        && (!q || p.name.toLowerCase().includes(q) || p.maker.toLowerCase().includes(q))
    }).sort((a, b) => {
      if (sort === 'price_asc') return a.price - b.price
      if (sort === 'price_desc') return b.price - a.price
      return new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime()
    })
  }, [products, activeCategory, originFilter, priceMax, searchQuery, sort])

  const TabBtn = ({ id, label, icon }: { id: ViewTab; label: string; icon: React.ReactNode }) => (
    <button onClick={() => setViewTab(id)} style={{
      background: viewTab === id ? `${C}15` : 'none', border: `1px solid ${viewTab === id ? C : 'transparent'}`,
      color: viewTab === id ? C : SEC, padding: '6px 14px', borderRadius: 8,
      fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
    }}>{icon}{label}</button>
  )

  return (
    <div style={{ minHeight: '100vh', background: BG, color: '#fff', paddingBottom: 80 }}>
      {/* BG glows */}
      <div style={{ position: 'fixed', top: '-10%', left: '-10%', width: '40%', height: '40%', background: `radial-gradient(circle, ${C}06 0%, transparent 70%)`, pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '-10%', right: '-10%', width: '50%', height: '50%', background: `radial-gradient(circle, ${C2}04 0%, transparent 70%)`, pointerEvents: 'none', zIndex: 0 }} />

      <div style={{ maxWidth: 1500, margin: '0 auto', padding: '36px 28px', position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.03em', margin: 0 }}>
              MARKET <span style={{ color: C }}>INTELLIGENCE</span>
            </h1>
            <p style={{ fontFamily: 'monospace', color: `${C}60`, fontSize: 11, marginTop: 4 }}>
              LED MARKET DATA ENGINE // {report ? new Date(report.generated_at).toLocaleString('ko-KR') : 'NO DATA'}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={loadData} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, color: '#fff', padding: '7px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                <RefreshCw size={12} /> 새로고침
              </button>
              <button onClick={startScrape} disabled={scraping} style={{ display: 'flex', alignItems: 'center', gap: 6, background: scraping ? 'rgba(255,255,255,0.03)' : `${C2}18`, border: `1px solid ${C2}35`, color: scraping ? SEC : C2, padding: '7px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: scraping ? 'not-allowed' : 'pointer' }}>
                <Activity size={12} /> {scraping ? '수집 중...' : '시장 데이터 수집'}
              </button>
            </div>
            {scrapeMsg && <div style={{ fontSize: 10, color: CG, fontFamily: 'monospace' }}>{scrapeMsg}</div>}
          </div>
        </div>

        {/* View tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          <TabBtn id="overview" label="개요 & 통계" icon={<BarChart3 size={13} />} />
          <TabBtn id="products" label="제품 목록" icon={<Package size={13} />} />
          <TabBtn id="makers" label="제조사 분석" icon={<Building2 size={13} />} />
          <TabBtn id="categories" label="카테고리 분석" icon={<Layers size={13} />} />
        </div>

        {/* ── OVERVIEW ── */}
        {viewTab === 'overview' && (
          <div>
            {/* KPI */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
              <StatCard label="총 제품" value={loading ? '...' : (report?.total_count || 0).toLocaleString()} sub="수집된 제품 수" color={C} icon={<Package size={16} />} />
              <StatCard label="제조사" value={loading ? '...' : (report?.total_makers || 0).toLocaleString()} sub="고유 제조사 수" color={C2} icon={<Building2 size={16} />} />
              <StatCard label="카테고리" value={loading ? '...' : (report?.total_categories || 0)} sub="제품 분류 수" color={CG} icon={<Layers size={16} />} />
              <StatCard label="평균 가격" value={loading ? '...' : `₩${((report?.avg_price || 0)).toLocaleString()}`} sub={`중간값 ₩${(report?.median_price || 0).toLocaleString()}`} color={CW} icon={<DollarSign size={16} />} />
              <StatCard label="링크 보유" value={loading ? '...' : `${report?.products_with_link || 0}`} sub="상품 페이지 연결" color="#4ea6fa" icon={<ExternalLink size={16} />} />
            </div>

            {/* AI Commentary */}
            <div style={{ ...card({ marginBottom: 24, borderLeft: `4px solid ${C}`, background: `linear-gradient(135deg, ${C}08, transparent)` }) }}>
              <div style={{ fontSize: 9, fontFamily: 'monospace', color: C, marginBottom: 8 }}>◈ AI MARKET INSIGHT</div>
              <p style={{ fontSize: 13, lineHeight: 1.7, color: '#e0e0e0', margin: 0 }}>
                {report?.ai_commentary || '데이터 수집 후 AI 인사이트가 표시됩니다.'}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, marginBottom: 18 }}>
              {/* 원산지 분포 */}
              <div style={card()}>
                <div style={{ fontSize: 11, color: C, fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Globe size={13} /> 원산지 분포
                </div>
                {report?.origin ? (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                      {[
                        { label: '국산', pct: report.origin.korea_pct, count: report.origin.korea, color: CG },
                        { label: '중국산', pct: report.origin.china_pct, count: report.origin.china, color: CDANGER },
                        { label: '미상', pct: 100 - report.origin.korea_pct - report.origin.china_pct, count: report.origin.unknown, color: SEC },
                      ].map(o => (
                        <div key={o.label} style={{ flex: 1, textAlign: 'center', padding: '10px 6px', background: `${o.color}10`, borderRadius: 8, border: `1px solid ${o.color}20` }}>
                          <div style={{ fontSize: 18, fontWeight: 900, color: o.color }}>{o.pct.toFixed(1)}%</div>
                          <div style={{ fontSize: 9, color: SEC, marginTop: 2 }}>{o.label}</div>
                          <div style={{ fontSize: 10, color: o.color, marginTop: 1 }}>{o.count.toLocaleString()}개</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                      <div style={{ width: `${report.origin.korea_pct}%`, background: CG }} />
                      <div style={{ width: `${report.origin.china_pct}%`, background: CDANGER }} />
                      <div style={{ flex: 1, background: 'rgba(255,255,255,0.1)' }} />
                    </div>
                  </>
                ) : <div style={{ color: SEC, fontSize: 12 }}>데이터 없음</div>}
              </div>

              {/* 가격 분포 */}
              <div style={card()}>
                <div style={{ fontSize: 11, color: CW, fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <DollarSign size={13} /> 가격 구간 분포
                </div>
                {report?.price_tiers ? Object.entries(report.price_tiers).map(([tier, cnt]) => (
                  <BarRow key={tier} label={tier} value={cnt as number}
                    max={Math.max(...Object.values(report.price_tiers!) as number[])} color={CW} suffix="개" />
                )) : <div style={{ color: SEC, fontSize: 12 }}>데이터 없음</div>}
              </div>

              {/* 가격 백분위 */}
              <div style={card()}>
                <div style={{ fontSize: 11, color: C2, fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TrendingUp size={13} /> 가격 백분위
                </div>
                {report?.price_percentiles ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {Object.entries(report.price_percentiles).map(([key, val]) => (
                      <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: SEC }}>{key.toUpperCase()}</span>
                        <span style={{ fontWeight: 700, color: C2 }}>₩{(val as number).toLocaleString()}</span>
                      </div>
                    ))}
                    <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, marginTop: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: SEC }}>최저</span>
                        <span style={{ color: CG, fontWeight: 700 }}>₩{(report.min_price || 0).toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                        <span style={{ color: SEC }}>최고</span>
                        <span style={{ color: CDANGER, fontWeight: 700 }}>₩{(report.max_price || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ) : <div style={{ color: SEC, fontSize: 12 }}>데이터 없음</div>}
              </div>
            </div>

            {/* 제조사 유형 + 상위 제조사 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 18 }}>
              <div style={card()}>
                <div style={{ fontSize: 11, color: CG, fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Building2 size={13} /> 제조사 유형
                </div>
                {report?.maker_type_dist ? Object.entries(report.maker_type_dist).map(([type, cnt]) => (
                  <BarRow key={type} label={type} value={cnt as number}
                    max={Math.max(...Object.values(report.maker_type_dist!) as number[])} color={CG} suffix="개" />
                )) : <div style={{ color: SEC, fontSize: 12 }}>데이터 없음</div>}
              </div>

              <div style={card()}>
                <div style={{ fontSize: 11, color: C, fontWeight: 800, marginBottom: 14 }}>◈ TOP 10 제조사</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(report?.maker_stats || []).slice(0, 10).map((m, i) => (
                    <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 10, color: SEC, width: 20, textAlign: 'right' }}>#{i + 1}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${(m.count / ((report?.maker_stats?.[0]?.count || 1)))*100}%`, background: m.origin === 'korea' ? CG : m.origin === 'china' ? CDANGER : C, borderRadius: 2 }} />
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, minWidth: 100, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
                      <span style={{ fontSize: 10, color: C, minWidth: 40, textAlign: 'right' }}>{m.count}개</span>
                      <span style={{ fontSize: 10, color: CW, minWidth: 70, textAlign: 'right' }}>₩{m.avg_price.toLocaleString()}</span>
                      <OriginBadge origin={m.origin} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PRODUCTS ── */}
        {viewTab === 'products' && (
          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20 }}>
            {/* Sidebar */}
            <aside>
              <div style={{ ...card({ marginBottom: 10 }) }}>
                <div style={{ fontSize: 9, color: `${C}80`, fontWeight: 800, marginBottom: 10 }}>◈ SEARCH</div>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: `${C}50` }} />
                  <input type="text" placeholder="제품명 / 제조사..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    style={{ width: '100%', background: '#000', border: `1px solid ${C}25`, color: '#fff', padding: '8px 8px 8px 28px', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }} />
                </div>
              </div>

              <div style={{ ...card({ marginBottom: 10 }) }}>
                <div style={{ fontSize: 9, color: `${C}80`, fontWeight: 800, marginBottom: 8 }}>◈ 원산지</div>
                {(['all', 'korea', 'china', 'unknown'] as const).map(o => (
                  <button key={o} onClick={() => setOriginFilter(o)} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '6px 8px', borderRadius: 6, border: `1px solid ${originFilter === o ? C : 'transparent'}`, background: originFilter === o ? `${C}12` : 'transparent', color: originFilter === o ? C : SEC, fontSize: 11, fontWeight: 700, cursor: 'pointer', marginBottom: 2 }}>
                    <span>{{ all: '전체', korea: '🇰🇷 국산', china: '🇨🇳 중국산', unknown: '미상' }[o]}</span>
                    <span style={{ opacity: 0.5 }}>{o === 'all' ? products.length : products.filter(p => p.origin === o).length}</span>
                  </button>
                ))}
              </div>

              <div style={{ ...card({ marginBottom: 10 }) }}>
                <div style={{ fontSize: 9, color: `${C}80`, fontWeight: 800, marginBottom: 8 }}>◈ 카테고리</div>
                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {categories.map(cat => (
                    <button key={cat} onClick={() => setActiveCategory(cat)} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '5px 8px', borderRadius: 6, border: `1px solid ${activeCategory === cat ? C : 'transparent'}`, background: activeCategory === cat ? `${C}12` : 'transparent', color: activeCategory === cat ? C : SEC, fontSize: 10, fontWeight: 700, cursor: 'pointer', marginBottom: 2 }}>
                      <span>{cat === 'all' ? '전체' : cat}</span>
                      <span style={{ opacity: 0.5 }}>{cat === 'all' ? products.length : products.filter(p => p.category === cat).length}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={card()}>
                <div style={{ fontSize: 9, color: `${C}80`, fontWeight: 800, marginBottom: 8 }}>◈ 최대 가격</div>
                <input type="range" min="0" max="1000000" step="10000" value={priceMax} onChange={e => setPriceMax(Number(e.target.value))} style={{ width: '100%', accentColor: C }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'monospace', color: `${C}70`, marginTop: 4 }}>
                  <span>₩0</span><span>₩{priceMax.toLocaleString()}</span>
                </div>
              </div>
            </aside>

            {/* Products */}
            <main>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 12, color: SEC }}>{filtered.length.toLocaleString()}개 제품</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select value={sort} onChange={e => setSort(e.target.value)} style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, color: '#fff', padding: '5px 8px', borderRadius: 7, fontSize: 11, outline: 'none' }}>
                    <option value="latest">최신순</option>
                    <option value="price_asc">가격 낮은순</option>
                    <option value="price_desc">가격 높은순</option>
                  </select>
                  <button onClick={() => setViewMode('grid')} style={{ padding: '5px 7px', borderRadius: 7, border: `1px solid ${viewMode === 'grid' ? C : BORDER}`, background: viewMode === 'grid' ? `${C}15` : 'transparent', color: viewMode === 'grid' ? C : SEC, cursor: 'pointer' }}><Grid3X3 size={13} /></button>
                  <button onClick={() => setViewMode('list')} style={{ padding: '5px 7px', borderRadius: 7, border: `1px solid ${viewMode === 'list' ? C : BORDER}`, background: viewMode === 'list' ? `${C}15` : 'transparent', color: viewMode === 'list' ? C : SEC, cursor: 'pointer' }}><List size={13} /></button>
                </div>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '80px 0', color: SEC }}>
                  <Activity size={28} style={{ margin: '0 auto 12px' }} />
                  <p style={{ fontFamily: 'monospace', fontSize: 11 }}>데이터 로딩 중...</p>
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px 0', border: `1px dashed ${BORDER}`, borderRadius: 16 }}>
                  <Filter size={36} style={{ margin: '0 auto 14px', color: SEC }} />
                  <p style={{ color: SEC, fontSize: 13 }}>수집된 데이터가 없습니다.</p>
                  <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, marginTop: 6 }}>상단 "시장 데이터 수집" 버튼을 눌러 수집하세요.</p>
                </div>
              ) : viewMode === 'grid' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                  {filtered.slice(0, 200).map(p => (
                    <div key={p.id} style={card({ display: 'flex', flexDirection: 'column', gap: 8 })}>
                      {p.image_url && <img src={p.image_url} alt={p.name} style={{ width: '100%', height: 130, objectFit: 'contain', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }} />}
                      <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.4 }}>{p.name}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 10, color: SEC }}>{p.maker}</div>
                        <OriginBadge origin={p.origin} />
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: C }}>{p.price > 0 ? `₩${p.price.toLocaleString()}` : '-'}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: `${C}12`, color: C, fontWeight: 700 }}>{p.category}</span>
                        {p.product_url && (
                          <a href={p.product_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: CG, fontWeight: 700, textDecoration: 'none' }} onClick={e => e.stopPropagation()}>
                            보러가기 <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filtered.slice(0, 500).map(p => (
                    <div key={p.id} style={{ ...card({ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px' }) }}>
                      {p.image_url && <img src={p.image_url} alt={p.name} style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 6, flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{p.name}</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 10, color: SEC }}>{p.maker}</span>
                          <OriginBadge origin={p.origin} />
                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: `${C}12`, color: C, fontWeight: 700 }}>{p.category}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: C, flexShrink: 0 }}>{p.price > 0 ? `₩${p.price.toLocaleString()}` : '-'}</div>
                      {p.product_url && (
                        <a href={p.product_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: CG, fontWeight: 700, textDecoration: 'none', flexShrink: 0, padding: '4px 8px', border: `1px solid ${CG}30`, borderRadius: 6 }}>
                          <ExternalLink size={11} /> 보러가기
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </main>
          </div>
        )}

        {/* ── MAKERS ── */}
        {viewTab === 'makers' && (
          <div>
            <div style={{ ...card({ marginBottom: 20 }) }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 16 }}>제조사 전체 현황 ({(report?.maker_stats || []).length}개)</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 5px', fontSize: 12 }}>
                  <thead>
                    <tr style={{ fontSize: 9, color: SEC, fontWeight: 800 }}>
                      {['순위', '제조사', '유형', '원산지', '제품수', '평균가', '최저가', '최고가', '카테고리'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '4px 10px 10px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(report?.maker_stats || []).map((m, i) => (
                      <tr key={m.name} style={{ background: 'rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '10px', borderRadius: '8px 0 0 8px', color: SEC, fontSize: 11 }}>#{i + 1}</td>
                        <td style={{ padding: '10px', fontWeight: 700 }}>{m.name}</td>
                        <td style={{ padding: '10px', fontSize: 10, color: SEC }}>{m.maker_type}</td>
                        <td style={{ padding: '10px' }}><OriginBadge origin={m.origin} /></td>
                        <td style={{ padding: '10px', color: C, fontWeight: 700 }}>{m.count}</td>
                        <td style={{ padding: '10px', color: CW, fontWeight: 700 }}>₩{m.avg_price.toLocaleString()}</td>
                        <td style={{ padding: '10px', color: CG, fontSize: 11 }}>-</td>
                        <td style={{ padding: '10px', color: CDANGER, fontSize: 11 }}>-</td>
                        <td style={{ padding: '10px', borderRadius: '0 8px 8px 0', fontSize: 9 }}>
                          {m.categories.slice(0, 2).map(c => (
                            <span key={c} style={{ marginRight: 4, padding: '1px 4px', background: `${C}10`, color: C, borderRadius: 3 }}>{c}</span>
                          ))}
                          {m.categories.length > 2 && <span style={{ color: SEC }}>+{m.categories.length - 2}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── CATEGORIES ── */}
        {viewTab === 'categories' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {(report?.category_stats || []).map(cat => (
              <div key={cat.name} style={card()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{cat.name}</div>
                  <span style={{ fontSize: 20, fontWeight: 900, color: C }}>{cat.count}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  {[
                    { label: '평균가', val: `₩${cat.avg_price.toLocaleString()}`, color: CW },
                    { label: '중간값', val: `₩${cat.median_price.toLocaleString()}`, color: C2 },
                    { label: '최저가', val: `₩${cat.min_price.toLocaleString()}`, color: CG },
                    { label: '최고가', val: `₩${cat.max_price.toLocaleString()}`, color: CDANGER },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 9, color: SEC, marginBottom: 2 }}>{s.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: s.color }}>{s.val}</div>
                    </div>
                  ))}
                </div>
                {/* 원산지 바 */}
                <div style={{ fontSize: 9, color: SEC, marginBottom: 6 }}>국산 비율</div>
                <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${cat.korea_pct}%`, background: CG, borderRadius: 3 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginTop: 4 }}>
                  <span style={{ color: CG }}>국산 {cat.korea_pct}%</span>
                  <span style={{ color: CDANGER }}>중국산 {(100 - cat.korea_pct).toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
