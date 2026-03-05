'use client';

import { useState, useEffect, useRef } from 'react';
import { PLATFORMS, Platform } from '@/lib/sns/platforms';

type Tab = 'connections' | 'compose' | 'templates' | 'comments' | 'logs';

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
  media_urls?: string[];
  created_at: string;
}

interface Log {
  id: string;
  platform: string;
  platform_post_id: string | null;
  status: 'success' | 'failed';
  posted_at: string;
  error_message: string | null;
  media_urls?: string[];
  sns_post_templates: { title: string } | null;
}

interface MediaItem {
  url: string;
  type: string;
  name: string;
  isVideo: boolean;
}

interface Comment {
  id: string;
  authorName: string;
  authorHandle: string;
  authorAvatar?: string;
  content: string;
  createdAt: string;
  mediaUrls?: string[];
}

const PLATFORM_INFO: Record<string, { label: string; icon: string; color: string }> = {
  twitter:   { label: '트위터/X',   icon: '🐦', color: 'from-blue-400 to-blue-600' },
  threads:   { label: '스레드',     icon: '🧵', color: 'from-gray-700 to-black' },
  facebook:  { label: '페이스북',   icon: '📘', color: 'from-blue-500 to-blue-700' },
  instagram: { label: '인스타그램', icon: '📸', color: 'from-pink-500 to-orange-400' },
  linkedin:  { label: '링크드인',   icon: '💼', color: 'from-blue-600 to-blue-800' },
};

const COMMENT_PLATFORMS = ['twitter', 'facebook', 'instagram'];

