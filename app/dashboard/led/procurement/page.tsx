'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Activity, Shield, BarChart3, Repeat, FileText,
  AlertTriangle, ArrowUpRight, ArrowDownRight,
  Search, ChevronRight, Package,
  CheckCircle2, XCircle, Info, Zap
} from 'lucide-react'

const ACCENT = '#4efaa6'
const ACCENT2 = '#4ea6fa'
const WARN = '#ffcc00'
const DANGER = '#ff4e4e'
const BORDER = 'rgba(255,255,255,0.08)'
const TEXT_SEC = 'rgba(255,255,255,0.5)'
const CARD_BG = '#0d0d0d'
const BG = '#050505'

const cardStyle: React.CSSProperties = {
  background: CARD_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 20,
  padding: 30,
  boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
}

function TabButton({ children, active, onClick, icon }: { children: React.ReactNode; active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      background: active ? 'rgba(255,255,255,0.05)' : 'none',
      border: 'none',
      color: active ? '#fff' : TEXT_SEC,
      padding: '8px 16px',
      borderRadius: 8,
      fontSize: 11,
      fontWeight: 800,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      transition: 'all 0.2s',
    }}>
      {icon}{children}
    </button>
  )
}

function KpiCard({ title, value, sub, color, icon }: { title: string; value: string | number; sub: string; color: string; icon?: React.ReactNode }) {
  return (
    <div style={{ ...cardStyle, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 2, height: '100%', background: color }} />
      <div style={{ fontSize: 10, fontWeight: 800, color: TEXT_SEC, marginBottom: 12, letterSpacing: '0.05em' }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
        {value} {icon && <span style={{ color }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 11, color: TEXT_SEC }}>{sub}</div>
    </div>
  )
}

function EventItem({ event }: { event: { event_type: string; severity: string; diff_summary?: string; detected_at: string; product_name?: string; company_name?: string } }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: event.event_type === 'price_change' ? 'rgba(78,166,250,0.1)' : 'rgba(78,250,166,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {event.event_type === 'price_change' ? <Repeat size={18} color={ACCENT2} /> : <ArrowUpRight size={18} color={ACCENT} />}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            {event.product_name || '제품명 미상'}
            {event.severity === 'high' && <span style={{ fontSize: 9, background: DANGER, color: '#fff', padding: '1px 5px', borderRadius: 4 }}>CRITICAL</span>}
          </div>
          <div style={{ fontSize: 11, color: TEXT_SEC, marginTop: 4 }}>
            {event.company_name || ''}{event.diff_summary ? ` • ${event.diff_summary}` : ''}
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 10, color: TEXT_SEC }}>{new Date(event.detected_at).toLocaleDateString('ko-KR')}</div>
        <div style={{ fontSize: 11, color: ACCENT, fontWeight: 600, marginTop: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          DETAILS <ChevronRight size={12} />
        </div>
      </div>
    </div>
  )
}

