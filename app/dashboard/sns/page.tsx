'use client';

import { useState, useEffect } from 'react';
import { PLATFORMS, Platform } from '@/lib/sns/platforms';
import { supabase } from '@/lib/supabase';

type Tab = 'connections' | 'templates' | 'post' | 'logs';

interface Connection {
  platform: string;
  platform_username: string;
  platform_display_name: string;
  platform_avatar: string | null;
  is_active: boolean;
  updated_at: string;
}

interface Template {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

interface Log {
  id: string;
  platform: string;
  status: 'success' | 'failed';
  posted_at: string;
  error_message: string | null;
  sns_post_templates: { title: string } | null;
}

const PLATFORM_INFO: Record<string, { label: string; icon: string; color: string }> = {
  twitter: { label: '트위터/X', icon: '🐦', color: 'from-blue-400 to-blue-600' },
  threads: { label: '스레드', icon: '🧵', color: 'from-gray-700 to-black' },
  facebook: { label: '페이스북', icon: '📘', color: 'from-blue-500 to-blue-700' },
};

export default function SNSPage() {
  const [tab, setTab] = useState<Tab>('connections');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // 즉시 발행 상태
  const [postTemplateId, setPostTemplateId] = useState('');
  const [postPlatforms, setPostPlatforms] = useState<Platform[]>([]);
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<{ platform: string; success: boolean; error?: string }[] | null>(null);

  // 템플릿 작성 상태
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    const [connRes, tplRes, logRes] = await Promise.all([
      fetch('/api/sns/connections'),
      fetch('/api/sns/templates'),
      fetch('/api/sns/logs'),
    ]);
    if (connRes.ok) setConnections(await connRes.json());
    if (tplRes.ok) setTemplates(await tplRes.json());
    if (logRes.ok) setLogs(await logRes.json());
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    // URL 파라미터로 연결 결과 확인
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const err = params.get('error');
    if (connected || err) {
      if (err) setUrlError(decodeURIComponent(err));
      window.history.replaceState({}, '', '/dashboard/sns');
    }
  }, []);

  const disconnect = async (platform: string) => {
    if (!confirm(`${PLATFORM_INFO[platform]?.label} 연결을 해제하시겠습니까?`)) return;
    await fetch('/api/sns/connections', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform }) });
    loadAll();
  };

  const togglePlatform = (p: Platform) => {
    setPostPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  };

  const postNow = async () => {
    if (!postTemplateId || !postPlatforms.length) return;
    setPosting(true);
    setPostResult(null);
    const res = await fetch('/api/sns/post-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: postTemplateId, platforms: postPlatforms }),
    });
    const data = await res.json();
    setPostResult(data.results);
    setPosting(false);
    loadAll();
  };

  const saveTemplate = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setSavingTemplate(true);
    await fetch('/api/sns/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, content: newContent }),
    });
    setNewTitle('');
    setNewContent('');
    setSavingTemplate(false);
    loadAll();
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('템플릿을 삭제하시겠습니까?')) return;
    await fetch('/api/sns/templates', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    loadAll();
  };

  const getConnection = (platform: string) => connections.find((c) => c.platform === platform);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'connections', label: '연결 관리' },
    { key: 'templates', label: '템플릿' },
    { key: 'post', label: '즉시 발행' },
    { key: 'logs', label: '발행 로그' },
  ];

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-gray-900">🌐 SNS 관리</h1>
            <p className="text-sm text-gray-400">소셜 미디어 실제 연동 및 자동 발행</p>
          </div>
          <div className="flex items-center gap-2">
            {connections.filter((c) => c.is_active).length > 0 && (
              <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full font-medium">
                {connections.filter((c) => c.is_active).length}개 연결됨
              </span>
            )}
          </div>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 mt-3">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="p-6">
        {urlError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <span className="text-red-500 text-lg flex-shrink-0">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-700">연결 실패</p>
              <p className="text-xs text-red-600 mt-0.5">{urlError}</p>
            </div>
            <button onClick={() => setUrlError(null)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12 text-gray-400 text-sm">불러오는 중...</div>
        )}

        {/* 연결 관리 탭 */}
        {!loading && tab === 'connections' && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              {(Object.keys(PLATFORMS) as Platform[]).map((platform) => {
                const conn = getConnection(platform);
                const info = PLATFORM_INFO[platform];
                return (
                  <div key={platform} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className={`h-1.5 bg-gradient-to-r ${info.color}`} />
                    <div className="p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${info.color} flex items-center justify-center text-xl`}>
                          {info.icon}
                        </div>
                        <div>
                          <div className="font-bold text-gray-800 text-sm">{info.label}</div>
                          <div className="flex items-center gap-1">
                            <div className={`w-1.5 h-1.5 rounded-full ${conn?.is_active ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                            <span className="text-xs text-gray-400">{conn?.is_active ? '연결됨' : '미연결'}</span>
                          </div>
                        </div>
                      </div>

                      {conn?.is_active ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2.5">
                            {conn.platform_avatar && (
                              <img src={conn.platform_avatar} alt="" className="w-8 h-8 rounded-full" />
                            )}
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-700 truncate">{conn.platform_display_name || conn.platform_username}</div>
                              <div className="text-xs text-gray-400 truncate">@{conn.platform_username}</div>
                            </div>
                          </div>
                          <button
                            onClick={() => disconnect(platform)}
                            className="w-full text-xs text-red-500 hover:text-red-600 border border-red-100 hover:border-red-200 rounded-xl py-2 transition-colors">
                            연결 해제
                          </button>
                        </div>
                      ) : (
                        <a
                          href={`/api/sns/connect/${platform}`}
                          className={`block w-full text-center bg-gradient-to-r ${info.color} text-white text-sm font-bold py-2.5 rounded-xl hover:opacity-90 transition-opacity`}>
                          {info.label} 연결하기
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 템플릿 탭 */}
        {!loading && tab === 'templates' && (
          <div className="space-y-6">
            {/* 새 템플릿 작성 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-4">새 템플릿 작성</h3>
              <div className="space-y-3">
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="템플릿 제목"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
                />
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="게시글 내용 (트위터 280자 제한 주의)"
                  rows={5}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{newContent.length}자</span>
                  <button
                    onClick={saveTemplate}
                    disabled={savingTemplate || !newTitle.trim() || !newContent.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-colors">
                    {savingTemplate ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>
            </div>

            {/* 템플릿 목록 */}
            <div className="space-y-3">
              {templates.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
                  아직 템플릿이 없습니다
                </div>
              ) : (
                templates.map((tpl) => (
                  <div key={tpl.id} className="bg-white rounded-2xl border border-gray-100 p-5">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="font-bold text-gray-800 text-sm">{tpl.title}</div>
                      <button onClick={() => deleteTemplate(tpl.id)} className="text-xs text-red-400 hover:text-red-500 flex-shrink-0">삭제</button>
                    </div>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{tpl.content}</p>
                    <div className="text-xs text-gray-400 mt-2">{new Date(tpl.created_at).toLocaleDateString('ko-KR')}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 즉시 발행 탭 */}
        {!loading && tab === 'post' && (
          <div className="max-w-lg space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-4">즉시 발행</h3>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-2 block">템플릿 선택</label>
                  <select
                    value={postTemplateId}
                    onChange={(e) => setPostTemplateId(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                    <option value="">템플릿을 선택하세요</option>
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>{tpl.title}</option>
                    ))}
                  </select>
                </div>

                {postTemplateId && (
                  <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600 whitespace-pre-wrap">
                    {templates.find((t) => t.id === postTemplateId)?.content}
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-2 block">발행 플랫폼</label>
                  <div className="flex gap-2">
                    {(Object.keys(PLATFORMS) as Platform[]).map((p) => {
                      const conn = getConnection(p);
                      const info = PLATFORM_INFO[p];
                      const selected = postPlatforms.includes(p);
                      return (
                        <button
                          key={p}
                          onClick={() => conn?.is_active && togglePlatform(p)}
                          disabled={!conn?.is_active}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                            !conn?.is_active
                              ? 'opacity-30 cursor-not-allowed border-gray-100 text-gray-400'
                              : selected
                              ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                              : 'border-gray-200 text-gray-600 hover:border-indigo-300'
                          }`}>
                          <span>{info.icon}</span>
                          <span>{info.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {connections.filter((c) => c.is_active).length === 0 && (
                    <p className="text-xs text-amber-600 mt-2">먼저 연결 관리 탭에서 SNS를 연결하세요</p>
                  )}
                </div>

                <button
                  onClick={postNow}
                  disabled={posting || !postTemplateId || !postPlatforms.length}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm transition-colors">
                  {posting ? '발행 중...' : '🚀 지금 발행'}
                </button>
              </div>
            </div>

            {postResult && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h4 className="font-bold text-gray-900 mb-3">발행 결과</h4>
                <div className="space-y-2">
                  {postResult.map((r) => (
                    <div key={r.platform} className="flex items-center gap-3">
                      <span>{PLATFORM_INFO[r.platform]?.icon}</span>
                      <span className="text-sm font-medium text-gray-700">{PLATFORM_INFO[r.platform]?.label}</span>
                      {r.success ? (
                        <span className="ml-auto text-xs text-emerald-600 font-medium">✓ 성공</span>
                      ) : (
                        <span className="ml-auto text-xs text-red-500">{r.error || '실패'}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 발행 로그 탭 */}
        {!loading && tab === 'logs' && (
          <div className="space-y-2">
            {logs.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
                발행 기록이 없습니다
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3">
                  <span className="text-lg flex-shrink-0">{PLATFORM_INFO[log.platform]?.icon || '🌐'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-700 truncate">
                      {log.sns_post_templates?.title || '알 수 없는 템플릿'}
                    </div>
                    <div className="text-xs text-gray-400">
                      {PLATFORM_INFO[log.platform]?.label} · {new Date(log.posted_at).toLocaleString('ko-KR')}
                    </div>
                    {log.error_message && (
                      <div className="text-xs text-red-400 mt-0.5">{log.error_message}</div>
                    )}
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${
                    log.status === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                  }`}>
                    {log.status === 'success' ? '성공' : '실패'}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
