'use client'

import { useEffect, useState } from 'react'
import { Activity, BarChart3, TrendingUp, Filter, Plus, Database, ArrowUpRight, Trash2 } from 'lucide-react'

interface MarketEntry {
  id: string
  title: string
  category: string
  value: number
  description?: string
  created_at: string
}

interface Stats {
  total: number
  analysis: number
  procurement: number
}

export default function LedMarketPage() {
  const [data, setData] = useState<MarketEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats>({ total: 0, analysis: 0, procurement: 0 })
  const [activeTab, setActiveTab] = useState('All')
  const [submitting, setSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(false)

  // Form
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('분析')
  const [value, setValue] = useState('')
  const [desc, setDesc] = useState('')

  useEffect(() => { fetchData() }, [])

  async function fetchData(cat?: string) {
    setLoading(true)
    try {
      const q = cat && cat !== 'All' ? `?category=${encodeURIComponent(cat)}` : ''
      const res = await fetch(`/api/led/market${q}`)
      const json = await res.json()
      setData(json.data || [])
      if (json.stats) setStats(json.stats)
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title || !value) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/led/market', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category, value: Number(value), description: desc }),
      })
      const json = await res.json()
      if (!res.ok) { alert(json.error || '저장 실패'); return }
      setTitle(''); setValue(''); setDesc(''); setShowForm(false)
      fetchData()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch(`/api/led/market?id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  function handleTabChange(tab: string) {
    setActiveTab(tab)
    fetchData(tab)
  }

  const filteredData = activeTab === 'All' ? data : data.filter(d => d.category === activeTab)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Activity size={16} className="text-cyan-400" />
            <span className="text-xs text-cyan-400 font-semibold tracking-widest uppercase">Real-Time Analytics</span>
          </div>
          <h1 className="text-3xl font-black text-white">LED 시장 및 조달 데이터 허브</h1>
          <p className="text-slate-400 text-sm mt-1">LOOV Intelligence Dashboard</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-sm px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} /> 신규 데이터 입력
          </button>
          <a
            href="/dashboard/led/procurement"
            className="flex items-center gap-2 border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            <ArrowUpRight size={16} /> G2B 조달 분석
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5">
          <div className="text-slate-400 text-xs mb-2">누적 거래 규모</div>
          <div className="text-2xl font-black text-white font-mono">₩ {stats.total.toLocaleString()}</div>
          <div className="mt-3 h-1.5 bg-slate-700 rounded-full">
            <div className="h-full w-[70%] bg-cyan-500 rounded-full" />
          </div>
        </div>
        <div className="bg-slate-800/60 border-l-4 border-green-500 border border-slate-700/50 rounded-2xl p-5">
          <div className="text-slate-400 text-xs mb-2">시장 분析 데이터</div>
          <div className="text-2xl font-black text-white">{stats.analysis} <span className="text-sm font-normal text-slate-400">Items</span></div>
          <TrendingUp size={22} className="text-green-400 mt-3" />
        </div>
        <div className="bg-slate-800/60 border-l-4 border-yellow-500 border border-slate-700/50 rounded-2xl p-5">
          <div className="text-slate-400 text-xs mb-2">조달 시장 실적</div>
          <div className="text-2xl font-black text-white">{stats.procurement} <span className="text-sm font-normal text-slate-400">Records</span></div>
          <BarChart3 size={22} className="text-yellow-400 mt-3" />
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Plus size={18} className="text-white" />
            <h2 className="text-lg font-semibold text-white">신규 데이터 엔트리</h2>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">분析 프로젝트 명</label>
            <input
              required value={title} onChange={e => setTitle(e.target.value)}
              placeholder="분析 타이틀 입력..."
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">데이터 분야</label>
              <select
                value={category} onChange={e => setCategory(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
              >
                <option value="분析">시장 분析</option>
                <option value="조달시장">조달 시장</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">값 (Amount)</label>
              <input
                required type="number" value={value} onChange={e => setValue(e.target.value)}
                placeholder="수치"
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">메모</label>
            <textarea
              rows={3} value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="설명 기록..."
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit" disabled={submitting}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-lg transition-colors"
            >
              <Database size={16} /> {submitting ? '저장 중...' : '저장'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white px-4 py-2 rounded-lg transition-colors">
              취소
            </button>
          </div>
        </form>
      )}

      {/* Feed */}
      <div>
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex gap-6">
            {['All', '분析', '조달시장'].map(tab => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`text-sm font-semibold pb-2 border-b-2 transition-colors ${
                  activeTab === tab ? 'text-white border-white' : 'text-slate-500 border-transparent hover:text-slate-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Filter size={12} /> 최신순 정렬
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-16 text-slate-500">
              <Activity size={28} className="mx-auto mb-3 animate-spin" />
              <p className="text-sm">데이터 불러오는 중...</p>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl text-center py-16 text-slate-500 text-sm">
              등록된 데이터가 없습니다.
            </div>
          ) : (
            filteredData.map((item) => (
              <div
                key={item.id}
                className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex items-center justify-between hover:bg-slate-700/40 transition-colors group"
              >
                <div className="flex items-center gap-5">
                  <div className="w-11 h-11 rounded-full bg-slate-700/60 border border-slate-600 flex items-center justify-center flex-shrink-0">
                    {item.category === '분析'
                      ? <TrendingUp size={18} className="text-green-400" />
                      : <BarChart3 size={18} className="text-yellow-400" />
                    }
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        item.category === '분析'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>{item.category}</span>
                      <span className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString('ko-KR')}</span>
                    </div>
                    <h3 className="text-base font-bold text-white">{item.title}</h3>
                    {item.description && <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-2xl font-black text-white font-mono">{item.value.toLocaleString()}</div>
                    <div className="text-[10px] text-cyan-400 font-bold tracking-widest uppercase">Analysis Value</div>
                  </div>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="opacity-0 group-hover:opacity-100 p-2 text-slate-500 hover:text-red-400 transition-all"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
