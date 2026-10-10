'use client'

import { useState, useEffect, useCallback } from 'react'

interface LogEntry {
  time: string
  ip: string
  domain: string
  type: string
}

interface DomainStat {
  domain: string
  count: number
  lastTime: string
  types: string[]
}

const DEVICE_NAMES: Record<string, string> = {
  '192.168.0.2': 'DESKTOP-4GT20NN',
  '192.168.0.3': 'wonjeong-Note20',
  '192.168.0.6': '내 Mac',
  '192.168.0.7': 'hy64 NAS',
  '192.168.0.15': '기기 (0.15)',
}

function toLocalDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function aggregateByDomain(entries: LogEntry[]): DomainStat[] {
  const map = new Map<string, DomainStat>()
  for (const e of entries) {
    const existing = map.get(e.domain)
    if (existing) {
      existing.count++
      if (e.time > existing.lastTime) existing.lastTime = e.time
      if (!existing.types.includes(e.type)) existing.types.push(e.type)
    } else {
      map.set(e.domain, { domain: e.domain, count: 1, lastTime: e.time, types: [e.type] })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}

export default function DnsMonitorPage() {
  const [date, setDate] = useState(toLocalDate)
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedIp, setSelectedIp] = useState('all')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'domain' | 'timeline'>('domain')

  const load = useCallback(async (d: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/dns-monitor?date=${d}`)
      if (!res.ok) throw new Error('서버 오류')
      const data = await res.json()
      setEntries(data.entries || [])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(date) }, [date, load])

  const ips = ['all', ...Array.from(new Set(entries.map(e => e.ip))).sort()]
  const filtered = entries.filter(e =>
    (selectedIp === 'all' || e.ip === selectedIp) &&
    (search === '' || e.domain.includes(search))
  )
  const domainStats = aggregateByDomain(filtered)
  const uniqueDomains = new Set(filtered.map(e => e.domain)).size

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-white">DNS 모니터</h1>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="bg-zinc-800 text-white border border-zinc-600 rounded px-3 py-1.5 text-sm"
        />
        <button
          onClick={() => load(date)}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
        >
          {loading ? '로딩...' : '새로고침'}
        </button>
      </div>

      {error && <div className="bg-red-900/50 text-red-300 px-4 py-2 rounded text-sm">{error}</div>}

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-800 rounded-lg p-4">
          <div className="text-zinc-400 text-xs mb-1">총 쿼리</div>
          <div className="text-2xl font-bold text-white">{filtered.length.toLocaleString()}</div>
        </div>
        <div className="bg-zinc-800 rounded-lg p-4">
          <div className="text-zinc-400 text-xs mb-1">접속 도메인</div>
          <div className="text-2xl font-bold text-emerald-400">{uniqueDomains.toLocaleString()}</div>
        </div>
        <div className="bg-zinc-800 rounded-lg p-4">
          <div className="text-zinc-400 text-xs mb-1">기기 수</div>
          <div className="text-2xl font-bold text-sky-400">{ips.length - 1}</div>
        </div>
      </div>

      {/* IP 탭 */}
      <div className="flex gap-2 flex-wrap">
        {ips.map(ip => (
          <button
            key={ip}
            onClick={() => setSelectedIp(ip)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              selectedIp === ip
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {ip === 'all' ? '전체' : (DEVICE_NAMES[ip] ? `${DEVICE_NAMES[ip]} (${ip})` : ip)}
            {ip !== 'all' && (
              <span className="ml-1.5 text-xs opacity-70">
                {entries.filter(e => e.ip === ip).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 검색 + 뷰 전환 */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="도메인 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-zinc-800 text-white border border-zinc-600 rounded px-3 py-1.5 text-sm placeholder:text-zinc-500"
        />
        <div className="flex bg-zinc-800 rounded overflow-hidden border border-zinc-600">
          <button
            onClick={() => setViewMode('domain')}
            className={`px-3 py-1.5 text-sm ${viewMode === 'domain' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'}`}
          >
            도메인별
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`px-3 py-1.5 text-sm ${viewMode === 'timeline' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'}`}
          >
            시간순
          </button>
        </div>
      </div>

      {/* 테이블 */}
      {loading ? (
        <div className="text-center py-12 text-zinc-400">로딩 중...</div>
      ) : viewMode === 'domain' ? (
        <div className="bg-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400 text-xs">
                <th className="text-left px-4 py-2">도메인</th>
                <th className="text-right px-4 py-2 w-20">횟수</th>
                <th className="text-right px-4 py-2 w-24">마지막 접속</th>
                <th className="text-right px-4 py-2 w-20">타입</th>
              </tr>
            </thead>
            <tbody>
              {domainStats.slice(0, 200).map((s, i) => (
                <tr key={i} className="border-b border-zinc-700/50 hover:bg-zinc-700/30">
                  <td className="px-4 py-1.5 text-zinc-200 font-mono text-xs truncate max-w-xs">{s.domain}</td>
                  <td className="px-4 py-1.5 text-right">
                    <span className="bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded text-xs">{s.count}</span>
                  </td>
                  <td className="px-4 py-1.5 text-right text-zinc-400 text-xs">{s.lastTime}</td>
                  <td className="px-4 py-1.5 text-right text-zinc-500 text-xs">{s.types.join('/')}</td>
                </tr>
              ))}
              {domainStats.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">데이터 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400 text-xs">
                <th className="text-left px-4 py-2 w-24">시간</th>
                <th className="text-left px-4 py-2 w-32">기기</th>
                <th className="text-left px-4 py-2">도메인</th>
                <th className="text-right px-4 py-2 w-16">타입</th>
              </tr>
            </thead>
            <tbody>
              {[...filtered].reverse().slice(0, 500).map((e, i) => (
                <tr key={i} className="border-b border-zinc-700/50 hover:bg-zinc-700/30">
                  <td className="px-4 py-1.5 text-zinc-400 text-xs font-mono">{e.time}</td>
                  <td className="px-4 py-1.5 text-xs">
                    <span className="text-sky-400">{DEVICE_NAMES[e.ip] || e.ip}</span>
                  </td>
                  <td className="px-4 py-1.5 text-zinc-200 font-mono text-xs truncate max-w-xs">{e.domain}</td>
                  <td className="px-4 py-1.5 text-right text-zinc-500 text-xs">{e.type}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">데이터 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
