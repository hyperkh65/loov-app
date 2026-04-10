'use client';

import { useState, useEffect, useRef } from 'react';

type DeployLog = {
  id: number;
  sha: string | null;
  branch: string;
  status: 'queued' | 'building' | 'deploying' | 'success' | 'failed';
  step: string | null;
  message: string | null;
  triggered_by: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  queued:    { label: '대기 중',   color: 'text-gray-400',   bg: 'bg-gray-800',   dot: 'bg-gray-500' },
  building:  { label: '빌드 중',   color: 'text-amber-400',  bg: 'bg-amber-900/30', dot: 'bg-amber-400' },
  deploying: { label: '배포 중',   color: 'text-blue-400',   bg: 'bg-blue-900/30',  dot: 'bg-blue-400' },
  success:   { label: '배포 완료', color: 'text-emerald-400', bg: 'bg-emerald-900/30', dot: 'bg-emerald-400' },
  failed:    { label: '실패',      color: 'text-red-400',    bg: 'bg-red-900/30',   dot: 'bg-red-500' },
};

const STEPS = ['queued', 'building', 'deploying', 'success'];

function elapsed(from: string, to?: string) {
  const ms = new Date(to ?? Date.now()).getTime() - new Date(from).getTime();
  if (ms < 60000) return `${Math.floor(ms / 1000)}초`;
  return `${Math.floor(ms / 60000)}분 ${Math.floor((ms % 60000) / 1000)}초`;
}

function shortSha(sha: string | null) {
  return sha ? sha.slice(0, 7) : '—';
}

function timeAgo(ts: string) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return new Date(ts).toLocaleDateString('ko-KR');
}

export default function DeployPage() {
  const [logs, setLogs] = useState<DeployLog[]>([]);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLogs = async () => {
    const res = await fetch('/api/deploy/webhook').catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setLogs(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
    const poll = () => {
      fetchLogs();
      timerRef.current = setTimeout(poll, 3000);
    };
    timerRef.current = setTimeout(poll, 3000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const latest = logs[0];
  const isActive = latest && (latest.status === 'queued' || latest.status === 'building' || latest.status === 'deploying');

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">배포 현황</h1>
            <p className="text-gray-400 text-sm mt-1">git push → NAS 자동 배포</p>
          </div>
          {isActive && (
            <div className="flex items-center gap-2 text-amber-400 text-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
              </span>
              배포 진행 중
            </div>
          )}
        </div>

        {/* 최신 배포 카드 */}
        {loading ? (
          <div className="bg-gray-900 rounded-xl p-8 text-center text-gray-500">불러오는 중...</div>
        ) : !latest ? (
          <div className="bg-gray-900 rounded-xl p-8 text-center text-gray-500">
            아직 배포 기록이 없습니다. git push main 하면 자동으로 배포됩니다.
          </div>
        ) : (
          <div className={`rounded-xl border p-6 ${STATUS_CONFIG[latest.status].bg} border-gray-700`}>
            {/* 상태 배지 */}
            <div className="flex items-center gap-3 mb-4">
              <span className="relative flex h-3 w-3">
                {isActive && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${STATUS_CONFIG[latest.status].dot}`} />}
                <span className={`relative inline-flex h-3 w-3 rounded-full ${STATUS_CONFIG[latest.status].dot}`} />
              </span>
              <span className={`text-lg font-semibold ${STATUS_CONFIG[latest.status].color}`}>
                {STATUS_CONFIG[latest.status].label}
              </span>
              <span className="text-gray-500 text-sm ml-auto">{timeAgo(latest.created_at)}</span>
            </div>

            {/* SHA + 브랜치 */}
            <div className="flex items-center gap-3 mb-4">
              <code className="bg-gray-800 px-2 py-1 rounded text-sm font-mono text-gray-300">
                {shortSha(latest.sha)}
              </code>
              <span className="text-gray-400 text-sm">{latest.branch}</span>
              {latest.triggered_by && (
                <span className="text-gray-500 text-sm">by {latest.triggered_by}</span>
              )}
            </div>

            {/* 현재 스텝 */}
            {latest.step && (
              <div className="text-sm text-gray-300 mb-5">
                {latest.status !== 'success' && latest.status !== 'failed' ? '⟳ ' : ''}
                {latest.step}
              </div>
            )}

            {/* 진행 단계 바 */}
            <div className="flex items-center gap-0 mb-2">
              {STEPS.map((s, i) => {
                const stepIdx = STEPS.indexOf(latest.status === 'failed' ? 'queued' : latest.status);
                const done = i < stepIdx || latest.status === 'success';
                const active = i === stepIdx && latest.status !== 'success' && latest.status !== 'failed';
                return (
                  <div key={s} className="flex items-center flex-1">
                    <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                      done ? 'bg-emerald-500' : active ? 'bg-amber-400' : 'bg-gray-700'
                    }`} />
                    {i < STEPS.length - 1 && <div className="w-2" />}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>대기</span><span>빌드</span><span>배포</span><span>완료</span>
            </div>

            {/* 경과 시간 */}
            <div className="mt-4 text-xs text-gray-500">
              {latest.status === 'success' || latest.status === 'failed'
                ? `소요 시간: ${elapsed(latest.created_at, latest.updated_at)}`
                : `경과: ${elapsed(latest.created_at)}`
              }
            </div>

            {/* 에러 메시지 */}
            {latest.status === 'failed' && latest.message && (
              <div className="mt-4 bg-red-900/40 border border-red-800 rounded-lg p-3 text-red-300 text-sm font-mono whitespace-pre-wrap">
                {latest.message}
              </div>
            )}
          </div>
        )}

        {/* 배포 히스토리 */}
        <div className="bg-gray-900 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 text-sm font-medium text-gray-300">
            배포 히스토리
          </div>
          <div className="divide-y divide-gray-800">
            {logs.length === 0 && (
              <div className="px-5 py-6 text-center text-gray-600 text-sm">기록 없음</div>
            )}
            {logs.map((log) => {
              const cfg = STATUS_CONFIG[log.status] ?? STATUS_CONFIG.failed;
              return (
                <div key={log.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-800/50 transition-colors">
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                  <code className="text-xs font-mono text-gray-400 w-16">{shortSha(log.sha)}</code>
                  <span className={`text-xs ${cfg.color} w-16`}>{cfg.label}</span>
                  <span className="text-xs text-gray-500 flex-1 truncate">{log.step ?? log.message ?? ''}</span>
                  <span className="text-xs text-gray-600 flex-shrink-0">{timeAgo(log.created_at)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 수동 배포 안내 */}
        <div className="bg-gray-900 rounded-xl p-5 text-sm text-gray-400">
          <div className="font-medium text-gray-300 mb-2">수동 배포</div>
          <code className="block bg-gray-800 rounded p-3 text-xs text-emerald-400 select-all">
            git push origin main
          </code>
          <p className="mt-2 text-xs">push 하면 GitHub Actions → NAS 직접 빌드 → 자동 재시작</p>
        </div>

      </div>
    </div>
  );
}
