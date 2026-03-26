'use client'

import { useState, useEffect, useCallback } from 'react'

// Types
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

const REGIONS = [
  '전체', '서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산',
  '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '전국',
]

function calcDday(endDate?: string): number | null {
  if (!endDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(endDate)
  end.setHours(0, 0, 0, 0)
  return Math.ceil((end.getTime() - today.getTime()) / 86400000)
}

function DdayBadge({ status, endDate }: { status: string; endDate?: string }) {
  if (status === '마감') {
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-700 text-gray-400">
        마감
      </span>
    )
  }
  const d = calcDday(endDate)
  if (d === null)
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-900/50 text-blue-300">
        신청중
      </span>
    )
  if (d === 0)
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-900/80 text-red-200 animate-pulse">
        D-day
      </span>
    )
  if (d < 0)
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-700 text-gray-400">
        마감
      </span>
    )
  if (d <= 3)
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-900/60 text-red-300">
        D-{d}
      </span>
    )
  if (d <= 7)
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-900/60 text-orange-300">
        D-{d}
      </span>
    )
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-900/50 text-blue-300">
      D-{d}
    </span>
  )
}

export default function SmePage() {
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

  // Load bookmarks from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sme_bookmarks')
    if (saved) {
      try {
        setBookmarks(new Set(JSON.parse(saved)))
      } catch {
        // ignore parse errors
      }
    }
  }, [])

  const toggleBookmark = (id: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem('sme_bookmarks', JSON.stringify([...next]))
      return next
    })
  }

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
    fetch(`/api/sme/programs?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
          setLoading(false)
          return
        }
        setPrograms(data.programs || [])
        setTotalPages(data.totalPages || 1)
        setTotalCount(data.totalCount || 0)
        setActiveCount(data.activeCount || 0)
        setClosedCount(data.closedCount || 0)
        if (data.fields?.length) setFields(data.fields)
        setLoading(false)
      })
      .catch(() => {
        setError('API 호출 실패')
        setLoading(false)
      })
  }, [page, keyword, region, status, field, sort])

  useEffect(() => {
    fetchPrograms()
  }, [fetchPrograms])

  const handleSearch = () => {
    setKeyword(inputKeyword)
    setPage(1)
  }

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

      {/* Stats */}
      {!loading && !error && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-800 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-white">
              {totalCount.toLocaleString()}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">전체</div>
          </div>
          <div className="bg-blue-900/40 rounded-xl p-3 text-center border border-blue-800/30">
            <div className="text-2xl font-bold text-blue-300">
              {activeCount.toLocaleString()}
            </div>
            <div className="text-xs text-blue-400 mt-0.5">신청가능</div>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-gray-400">
              {closedCount.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">마감</div>
          </div>
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
            onChange={(e) => {
              setRegion(e.target.value)
              setPage(1)
            }}
            className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-2 text-sm text-white focus:outline-none"
          >
            {REGIONS.map((r) => (
              <option key={r} value={r === '전체' ? '' : r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={field}
            onChange={(e) => {
              setField(e.target.value)
              setPage(1)
            }}
            className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-2 text-sm text-white focus:outline-none"
          >
            <option value="">전체 분야</option>
            {fields.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
            className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-2 text-sm text-white focus:outline-none"
          >
            <option value="">전체 상태</option>
            <option value="신청가능">신청가능</option>
            <option value="마감">마감</option>
          </select>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value)
              setPage(1)
            }}
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
            <p className="mt-2 text-xs text-red-400">
              .env.local에{' '}
              <code className="bg-red-900/50 px-1 rounded">
                DATA_GO_KR_SERVICE_KEY=발급받은키
              </code>{' '}
              를 추가하세요.
              <a
                href="https://www.data.go.kr"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 underline"
              >
                공공데이터포털 →
              </a>
            </p>
          )}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="bg-gray-800 rounded-xl p-4 animate-pulse h-20"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {programs.length === 0 && (
            <div className="text-center py-20 text-gray-500">
              검색 결과가 없습니다.
            </div>
          )}
          {programs.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelected(p)}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 rounded-xl p-4 cursor-pointer transition group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white truncate group-hover:text-blue-300 transition">
                      {p.title}
                    </h3>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    <span>{p.agency}</span>
                    {p.region && (
                      <>
                        <span>·</span>
                        <span className="text-gray-300">{p.region}</span>
                      </>
                    )}
                    {p.field && (
                      <>
                        <span>·</span>
                        <span className="text-gray-400">{p.field}</span>
                      </>
                    )}
                    {p.endDate && (
                      <>
                        <span>·</span>
                        <span>~{p.endDate}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <DdayBadge status={p.status} endDate={p.endDate} />
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleBookmark(p.id)
                    }}
                    className={`text-lg transition ${
                      bookmarks.has(p.id)
                        ? 'text-yellow-400'
                        : 'text-gray-600 hover:text-yellow-400'
                    }`}
                  >
                    {bookmarks.has(p.id) ? '★' : '☆'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            disabled={page === 1}
            onClick={() => setPage(1)}
            className="px-2 py-1.5 rounded-lg text-xs border border-gray-700 disabled:opacity-30 hover:bg-gray-700 transition"
          >
            ««
          </button>
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg text-xs border border-gray-700 disabled:opacity-30 hover:bg-gray-700 transition"
          >
            이전
          </button>
          <span className="text-sm text-gray-400 px-3">
            <span className="text-white font-semibold">{page}</span> /{' '}
            {totalPages}
            <span className="ml-2 text-xs">
              ({totalCount.toLocaleString()}개)
            </span>
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg text-xs border border-gray-700 disabled:opacity-30 hover:bg-gray-700 transition"
          >
            다음
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(totalPages)}
            className="px-2 py-1.5 rounded-lg text-xs border border-gray-700 disabled:opacity-30 hover:bg-gray-700 transition"
          >
            »»
          </button>
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
                <h2 className="text-base font-bold text-white leading-tight">
                  {selected.title}
                </h2>
                <p className="text-sm text-gray-400 mt-1">{selected.agency}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <DdayBadge status={selected.status} endDate={selected.endDate} />
                <button
                  onClick={() => setSelected(null)}
                  className="text-gray-500 hover:text-white text-xl leading-none"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="p-5 space-y-3">
              {(
                [
                  ['수행기관', selected.executor],
                  ['지원분야', selected.field],
                  ['지역', selected.region],
                  [
                    '신청기간',
                    selected.startDate && selected.endDate
                      ? `${selected.startDate} ~ ${selected.endDate}`
                      : selected.endDate,
                  ],
                  ['등록일', selected.registeredAt],
                ] as [string, string | undefined][]
              ).map(([label, value]) =>
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