function MarketBoardView({ data }: { data: Array<{ category_name: string; total_companies: number; total_products: number; min_price: number; median_price: number; avg_efficacy?: number }> }) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 30 }}>
        <h3 style={{ fontSize: 18, fontWeight: 800 }}>시장 카테고리 현황</h3>
        <span style={{ fontSize: 11, color: TEXT_SEC }}>{data.length}개 카테고리</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
          <thead>
            <tr style={{ fontSize: 10, color: TEXT_SEC, fontWeight: 800, letterSpacing: '0.05em' }}>
              <th style={{ textAlign: 'left', padding: '0 16px 12px' }}>CATEGORY</th>
              <th style={{ textAlign: 'right', padding: '0 16px 12px' }}>SUPPLIERS</th>
              <th style={{ textAlign: 'right', padding: '0 16px 12px' }}>SKU VOLUME</th>
              <th style={{ textAlign: 'right', padding: '0 16px 12px' }}>MIN PRICE</th>
              <th style={{ textAlign: 'right', padding: '0 16px 12px' }}>MEDIAN PRICE</th>
              <th style={{ textAlign: 'right', padding: '0 16px 12px' }}>AVG EFFICACY</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '60px 0', color: TEXT_SEC, fontSize: 13 }}>
                  수집된 조달 데이터가 없습니다. LED 제품 인텔 페이지에서 데이터를 먼저 수집하세요.
                </td>
              </tr>
            ) : data.map((row, i) => (
              <tr key={i} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12 }}>
                <td style={{ padding: '14px 16px', fontWeight: 700, fontSize: 13, borderRadius: '12px 0 0 12px' }}>{row.category_name}</td>
                <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: 13, color: ACCENT2 }}>{row.total_companies}</td>
                <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: 13 }}>{row.total_products}</td>
                <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: 13 }}>₩{row.min_price?.toLocaleString() || '-'}</td>
                <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: 13, color: ACCENT }}>{row.median_price ? `₩${row.median_price.toLocaleString()}` : '-'}</td>
                <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: 12, color: row.avg_efficacy && row.avg_efficacy >= 140 ? ACCENT : TEXT_SEC, borderRadius: '0 12px 12px 0' }}>
                  {row.avg_efficacy ? `${row.avg_efficacy} lm/W` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ComparisonView() {
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<Array<{ name: string; maker: string; price: number; category: string }>>([])
  const [searching, setSearching] = useState(false)

  async function handleSearch() {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`/api/led/intel?search=${encodeURIComponent(searchQuery)}&limit=6`)
      if (res.ok) {
        const json = await res.json()
        setResults(json.products || [])
      }
    } finally {
      setSearching(false)
    }
  }

  return (
    <div>
      <div style={cardStyle}>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 25 }}>제품 비교 & 인증 현황</h3>
        <div style={{ display: 'flex', gap: 12, marginBottom: 30 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: TEXT_SEC }} />
            <input
              type="text"
              placeholder="제품명 또는 제조사 검색..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`, color: '#fff', fontSize: 14, padding: '14px 14px 14px 44px', borderRadius: 12, outline: 'none', boxSizing: 'border-box' as const }}
            />
          </div>
          <button
            onClick={handleSearch} disabled={searching}
            style={{ background: ACCENT, color: '#000', border: 'none', padding: '0 28px', borderRadius: 12, fontWeight: 800, cursor: 'pointer' }}
          >
            {searching ? '검색 중...' : '검색'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {results.length === 0 ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '80px 0', border: `1px dashed ${BORDER}`, borderRadius: 20 }}>
              <Package size={40} style={{ margin: '0 auto 16px', color: TEXT_SEC }} />
              <p style={{ color: TEXT_SEC, fontSize: 13 }}>비교할 제품을 검색해 주세요.</p>
            </div>
          ) : results.map((p, i) => (
            <div key={i} style={{ ...cardStyle, padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: TEXT_SEC, marginBottom: 4 }}>{p.maker}</div>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>{p.name}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: ACCENT, marginBottom: 12 }}>
                {p.price > 0 ? `₩${p.price.toLocaleString()}` : '가격 정보 없음'}
              </div>
              <div style={{ fontSize: 11, color: TEXT_SEC }}>{p.category}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function BidSimulatorView() {
  const [price, setPrice] = useState(85000)
  const [efficiency, setEfficiency] = useState(145)
  const [warranty, setWarranty] = useState(3)

  const score = useMemo(() => {
    const base = 70
    const priceBonus = (100000 - price) / 1000
    const effBonus = (efficiency - 130) * 0.5
    const warBonus = warranty * 2
    return Math.min(100, Math.max(0, base + priceBonus + effBonus + warBonus))
  }, [price, efficiency, warranty])

  function SpecRow({ label, value, status = null }: { label: string; value: string; status?: boolean | null }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: TEXT_SEC }}>{label}</span>
        <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          {value}
          {status === true && <CheckCircle2 size={14} color={ACCENT} />}
          {status === false && <XCircle size={14} color={DANGER} />}
        </span>
      </div>
    )
  }

  function StrategyItem({ label, desc, status }: { label: string; desc: string; status: 'positive' | 'warning' | 'neutral' }) {
    const icon = status === 'positive' ? <CheckCircle2 size={16} color={ACCENT} /> :
      status === 'warning' ? <AlertTriangle size={16} color={WARN} /> :
        <Info size={16} color={TEXT_SEC} />
    return (
      <div style={{ padding: 15, borderRadius: 12, border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.01)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          {icon}<span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
        </div>
        <p style={{ fontSize: 12, color: TEXT_SEC, lineHeight: 1.5, margin: 0 }}>{desc}</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 30 }}>
      <div style={cardStyle}>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 30 }}>BID PARAMETERS</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Target Price</span>
              <span style={{ color: ACCENT, fontWeight: 900 }}>₩{price.toLocaleString()}</span>
            </div>
            <input type="range" min="40000" max="150000" step="1000" value={price} onChange={e => setPrice(Number(e.target.value))} style={{ width: '100%', accentColor: ACCENT }} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Luminous Efficacy</span>
              <span style={{ color: ACCENT2, fontWeight: 900 }}>{efficiency} lm/W</span>
            </div>
            <input type="range" min="120" max="180" step="1" value={efficiency} onChange={e => setEfficiency(Number(e.target.value))} style={{ width: '100%', accentColor: ACCENT2 }} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Warranty Period</span>
              <span style={{ color: WARN, fontWeight: 900 }}>{warranty} Years</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {[1, 2, 3, 5].map(y => (
                <button key={y} onClick={() => setWarranty(y)} style={{
                  flex: 1, padding: 10, borderRadius: 8,
                  border: `1px solid ${warranty === y ? WARN : BORDER}`,
                  background: warranty === y ? 'rgba(255,204,0,0.1)' : 'transparent',
                  color: warranty === y ? WARN : TEXT_SEC,
                  cursor: 'pointer', fontSize: 12, fontWeight: 700
                }}>{y}Y</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 40, padding: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 16, border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 11, color: TEXT_SEC, marginBottom: 8 }}>PREDICTED WIN PROBABILITY</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 900, color: score > 80 ? ACCENT : score > 60 ? WARN : DANGER }}>
              {score.toFixed(1)}%
            </span>
            <span style={{ fontSize: 12, color: TEXT_SEC }}>Confidence Score</span>
          </div>
          {/* Score bar */}
          <div style={{ marginTop: 12, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
            <div style={{ height: '100%', width: `${score}%`, borderRadius: 3, background: score > 80 ? ACCENT : score > 60 ? WARN : DANGER, transition: 'width 0.4s ease' }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ ...cardStyle, flex: 1 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 25 }}>ADJUSTMENT STRATEGY</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <StrategyItem
              label="Price Competitiveness"
              desc={price < 70000 ? '매우 경쟁력 있는 가격대입니다. 상위 10% 범위에 해당합니다.' : '평균 수준입니다. 낙찰 확률 향상을 위해 5% 인하를 검토하세요.'}
              status={price < 70000 ? 'positive' : 'neutral'}
            />
            <StrategyItem
              label="Spec Compliance"
              desc={efficiency >= 150 ? '우수한 광효율입니다. 경쟁사의 90%를 상회합니다.' : '기본 요건을 충족하나 고효율 인증 기준에 미달합니다.'}
              status={efficiency >= 150 ? 'positive' : 'warning'}
            />
            <StrategyItem
              label="Historical Performance"
              desc="이 카테고리의 평균 낙찰가는 ₩82,400입니다. 현재 가격은 허용 범위 내에 있습니다."
              status="neutral"
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <button style={{ padding: 18, borderRadius: 12, border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.03)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <FileText size={16} /> DOWNLOAD PROPOSAL
          </button>
          <button style={{ padding: 18, borderRadius: 12, border: 'none', background: ACCENT, color: '#000', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <ArrowUpRight size={16} /> ANALYZE DATA
          </button>
        </div>

        <div style={{ ...cardStyle, background: 'linear-gradient(135deg, rgba(78,250,166,0.05) 0%, rgba(0,229,255,0.05) 100%)', border: `1px solid ${ACCENT}33` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15 }}>
            <Zap size={18} color={ACCENT} />
            <h4 style={{ fontSize: 13, fontWeight: 900, color: ACCENT }}>AI OPTIMIZATION INSIGHT</h4>
          </div>
          <p style={{ fontSize: 13, color: '#fff', lineHeight: 1.6, margin: 0 }}>
            {price > 80000
              ? '현재 가격설정은 상위 30%에 해당합니다. 낙찰 확률을 높이려면 광효율을 155lm/W 이상으로 상향하거나 보증기간을 5년으로 연장하는 것을 권장합니다.'
              : '경쟁력 있는 가격대입니다. 효율성 점수 보강을 위해 고효율 인증 데이터를 추가 업로드하십시오.'}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LedProcurementPage() {
  const [view, setView] = useState<'overview' | 'market' | 'compare' | 'simulator'>('overview')
  const [events, setEvents] = useState<Array<{ event_type: string; severity: string; diff_summary?: string; detected_at: string; product_name?: string; company_name?: string }>>([])
  const [stats, setStats] = useState({ total_products: 0, total_companies: 0, changes_24h: 0 })
  const [marketOverviews, setMarketOverviews] = useState<Array<{ category_name: string; total_companies: number; total_products: number; min_price: number; median_price: number; avg_efficacy?: number }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const res = await fetch('/api/led/procurement')
      if (res.ok) {
        const json = await res.json()
        setEvents(json.events || [])
        setStats(json.stats || { total_products: 0, total_companies: 0, changes_24h: 0 })
        setMarketOverviews(json.marketOverviews || [])
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, color: '#fff', fontFamily: 'Inter, sans-serif', paddingBottom: 80 }}>
      {/* Top bar */}
      <div style={{ height: 64, borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', padding: '0 40px', justifyContent: 'space-between', backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 100, background: 'rgba(5,5,5,0.9)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={18} color="#000" />
          </div>
          <h1 style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>
            PROCUREMENT <span style={{ color: ACCENT }}>INTEL</span>
          </h1>
          <div style={{ background: 'rgba(78,250,166,0.1)', color: ACCENT, fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>G2B INSIGHT ENGINE</div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <TabButton active={view === 'overview'} onClick={() => setView('overview')} icon={<Activity size={14} />}>OVERVIEW</TabButton>
          <TabButton active={view === 'market'} onClick={() => setView('market')} icon={<BarChart3 size={14} />}>MARKET BOARD</TabButton>
          <TabButton active={view === 'compare'} onClick={() => setView('compare')} icon={<Repeat size={14} />}>COMPARE</TabButton>
          <TabButton active={view === 'simulator'} onClick={() => setView('simulator')} icon={<ArrowUpRight size={14} />}>BID SIMULATOR</TabButton>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: TEXT_SEC }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, boxShadow: `0 0 10px ${ACCENT}`, display: 'inline-block' }} />
          SYSTEM LIVE: {new Date().toLocaleTimeString('ko-KR')}
        </div>
      </div>

      <main style={{ padding: '40px 60px' }}>
        {view === 'overview' && (
          <div>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 40 }}>
              <KpiCard title="TOTAL PRODUCTS" value={loading ? '...' : stats.total_products.toLocaleString()} sub="Registered SKU" color={ACCENT2} />
              <KpiCard title="ACTIVE COMPANIES" value={loading ? '...' : stats.total_companies.toLocaleString()} sub="Manufacturers" color={ACCENT} />
              <KpiCard title="CHANGES (24H)" value={stats.changes_24h} sub="Detected Events" color={WARN} icon={<AlertTriangle size={16} />} />
              <KpiCard title="MARKET HEALTH" value="OPTIMAL" sub="Spec Compliance" color="#fff" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 28 }}>
              {/* Change feed */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Activity size={18} color={ACCENT} /> DAILY CHANGE FEED
                  </h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: TEXT_SEC, fontSize: 13 }}>로딩 중...</div>
                  ) : events.length === 0 ? (
                    <div style={{ padding: '40px 0', textAlign: 'center', color: TEXT_SEC, fontSize: 13 }}>
                      최근 변경 이벤트가 없습니다.
                    </div>
                  ) : events.map((ev, i) => <EventItem key={i} event={ev} />)}
                </div>
              </div>

              {/* Side */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ ...cardStyle, borderLeft: `4px solid ${WARN}` }}>
                  <h4 style={{ fontSize: 13, fontWeight: 800, color: WARN, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={14} /> 인증 만료 알림
                  </h4>
                  <p style={{ fontSize: 12, color: TEXT_SEC, lineHeight: 1.6 }}>
                    KS 인증 만료 예정 제품이 있습니다. 입찰 자격 취소를 방지하기 위해 갱신이 필요합니다.
                  </p>
                  <button style={{ marginTop: 14, background: 'rgba(255,204,0,0.1)', border: '1px solid rgba(255,204,0,0.2)', color: WARN, fontSize: 11, padding: '8px 12px', borderRadius: 6, fontWeight: 700, width: '100%', cursor: 'pointer' }}>
                    보고서 생성
                  </button>
                </div>

                <div style={cardStyle}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 20 }}>TOP CATEGORY SHIFTS</h4>
                  {[
                    { name: 'LED 거실등', delta: '+4.2%', color: ACCENT },
                    { name: 'LED 가로등', delta: '-1.5%', color: DANGER },
                    { name: 'LED 매입등', delta: '+12.8%', color: ACCENT },
                  ].map((cat, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < 2 ? `1px solid ${BORDER}` : 'none' }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{cat.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: cat.color, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {cat.delta.startsWith('+') ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        {cat.delta}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'market' && <MarketBoardView data={marketOverviews} />}
        {view === 'compare' && <ComparisonView />}
        {view === 'simulator' && <BidSimulatorView />}
      </main>
    </div>
  )
}
