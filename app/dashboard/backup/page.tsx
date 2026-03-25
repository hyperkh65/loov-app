'use client';

import { useState, useEffect, useCallback } from 'react';

interface DiskInfo { size: string; used: string; avail: string; pct: string; }
interface FileItem { size: string; name: string; }
interface DbDetail { timestamp: string; totalSize: string; files: FileItem[]; }
interface WebStatus { lastSync: string | null; size: string; }
interface UsbStatus { web: WebStatus; db: string[]; }

interface NasData {
  db: { backups: string[]; latestDetail: DbDetail | null };
  web: WebStatus;
  webPkg?: WebStatus | null;
  usb?: UsbStatus | null;
  disk: DiskInfo | null;
  usbDisk?: DiskInfo | null;
  latestLog: string;
  schedule: string;
}

interface BackupData {
  hy64: NasData;
  days2: NasData;
}

function formatTs(ts: string) {
  return ts.replace('_', ' ').replace(/(\d{2})(\d{2})(\d{2})$/, '$1:$2:$3');
}

function DiskBar({ disk, label, icon }: { disk: DiskInfo | null; label: string; icon: string }) {
  if (!disk) return <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 text-slate-500 text-sm">디스크 정보 없음</div>;
  const pct = parseInt(disk.pct);
  const color = pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-yellow-500' : 'bg-emerald-500';
  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{icon}</span>
        <span className="font-semibold text-white text-sm">{label}</span>
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

function DbList({ backups, latestDetail }: { backups: string[]; latestDetail: DbDetail | null }) {
  const [showFiles, setShowFiles] = useState(false);
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span>🗄️</span>
        <span className="font-semibold text-white">DB 백업</span>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">{backups.length} / 5개</span>
      </div>
      {backups.length === 0 ? (
        <div className="text-slate-500 text-sm text-center py-3">백업 없음</div>
      ) : (
        <div className="space-y-1.5">
          {backups.map((ts, i) => (
            <div key={ts} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${i === 0 ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-slate-700/50'}`}>
              <span>{i === 0 ? '✅' : '📦'}</span>
              <span className="font-mono">{formatTs(ts)}</span>
              {i === 0 && latestDetail && <span className="ml-auto text-slate-400">{latestDetail.totalSize}</span>}
            </div>
          ))}
        </div>
      )}
      {latestDetail && latestDetail.files.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-700">
          <button onClick={() => setShowFiles(!showFiles)} className="text-xs text-indigo-400 hover:text-indigo-300">
            {showFiles ? '▲ 접기' : `▼ DB 목록 (${latestDetail.files.length}개)`}
          </button>
          {showFiles && (
            <div className="mt-2 max-h-40 overflow-y-auto space-y-0.5">
              {latestDetail.files.map((f, i) => (
                <div key={i} className="flex justify-between text-xs font-mono px-2 py-0.5 hover:bg-slate-700 rounded text-slate-400">
                  <span>{f.name}</span><span>{f.size}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WebMirror({ web, label, webPkg }: { web: WebStatus; label: string; webPkg?: WebStatus | null }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span>📁</span>
        <span className="font-semibold text-white">웹파일 미러 (rsync 증분)</span>
      </div>
      <div className="space-y-2">
        <div className={`rounded-lg p-3 border ${web.lastSync ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-slate-700 border-slate-600'}`}>
          <div className="text-xs font-semibold text-white">📂 {label}/web</div>
          {web.lastSync ? (
            <div className="flex justify-between mt-1">
              <span className="text-xs text-emerald-300 font-mono">{web.lastSync}</span>
              <span className="text-sm font-bold text-white">{web.size}</span>
            </div>
          ) : <div className="text-xs text-slate-500 mt-1">미동기화 (첫 실행 필요)</div>}
        </div>
        {webPkg && (
          <div className={`rounded-lg p-3 border ${webPkg.lastSync ? 'bg-purple-500/10 border-purple-500/20' : 'bg-slate-700 border-slate-600'}`}>
            <div className="text-xs font-semibold text-white">📂 web_packages/wordpress</div>
            {webPkg.lastSync ? (
              <div className="flex justify-between mt-1">
                <span className="text-xs text-purple-300 font-mono">{webPkg.lastSync}</span>
                <span className="text-sm font-bold text-white">{webPkg.size}</span>
              </div>
            ) : <div className="text-xs text-slate-500 mt-1">미동기화</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function NasPanel({ data, nasName }: {
  data: NasData; nasName: string;
}) {
  const [showLog, setShowLog] = useState(false);
  return (
    <div className="space-y-4">

      {/* 디스크 */}
      <div className={`grid gap-3 ${data.usbDisk !== undefined ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <DiskBar disk={data.disk} label={`${nasName} (volume1)`} icon="🖥️" />
        {data.usbDisk !== undefined && <DiskBar disk={data.usbDisk ?? null} label="외장하드 (USB)" icon="💿" />}
      </div>

      {/* DB + 웹 */}
      <div className="grid md:grid-cols-2 gap-4">
        <DbList backups={data.db.backups} latestDetail={data.db.latestDetail} />
        <WebMirror web={data.web} label={nasName} webPkg={data.webPkg} />
      </div>

      {/* USB (hy64만) */}
      {data.usb && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span>💿</span>
            <span className="font-semibold text-white">외장하드 (USB) 백업</span>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
              DB {data.usb.db.length} / 5개
            </span>
          </div>
          <div className="space-y-1.5">
            {data.usb.db.length === 0 ? (
              <div className="text-slate-500 text-sm text-center py-2">USB DB 백업 없음</div>
            ) : data.usb.db.map((ts, i) => (
              <div key={ts} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${i === 0 ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-slate-700/50'}`}>
                <span>{i === 0 ? '✅' : '📦'}</span>
                <span className="font-mono">{formatTs(ts)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            웹파일: {data.usb.web.lastSync ? `${data.usb.web.lastSync} (${data.usb.web.size})` : '미동기화'}
          </div>
        </div>
      )}

      {/* 로그 */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <button onClick={() => setShowLog(!showLog)}
          className="w-full flex items-center justify-between p-4 hover:bg-slate-700 transition-colors text-sm">
          <div className="flex items-center gap-2"><span>📋</span><span className="font-semibold">최근 백업 로그</span></div>
          <span className="text-slate-400">{showLog ? '▲' : '▼'}</span>
        </button>
        {showLog && (
          <pre className="p-4 text-xs text-slate-300 font-mono bg-slate-900/50 max-h-56 overflow-y-auto whitespace-pre-wrap border-t border-slate-700">
            {data.latestLog || '로그 없음'}
          </pre>
        )}
      </div>
    </div>
  );
}

export default function BackupPage() {
  const [data, setData] = useState<BackupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'hy64' | '2days'>('hy64');
  const [error, setError] = useState('');
  const [backing, setBacking] = useState<Record<string, boolean>>({});
  const [backupMsg, setBackupMsg] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/nas/backup');
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류 발생');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBackup = async (target: string, label: string) => {
    if (!confirm(`${label} 백업을 지금 실행할까요?`)) return;
    setBacking(p => ({ ...p, [target]: true }));
    setBackupMsg(p => ({ ...p, [target]: '' }));
    try {
      const res = await fetch('/api/nas/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'backup', target }),
      });
      const json = await res.json();
      if (json.ok) {
        setBackupMsg(p => ({ ...p, [target]: '✅ 백업 시작됨! (완료까지 수분 소요)' }));
        setTimeout(fetchData, 12000);
      } else {
        setBackupMsg(p => ({ ...p, [target]: `❌ ${json.error || '실패'}` }));
      }
    } catch (e) {
      setBackupMsg(p => ({ ...p, [target]: `❌ ${String(e)}` }));
    } finally {
      setBacking(p => ({ ...p, [target]: false }));
    }
  };

  const NAS_LIST = [
    { target: 'hy64',  label: 'hy64',  desc: 'hy64.synology.me', icon: '🖥️' },
    { target: '2days', label: 'hy65',  desc: '2days.kr',          icon: '🖥️' },
  ];

  const tabs = [
    { key: 'hy64',  label: 'hy64',  icon: '🖥️' },
    { key: '2days', label: 'hy65',  icon: '🖥️' },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">💾 백업 관리</h1>
            <p className="text-sm text-slate-400 mt-1">수동 백업 — 버튼을 눌러 즉시 실행</p>
          </div>
          <button onClick={fetchData} disabled={loading}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors">
            {loading ? '⏳' : '🔄'} 새로고침
          </button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm">❌ {error}</div>}

        {/* ── 수동 백업 버튼 ── */}
        <div className="grid grid-cols-2 gap-4">
          {NAS_LIST.map(({ target, label, desc, icon }) => (
            <div key={target} className="bg-slate-800 border border-slate-700 rounded-2xl p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{icon}</span>
                <div>
                  <div className="font-bold text-white text-lg">{label}</div>
                  <div className="text-xs text-slate-400">{desc}</div>
                </div>
              </div>
              <button
                onClick={() => handleBackup(target, label)}
                disabled={backing[target]}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
                {backing[target]
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />백업 중...</>
                  : '💾 지금 백업'}
              </button>
              {backupMsg[target] && (
                <p className="text-xs text-center text-slate-300">{backupMsg[target]}</p>
              )}
            </div>
          ))}
        </div>

        {/* 탭 — 상세 현황 */}
        <div className="flex gap-2 bg-slate-800 p-1 rounded-xl border border-slate-700">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              {t.icon} {t.label} 상세보기
            </button>
          ))}
        </div>

        {loading && !data && (
          <div className="text-center py-16 text-slate-400">
            <div className="text-4xl mb-3">💾</div>
            <div>NAS 백업 정보 조회중...</div>
          </div>
        )}

        {data && tab === 'hy64' && <NasPanel data={data.hy64} nasName="hy64" />}
        {data && tab === '2days' && <NasPanel data={data.days2} nasName="hy65" />}
      </div>
    </div>
  );
}
