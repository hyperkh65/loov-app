'use client'

import { useState, useEffect } from 'react'
import {
  Activity, Shield, BarChart3, Building2, Search,
  ArrowUpRight, ArrowDownRight, Star, StarOff, RefreshCw,
  Package, TrendingUp, AlertCircle, ChevronDown, ChevronUp
} from 'lucide-react'

const ACCENT = '#4efaa6'
const ACCENT2 = '#4ea6fa'
const WARN = '#ffcc00'
const DANGER = '#ff4e4e'
const BORDER = 'rgba(255,255,255,0.08)'
const TEXT_SEC = 'rgba(255,255,255,0.5)'
const CARD_BG = '#0d0d0d'
const BG = '#050505'

const card: React.CSSProperties = {
  background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24,
}

interface Company {
  name: string
  biz_no?: string
  product_count: number
  categories: string[]
  avg_price: number
  min_price: number
  max_price: number
  last_updated: string
  watched?: boolean
}

interface Product {
  id: string
  name: string
  company: string
  price: number
  category: string
  product_no?: string
  collected_at: string
}

interface ChangeEvent {
  type: 'price_change' | 'new_product' | 'removed_product' | 'category_change'
  company: string
  product?: string
  old_price?: number
  new_price?: number
  old_category?: string
  new_category?: string
  change_pct?: number
  detected_at: string
}

function TabBtn({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      background: active ? 'rgba(255,255,255,0.07)' : 'none', border: 'none',
      color: active ? '#fff' : TEXT_SEC, padding: '8px 18px', borderRadius: 8,
      fontSize: 11, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
    }}>
      {icon}{label}
    </button>
  )
}

function ChangeRow({ ev }: { ev: ChangeEvent }) {
  const isPrice = ev.type === 'price_change'
  const isNew = ev.type === 'new_product'
  const isRemoved = ev.type === 'removed_product'
  const color = isPrice ? (ev.change_pct! > 0 ? DANGER : ACCENT) : isNew ? ACCENT2 : isRemoved ? DANGER : WARN
  const icon = isPrice
    ? (ev.change_pct! > 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />)
    : isNew ? <Package size={16} /> : <AlertCircle size={16} />

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{ev.product || '제품 변동'}</div>
        <div style={{ fontSize: 11, color: TEXT_SEC }}>{ev.company}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {isPrice && (
          <div style={{ fontSize: 13, fontWeight: 800, color }}>
            {ev.change_pct! > 0 ? '+' : ''}{ev.change_pct?.toFixed(1)}%
          </div>
        )}
        {isPrice && (
          <div style={{ fontSize: 10, color: TEXT_SEC, marginTop: 2 }}>
            ₩{ev.old_price?.toLocaleString()} → ₩{ev.new_price?.toLocaleString()}
          </div>
        )}
        {isNew && <div style={{ fontSize: 11, color: ACCENT2, fontWeight: 700 }}>신규 등록</div>}
        {isRemoved && <div style={{ fontSize: 11, color: DANGER, fontWeight: 700 }}>삭제됨</div>}
        <div style={{ fontSize: 10, color: TEXT_SEC, marginTop: 2 }}>
          {new Date(ev.detected_at).toLocaleDateString('ko-KR')}
        </div>
      </div>
    </div>
  )
}

function CompanyCard({ company, onWatch, onSelect }: { company: Company; onWatch: () => void; onSelect: () => void }) {
  return (
    <div style={{ ...card, cursor: 'pointer' }} onClick={onSelect}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {company.name}
          </div>
          {company.biz_no && <div style={{ fontSize: 10, color: TEXT_SEC }}>{company.biz_no}</div>}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onWatch() }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: company.watched ? WARN : TEXT_SEC, padding: 4, flexShrink: 0 }}
        >
          {company.watched ? <Star size={16} fill={WARN} /> : <StarOff size={16} />}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: 10, color: TEXT_SEC, marginBottom: 2 }}>제품수</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: ACCENT2 }}>{company.product_count}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: 10, color: TEXT_SEC, marginBottom: 2 }}>평균가</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: ACCENT }}>
            {company.avg_price > 0 ? `₩${Math.round(company.avg_price / 1000)}K` : '-'}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {(company.categories || []).slice(0, 3).map(cat => (
          <span key={cat} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(78,166,250,0.1)', color: ACCENT2, fontWeight: 700 }}>
            {cat}
          </span>
        ))}
      </div>
    </div>
  )
}

