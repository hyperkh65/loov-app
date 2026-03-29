'use client'

import { useEffect, useState, useMemo } from 'react'
import { Activity, Search, Filter, Grid3X3, List, RefreshCw } from 'lucide-react'

interface Product {
  id: string
  name: string
  price: number
  maker: string
  category: string
  image_url?: string
  collected_at: string
  specs?: Record<string, string>
}

interface Report {
  generated_at: string
  total_count: number
  ai_commentary?: string
  top_makers?: Array<{ name: string; count: number; avgPrice: number; certRatio: number }>
  waste_items?: {
    waste_count: number
    origin_stats?: { korea_ratio: number; china_ratio: number }
    price_distribution?: Array<{ tier: string; ratio: number }>
    yearly_trends?: Record<string, number>
  }
}

const C = '#00e5ff'
const C2 = '#ff00d4'
const BG = '#05050a'
const CARD_BG = 'rgba(20, 20, 30, 0.4)'
const BORDER = 'rgba(255, 255, 255, 0.08)'

export default function LedIntelPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [scraping, setScraping] = useState(false)
  const [scrapeMsg, setScrapeMsg] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [originFilter, setOriginFilter] = useState<'all' | 'korea' | 'china'>('all')
  const [priceMax, setPriceMax] = useState(200000)
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
    } catch { /* table not ready */ }
    setLoading(false)
  }

  async function startScrape() {
    setScraping(true)
    setScrapeMsg('GitHub Actions 트리거 중...')
    try {
      const res = await fetch('/api/led/trigger', { method: 'POST' })
      const json = await res.json()
      if (json.ok) {
        setScrapeMsg('✅ 수집 시작됨 (약 3~5분 후 새로고침)')
      } else {
        setScrapeMsg(`❌ ${json.error}`)
      }
    } catch {
      setScrapeMsg('❌ 트리거 실패')
    }
    setScraping(false)
  }

  const categories = useMemo(() => {
    return ['all', ...new Set(products.map(p => p.category).filter(Boolean))]
  }, [products])

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCat = activeCategory === 'all' || p.category === activeCategory
      const matchesPrice = p.price <= priceMax
      const q = searchQuery.toLowerCase()
      const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.maker.toLowerCase().includes(q)

      const str = (p.name + ' ' + p.maker).toLowerCase()
      const isKorea = str.includes('국산') || str.includes('한국') || str.includes('korea')
      const isChina = str.includes('중국') || str.includes('china')
      const origin = isKorea ? 'korea' : isChina ? 'china' : 'other'
      const matchesOrigin = originFilter === 'all' || origin === originFilter

      // Filter products with no image (likely danawa logo placeholders)
      const hasImage = p.image_url && !p.image_url.includes('no_image') && !p.image_url.includes('danawa_logo')

      return matchesCat && matchesPrice && matchesSearch && matchesOrigin && hasImage
    }).sort((a, b) => {
      if (sort === 'price_asc') return a.price - b.price
      if (sort === 'price_desc') return b.price - a.price
      return new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime()
    })
  }, [products, activeCategory, priceMax, searchQuery, originFilter, sort])

  // Market depth analytics
  const marketDepth = useMemo(() => {
    if (filteredProducts.length === 0) return null
    const total = filteredProducts.length
    let koreaCount = 0, chinaCount = 0
    filteredProducts.forEach(p => {
      const s = (p.name + p.maker).toLowerCase()
      if (s.includes('국산') || s.includes('한국') || s.includes('korea')) koreaCount++
      else if (s.includes('중국') || s.includes('china')) chinaCount++
    })
    const tiers = { 'Entry (<₩5k)': 0, 'Mid (₩5k~20k)': 0, 'High (₩20k~50k)': 0, 'Premium (>₩50k)': 0 }
    filteredProducts.forEach(p => {
      if (p.price < 5000) tiers['Entry (<₩5k)']++
      else if (p.price < 20000) tiers['Mid (₩5k~20k)']++
      else if (p.price < 50000) tiers['High (₩20k~50k)']++
      else tiers['Premium (>₩50k)']++
    })
    // Brand rankings
    const brandMap: Record<string, number> = {}
    filteredProducts.forEach(p => { brandMap[p.maker] = (brandMap[p.maker] || 0) + 1 })
    const topBrands = Object.entries(brandMap).sort((a, b) => b[1] - a[1]).slice(0, 10)

    return {
      korea_ratio: parseFloat(((koreaCount / total) * 100).toFixed(1)),
      china_ratio: parseFloat(((chinaCount / total) * 100).toFixed(1)),
      price_distribution: Object.entries(tiers).map(([tier, count]) => ({ tier, ratio: parseFloat(((count / total) * 100).toFixed(1)) })),
      topBrands,
    }
  }, [filteredProducts])

  const sideStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 12 }
  const sideTitleStyle: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: `${C}cc`, marginBottom: 12, letterSpacing: '0.1em', textTransform: 'uppercase' as const }
  const filterBtnStyle = (active: boolean): React.CSSProperties => ({
    width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
    border: `1px solid ${active ? C : 'transparent'}`, background: active ? `${C}15` : 'transparent',
    color: active ? C : 'rgba(255,255,255,0.5)', cursor: 'pointer', transition: 'all 0.2s',
  })
  const cardStyle: React.CSSProperties = { background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }

  return (
    <div style={{ minHeight: '100vh', background: BG, color: '#fff', paddingBottom: 80, position: 'relative', overflow: 'hidden' }}>
      {/* Bg glows */}
      <div style={{ position: 'fixed', top: '-10%', left: '-10%', width: '40%', height: '40%', background: `radial-gradient(circle, ${C}08 0%, transparent 70%)`, pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '-10%', right: '-10%', width: '50%', height: '50%', background: `radial-gradient(circle, ${C2}05 0%, transparent 70%)`, pointerEvents: 'none', zIndex: 0 }} />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 32px', position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <header style={{ marginBottom: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.03em', margin: 0 }}>
              MARKET <span style={{ color: C }}>INTELLIGENCE</span>
            </h1>
            <p style={{ fontFamily: 'monospace', color: `${C}70`, fontSize: 12, marginTop: 4 }}>
              PROPRIETARY DATA HARVESTING // REAL-TIME ANALYSIS ENGINE
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4efaa6', boxShadow: '0 0 8px #4efaa6' }} />
              <span style={{ fontSize: 10, color: '#4efaa6', fontWeight: 900, fontFamily: 'monospace' }}>
                {loading ? 'LOADING...' : 'LIVE CONNECTION ACTIVE'}
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
              {report ? new Date(report.generated_at).toLocaleString('ko-KR') : 'PENDING SYNC'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={loadData}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: `${C}15`, border: `1px solid ${C}30`, color: C, padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                >
                  <RefreshCw size={12} /> 새로고침
                </button>
                <button
                  onClick={startScrape}
                  disabled={scraping}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: scraping ? 'rgba(255,255,255,0.05)' : `${C2}20`, border: `1px solid ${C2}40`, color: scraping ? 'rgba(255,255,255,0.3)' : C2, padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: scraping ? 'not-allowed' : 'pointer' }}
                >
                  <Activity size={12} /> {scraping ? '수집 중...' : '다나와 수집'}
                </button>
              </div>
              {scrapeMsg && (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{scrapeMsg}</div>
              )}
            </div>
          </div>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 28 }}>
          {/* Sidebar */}
          <aside style={{ position: 'sticky', top: 20, height: 'fit-content' }}>
            {/* Search */}
            <div style={sideStyle}>
              <h3 style={sideTitleStyle}>◈ Search Engine</h3>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: `${C}60` }} />
                <input
                  type="text" placeholder="Model or Vendor..."
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '100%', background: '#000', border: `1px solid ${C}30`, color: '#fff', padding: '10px 10px 10px 32px', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Category */}
            <div style={sideStyle}>
              <h3 style={sideTitleStyle}>◈ Category</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 300, overflowY: 'auto' }}>
                {categories.map(cat => (
                  <button key={cat} onClick={() => setActiveCategory(cat)} style={filterBtnStyle(activeCategory === cat)}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <span>{cat === 'all' ? 'ALL CATEGORIES' : cat.toUpperCase()}</span>
                      <span style={{ opacity: 0.5, fontSize: 10 }}>
                        {cat === 'all' ? products.length : products.filter(p => p.category === cat).length}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Origin */}
            <div style={sideStyle}>
              <h3 style={sideTitleStyle}>◈ Product Origin</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['all', 'korea', 'china'] as const).map(o => (
                  <button key={o} onClick={() => setOriginFilter(o)} style={{ ...filterBtnStyle(originFilter === o), flex: 1, textAlign: 'center' as const }}>
                    {o.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Price */}
            <div style={sideStyle}>
              <h3 style={sideTitleStyle}>◈ Price Segmentation</h3>
              <input type="range" min="0" max="200000" step="5000" value={priceMax}
                onChange={e => setPriceMax(Number(e.target.value))}
                style={{ width: '100%', accentColor: C }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'monospace', color: `${C}80`, marginTop: 6 }}>
                <span>₩0</span><span>₩{priceMax.toLocaleString()}</span>
              </div>
            </div>

            {/* Brand rankings */}
            {marketDepth && marketDepth.topBrands.length > 0 && (
              <div style={sideStyle}>
                <h3 style={sideTitleStyle}>◈ Brand Portfolio (Top 10)</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {marketDepth.topBrands.map(([name, count], i) => (
                    <div key={name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                        <span style={{ fontWeight: 900 }}>#{i + 1} {name}</span>
                        <span style={{ color: C, fontWeight: 900 }}>{count}</span>
                      </div>
                      <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${(count / (marketDepth.topBrands[0][1] || 1)) * 100}%`, background: C, borderRadius: 2 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* Main */}
          <main>
            {/* AI Commentary */}
            <div style={{ ...cardStyle, background: `linear-gradient(135deg, ${C}10 0%, transparent 100%)`, borderLeft: `4px solid ${C}`, marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: C, marginBottom: 10 }}>◈ AI STRATEGIC PARTNER // LOOVBASE-ALPHA</div>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: '#e0e0e0', margin: 0 }}>
                {report?.ai_commentary || '현재 LED 제품 데이터를 분석 중입니다. Danawa에서 수집된 제품 정보를 기반으로 시장 인사이트를 제공합니다. 수집 버튼을 눌러 최신 데이터를 동기화하세요.'}
              </p>
            </div>

            {/* Analytics row */}
            {marketDepth && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                {/* Origin ratio */}
                <div style={cardStyle}>
                  <div style={{ fontSize: 11, color: `${C}cc`, fontWeight: 700, marginBottom: 14 }}>◈ ORIGIN RATIO</div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontSize: 24, fontWeight: 900, color: '#4efaa6' }}>{marketDepth.korea_ratio}%</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>KOREA</div>
                    </div>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontSize: 24, fontWeight: 900, color: C2 }}>{marketDepth.china_ratio}%</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>CHINA</div>
                    </div>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontSize: 24, fontWeight: 900, color: 'rgba(255,255,255,0.6)' }}>
                        {parseFloat((100 - marketDepth.korea_ratio - marketDepth.china_ratio).toFixed(1))}%
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>OTHER</div>
                    </div>
                  </div>
                </div>
                {/* Price distribution */}
                <div style={cardStyle}>
                  <div style={{ fontSize: 11, color: `${C}cc`, fontWeight: 700, marginBottom: 14 }}>◈ PRICE DISTRIBUTION</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {marketDepth.price_distribution.map(({ tier, ratio }) => (
                      <div key={tier}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
                          <span style={{ color: 'rgba(255,255,255,0.6)' }}>{tier}</span>
                          <span style={{ color: C, fontWeight: 700 }}>{ratio}%</span>
                        </div>
                        <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${ratio}%`, background: `linear-gradient(90deg, ${C}, ${C2})`, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                {loading ? '로딩 중...' : `${filteredProducts.length.toLocaleString()}개 제품`}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <select
                  value={sort} onChange={e => setSort(e.target.value)}
                  style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, color: '#fff', padding: '6px 10px', borderRadius: 8, fontSize: 11, outline: 'none' }}
                >
                  <option value="latest">최신순</option>
                  <option value="price_asc">가격 낮은순</option>
                  <option value="price_desc">가격 높은순</option>
                </select>
                <button onClick={() => setViewMode('grid')} style={{ padding: '6px 8px', borderRadius: 8, border: `1px solid ${viewMode === 'grid' ? C : BORDER}`, background: viewMode === 'grid' ? `${C}15` : 'transparent', color: viewMode === 'grid' ? C : 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
                  <Grid3X3 size={14} />
                </button>
                <button onClick={() => setViewMode('list')} style={{ padding: '6px 8px', borderRadius: 8, border: `1px solid ${viewMode === 'list' ? C : BORDER}`, background: viewMode === 'list' ? `${C}15` : 'transparent', color: viewMode === 'list' ? C : 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
                  <List size={14} />
                </button>
              </div>
            </div>

            {/* Products */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: '80px 0', color: 'rgba(255,255,255,0.4)' }}>
                <Activity size={32} style={{ margin: '0 auto 12px' }} />
                <p style={{ fontFamily: 'monospace', fontSize: 12 }}>INTELLIGENCE HARVEST IN PROGRESS...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 0', border: `1px dashed ${BORDER}`, borderRadius: 20 }}>
                <Filter size={40} style={{ margin: '0 auto 16px', color: 'rgba(255,255,255,0.2)' }} />
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
                  아직 수집된 LED 제품 데이터가 없습니다.
                </p>
                <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, marginTop: 8 }}>
                  GitHub Actions의 Danawa 스크래퍼를 실행하여 데이터를 수집하세요.
                </p>
              </div>
            ) : viewMode === 'grid' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                {filteredProducts.slice(0, 100).map(p => (
                  <div key={p.id} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {p.image_url && (
                      <img src={p.image_url} alt={p.name} style={{ width: '100%', height: 140, objectFit: 'contain', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }} />
                    )}
                    <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{p.maker}</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: C }}>
                      {p.price > 0 ? `₩${p.price.toLocaleString()}` : '가격 정보 없음'}
                    </div>
                    {p.category && (
                      <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: `${C}15`, color: C, fontWeight: 700, width: 'fit-content' }}>
                        {p.category}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredProducts.slice(0, 200).map(p => (
                  <div key={p.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 16, padding: '12px 20px' }}>
                    {p.image_url && (
                      <img src={p.image_url} alt={p.name} style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 8, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{p.maker} · {p.category}</div>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: C, flexShrink: 0 }}>
                      {p.price > 0 ? `₩${p.price.toLocaleString()}` : '-'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