export default function SNSPage() {
  const [tab, setTab] = useState<Tab>('connections');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // ── 게시물 작성 ───────────────────────────────────────
  const [composeContent, setComposeContent] = useState('');
  const [composeMedia, setComposeMedia] = useState<MediaItem[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [composePlatforms, setComposePlatforms] = useState<Platform[]>([]);
  const [composing, setComposing] = useState(false);
  const [composeResult, setComposeResult] = useState<{ platform: string; success: boolean; error?: string }[] | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 템플릿 ───────────────────────────────────────────
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // ── 댓글 관리 ─────────────────────────────────────────
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyMedia, setReplyMedia] = useState<MediaItem[]>([]);
  const [sendingReply, setSendingReply] = useState(false);
  const replyFileRef = useRef<HTMLInputElement>(null);

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
    const params = new URLSearchParams(window.location.search);
    if (params.get('error')) setUrlError(decodeURIComponent(params.get('error')!));
    if (params.get('connected') || params.get('error')) window.history.replaceState({}, '', '/dashboard/sns');
  }, []);

  const disconnect = async (platform: string) => {
    if (!confirm(`${PLATFORM_INFO[platform]?.label} 연결을 해제하시겠습니까?`)) return;
    await fetch('/api/sns/connections', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform }) });
    loadAll();
  };

  const getConnection = (platform: string) => connections.find((c) => c.platform === platform);

  // ── 미디어 업로드 ──────────────────────────────────────
  const uploadFiles = async (files: FileList | null, target: 'compose' | 'reply') => {
    if (!files?.length) return;
    const currentCount = target === 'compose' ? composeMedia.length : replyMedia.length;
    const remaining = 4 - currentCount;
    if (remaining <= 0) return;

    if (target === 'compose') setUploadingMedia(true);

    for (const file of Array.from(files).slice(0, remaining)) {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/sns/media', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        const item: MediaItem = { url: data.url, type: data.type, name: data.name, isVideo: data.isVideo };
        if (target === 'compose') setComposeMedia((prev) => [...prev, item]);
        else setReplyMedia((prev) => [...prev, item]);
      } else {
        alert(data.error || '업로드 실패');
      }
    }

    if (target === 'compose') setUploadingMedia(false);
  };

  const removeMedia = (idx: number, target: 'compose' | 'reply') => {
    if (target === 'compose') setComposeMedia((prev) => prev.filter((_, i) => i !== idx));
    else setReplyMedia((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── 게시 ────────────────────────────────────────────
  const postNow = async () => {
    if (!composeContent.trim() || !composePlatforms.length) return;
    setComposing(true);
    setComposeResult(null);
    const res = await fetch('/api/sns/post-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: composeContent,
        platforms: composePlatforms,
        media_urls: composeMedia.map((m) => m.url),
      }),
    });
    const data = await res.json();
    setComposeResult(data.results);
    setComposing(false);
    loadAll();
  };

  const loadFromTemplate = (tplId: string) => {
    const tpl = templates.find((t) => t.id === tplId);
    if (!tpl) return;
    setLoadingTemplate(tplId);
    setComposeContent(tpl.content);
    if (tpl.media_urls?.length) {
      setComposeMedia(tpl.media_urls.map((url) => ({
        url, type: url.match(/\.(mp4|mov)$/i) ? 'video/mp4' : 'image/jpeg', name: '', isVideo: !!url.match(/\.(mp4|mov)$/i),
      })));
    }
    setLoadingTemplate('');
  };

  // ── 템플릿 저장 ────────────────────────────────────────
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

  // ── 댓글 조회 ──────────────────────────────────────────
  const fetchComments = async (log: Log) => {
    if (!log.platform_post_id) return;
    setSelectedLog(log);
    setComments([]);
    setCommentsError(null);
    setReplyingTo(null);
    setReplyContent('');
    setReplyMedia([]);
    setLoadingComments(true);
    const res = await fetch(`/api/sns/comments?platform=${log.platform}&post_id=${log.platform_post_id}`);
    const data = await res.json();
    if (res.ok) {
      setComments(data.comments || []);
      if (data.note) setCommentsError(data.note);
    } else {
      setCommentsError(data.error || '댓글 조회 실패');
    }
    setLoadingComments(false);
  };

  const sendReply = async () => {
    if (!selectedLog || !replyContent.trim()) return;
    setSendingReply(true);
    const res = await fetch('/api/sns/comments/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: selectedLog.platform,
        post_id: selectedLog.platform_post_id,
        comment_id: replyingTo,
        content: replyContent,
        media_urls: replyMedia.map((m) => m.url),
      }),
    });
    if (res.ok) {
      setReplyContent('');
      setReplyMedia([]);
      setReplyingTo(null);
      fetchComments(selectedLog);
    } else {
      const data = await res.json();
      alert(data.error || '답글 실패');
    }
    setSendingReply(false);
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'connections', label: '연결 관리' },
    { key: 'compose',     label: '게시물 작성' },
    { key: 'templates',   label: '템플릿' },
    { key: 'comments',    label: '댓글 관리' },
    { key: 'logs',        label: '발행 로그' },
  ];

  // ── MediaPreview 컴포넌트 ──────────────────────────────
  const MediaPreview = ({ items, onRemove }: { items: MediaItem[]; onRemove: (i: number) => void }) => (
    <div className="flex flex-wrap gap-2">
      {items.map((m, i) => (
        <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
          {m.isVideo ? (
            <video src={m.url} className="w-full h-full object-cover" muted />
          ) : (
            <img src={m.url} alt={m.name} className="w-full h-full object-cover" />
          )}
          <div className="absolute top-0 left-0 right-0 bottom-0 bg-black/0 hover:bg-black/20 transition-colors" />
          <button
            onClick={() => onRemove(i)}
            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-black/80">
            ×
          </button>
          {m.isVideo && (
            <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1 rounded">▶</div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-gray-900">🌐 SNS 관리</h1>
            <p className="text-sm text-gray-400">소셜 미디어 연동 · 게시 · 댓글 관리</p>
          </div>
          {connections.filter((c) => c.is_active).length > 0 && (
            <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full font-medium">
              {connections.filter((c) => c.is_active).length}개 연결됨
            </span>
          )}
        </div>

        <div className="flex gap-1 mt-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
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

        {loading && <div className="flex items-center justify-center py-12 text-gray-400 text-sm">불러오는 중...</div>}

        {/* ── 연결 관리 ── */}
        {!loading && tab === 'connections' && (
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
                          {conn.platform_avatar && <img src={conn.platform_avatar} alt="" className="w-8 h-8 rounded-full" />}
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-700 truncate">{conn.platform_display_name || conn.platform_username}</div>
                            <div className="text-xs text-gray-400 truncate">@{conn.platform_username}</div>
                          </div>
                        </div>
                        <button onClick={() => disconnect(platform)} className="w-full text-xs text-red-500 hover:text-red-600 border border-red-100 hover:border-red-200 rounded-xl py-2 transition-colors">
                          연결 해제
                        </button>
                      </div>
                    ) : (
                      <a href={`/api/sns/connect/${platform}`} className={`block w-full text-center bg-gradient-to-r ${info.color} text-white text-sm font-bold py-2.5 rounded-xl hover:opacity-90 transition-opacity`}>
                        {info.label} 연결하기
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── 게시물 작성 ── */}
        {!loading && tab === 'compose' && (
          <div className="max-w-2xl space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-4">게시물 작성</h3>

              {/* 템플릿 불러오기 */}
              {templates.length > 0 && (
                <div className="mb-4">
                  <select
                    value={loadingTemplate}
                    onChange={(e) => loadFromTemplate(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-500 focus:outline-none focus:border-indigo-400">
                    <option value="">템플릿에서 불러오기 (선택사항)</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
              )}

              {/* 내용 작성 */}
              <textarea
                value={composeContent}
                onChange={(e) => setComposeContent(e.target.value)}
                placeholder="게시물 내용을 입력하세요&#10;(트위터 280자 / 스레드 500자 / 인스타 2,200자 / 링크드인 3,000자)"
                rows={6}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"
              />
              <div className="flex items-center justify-between mt-1.5 mb-4">
                <span className="text-xs text-gray-400">{composeContent.length}자</span>
                {composeContent.length > 280 && <span className="text-xs text-amber-500">트위터 280자 초과</span>}
              </div>

              {/* 미디어 첨부 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500">미디어 첨부</span>
                  <span className="text-xs text-gray-400">(이미지 최대 4개 또는 동영상 1개, jpg·png·gif·webp·mp4·mov)</span>
                </div>

                {composeMedia.length > 0 && (
                  <MediaPreview items={composeMedia} onRemove={(i) => removeMedia(i, 'compose')} />
                )}

                {composeMedia.length < 4 && (
                  <label
                    className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-colors ${
                      uploadingMedia ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                    }`}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime"
                      multiple
                      className="hidden"
                      onChange={(e) => uploadFiles(e.target.files, 'compose')}
                    />
                    {uploadingMedia ? (
                      <span className="text-sm text-indigo-500">업로드 중...</span>
                    ) : (
                      <>
                        <span className="text-2xl">📎</span>
                        <span className="text-sm text-gray-500">클릭하여 이미지/동영상 추가</span>
                      </>
                    )}
                  </label>
                )}
              </div>

              {/* 플랫폼 선택 */}
              <div className="mt-5">
                <label className="text-xs font-semibold text-gray-500 mb-2 block">발행 플랫폼</label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(PLATFORMS) as Platform[]).map((p) => {
                    const conn = getConnection(p);
                    const info = PLATFORM_INFO[p];
                    const selected = composePlatforms.includes(p);
                    return (
                      <button
                        key={p}
                        onClick={() => conn?.is_active && setComposePlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])}
                        disabled={!conn?.is_active}
                        title={!conn?.is_active ? '연결 필요' : undefined}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                          !conn?.is_active ? 'opacity-30 cursor-not-allowed border-gray-100 text-gray-400'
                          : selected ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                          : 'border-gray-200 text-gray-600 hover:border-indigo-300'
                        }`}>
                        <span>{info.icon}</span>
                        <span className="hidden sm:inline">{info.label}</span>
                      </button>
                    );
                  })}
                </div>
                {connections.filter((c) => c.is_active).length === 0 && (
                  <p className="text-xs text-amber-600 mt-2">먼저 연결 관리 탭에서 SNS를 연결하세요</p>
                )}
              </div>

              <div className="flex gap-2 mt-5">
                <button
                  onClick={postNow}
                  disabled={composing || !composeContent.trim() || !composePlatforms.length}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm transition-colors">
                  {composing ? '발행 중...' : '🚀 지금 발행'}
                </button>
                <button
                  onClick={() => {
                    if (!composeContent.trim()) return;
                    const title = prompt('템플릿 제목을 입력하세요');
                    if (!title) return;
                    setNewTitle(title);
                    setNewContent(composeContent);
                    setTab('templates');
                  }}
                  className="px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                  💾 템플릿 저장
                </button>
              </div>
            </div>

            {/* 발행 결과 */}
            {composeResult && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h4 className="font-bold text-gray-900 mb-3">발행 결과</h4>
                <div className="space-y-2">
                  {composeResult.map((r) => (
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

        {/* ── 템플릿 ── */}
        {!loading && tab === 'templates' && (
          <div className="space-y-6">
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

            <div className="space-y-3">
              {templates.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">아직 템플릿이 없습니다</div>
              ) : (
                templates.map((tpl) => (
                  <div key={tpl.id} className="bg-white rounded-2xl border border-gray-100 p-5">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="font-bold text-gray-800 text-sm">{tpl.title}</div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => { setTab('compose'); setTimeout(() => loadFromTemplate(tpl.id), 100); }}
                          className="text-xs text-indigo-500 hover:text-indigo-600">사용</button>
                        <button onClick={() => deleteTemplate(tpl.id)} className="text-xs text-red-400 hover:text-red-500">삭제</button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{tpl.content}</p>
                    <div className="text-xs text-gray-400 mt-2">{new Date(tpl.created_at).toLocaleDateString('ko-KR')}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── 댓글 관리 ── */}
        {!loading && tab === 'comments' && (
          <div className="grid md:grid-cols-5 gap-5">
            {/* 게시물 목록 */}
            <div className="md:col-span-2 space-y-2">
              <p className="text-xs font-semibold text-gray-400 mb-3">댓글을 볼 게시물 선택</p>
              {logs.filter((l) => l.status === 'success' && l.platform_post_id && COMMENT_PLATFORMS.includes(l.platform)).length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
                  <p>댓글 조회 가능한 게시물이 없습니다</p>
                  <p className="text-xs mt-1 text-gray-300">Twitter, Facebook, Instagram 게시물만 지원</p>
                </div>
              ) : (
                logs
                  .filter((l) => l.status === 'success' && l.platform_post_id && COMMENT_PLATFORMS.includes(l.platform))
                  .map((log) => {
                    const info = PLATFORM_INFO[log.platform];
                    return (
                      <button
                        key={log.id}
                        onClick={() => fetchComments(log)}
                        className={`w-full text-left bg-white rounded-xl border px-4 py-3 transition-all ${
                          selectedLog?.id === log.id ? 'border-indigo-400 shadow-sm' : 'border-gray-100 hover:border-gray-200'
                        }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span>{info?.icon}</span>
                          <span className="text-xs font-medium text-gray-600">{info?.label}</span>
                          <span className="text-xs text-gray-400 ml-auto">{new Date(log.posted_at).toLocaleDateString('ko-KR')}</span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{log.sns_post_templates?.title || log.platform_post_id}</p>
                      </button>
                    );
                  })
              )}
            </div>

            {/* 댓글 뷰 */}
            <div className="md:col-span-3">
              {!selectedLog ? (
                <div className="bg-white rounded-2xl border border-gray-100 flex items-center justify-center h-64 text-gray-400 text-sm">
                  왼쪽에서 게시물을 선택하세요
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-3">
                    <span>{PLATFORM_INFO[selectedLog.platform]?.icon}</span>
                    <span className="text-sm font-semibold text-gray-700">
                      {PLATFORM_INFO[selectedLog.platform]?.label} · {selectedLog.sns_post_templates?.title || selectedLog.platform_post_id}
                    </span>
                    <button
                      onClick={() => fetchComments(selectedLog)}
                      className="ml-auto text-xs text-indigo-500 hover:text-indigo-600">
                      새로고침
                    </button>
                  </div>

                  <div className="p-5 space-y-4 max-h-[400px] overflow-y-auto">
                    {loadingComments && <div className="text-center py-8 text-gray-400 text-sm">댓글 불러오는 중...</div>}
                    {commentsError && <div className="text-center py-4 text-sm text-amber-600">{commentsError}</div>}
                    {!loadingComments && !commentsError && comments.length === 0 && (
                      <div className="text-center py-8 text-gray-400 text-sm">댓글이 없습니다</div>
                    )}

                    {comments.map((comment) => (
                      <div key={comment.id} className="space-y-2">
                        <div className="flex items-start gap-3">
                          {comment.authorAvatar ? (
                            <img src={comment.authorAvatar} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">
                              {comment.authorName[0]}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold text-gray-800">{comment.authorName}</span>
                              {comment.authorHandle && <span className="text-xs text-gray-400">@{comment.authorHandle}</span>}
                              <span className="text-xs text-gray-300 ml-auto">
                                {new Date(comment.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700">{comment.content}</p>
                            {comment.mediaUrls?.length ? (
                              <div className="flex gap-1 mt-2">
                                {comment.mediaUrls.map((url, i) => (
                                  <img key={i} src={url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                                ))}
                              </div>
                            ) : null}
                            <button
                              onClick={() => setReplyingTo(comment.id === replyingTo ? null : comment.id)}
                              className="text-xs text-indigo-500 hover:text-indigo-600 mt-1">
                              답글 달기
                            </button>
                          </div>
                        </div>

                        {/* 답글 폼 */}
                        {replyingTo === comment.id && (
                          <div className="ml-11 space-y-2">
                            <textarea
                              value={replyContent}
                              onChange={(e) => setReplyContent(e.target.value)}
                              placeholder="답글 내용..."
                              rows={2}
                              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"
                            />
                            {replyMedia.length > 0 && (
                              <MediaPreview items={replyMedia} onRemove={(i) => removeMedia(i, 'reply')} />
                            )}
                            <div className="flex items-center gap-2">
                              <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer hover:text-indigo-500">
                                <input
                                  ref={replyFileRef}
                                  type="file"
                                  accept="image/jpeg,image/png,image/gif,image/webp,video/mp4"
                                  multiple
                                  className="hidden"
                                  onChange={(e) => uploadFiles(e.target.files, 'reply')}
                                />
                                📎 미디어
                              </label>
                              <button
                                onClick={sendReply}
                                disabled={sendingReply || !replyContent.trim()}
                                className="ml-auto bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-xl text-xs font-bold transition-colors">
                                {sendingReply ? '전송 중...' : '답글'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 게시물에 직접 댓글 */}
                  <div className="px-5 py-4 border-t border-gray-50">
                    <p className="text-xs font-semibold text-gray-400 mb-2">게시물에 댓글 달기</p>
                    <textarea
                      value={replyingTo === 'post' ? replyContent : ''}
                      onChange={(e) => { setReplyingTo('post'); setReplyContent(e.target.value); }}
                      placeholder="댓글 내용..."
                      rows={2}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"
                    />
                    {replyingTo === 'post' && replyMedia.length > 0 && (
                      <div className="mt-2">
                        <MediaPreview items={replyMedia} onRemove={(i) => removeMedia(i, 'reply')} />
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer hover:text-indigo-500">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp,video/mp4"
                          multiple
                          className="hidden"
                          onChange={(e) => { setReplyingTo('post'); uploadFiles(e.target.files, 'reply'); }}
                        />
                        📎 미디어 첨부
                      </label>
                      <button
                        onClick={() => { setReplyingTo('post'); sendReply(); }}
                        disabled={sendingReply || !replyContent.trim() || replyingTo !== 'post'}
                        className="ml-auto bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-xl text-xs font-bold transition-colors">
                        {sendingReply ? '전송 중...' : '댓글 달기'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 발행 로그 ── */}
        {!loading && tab === 'logs' && (
          <div className="space-y-2">
            {logs.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">발행 기록이 없습니다</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3">
                  <span className="text-lg flex-shrink-0">{PLATFORM_INFO[log.platform]?.icon || '🌐'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-700 truncate">
                      {log.sns_post_templates?.title || '직접 작성'}
                    </div>
                    <div className="text-xs text-gray-400">
                      {PLATFORM_INFO[log.platform]?.label} · {new Date(log.posted_at).toLocaleString('ko-KR')}
                    </div>
                    {log.media_urls?.length ? (
                      <div className="text-xs text-gray-400 mt-0.5">📎 미디어 {log.media_urls.length}개 첨부</div>
                    ) : null}
                    {log.error_message && <div className="text-xs text-red-400 mt-0.5">{log.error_message}</div>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {log.status === 'success' && log.platform_post_id && COMMENT_PLATFORMS.includes(log.platform) && (
                      <button
                        onClick={() => { setTab('comments'); setTimeout(() => fetchComments(log), 100); }}
                        className="text-xs text-indigo-500 hover:text-indigo-600 border border-indigo-100 rounded-lg px-2 py-1">
                        댓글
                      </button>
                    )}
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      log.status === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                    }`}>
                      {log.status === 'success' ? '성공' : '실패'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
