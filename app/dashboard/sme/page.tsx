'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────
type Program = {
  id: string
  title: string
  agency: string
  executor: string
  field: string
  region: string
  startDate?: string
  endDate?: string
  status: '신청가능' | '마감'
  registeredAt?: string
  url?: string
}

interface FieldMap {
  id?: string
  title?: string
  agency?: string
  executor?: string
  field?: string
  region?: string
  startDate?: string
  endDate?: string
  registeredAt?: string
  url?: string
}

interface ApiConfig {
  id: string
  name: string
  endpoint: string
  serviceKey: string
  fieldMap: FieldMap
  enabled: boolean
  isDefault?: boolean
}

const DEFAULT_FIELD_MAP: FieldMap = {
  id: '번호',
  title: '사업명',
  agency: '소관기관',
  executor: '수행기관',
  field: '지원분야',
  region: '지역',
  startDate: '신청시작일자',
  endDate: '신청종료일자',
  registeredAt: '등록일자',
  url: '사업공고URL',
}

const BUILT_IN_API: ApiConfig = {
  id: 'default',
  name: '중소기업 지원사업 (기본)',
  endpoint:
    'https://api.odcloud.kr/api/3034791/v1/uddi:fa09d13d-bce8-474e-b214-8008e79ec08f',
  serviceKey: '',
  fieldMap: DEFAULT_FIELD_MAP,
  enabled: true,
  isDefault: true,
}

const STORAGE_KEY_CONFIGS = 'sme_api_configs'
const STORAGE_KEY_ACTIVE = 'sme_active_api'
const STORAGE_KEY_BOOKMARKS = 'sme_bookmarks'
const STORAGE_KEY_DEFAULT_KEY = 'sme_default_service_key'

// ── Constants ──────────────────────────────────────────────────────────
const REGIONS = [
  '전체', '서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산',
  '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '전국',
]

const FIELD_MAP_LABELS: [keyof FieldMap, string][] = [
  ['id', 'ID 필드'],
  ['title', '사업명 필드'],
  ['agency', '소관기관 필드'],
  ['executor', '수행기관 필드'],
  ['field', '지원분야 필드'],
  ['region', '지역 필드'],
  ['startDate', '신청시작일 필드'],
  ['endDate', '신청종료일 필드'],
  ['registeredAt', '등록일 필드'],
  ['url', 'URL 필드'],
]