function CompanyDetail({ company, products, changes, onClose }: {
  company: Company
  products: Product[]
  changes: ChangeEvent[]
  onClose: () => void
}) {
  const compProducts = products.filter(p => p.company === company.name)
  const compChanges = changes.filter(c => c.company === company.name)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: '#0d0d0d', border: `1px solid ${BORDER}`, borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 900, maxHeight: '85vh', overflow: 'auto', padding: 32 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 900 }}>{company.name}</h2>
            <div style={{ fontSize: 12, color: TEXT_SEC, marginTop: 4 }}>
              제품 {company.product_count}개 · 가격범위 ₩{company.min_price?.toLocaleString()} ~ ₩{company.max_price?.toLocaleString()}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, color: '#fff', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>닫기</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* 제품 목록 */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: ACCENT2, marginBottom: 12 }}>등록 제품 ({compProducts.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {compProducts.length === 0 ? (
                <div style={{ color: TEXT_SEC, fontSize: 12 }}>제품 없음</div>
              ) : compProducts.map((p, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: TEXT_SEC }}>{p.category}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: ACCENT }}>
                    {p.price > 0 ? `₩${p.price.toLocaleString()}` : '-'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 변동 이력 */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: WARN, marginBottom: 12 }}>변동 이력 ({compChanges.length})</h3>
            {compChanges.length === 0 ? (
              <div style={{ color: TEXT_SEC, fontSize: 12 }}>변동 없음</div>
            ) : compChanges.map((ev, i) => <ChangeRow key={i} ev={ev} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LedProcurementPage() {
  const [view, setView] = useState<'companies' | 'changes' | 'products'>('companies')
  const [companies, setCompanies] = useState<Company[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [changes, setChanges] = useState<ChangeEvent[]>([])
  const [stats, setStats] = useState({ total_companies: 0, total_products: 0, changes_24h: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Company | null>(null)
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set())
  const [showWatchOnly, setShowWatchOnly] = useState(false)
  const [sortBy, setSortBy] = useState<'product_count' | 'avg_price' | 'name'>('product_count')
  const [sortAsc, setSortAsc] = useState(false)
  const [scraping, setScraping] = useState(false)
  const [scrapeMsg, setScrapeMsg] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const res = await fetch('/api/led/procurement')
      if (res.ok) {
        const json = await res.json()
        const comps: Company[] = json.companies || []
        setCompanies(comps)
        setProducts(json.products || [])
        setChanges(json.changes || [])
        setStats(json.stats || {})
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function toggleWatch(companyName: string) {
    const isWatched = watchlist.has(companyName)
    await fetch('/api/led/procurement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: isWatched ? 'remove' : 'add', company_name: companyName }),
    })
    setWatchlist(prev => {
      const next = new Set(prev)
      isWatched ? next.delete(companyName) : next.add(companyName)
      return next
    })
  }

  async function triggerScrape() {
    setScraping(true)
    setScrapeMsg('GitHub Actions 트리거 중...')
    try {
      const res = await fetch('/api/led/trigger', { method: 'POST' })
      const json = await res.json()
      setScrapeMsg(json.ok ? '✅ 나라장터 수집 시작됨 (약 3~5분 후 새로고침)' : `❌ ${json.error}`)
    } catch { setScrapeMsg('❌ 실패') }
    setScraping(false)
  }

  const displayedCompanies = companies
    .map(c => ({ ...c, watched: watchlist.has(c.name) }))
    .filter(c => {
      const matchSearch = !search || c.name.includes(search)
      const matchWatch = !showWatchOnly || c.watched
      return matchSearch && matchWatch
    })
    .sort((a, b) => {
      let diff = 0
      if (sortBy === 'product_count') diff = a.product_count - b.product_count
      else if (sortBy === 'avg_price') diff = a.avg_price - b.avg_price
      else diff = a.name.localeCompare(b.name)
      return sortAsc ? diff : -diff
    })

  const priceChanges = changes.filter(c => c.type === 'price_change')
  const bigChanges = priceChanges.filter(c => Math.abs(c.change_pct || 0) >= 5)

  return (
    <div style={{ minHeight: '100vh', background: BG, color: '#fff', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ height: 60, borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', padding: '0 32px', justifyContent: 'space-between', background: 'rgba(5,5,5,0.95)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={16} color="#000" />
          </div>
          <span style={{ fontSize: 15, fontWeight: 800 }}>나라장터 <span style={{ color: ACCENT }}>LED 조달 추적</span></span>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          <TabBtn label="업체 현황" active={view === 'companies'} onClick={() => setView('companies')} icon={<Building2 size={13} />} />
          <TabBtn label="변동 추적" active={view === 'changes'} onClick={() => setView('changes')} icon={<Activity size={13} />} />
          <TabBtn label="제품 목록" active={view === 'products'} onClick={() => setView('products')} icon={<BarChart3 size={13} />} />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={loadData} style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, color: '#fff', padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={12} /> 새로고침
          </button>
          <button onClick={triggerScrape} disabled={scraping} style={{ background: scraping ? 'rgba(255,255,255,0.03)' : `${ACCENT}20`, border: `1px solid ${ACCENT}40`, color: scraping ? TEXT_SEC : ACCENT, padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: scraping ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <TrendingUp size={12} /> {scraping ? '수집 중...' : '나라장터 수집'}
          </button>
        </div>
      </div>
      {scrapeMsg && (
        <div style={{ background: 'rgba(78,250,166,0.05)', borderBottom: `1px solid ${BORDER}`, padding: '8px 32px', fontSize: 11, color: ACCENT }}>{scrapeMsg}</div>
      )}

      <main style={{ padding: '28px 32px' }}>
        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
          {[
            { label: '등록 업체', value: stats.total_companies, color: ACCENT2, sub: '나라장터 LED 업체' },
            { label: '등록 제품', value: stats.total_products, color: ACCENT, sub: '나라장터 쇼핑 제품' },
            { label: '24h 변동', value: stats.changes_24h, color: WARN, sub: '가격/품목 변동' },
            { label: '주시 업체', value: watchlist.size, color: '#ff9a4e', sub: '추적 중인 업체' },
          ].map(k => (
            <div key={k.label} style={{ ...card, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: k.color }} />
              <div style={{ fontSize: 10, color: TEXT_SEC, marginBottom: 8, fontWeight: 700 }}>{k.label}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: k.color }}>{loading ? '...' : k.value}</div>
              <div style={{ fontSize: 10, color: TEXT_SEC, marginTop: 4 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* 업체 현황 */}
        {view === 'companies' && (
          <div>
            {/* 툴바 */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: TEXT_SEC }} />
                <input
                  type="text" placeholder="업체명 검색..."
                  value={search} onChange={e => setSearch(e.target.value)}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`, color: '#fff', padding: '10px 12px 10px 36px', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <button
                onClick={() => setShowWatchOnly(!showWatchOnly)}
                style={{ background: showWatchOnly ? `${WARN}15` : 'rgba(255,255,255,0.03)', border: `1px solid ${showWatchOnly ? WARN : BORDER}`, color: showWatchOnly ? WARN : TEXT_SEC, padding: '9px 14px', borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Star size={13} /> 주시 업체만
              </button>
              {(['product_count', 'avg_price', 'name'] as const).map(s => (
                <button key={s} onClick={() => { setSortBy(s); if (sortBy === s) setSortAsc(!sortAsc) }}
                  style={{ background: sortBy === s ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)', border: `1px solid ${BORDER}`, color: sortBy === s ? '#fff' : TEXT_SEC, padding: '9px 12px', borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {{ product_count: '제품수', avg_price: '평균가', name: '업체명' }[s]}
                  {sortBy === s && (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                </button>
              ))}
              <span style={{ fontSize: 12, color: TEXT_SEC }}>{displayedCompanies.length}개 업체</span>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '80px 0', color: TEXT_SEC }}>나라장터 데이터 로딩 중...</div>
            ) : displayedCompanies.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 0', border: `1px dashed ${BORDER}`, borderRadius: 16 }}>
                <Building2 size={40} style={{ margin: '0 auto 16px', color: TEXT_SEC }} />
                <p style={{ color: TEXT_SEC, fontSize: 14 }}>아직 수집된 나라장터 업체 데이터가 없습니다.</p>
                <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, marginTop: 8 }}>상단 "나라장터 수집" 버튼을 눌러 데이터를 수집하세요.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {displayedCompanies.map((c, i) => (
                  <CompanyCard key={i} company={c}
                    onWatch={() => toggleWatch(c.name)}
                    onSelect={() => setSelected(c)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* 변동 추적 */}
        {view === 'changes' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
            <div style={card}>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={16} color={ACCENT} /> 전체 변동 이력
                <span style={{ fontSize: 11, color: TEXT_SEC, fontWeight: 500 }}>({changes.length}건)</span>
              </h3>
              {changes.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: TEXT_SEC, fontSize: 13 }}>
                  변동 이력이 없습니다. 최소 2회 이상 수집 후 변동이 감지됩니다.
                </div>
              ) : changes.map((ev, i) => <ChangeRow key={i} ev={ev} />)}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 급변동 알림 */}
              <div style={{ ...card, borderLeft: `4px solid ${DANGER}` }}>
                <h4 style={{ fontSize: 13, fontWeight: 800, color: DANGER, marginBottom: 12 }}>🚨 급변동 알림 (±5% 이상)</h4>
                {bigChanges.length === 0 ? (
                  <div style={{ fontSize: 12, color: TEXT_SEC }}>급변동 없음</div>
                ) : bigChanges.slice(0, 5).map((ev, i) => (
                  <div key={i} style={{ padding: '8px 0', borderBottom: i < bigChanges.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{ev.product}</div>
                    <div style={{ fontSize: 11, color: TEXT_SEC }}>{ev.company}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: (ev.change_pct || 0) > 0 ? DANGER : ACCENT, marginTop: 2 }}>
                      {(ev.change_pct || 0) > 0 ? '+' : ''}{ev.change_pct?.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>

              {/* 주시 업체 변동 */}
              <div style={card}>
                <h4 style={{ fontSize: 13, fontWeight: 800, color: WARN, marginBottom: 12 }}>⭐ 주시 업체 변동</h4>
                {watchlist.size === 0 ? (
                  <div style={{ fontSize: 12, color: TEXT_SEC }}>업체 카드의 별 아이콘으로 주시 등록하세요.</div>
                ) : (() => {
                  const watched = changes.filter(c => watchlist.has(c.company))
                  return watched.length === 0
                    ? <div style={{ fontSize: 12, color: TEXT_SEC }}>주시 업체 변동 없음</div>
                    : watched.slice(0, 5).map((ev, i) => <ChangeRow key={i} ev={ev} />)
                })()}
              </div>
            </div>
          </div>
        )}

        {/* 제품 목록 */}
        {view === 'products' && (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800 }}>나라장터 LED 등록 제품</h3>
              <span style={{ fontSize: 12, color: TEXT_SEC }}>{products.length}개</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px', fontSize: 13 }}>
                <thead>
                  <tr style={{ fontSize: 10, color: TEXT_SEC, fontWeight: 800 }}>
                    {['제품명', '업체', '카테고리', '가격', '수집일'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '4px 12px 12px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '60px 0', color: TEXT_SEC }}>데이터 없음</td></tr>
                  ) : products.map((p, i) => (
                    <tr key={i} style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '12px', borderRadius: '8px 0 0 8px', fontWeight: 600 }}>{p.name}</td>
                      <td style={{ padding: '12px', color: TEXT_SEC, fontSize: 12 }}>{p.company}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${ACCENT2}15`, color: ACCENT2, fontWeight: 700 }}>{p.category}</span>
                      </td>
                      <td style={{ padding: '12px', fontWeight: 800, color: ACCENT }}>
                        {p.price > 0 ? `₩${p.price.toLocaleString()}` : '-'}
                      </td>
                      <td style={{ padding: '12px', borderRadius: '0 8px 8px 0', fontSize: 11, color: TEXT_SEC }}>
                        {new Date(p.collected_at).toLocaleDateString('ko-KR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {selected && (
        <CompanyDetail
          company={selected}
          products={products}
          changes={changes}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
