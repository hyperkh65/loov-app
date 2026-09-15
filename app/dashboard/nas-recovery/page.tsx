'use client';

import { useState, useEffect } from 'react';

interface Status { loovStatus: string; latestBackup: string | null }
interface RunResult { ok: boolean; scope: string; stdout?: string; stderr?: string; error?: string; backupUsed?: string }

export default function NasRecoveryPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/nas-recovery');
      setStatus(await res.json());
    } catch { /* 상태 조회 실패는 조용히 무시 — 버튼은 계속 쓸 수 있음 */ }
  };

  useEffect(() => { loadStatus(); }, []);

  const run = async (scope: 'loov' | 'all') => {
    if (scope === 'all' && !confirm('hy64에 있는 컨테이너 58개 전체를 대상으로 복구를 시도합니다. 이미 떠있는 건 건드리지 않고, 꺼져있거나 사라진 것만 백업 시점 설정 그대로 재생성/재시작합니다. 계속할까요?')) {
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/nas-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      });
      setResult(await res.json());
    } catch (e) {
      setResult({ ok: false, scope, error: String(e) });
    } finally {
      setLoading(false);
      loadStatus();
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">NAS 복구 / 컨테이너 재시작</h1>
        <p className="text-sm text-gray-500 mt-1">
          정전 등으로 hy64 컨테이너가 죽었을 때 백업 시점 설정으로 되살립니다. 이미 떠있는 컨테이너는 건드리지 않습니다(멱등적 — 여러 번 눌러도 안전).
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">loov-app 상태</span>
          <span className={`font-mono px-2 py-0.5 rounded ${status?.loovStatus === 'running' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {status?.loovStatus ?? '조회 중...'}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm mt-2">
          <span className="text-gray-500">최신 백업</span>
          <span className="font-mono text-gray-800">{status?.latestBackup ?? '-'}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
        <div>
          <button
            onClick={() => run('loov')}
            disabled={loading}
            className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? '실행 중...' : 'LOOV만 재시작 (안전, 즉시)'}
          </button>
          <p className="text-xs text-gray-400 mt-1">loov-app 컨테이너만 대상 — 코드는 내장 볼륨, 데이터는 Supabase라 정전 영향 거의 없음</p>
        </div>

        <div>
          <button
            onClick={() => run('all')}
            disabled={loading}
            className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? '실행 중...' : '전체 나스 컨테이너 복구 (58개 대상)'}
          </button>
          <p className="text-xs text-gray-400 mt-1">tradeos/n8n 등 다른 서비스까지 포함 — 실행 전 확인창이 뜹니다</p>
        </div>
      </div>

      {result && (
        <div className={`bg-gray-900 rounded-2xl overflow-hidden shadow-xl border ${result.ok ? 'border-green-800' : 'border-red-800'}`}>
          <div className="px-4 py-2 border-b border-gray-800 text-xs text-gray-400 flex items-center justify-between">
            <span>{result.ok ? '✅ 완료' : '❌ 실패'} — scope: {result.scope}{result.backupUsed ? ` (backup: ${result.backupUsed})` : ''}</span>
          </div>
          <div className="p-4 font-mono text-xs text-gray-300 max-h-96 overflow-y-auto whitespace-pre-wrap">
            {result.error || result.stdout || result.stderr || '(출력 없음)'}
          </div>
        </div>
      )}
    </div>
  );
}
