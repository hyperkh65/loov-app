'use client';

import { useState, useEffect, useCallback } from 'react';

interface DiskInfo {
  size: string;
  used: string;
  avail: string;
  pct: string;
  mount: string;
}

interface FileItem {
  size: string;
  name: string;
}

interface LatestDetail {
  timestamp: string;
  dbSize: string;
  webSize: string;
  files: FileItem[];
}

interface BackupData {
  nas: { backups: string[]; disk: DiskInfo | null };
  usb: { backups: string[]; disk: DiskInfo | null };
  latestDetail: LatestDetail | null;
  latestLog: string;
}

function formatTimestamp(ts: string): string {
  // 2026-03-19_023000 → 2026-03-19 02:30:00
  return ts.replace('_', ' ').replace(/(\d{2})(\d{2})(\d{2})$/, '$1:$2:$3');
}

function DiskBar({ disk, label, icon }: { disk: DiskInfo | null; label: string; icon: string }) {
  if (!disk) return null;
  const pct = parseInt(disk.pct);
  const color = pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-yellow-500' : 'bg-emerald-500';
  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{icon}</span>
        <span className="font-semibold text-white">{label}</span>
        <span className="text-xs text-slate-400 ml-auto">{disk.mount}</span>
      </div>
      <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: disk.pct }} />
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>사용: {disk.used}</span>
        <span>여유: {disk.avail}</span>
        <span>전체: {disk.size}</span>
      </div>
    </div>
  );
}

function BackupList({ backups, label, icon, color }: {
  backups: string[];
  label: string;
  icon: string;
  color: string;
}) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{icon}</span>
        <span className="font-semibold text-white">{label}</span>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${color}`}>
          {backups.length}개 보관중
        </span>
      </div>
      {backups.length === 0 ? (
        <div className="text-slate-500 text-sm text-center py-4">백업 없음</div>
      ) : (
        <div className="space-y-2">
          {backups.map((ts, i) => (
            <div key={ts} className={`flex items-center gap-3 p-2 rounded-lg ${i === 0 ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-slate-700/50'}`}>
              <span className="text-lg">{i === 0 ? '✅' : '📦'}</span>
              <div>
                <div className="text-sm text-white font-mono">{formatTimestamp(ts)}</div>
                {i === 0 && <div className="text-xs text-emerald-400">최신 백업</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BackupPage() {
  const [data, setData] = useState<BackupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [backing, setBacking] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/nas/backup');
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류 발생');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBackup = async () => {
    if (!confirm('지금 바로 백업을 실행할까요?\n(DB + 웹파일 전체, 수 분 소요)')) return;
    setBacking(true);
    try {
      const res = await fetch('/api/nas/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'backup' }),
      });
      const json = await res.json();
      if (json.ok) {
        alert('백업이 시작됐어요. 완료까지 수 분 소요됩니다.');
        setTimeout(() => fetchData(), 5000);
      }
    } finally {
      setBacking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">💾 백업 관리</h1>
            <p className="text-sm text-slate-400 mt-1">시놀로지 NAS + 외장하드 백업 현황</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? '⏳ 조회중...' : '🔄 새로고침'}
            </button>
            <button
              onClick={handleBackup}
              disabled={backing}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
            >
              {backing ? '⏳ 실행중...' : '▶ 지금 백업'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm">
            ❌ {error}
          </div>
        )}

        {loading && !data && (
          <div className="text-center py-20 text-slate-400">
            <div className="text-4xl mb-3">💾</div>
            <div>NAS에서 백업 정보를 가져오는 중...</div>
          </div>
        )}

        {data && (
          <>
            {/* 스케줄 정보 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: '백업 주기', value: '매일 02:30', icon: '🕑' },
                { label: 'NAS 보관', value: `${data.nas.backups.length} / 5개`, icon: '🖥️' },
                { label: 'USB 보관', value: `${data.usb.backups.length} / 5개`, icon: '💿' },
                { label: '백업 내용', value: 'DB + 웹파일', icon: '📦' },
              ].map(s => (
                <div key={s.label} className="bg-slate-800 border border-slate-700 rounded-xl p-3 text-center">
                  <div className="text-2xl mb-1">{s.icon}</div>
                  <div className="text-sm font-semibold text-white">{s.value}</div>
                  <div className="text-xs text-slate-400">{s.label}</div>
                </div>
              ))}
            </div>

            {/* 디스크 사용량 */}
            <div className="grid md:grid-cols-2 gap-4">
              <DiskBar disk={data.nas.disk} label="시놀로지 NAS (volume1)" icon="🖥️" />
              <DiskBar disk={data.usb.disk} label="외장하드 (USB)" icon="💿" />
            </div>

            {/* 최신 백업 상세 */}
            {data.latestDetail && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">📊</span>
                  <span className="font-semibold text-white">최신 백업 상세</span>
                  <span className="ml-auto text-xs font-mono text-slate-400">
                    {formatTimestamp(data.latestDetail.timestamp)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-blue-400">{data.latestDetail.dbSize || '-'}</div>
                    <div className="text-xs text-slate-400">DB 백업 크기</div>
                  </div>
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-purple-400">{data.latestDetail.webSize || '-'}</div>
                    <div className="text-xs text-slate-400">웹파일 크기</div>
                  </div>
                </div>
                {data.latestDetail.files.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {data.latestDetail.files.map((f, i) => (
                      <div key={i} className="flex justify-between text-xs text-slate-400 font-mono px-2 py-1 hover:bg-slate-700 rounded">
                        <span>{f.name}</span>
                        <span className="text-slate-300">{f.size}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 백업 목록 */}
            <div className="grid md:grid-cols-2 gap-4">
              <BackupList
                backups={data.nas.backups}
                label="시놀로지 NAS"
                icon="🖥️"
                color="bg-blue-500/20 text-blue-300"
              />
              <BackupList
                backups={data.usb.backups}
                label="외장하드 (USB)"
                icon="💿"
                color="bg-emerald-500/20 text-emerald-300"
              />
            </div>

            {/* 최신 로그 */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowLog(!showLog)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-700 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span>📋</span>
                  <span className="font-semibold">최근 백업 로그</span>
                </div>
                <span className="text-slate-400">{showLog ? '▲' : '▼'}</span>
              </button>
              {showLog && (
                <pre className="p-4 text-xs text-slate-300 font-mono bg-slate-900/50 max-h-64 overflow-y-auto whitespace-pre-wrap border-t border-slate-700">
                  {data.latestLog || '로그 없음'}
                </pre>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
