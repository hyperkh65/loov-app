'use client';

import { useState, useEffect, useCallback } from 'react';

interface Workflow {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  totalRuns: number;
  lastStatus: string | null;
  lastRun: string | null;
}

interface Execution {
  id: string;
  mode: string;
  status: string;
  startedAt: string;
  stoppedAt: string;
  durationSec: number;
}

const statusColor: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
  running: 'bg-blue-100 text-blue-700',
  waiting: 'bg-yellow-100 text-yellow-700',
  crashed: 'bg-red-100 text-red-800',
};

const statusIcon: Record<string, string> = {
  success: '✅',
  error: '❌',
  running: '⏳',
  waiting: '⏸',
  crashed: '💥',
};

function formatTime(iso: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function formatDuration(sec: number) {
  if (!sec || isNaN(sec)) return '-';
  if (sec < 60) return `${Math.round(sec)}초`;
  return `${Math.floor(sec / 60)}분 ${Math.round(sec % 60)}초`;
}

export default function AutomationPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [execLoading, setExecLoading] = useState(false);
  const [execOutput, setExecOutput] = useState<{ stdout: string; stderr: string } | null>(null);

  const loadWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/n8n/workflows');
      const data = await res.json();
      setWorkflows(data.workflows || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  async function loadExecutions(id: string) {
    setSelectedId(id);
    setExecLoading(true);
    setExecOutput(null);
    try {
      const res = await fetch(`/api/n8n/workflows/${id}/executions`);
      const data = await res.json();
      setExecutions(data.executions || []);
    } finally {
      setExecLoading(false);
    }
  }

  async function toggleWorkflow(id: string, currentActive: boolean) {
    setToggling(id);
    try {
      const res = await fetch(`/api/n8n/workflows/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive }),
      });
      const data = await res.json();
      if (data.ok) {
        setWorkflows(prev =>
          prev.map(w => w.id === id ? { ...w, active: data.workflow.active } : w)
        );
      }
    } finally {
      setToggling(null);
    }
  }

  async function executeWorkflow(id: string, name: string) {
    if (!confirm(`"${name}" 워크플로우를 지금 실행하시겠습니까?`)) return;
    setExecuting(id);
    setExecOutput(null);
    try {
      const res = await fetch(`/api/n8n/workflows/${id}/execute`, { method: 'POST' });
      const data = await res.json();
      setExecOutput({ stdout: data.stdout || '', stderr: data.stderr || '' });
      // 실행 후 목록 새로고침
      setTimeout(loadWorkflows, 2000);
      if (selectedId === id) setTimeout(() => loadExecutions(id), 2000);
    } finally {
      setExecuting(null);
    }
  }

  const activeCount = workflows.filter(w => w.active).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              ⚙️ n8n 자동화 관리
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">NAS 워크플로우 on/off · 수동 실행 · 실행 이력</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              <span className="font-semibold text-green-600">{activeCount}</span>/{workflows.length} 활성
            </span>
            <button
              onClick={loadWorkflows}
              disabled={loading}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium transition-colors disabled:opacity-50"
            >
              {loading ? '로딩...' : '🔄 새로고침'}
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 flex gap-6">
        {/* 워크플로우 목록 */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-gray-400">
              <div className="text-center">
                <div className="text-3xl mb-2">⏳</div>
                <p>NAS에서 워크플로우 로딩 중...</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {workflows.map(wf => (
                <div
                  key={wf.id}
                  className={`bg-white rounded-xl border transition-all ${
                    selectedId === wf.id ? 'border-indigo-400 shadow-md' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      {/* ON/OFF 토글 */}
                      <button
                        onClick={() => toggleWorkflow(wf.id, wf.active)}
                        disabled={toggling === wf.id}
                        className="mt-0.5 flex-shrink-0"
                        title={wf.active ? '클릭하여 비활성화' : '클릭하여 활성화'}
                      >
                        {toggling === wf.id ? (
                          <span className="text-xl">⏳</span>
                        ) : (
                          <div className={`w-11 h-6 rounded-full transition-colors relative ${wf.active ? 'bg-green-500' : 'bg-gray-300'}`}>
                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${wf.active ? 'left-6' : 'left-1'}`} />
                          </div>
                        )}
                      </button>

                      {/* 이름 + 상태 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 truncate">{wf.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${wf.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {wf.active ? '● 실행중' : '○ 정지'}
                          </span>
                          {wf.lastStatus && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[wf.lastStatus] || 'bg-gray-100 text-gray-500'}`}>
                              {statusIcon[wf.lastStatus] || '?'} {wf.lastStatus}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                          <span>ID: <code className="bg-gray-100 px-1 rounded">{wf.id}</code></span>
                          <span>총 {wf.totalRuns}회 실행</span>
                          {wf.lastRun && <span>마지막 실행: {formatTime(wf.lastRun)}</span>}
                        </div>
                      </div>

                      {/* 액션 버튼 */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => loadExecutions(wf.id)}
                          className="px-3 py-1.5 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-medium transition-colors"
                        >
                          📋 이력
                        </button>
                        <button
                          onClick={() => executeWorkflow(wf.id, wf.name)}
                          disabled={executing === wf.id}
                          className="px-3 py-1.5 text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          {executing === wf.id ? '⏳ 실행중...' : '▶ 지금 실행'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {workflows.length === 0 && !loading && (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
                  <div className="text-4xl mb-3">🤖</div>
                  <p className="font-medium">워크플로우가 없습니다</p>
                  <p className="text-sm mt-1">NAS n8n에 워크플로우를 먼저 추가하세요</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 사이드 패널: 실행 이력 */}
        <div className="w-80 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden sticky top-6">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h3 className="font-semibold text-gray-700 text-sm">
                {selectedId
                  ? `📋 ${workflows.find(w => w.id === selectedId)?.name || selectedId} 이력`
                  : '📋 실행 이력'}
              </h3>
            </div>

            {!selectedId && (
              <div className="p-6 text-center text-gray-400 text-sm">
                왼쪽에서 워크플로우를 선택하면 실행 이력이 표시됩니다
              </div>
            )}

            {execOutput && (
              <div className="p-3 border-b border-gray-100">
                <div className="text-xs font-semibold text-gray-600 mb-1">최근 실행 결과</div>
                {execOutput.stdout && (
                  <pre className="text-xs bg-gray-50 rounded p-2 overflow-auto max-h-32 text-gray-700 whitespace-pre-wrap">
                    {execOutput.stdout.slice(-800)}
                  </pre>
                )}
                {execOutput.stderr && (
                  <pre className="text-xs bg-red-50 rounded p-2 overflow-auto max-h-20 text-red-600 mt-1 whitespace-pre-wrap">
                    {execOutput.stderr.slice(-400)}
                  </pre>
                )}
              </div>
            )}

            {execLoading && (
              <div className="p-6 text-center text-gray-400 text-sm">⏳ 로딩 중...</div>
            )}

            {!execLoading && selectedId && (
              <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
                {executions.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">실행 이력이 없습니다</div>
                ) : (
                  executions.map(ex => (
                    <div key={ex.id} className="px-4 py-3 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[ex.status] || 'bg-gray-100 text-gray-500'}`}>
                          {statusIcon[ex.status] || '?'} {ex.status}
                        </span>
                        <span className="text-xs text-gray-400">{formatDuration(ex.durationSec)}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                        <span>{formatTime(ex.startedAt)}</span>
                        <span className="text-gray-300">·</span>
                        <span className="text-gray-400">{ex.mode}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