// ── Helpers ────────────────────────────────────────────────────────────
function calcDday(endDate?: string): number | null {
  if (!endDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(endDate)
  end.setHours(0, 0, 0, 0)
  return Math.ceil((end.getTime() - today.getTime()) / 86400000)
}

function DdayBadge({ status, endDate }: { status: string; endDate?: string }) {
  if (status === '마감')
    return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-700 text-gray-400">마감</span>
  const d = calcDday(endDate)
  if (d === null)
    return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-900/50 text-blue-300">신청중</span>
  if (d === 0)
    return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-900/80 text-red-200 animate-pulse">D-day</span>
  if (d < 0)
    return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-700 text-gray-400">마감</span>
  if (d <= 3)
    return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-900/60 text-red-300">D-{d}</span>
  if (d <= 7)
    return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-900/60 text-orange-300">D-{d}</span>
  return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-900/50 text-blue-300">D-{d}</span>
}

// ── Empty form ─────────────────────────────────────────────────────────
function emptyForm(): Omit<ApiConfig, 'id' | 'isDefault'> {
  return {
    name: '',
    endpoint: '',
    serviceKey: '',
    fieldMap: { ...DEFAULT_FIELD_MAP },
    enabled: true,
  }
}

// ══════════════════════════════════════════════════════════════════════
export default function SmePage() {
  const [activeTab, setActiveTab] = useState<'search' | 'settings'>('search')

  // ── API configs (localStorage) ──────────────────────────────────────
  const [apiConfigs, setApiConfigs] = useState<ApiConfig[]>([])
  const [activeApiId, setActiveApiId] = useState<string>('default')
  const [defaultServiceKey, setDefaultServiceKey] = useState<string>('')
  const [serviceKeyInput, setServiceKeyInput] = useState<string>('')
  const [serviceKeySaved, setServiceKeySaved] = useState(false)

  // ── Search state ────────────────────────────────────────────────────
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [activeCount, setActiveCount] = useState(0)
  const [closedCount, setClosedCount] = useState(0)
  const [fields, setFields] = useState<string[]>([])

  const [keyword, setKeyword] = useState('')
  const [inputKeyword, setInputKeyword] = useState('')
  const [region, setRegion] = useState('')
  const [status, setStatus] = useState('')
  const [field, setField] = useState('')
  const [sort, setSort] = useState('deadline')

  const [selected, setSelected] = useState<Program | null>(null)
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set())

  // ── Settings form state ─────────────────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [showAdvanced, setShowAdvanced] = useState(false)

  // ── Load from localStorage ──────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_BOOKMARKS)
    if (saved) {
      try { setBookmarks(new Set(JSON.parse(saved))) } catch { /* ignore */ }
    }
    const savedConfigs = localStorage.getItem(STORAGE_KEY_CONFIGS)
    if (savedConfigs) {
      try { setApiConfigs(JSON.parse(savedConfigs)) } catch { /* ignore */ }
    }
    const savedActive = localStorage.getItem(STORAGE_KEY_ACTIVE)
    if (savedActive) setActiveApiId(savedActive)
    const savedKey = localStorage.getItem(STORAGE_KEY_DEFAULT_KEY) ?? ''
    setDefaultServiceKey(savedKey)
    setServiceKeyInput(savedKey)
  }, [])

  const saveConfigs = (configs: ApiConfig[]) => {
    setApiConfigs(configs)
    localStorage.setItem(STORAGE_KEY_CONFIGS, JSON.stringify(configs))
  }

  const saveDefaultServiceKey = () => {
    const trimmed = serviceKeyInput.trim()
    if (!trimmed) return
    setDefaultServiceKey(trimmed)
    setServiceKeyInput(trimmed)
    localStorage.setItem(STORAGE_KEY_DEFAULT_KEY, trimmed)
    setServiceKeySaved(true)
    setError('')
    setTimeout(() => setServiceKeySaved(false), 2000)
  }

  const toggleBookmark = (id: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem(STORAGE_KEY_BOOKMARKS, JSON.stringify([...next]))
      return next
    })
  }

  // ── Active API config ───────────────────────────────────────────────
  const allConfigs = [BUILT_IN_API, ...apiConfigs]
  const activeApi = allConfigs.find((c) => c.id === activeApiId) ?? BUILT_IN_API

  // ── Fetch programs ──────────────────────────────────────────────────
  const fetchPrograms = useCallback(() => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams({
      page: String(page),
      perPage: '20',
      keyword,
      region,
      status,
      field,
      sort,
    })

    // Pass API config
    if (activeApi.id === 'default') {
      // Default built-in API — pass localStorage service key if set
      if (defaultServiceKey) params.set('apiKey', defaultServiceKey)
    } else {
      // Custom user-added API
      params.set('apiEndpoint', activeApi.endpoint)
      const key = activeApi.serviceKey || defaultServiceKey
      if (key) params.set('apiKey', key)
      const customFM = Object.fromEntries(
        Object.entries(activeApi.fieldMap).filter(([, v]) => v)
      )
      if (Object.keys(customFM).length > 0) {
        params.set('fieldMap', JSON.stringify(customFM))
      }
    }

    fetch(`/api/sme/programs?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); setLoading(false); return }
        setPrograms(data.programs || [])
        setTotalPages(data.totalPages || 1)
        setTotalCount(data.totalCount || 0)
        setActiveCount(data.activeCount || 0)
        setClosedCount(data.closedCount || 0)
        if (data.fields?.length) setFields(data.fields)
        setLoading(false)
      })
      .catch(() => { setError('API 호출 실패'); setLoading(false) })
  }, [page, keyword, region, status, field, sort, activeApi, defaultServiceKey])

  useEffect(() => { fetchPrograms() }, [fetchPrograms])

  const handleSearch = () => { setKeyword(inputKeyword); setPage(1) }

  // ── Settings handlers ───────────────────────────────────────────────
  const startEdit = (cfg: ApiConfig) => {
    setEditingId(cfg.id)
    setForm({
      name: cfg.name,
      endpoint: cfg.endpoint,
      serviceKey: cfg.serviceKey,
      fieldMap: { ...DEFAULT_FIELD_MAP, ...cfg.fieldMap },
      enabled: cfg.enabled,
    })
    setShowAddForm(true)
    setShowAdvanced(false)
  }

  const cancelForm = () => {
    setShowAddForm(false)
    setEditingId(null)
    setForm(emptyForm())
    setShowAdvanced(false)
  }

  const saveForm = () => {
    if (!form.name.trim() || !form.endpoint.trim()) return

    if (editingId) {
      saveConfigs(
        apiConfigs.map((c) =>
          c.id === editingId ? { ...c, ...form } : c
        )
      )
    } else {
      const newCfg: ApiConfig = {
        ...form,
        id: `api_${Date.now()}`,
      }
      saveConfigs([...apiConfigs, newCfg])
    }
    cancelForm()
  }

  const deleteConfig = (id: string) => {
    const next = apiConfigs.filter((c) => c.id !== id)
    saveConfigs(next)
    if (activeApiId === id) {
      setActiveApiId('default')
      localStorage.setItem(STORAGE_KEY_ACTIVE, 'default')
    }
  }

  const toggleEnabled = (id: string) => {
    saveConfigs(apiConfigs.map((c) => c.id === id ? { ...c, enabled: !c.enabled } : c))
  }

  const selectApi = (id: string) => {
    setActiveApiId(id)
    localStorage.setItem(STORAGE_KEY_ACTIVE, id)
    setPage(1)
  }

  const updateFieldMap = (key: keyof FieldMap, value: string) => {
    setForm((f) => ({ ...f, fieldMap: { ...f.fieldMap, [key]: value } }))
  }

  // ══════════════════════════════════════════════════════════════════
  return (
    <div className="p-4 md:p-6 space-y-5 text-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">🏢 중소기업 지원사업</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            정부·지자체 지원사업 통합 검색 (공공데이터포털)
          </p>
        </div>
        <button
          onClick={fetchPrograms}
          className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg text-gray-300 transition"
        >
          🔄 새로고침
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-800/60 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('search')}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${
            activeTab === 'search'
              ? 'bg-blue-600 text-white shadow'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          🔍 검색
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition relative ${
            activeTab === 'settings'
              ? 'bg-gray-600 text-white shadow'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          ⚙️ API 설정
          {apiConfigs.length > 0 && (
            <span className="ml-1.5 text-xs bg-blue-600 text-white rounded-full px-1.5 py-0.5 leading-none">
              {apiConfigs.length}
            </span>
          )}
        </button>
      </div>

      {/* ── SEARCH TAB ────────────────────────────────────────────── */}
      {activeTab === 'search' && (
        <>
          {/* Active API selector */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">현재 API:</span>
            <div className="flex gap-1 flex-wrap">
              {allConfigs.filter((c) => c.enabled !== false).map((cfg) => (
                <button
                  key={cfg.id}
                  onClick={() => selectApi(cfg.id)}
                  className={`px-2.5 py-1 rounded-full font-semibold transition ${
                    activeApiId === cfg.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
                  }`}
                >
                  {cfg.isDefault ? '🔵' : '🟡'} {cfg.name}
                </button>
              ))}
            </div>
          </div>

          {/* Stats — 클릭으로 필터 */}
          {!loading && !error && (
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => { setStatus(''); setPage(1) }}
                className={`rounded-xl p-4 text-center transition border ${status === '' ? 'bg-gray-700 border-gray-500' : 'bg-gray-800 border-transparent hover:bg-gray-750'}`}
              >
                <div className="text-2xl font-bold text-white">{totalCount.toLocaleString()}</div>
                <div className="text-xs text-gray-400 mt-0.5">전체</div>
              </button>
              <button
                onClick={() => { setStatus('신청가능'); setPage(1) }}
                className={`rounded-xl p-4 text-center transition border ${status === '신청가능' ? 'bg-green-800 border-green-600' : 'bg-green-900/30 border-green-800/30 hover:bg-green-900/50'}`}
              >
                <div className="text-2xl font-bold text-green-300">{activeCount.toLocaleString()}</div>
                <div className="text-xs text-green-400 mt-0.5">신청가능 ▶</div>
              </button>
              <button
                onClick={() => { setStatus('마감'); setPage(1) }}
                className={`rounded-xl p-4 text-center transition border ${status === '마감' ? 'bg-gray-600 border-gray-500' : 'bg-gray-800/60 border-transparent hover:bg-gray-700'}`}
              >
                <div className="text-2xl font-bold text-gray-400">{closedCount.toLocaleString()}</div>
                <div className="text-xs text-gray-500 mt-0.5">마감</div>
              </button>
            </div>
          )}

          {/* Search */}
          <div className="bg-gray-800 rounded-2xl p-4 space-y-3">
            <div className="flex gap-2">
              <input
                value={inputKeyword}
                onChange={(e) => setInputKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="사업명, 기관명 검색..."
                className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleSearch}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
              >
                검색
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <select
                value={region}
                onChange={(e) => { setRegion(e.target.value); setPage(1) }}
                className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-2 text-sm text-white focus:outline-none"
              >
                {REGIONS.map((r) => (
                  <option key={r} value={r === '전체' ? '' : r}>{r}</option>
                ))}
              </select>
              <select
                value={field}
                onChange={(e) => { setField(e.target.value); setPage(1) }}
                className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-2 text-sm text-white focus:outline-none"
              >
                <option value="">전체 분야</option>
                {fields.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <select
                value={status}
                onChange={(e) => { setStatus(e.target.value); setPage(1) }}
                className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-2 text-sm text-white focus:outline-none"
              >
                <option value="">전체 상태</option>
                <option value="신청가능">신청가능</option>
                <option value="마감">마감</option>
              </select>
              <select
                value={sort}
                onChange={(e) => { setSort(e.target.value); setPage(1) }}
                className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-2 text-sm text-white focus:outline-none"
              >
                <option value="deadline">마감임박순</option>
                <option value="latest">최신등록순</option>
              </select>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-sm text-red-300">
              <p className="font-semibold">❌ {error}</p>
              {error.includes('SERVICE_KEY') && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-red-400">
                    공공데이터포털 서비스키가 필요합니다.{' '}
                    <a href="https://www.data.go.kr" target="_blank" rel="noopener noreferrer" className="underline">
                      발급받기 →
                    </a>
                  </p>
                  <div className="flex gap-2 items-center">
                    <input
                      value={serviceKeyInput}
                      onChange={(e) => setServiceKeyInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveDefaultServiceKey()}
                      placeholder="서비스키 붙여넣기..."
                      className="flex-1 bg-red-950/50 border border-red-700 rounded-lg px-3 py-2 text-xs text-white placeholder-red-500 focus:outline-none focus:border-red-400 font-mono"
                    />
                    <button
                      onClick={saveDefaultServiceKey}
                      disabled={!serviceKeyInput.trim()}
                      className="bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-xs font-semibold px-3 py-2 rounded-lg transition whitespace-nowrap"
                    >
                      {serviceKeySaved ? '✓ 저장됨' : '저장 후 검색'}
                    </button>
                  </div>
                  <p className="text-xs text-red-500">또는 ⚙️ API 설정 탭에서 서비스키를 관리하세요.</p>
                </div>
              )}
            </div>
          )}

          {/* List */}
          {loading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-gray-800 rounded-xl p-4 animate-pulse h-[72px]" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {programs.length === 0 && (
                <div className="text-center py-20 text-gray-500">검색 결과가 없습니다.</div>
              )}
              {programs.map((p) => {
                const isActive = p.status === '신청가능'
                return (
                  <div
                    key={p.id}
                    onClick={() => p.url ? window.open(p.url, '_blank', 'noopener,noreferrer') : setSelected(p)}
                    className={`flex items-stretch rounded-xl cursor-pointer transition group overflow-hidden border ${
                      isActive
                        ? 'bg-gray-800 border-green-800/60 hover:border-green-600 hover:bg-gray-750'
                        : 'bg-gray-800/50 border-gray-700/50 hover:bg-gray-800 hover:border-gray-600'
                    }`}
                  >
                    {/* Left accent bar */}
                    <div className={`w-1 shrink-0 ${isActive ? 'bg-green-500' : 'bg-gray-700'}`} />

                    <div className="flex-1 flex items-center justify-between gap-3 px-4 py-3 min-w-0">
                      <div className="flex-1 min-w-0">
                        {/* Title */}
                        <p className={`text-sm font-semibold leading-snug truncate transition ${
                          isActive ? 'text-white group-hover:text-green-300' : 'text-gray-300 group-hover:text-white'
                        }`}>
                          {p.title}
                        </p>
                        {/* Meta row */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {p.agency && (
                            <span className="text-xs text-gray-400 font-medium">{p.agency}</span>
                          )}
                          {p.region && (
                            <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">{p.region}</span>
                          )}
                          {p.field && p.field !== '기타' && (
                            <span className="text-xs bg-blue-900/50 text-blue-300 px-1.5 py-0.5 rounded">{p.field}</span>
                          )}
                          {p.endDate && (
                            <span className={`text-xs ${isActive ? 'text-green-400' : 'text-gray-500'}`}>
                              ~ {p.endDate}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: badge + bookmark */}
                      <div className="flex items-center gap-2 shrink-0">
                        <DdayBadge status={p.status} endDate={p.endDate} />
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleBookmark(p.id) }}
                          className={`text-xl leading-none transition ${
                            bookmarks.has(p.id) ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'
                          }`}
                        >
                          {bookmarks.has(p.id) ? '★' : '☆'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button disabled={page === 1} onClick={() => setPage(1)}
                className="px-2 py-1.5 rounded-lg text-xs border border-gray-700 disabled:opacity-30 hover:bg-gray-700 transition">««</button>
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg text-xs border border-gray-700 disabled:opacity-30 hover:bg-gray-700 transition">이전</button>
              <span className="text-sm text-gray-400 px-3">
                <span className="text-white font-semibold">{page}</span> / {totalPages}
                <span className="ml-2 text-xs">({totalCount.toLocaleString()}개)</span>
              </span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg text-xs border border-gray-700 disabled:opacity-30 hover:bg-gray-700 transition">다음</button>
              <button disabled={page >= totalPages} onClick={() => setPage(totalPages)}
                className="px-2 py-1.5 rounded-lg text-xs border border-gray-700 disabled:opacity-30 hover:bg-gray-700 transition">»»</button>
            </div>
          )}
        </>
      )}

      {/* ── SETTINGS TAB ─────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <div className="space-y-4 max-w-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">공공 API 설정</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                공공데이터포털 또는 다른 공공 API를 추가하여 검색 소스를 확장합니다.
              </p>
            </div>
            {!showAddForm && (
              <button
                onClick={() => { setShowAddForm(true); setEditingId(null); setForm(emptyForm()) }}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
              >
                + API 추가
              </button>
            )}
          </div>

          {/* ── Default Service Key ── */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                🔑 기본 서비스키 (공공데이터포털)
                {defaultServiceKey && (
                  <span className="text-xs bg-green-900/60 text-green-300 px-2 py-0.5 rounded-full">설정됨</span>
                )}
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                서비스키가 없으면{' '}
                <a href="https://www.data.go.kr" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
                  data.go.kr
                </a>
                에서 무료 발급받으세요. 브라우저에 저장됩니다.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={serviceKeyInput}
                onChange={(e) => setServiceKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveDefaultServiceKey()}
                placeholder={defaultServiceKey ? '••••••••••••••••••••••••' : '공공데이터포털 서비스키 입력...'}
                className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
              />
              <button
                onClick={saveDefaultServiceKey}
                disabled={!serviceKeyInput.trim()}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition whitespace-nowrap ${
                  serviceKeySaved
                    ? 'bg-green-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white'
                }`}
              >
                {serviceKeySaved ? '✓ 저장됨' : '저장'}
              </button>
              {defaultServiceKey && (
                <button
                  onClick={() => {
                    setDefaultServiceKey('')
                    setServiceKeyInput('')
                    localStorage.removeItem(STORAGE_KEY_DEFAULT_KEY)
                  }}
                  className="px-3 py-2 rounded-lg text-sm border border-gray-600 hover:border-red-500 text-gray-400 hover:text-red-300 transition"
                >
                  삭제
                </button>
              )}
            </div>
            {defaultServiceKey && (
              <p className="text-xs text-gray-500">
                현재 저장된 키: <span className="font-mono text-gray-400">{defaultServiceKey.slice(0, 12)}...</span>
              </p>
            )}
          </div>

          {/* Built-in API */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-blue-900/60 text-blue-300 px-2 py-0.5 rounded-full font-semibold">기본</span>
                  <span className="text-sm font-semibold text-white">{BUILT_IN_API.name}</span>
                  {activeApiId === 'default' && (
                    <span className="text-xs bg-green-900/60 text-green-300 px-2 py-0.5 rounded-full">사용중</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1 truncate">{BUILT_IN_API.endpoint}</p>
                <p className="text-xs text-gray-500 mt-0.5">서비스키: 환경변수 (DATA_GO_KR_SERVICE_KEY)</p>
              </div>
              <button
                onClick={() => selectApi('default')}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeApiId === 'default'
                    ? 'bg-green-700 text-white cursor-default'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }`}
              >
                {activeApiId === 'default' ? '✓ 선택됨' : '선택'}
              </button>
            </div>
          </div>

          {/* User-added APIs */}
          {apiConfigs.map((cfg) => (
            <div key={cfg.id} className={`bg-gray-800 border rounded-xl p-4 transition ${
              cfg.enabled ? 'border-gray-700' : 'border-gray-800 opacity-60'
            }`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      cfg.enabled ? 'bg-yellow-900/60 text-yellow-300' : 'bg-gray-700 text-gray-500'
                    }`}>
                      {cfg.enabled ? '활성' : '비활성'}
                    </span>
                    <span className="text-sm font-semibold text-white">{cfg.name}</span>
                    {activeApiId === cfg.id && (
                      <span className="text-xs bg-green-900/60 text-green-300 px-2 py-0.5 rounded-full">사용중</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate">{cfg.endpoint}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    서비스키: {cfg.serviceKey ? `${cfg.serviceKey.slice(0, 8)}...` : '(없음)'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {cfg.enabled && (
                    <button
                      onClick={() => selectApi(cfg.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        activeApiId === cfg.id
                          ? 'bg-green-700 text-white cursor-default'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      }`}
                    >
                      {activeApiId === cfg.id ? '✓ 선택됨' : '선택'}
                    </button>
                  )}
                  <button
                    onClick={() => toggleEnabled(cfg.id)}
                    className="px-2.5 py-1.5 rounded-lg text-xs border border-gray-600 hover:border-gray-500 text-gray-400 transition"
                    title={cfg.enabled ? '비활성화' : '활성화'}
                  >
                    {cfg.enabled ? '끄기' : '켜기'}
                  </button>
                  <button
                    onClick={() => startEdit(cfg)}
                    className="px-2.5 py-1.5 rounded-lg text-xs border border-gray-600 hover:border-blue-500 text-gray-400 hover:text-blue-300 transition"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => deleteConfig(cfg.id)}
                    className="px-2.5 py-1.5 rounded-lg text-xs border border-gray-600 hover:border-red-500 text-gray-400 hover:text-red-300 transition"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}

          {apiConfigs.length === 0 && !showAddForm && (
            <div className="text-center py-8 text-gray-500 text-sm">
              추가된 API가 없습니다. &apos;+ API 추가&apos; 버튼으로 새 API를 등록하세요.
            </div>
          )}

          {/* Add/Edit Form */}
          {showAddForm && (
            <div className="bg-gray-800 border border-blue-800/50 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white">
                {editingId ? '🛠 API 수정' : '➕ 새 API 추가'}
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">API 이름 *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="예: 창업진흥원 지원사업"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">API 엔드포인트 URL *</label>
                  <input
                    value={form.endpoint}
                    onChange={(e) => setForm((f) => ({ ...f, endpoint: e.target.value }))}
                    placeholder="https://api.odcloud.kr/api/..."
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono text-xs"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    공공데이터포털 오픈 API 엔드포인트를 입력하세요.
                  </p>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">서비스키 (없으면 환경변수 사용)</label>
                  <input
                    value={form.serviceKey}
                    onChange={(e) => setForm((f) => ({ ...f, serviceKey: e.target.value }))}
                    placeholder="공공데이터포털에서 발급받은 서비스키"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono text-xs"
                  />
                </div>

                {/* Advanced: Field Map */}
                <div>
                  <button
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300 transition"
                  >
                    <span>{showAdvanced ? '▼' : '▶'}</span>
                    <span>고급 설정: 필드 이름 매핑</span>
                  </button>
                  {showAdvanced && (
                    <div className="mt-3 space-y-2 bg-gray-900/50 rounded-xl p-3 border border-gray-700">
                      <p className="text-xs text-gray-500 mb-2">
                        API 응답 JSON의 필드명이 다를 경우 변경하세요. (기본값은 공공데이터포털 표준)
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {FIELD_MAP_LABELS.map(([key, label]) => (
                          <div key={key}>
                            <label className="block text-xs text-gray-500 mb-0.5">{label}</label>
                            <input
                              value={form.fieldMap[key] ?? ''}
                              onChange={(e) => updateFieldMap(key, e.target.value)}
                              placeholder={DEFAULT_FIELD_MAP[key]}
                              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setForm((f) => ({ ...f, fieldMap: { ...DEFAULT_FIELD_MAP } }))}
                        className="text-xs text-gray-500 hover:text-gray-300 transition underline"
                      >
                        기본값으로 초기화
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="enabled"
                    checked={form.enabled}
                    onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                    className="rounded"
                  />
                  <label htmlFor="enabled" className="text-xs text-gray-400">활성화</label>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={saveForm}
                  disabled={!form.name.trim() || !form.endpoint.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold px-5 py-2 rounded-xl transition"
                >
                  {editingId ? '저장' : '추가'}
                </button>
                <button
                  onClick={cancelForm}
                  className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm px-5 py-2 rounded-xl transition"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {/* Guide */}
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 text-xs text-gray-500 space-y-1.5">
            <p className="font-semibold text-gray-400">💡 공공데이터포털 API 추가 방법</p>
            <p>1. <a href="https://www.data.go.kr" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">data.go.kr</a>에서 원하는 API 검색 후 활용신청</p>
            <p>2. 발급된 서비스키와 엔드포인트 URL을 복사</p>
            <p>3. 위 &apos;+ API 추가&apos; 버튼으로 등록</p>
            <p>4. 검색 탭에서 원하는 API를 선택하여 사용</p>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-700 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-white leading-tight">{selected.title}</h2>
                <p className="text-sm text-gray-400 mt-1">{selected.agency}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <DdayBadge status={selected.status} endDate={selected.endDate} />
                <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
              </div>
            </div>
            <div className="p-5 space-y-3">
              {([
                ['수행기관', selected.executor],
                ['지원분야', selected.field],
                ['지역', selected.region],
                ['신청기간', selected.startDate && selected.endDate ? `${selected.startDate} ~ ${selected.endDate}` : selected.endDate],
                ['등록일', selected.registeredAt],
              ] as [string, string | undefined][]).map(([label, value]) =>
                value ? (
                  <div key={label} className="flex gap-3 text-sm">
                    <span className="text-gray-500 w-20 shrink-0">{label}</span>
                    <span className="text-gray-200">{value}</span>
                  </div>
                ) : null
              )}
            </div>
            <div className="p-5 pt-0 flex gap-3">
              {selected.url && (
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-xl transition"
                >
                  공고 원문 바로가기 →
                </a>
              )}
              <button
                onClick={() => toggleBookmark(selected.id)}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition border ${
                  bookmarks.has(selected.id)
                    ? 'border-yellow-600 bg-yellow-900/30 text-yellow-300'
                    : 'border-gray-600 text-gray-400 hover:border-yellow-600'
                }`}
              >
                {bookmarks.has(selected.id) ? '★ 저장됨' : '☆ 즐겨찾기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
