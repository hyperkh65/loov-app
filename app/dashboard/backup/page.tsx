'use client';

import { useState, useEffect, useCallback } from 'react';

interface DiskInfo { size: string; used: string; avail: string; pct: string; mount: string; }
interface FileItem { size: string; name: string; }
interface DbDetail { timestamp: string; totalSize: string; files: FileItem[]; }
interface WebStatus { lastSync: string | null; size: string; }

interface BackupData {
  db: {
    nas: string[];
    usb: string[];
    latestDetail: DbDetail | null;
  };
  web: {
    nas: WebStatus;
    usb: WebStatus;
  };
  disk: {
    nas: DiskInfo | null;
    usb: DiskInfo | null;
  };
  latestLog: string;
}

function formatTs(ts: string) {
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
        <span className="text-xs text-slate-400 ml-auto">{disk.pct} 사용</span>
      </div>
      <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
        <div className={`${color} h-2 rounded-full`} style={{ width: disk.pct }} />
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>사용 {disk.used}</span>
        <span>여유 {disk.avail}</span>
        <span>전체 {disk.size}</span>
      </div>
    </div>
  );
}

export default function BackupPage() {
  const [data, setData] = useState<BackupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [backing, setBacking] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
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
    if (!confirm('지금 바로 백업을 실행할까요?\n(DB 전체 덤프 + 웹파일 증분 rsync)')) return;
    setBacking(true);
    try {
      const res = await fetch('/api/nas/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'backup' }),
      });
      const json = await res.json();
      if (json.ok) {
        alert('백업이 시작됐어요!\n완료까지 수 분~수십 분 소요됩니다 (웹파일 첫 실행 시 수백 GB).');
        setTimeout(() => fetchData(), 10000);
      }
    } finally {
      setBacking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">💾 백업 관리</h1>
            <p className="text-sm text-slate-400 mt-1">시놀로지 NAS + 외장하드 자동 백업</p>
          </div>
          <div className="flex gap-2">
            <button onClick={fetchData} disabled={loading}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors">
              {loading ? '⏳' : '🔄'} 새로고침
            </button>
            <button onClick={handleBackup} disabled={backing}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors">
              {backing ? '⏳ 실행중...' : '▶ 지금 백업'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm">❌ {error}</div>
        )}

        {/* 백업 전략 설명 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { icon: '🗄️', title: 'DB 백업', desc: '매일 02:30 전체 덤프', sub: '5개 보관 (NAS + USB)' },
            { icon: '📁', title: '웹파일 백업', desc: '첫 회 전체 → 이후 증분', sub: 'rsync 변경파일만' },
            { icon: '💿', title: 'USB 동기화', desc: '백업 후 자동 미러링', sub: '외장하드 항상 최신 유지' },
          ].map(s => (
            <div key={s.title} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="text-2xl mb-2">{s.icon}</div>
              <div className="font-semibold text-white">{s.title}</div>
              <div className="text-sm text-slate-300 mt-1">{s.desc}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>

        {loading && !data && (
          <div className="text-center py-16 text-slate-400">
            <div className="text-4xl mb-3">💾</div>
            <div>NAS 백업 정보 조회중...</div>
          </div>
        )}

        {data && (
          <>
            {/* 디스크 사용량 */}
            <div className="grid md:grid-cols-2 gap-4">
              <DiskBar disk={data.disk.nas} label="시놀로지 NAS" icon="🖥️" />
              <DiskBar disk={data.disk.usb} label="외장하드 (USB)" icon="💿" />
            </div>

            {/* 웹파일 미러 상태 */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">📁</span>
                <span className="font-semibold text-white">웹파일 미러 (rsync 증분)</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: '🖥️ NAS', info: data.web.nas },
                  { label: '💿 USB', info: data.web.usb },
                ].map(({ label, info }) => (
                  <div key={label} className={`rounded-lg p-3 border ${info.lastSync ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-slate-700 border-slate-600'}`}>
                    <div className="text-sm font-semibold text-white">{label}</div>
                    {info.lastSync ? (
                      <>
                        <div className="text-xs text-slate-400 mt-1">최종 동기화</div>
                        <div className="text-xs text-emerald-300 font-mono">{info.lastSync}</div>
                        <div className="text-sm font-bold text-white mt-1">{info.size}</div>
                      </>
                    ) : (
                      <div className="text-xs text-slate-500 mt-1">미동기화 (첫 실행 필요)</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* DB 백업 현황 */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">🗄️</span>
                <span className="font-semibold text-white">DB 백업 목록</span>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  { label: '🖥️ NAS', backups: data.db.nas, color: 'bg-blue-500/20 text-blue-300' },
                  { label: '💿 USB', backups: data.db.usb, color: 'bg-emerald-500/20 text-emerald-300' },
                ].map(({ label, backups, color }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-300">{label}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${color}`}>{backups.length} / 5개</span>
                    </div>
                    {backups.length === 0 ? (
                      <div className="text-xs text-slate-500 text-center py-4">백업 없음</div>
                    ) : (
                      <div className="space-y-1.5">
                        {backups.map((ts, i) => (
                          <div key={ts} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${i === 0 ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-slate-700/50'}`}>
                            <span>{i === 0 ? '✅' : '📦'}</span>
                            <span className="font-mono text-xs">{formatTs(ts)}</span>
                            {i === 0 && <span className="ml-auto text-xs text-emerald-400">최신</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 최신 DB 상세 */}
              {data.db.latestDetail && (
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-400">최신 DB 백업 내용 ({data.db.latestDetail.totalSize})</span>
                    <button onClick={() => setShowFiles(!showFiles)} className="text-xs text-indigo-400 hover:text-indigo-300">
                      {showFiles ? '▲ 접기' : '▼ 파일 목록'}
                    </button>
                  </div>
                  {showFiles && (
                    <div className="max-h-48 overflow-y-auto space-y-0.5">
                      {data.db.latestDetail.files.map((f, i) => (
                        <div key={i} className="flex justify-between text-xs font-mono px-2 py-1 hover:bg-slate-700 rounded text-slate-400">
                          <span>{f.name}</span>
                          <span className="text-slate-300">{f.size}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 최근 로그 */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
              <button onClick={() => setShowLog(!showLog)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-700 transition-colors">
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
