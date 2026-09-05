'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Schedule, ScheduleLog, BlogAutoConfig, CoupangAutoConfig, AgodaAutoConfig, ShortsAutoConfig, InstagramAutoConfig } from '@/lib/scheduler';
import { INTERVAL_OPTIONS, formatRelativeTime } from '@/lib/scheduler';

// ── 헬퍼 함수 ─────────────────────────────────────────────────────────────
function modelEmoji(id: string): string {
  if (id.includes('qwen')) return '🔮';
  if (id.includes('llama')) return '🦙';
  if (id.includes('mistral') || id.includes('ministral')) return '🌪️';
  if (id.includes('gemma')) return '💎';
  if (id.includes('deepseek')) return '🧠';
  if (id.includes('phi')) return '🔵';
  if (id.includes('gemini')) return '✨';
  if (id.includes('claude')) return '🟣';
  if (id.includes('gpt') || id.includes('openai')) return '🟢';
  return '🤖';
}
function modelLabel(id: string): string {
  if (id === 'gemini') return 'Gemini';
  if (id === 'claude') return 'Claude';
  if (id === 'openai' || id === 'gpt4o') return 'GPT-4o';
  return id.replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 20);
}
function errorIcon(err: string): string {
  if (/\[AI 생성 실패\]|AI 생성|ollama|openrouter|gemini|claude|openai|timeout|모델/i.test(err)) return '🤖';
  if (/\[발행 실패\]|발행|blogger|wordpress|publish|api 오류/i.test(err)) return '📤';
  if (/\[키워드 발굴 실패\]|키워드|keyword/i.test(err)) return '🔍';
  if (/network|fetch|ECONNREFUSED|서버|다운|connect/i.test(err)) return '🌐';
  if (/인증|token|auth|로그인/i.test(err)) return '🔑';
  return '⚠️';
}
function errorCategory(err: string): string {
  if (/\[AI 생성 실패\]|ollama|openrouter|timeout|모델/i.test(err)) return 'AI 생성 오류';
  if (/\[발행 실패\]|blogger|wordpress|publish/i.test(err)) return '블로그 발행 오류';
  if (/\[키워드 발굴 실패\]/i.test(err)) return '키워드 발굴 오류';
  if (/network|fetch|ECONNREFUSED|서버|다운|connect/i.test(err)) return '네트워크/서버 오류';
  if (/인증|token|auth|로그인/i.test(err)) return '인증 오류';
  return '실행 오류';
}

// ── 상수 ──────────────────────────────────────────────────────────────────
const SNS_PLATFORMS = [
  { id: 'threads',   label: '🧵 스레드' },
  { id: 'instagram', label: '📸 인스타' },
  { id: 'twitter',   label: '🐦 트위터' },
  { id: 'facebook',  label: '📘 페북' },
];

const SCHEDULE_TYPES = [
  { id: 'blog_auto',      icon: '📝', label: '블로그 자동글' },
  { id: 'coupang_auto',   icon: '🛒', label: '쿠팡 자동발행' },
  { id: 'agoda_auto',     icon: '🏨', label: '아고다 호텔' },
  { id: 'shorts_auto',    icon: '🎬', label: '숏폼 스크립트' },
  { id: 'instagram_auto', icon: '📸', label: '인스타그램' },
];

const AGODA_CITIES = [
  { id: 17193, name: '발리',       nameEn: 'Bali' },
  { id: 9395,  name: '방콕',       nameEn: 'Bangkok' },
  { id: 16056, name: '푸켓',       nameEn: 'Phuket' },
  { id: 7401,  name: '치앙마이',   nameEn: 'Chiang Mai' },
  { id: 5085,  name: '도쿄',       nameEn: 'Tokyo' },
  { id: 9590,  name: '오사카',     nameEn: 'Osaka' },
  { id: 1784,  name: '교토',       nameEn: 'Kyoto' },
  { id: 16527, name: '후쿠오카',   nameEn: 'Fukuoka' },
  { id: 3435,  name: '삿포로',     nameEn: 'Sapporo' },
  { id: 4064,  name: '싱가포르',   nameEn: 'Singapore' },
  { id: 16808, name: '홍콩',       nameEn: 'Hong Kong' },
  { id: 4001,  name: '세부',       nameEn: 'Cebu' },
  { id: 13170, name: '호치민',     nameEn: 'Ho Chi Minh' },
  { id: 16440, name: '다낭',       nameEn: 'Da Nang' },
  { id: 2758,  name: '하노이',     nameEn: 'Hanoi' },
  { id: 14524, name: '쿠알라룸푸르', nameEn: 'Kuala Lumpur' },
  { id: 2994,  name: '두바이',     nameEn: 'Dubai' },
  { id: 15470, name: '파리',       nameEn: 'Paris' },
  { id: 318,   name: '뉴욕',       nameEn: 'New York' },
];

const STATUS_STYLE: Record<string, string> = {
  success: 'bg-emerald-100 text-emerald-700',
  failed:  'bg-red-100 text-red-700',
  running: 'bg-yellow-100 text-yellow-700',
};

// ── 폼 초기값 ──────────────────────────────────────────────────────────────
const defaultForm = () => ({
  name: '',
  type: 'blog_auto',
  interval_hours: 24,
  run_at_hour: 9,
  blog: {
    content_type: 'info' as 'product' | 'info',
    blog_platform: 'blogger' as 'blogger' | 'wordpress',
    blogger_blog_id: '', wp_site_id: '',
  } as BlogAutoConfig,
  coupang: {
    product_source: 'goldbox' as 'goldbox' | 'keyword', search_keywords: [] as string[],
    sns_platforms: ['threads'] as string[], min_discount: 0,
    publish_targets: ['sns'] as ('sns' | 'wordpress')[], wp_site_id: '', ai_model: 'claude',
  } as CoupangAutoConfig,
  agoda: {
    cities: [] as AgodaAutoConfig['cities'], city_mode: 'rotate' as 'rotate' | 'random',
    blog_platform: 'blogger' as 'blogger' | 'wordpress', blogger_blog_id: '',
    wp_site_id: '', travel_style: '커플', sns_platforms: [] as string[],
  } as AgodaAutoConfig,
  shorts: {
    topics: [] as string[], topic_mode: 'rotate' as 'rotate' | 'random',
    duration: 60 as 30 | 60 | 120, tone: 'info', platform: 'youtube',
    save_to_blog: false, blog_platform: 'blogger' as 'blogger' | 'wordpress',
    blogger_blog_id: '', wp_site_id: '',
  } as ShortsAutoConfig,
  instagram: {
    topics: [] as string[], topic_mode: 'rotate' as 'rotate' | 'random',
    tone: 'casual', auto_publish: false,
  } as InstagramAutoConfig,
});

type FormState = ReturnType<typeof defaultForm>;

// ── 컴포넌트 ───────────────────────────────────────────────────────────────
export default function SchedulerPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [logs, setLogs] = useState<Record<string, ScheduleLog[]>>({});
  const [openLogId, setOpenLogId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  // 입력 임시값
  const [searchKwInput, setSearchKwInput] = useState('');
  const [shortsTopicInput, setShortsTopicInput] = useState('');
  const [igTopicInput, setIgTopicInput] = useState('');

  // 등록된 WP 사이트 (DB)
  const [wpRegSites, setWpRegSites] = useState<Array<{ id: string; site_name: string; site_url: string }>>([]);
  const [wpRegSitesLoaded, setWpRegSitesLoaded] = useState(false);

  // AI 모델 목록
  const [aiModels, setAiModels] = useState<Array<{ id: string; name: string; emoji: string; group: string }>>([
    { id: 'gemini', name: 'Gemini', emoji: '✨', group: 'cloud' },
    { id: 'claude', name: 'Claude', emoji: '🟣', group: 'cloud' },
    { id: 'openai', name: 'GPT-4o', emoji: '🟢', group: 'cloud' },
  ]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const loadSchedules = useCallback(async () => {
    const res = await fetch('/api/scheduler/schedules');
    if (res.ok) setSchedules(await res.json() as Schedule[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadSchedules(); }, [loadSchedules]);

  // 모달 오픈 시 WP 사이트 자동 로드
  useEffect(() => {
    if (!showModal) return;
    if (['blog_auto', 'agoda_auto', 'shorts_auto'].includes(form.type)) loadWpRegSites();
    if (form.type === 'blog_auto') loadAiModels();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal, form.type]);

  // 등록된 WP 사이트 불러오기 (DB — 배열 직접 반환)
  const loadWpRegSites = useCallback(async () => {
    if (wpRegSitesLoaded) return;
    const res = await fetch('/api/wordpress/sites');
    if (res.ok) {
      const data = await res.json() as Array<{ id: string; site_name: string; site_url: string }>;
      setWpRegSites(Array.isArray(data) ? data : []);
    }
    setWpRegSitesLoaded(true);
  }, [wpRegSitesLoaded]);

  const loadAiModels = useCallback(async () => {
    if (modelsLoading) return;
    setModelsLoading(true);
    try {
      const [ollamaRes, claudeRes] = await Promise.allSettled([
        fetch('/api/ollama/models').then(r => r.ok ? r.json() : null),
        fetch('/api/claude/models').then(r => r.ok ? r.json() : null),
      ]);
      const ollamaList: string[] = ollamaRes.status === 'fulfilled' && ollamaRes.value
        ? (ollamaRes.value.popular || ollamaRes.value.models || []) : [];
      const claudeList: string[] = claudeRes.status === 'fulfilled' && claudeRes.value
        ? (claudeRes.value.models || []) : ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'];
      const combined = [
        { id: 'gemini', name: 'Gemini', emoji: '✨', group: 'cloud' },
        ...claudeList.map(id => ({ id, name: id.includes('haiku') ? 'Claude Haiku' : id.includes('sonnet') ? 'Claude Sonnet' : id.includes('opus') ? 'Claude Opus' : id, emoji: '🟣', group: 'cloud' })),
        { id: 'openai', name: 'GPT-4o', emoji: '🟢', group: 'cloud' },
        ...ollamaList.map(id => ({ id, name: modelLabel(id), emoji: modelEmoji(id), group: 'ollama' })),
      ];
      if (combined.length > 0) setAiModels(combined);
    } catch { /* keep defaults */ } finally { setModelsLoading(false); }
  }, [modelsLoading]);

  const loadLogs = async (scheduleId: string) => {
    if (openLogId === scheduleId) { setOpenLogId(null); return; }
    const res = await fetch(`/api/scheduler/logs?schedule_id=${scheduleId}&limit=15`);
    if (res.ok) {
      const data = await res.json() as ScheduleLog[];
      setLogs(prev => ({ ...prev, [scheduleId]: data }));
    }
    setOpenLogId(scheduleId);
  };

  const refreshLogs = async (scheduleId: string) => {
    const res = await fetch(`/api/scheduler/logs?schedule_id=${scheduleId}&limit=15`);
    if (res.ok) {
      const data = await res.json() as ScheduleLog[];
      setLogs(prev => ({ ...prev, [scheduleId]: data }));
    }
  };

  const toggleActive = async (s: Schedule) => {
    await fetch(`/api/scheduler/schedules/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !s.is_active }) });
    await loadSchedules();
  };

  const deleteSchedule = async (id: string) => {
    if (!confirm('이 스케줄을 삭제할까요?')) return;
    await fetch(`/api/scheduler/schedules/${id}`, { method: 'DELETE' });
    await loadSchedules();
    showToast('스케줄 삭제됨');
  };

  const runNow = async (scheduleId: string) => {
    setRunning(scheduleId);
    try {
      const res = await fetch('/api/scheduler/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schedule_id: scheduleId }) });
      const data = await res.json() as { results?: Array<{ success: boolean; summary?: string; error?: string }> };
      const r = data.results?.[0];
      showToast(r?.success ? `✓ ${r.summary || '실행 완료'}` : `✗ ${r?.error?.slice(0, 60) || '실행 실패'}`);
      await loadSchedules();
      await refreshLogs(scheduleId);
    } finally { setRunning(null); }
  };

  const openAdd = () => {
    setEditId(null);
    setForm(defaultForm());
    setSearchKwInput(''); setShortsTopicInput(''); setIgTopicInput('');
    setWpRegSitesLoaded(false);
    setShowModal(true);
  };

  const openEdit = (s: Schedule) => {
    setEditId(s.id);
    const f = defaultForm();
    f.name = s.name; f.type = s.type; f.interval_hours = s.interval_hours; f.run_at_hour = s.run_at_hour;
    if (s.type === 'blog_auto') f.blog = s.config as BlogAutoConfig;
    else if (s.type === 'coupang_auto') f.coupang = s.config as CoupangAutoConfig;
    else if (s.type === 'agoda_auto') f.agoda = s.config as AgodaAutoConfig;
    else if (s.type === 'shorts_auto') f.shorts = s.config as ShortsAutoConfig;
    else if (s.type === 'instagram_auto') f.instagram = s.config as InstagramAutoConfig;
    setForm(f);
    setSearchKwInput(''); setShortsTopicInput(''); setIgTopicInput('');
    setWpRegSitesLoaded(false);
    setShowModal(true);
  };

  const saveSchedule = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    let config: unknown;
    if (form.type === 'blog_auto') config = form.blog;
    else if (form.type === 'coupang_auto') config = form.coupang;
    else if (form.type === 'agoda_auto') config = form.agoda;
    else if (form.type === 'shorts_auto') config = form.shorts;
    else config = form.instagram;

    const url = editId ? `/api/scheduler/schedules/${editId}` : '/api/scheduler/schedules';
    const res = await fetch(url, { method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.name, type: form.type, interval_hours: form.interval_hours, run_at_hour: form.run_at_hour, config }) });
    if (res.ok) {
      await loadSchedules(); setShowModal(false); showToast(editId ? '수정됨' : '추가됨');
    } else {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
      showToast(`저장 실패: ${err.error || res.status}`);
    }
    setSaving(false);
  };

  // ── topic helper ────────────────────────────────────────────────────────
  const addTopic = (field: 'shorts' | 'instagram', input: string, setter: (v: string) => void) => {
    const t = input.trim(); if (!t) return;
    if (field === 'shorts') setForm(f => ({ ...f, shorts: { ...f.shorts, topics: [...new Set([...f.shorts.topics, t])] } }));
    else setForm(f => ({ ...f, instagram: { ...f.instagram, topics: [...new Set([...f.instagram.topics, t])] } }));
    setter('');
  };

  const typeLabel = (t: string) => SCHEDULE_TYPES.find(s => s.id === t);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">로딩 중...</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">⏰ 발행 스케줄러</h1>
          <p className="text-xs text-gray-400 mt-0.5">블로그·쿠팡·아고다·숏폼·인스타를 자동으로 생성하고 발행합니다</p>
        </div>
        <button onClick={openAdd} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">+ 스케줄 추가</button>
      </div>

      {/* Toast */}
      {toast && <div className="fixed top-4 right-4 z-50 px-4 py-2.5 bg-gray-900 text-white text-sm rounded-xl shadow-lg">{toast}</div>}

      {/* NAS 크론 안내 */}
      <details className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <summary className="text-xs font-semibold text-amber-800 cursor-pointer">⚙️ NAS 자동 실행 설정 (클릭하여 보기)</summary>
        <div className="mt-2 space-y-1.5">
          <p className="text-[11px] text-amber-700">NAS 터미널에서 아래 명령어 1회 실행 → 매 분마다 자동 체크:</p>
          <code className="block text-[11px] bg-amber-100 rounded-lg px-3 py-2 text-amber-900 font-mono break-all">
            {'(crontab -l 2>/dev/null; echo "* * * * * curl -s -X POST https://loov.co.kr/api/scheduler/run -H \'x-internal-key: YOUR_TELEGRAM_WEBHOOK_SECRET\' 2>/dev/null") | crontab -'}
          </code>
        </div>
      </details>

      {/* Schedule List */}
      {schedules.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">⏰</p>
          <p className="text-sm">아직 스케줄이 없습니다</p>
          <p className="text-xs mt-1">+ 스케줄 추가로 완전 자동화를 시작하세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map(s => {
            const tl = typeLabel(s.type);
            return (
              <div key={s.id} className={`border rounded-2xl overflow-hidden ${s.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                <div className="p-4 bg-white">
                  <div className="flex items-start gap-3">
                    <button onClick={() => toggleActive(s)} className={`mt-0.5 w-10 h-6 rounded-full transition-colors flex-shrink-0 relative ${s.is_active ? 'bg-blue-500' : 'bg-gray-200'}`}>
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${s.is_active ? 'left-5' : 'left-1'}`} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 text-sm">{s.name}</span>
                        <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tl?.icon} {tl?.label}</span>
                        {s.last_status && (
                          <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_STYLE[s.last_status] || ''}`}>
                            {s.last_status === 'success' ? '✓ 성공' : s.last_status === 'failed' ? '✗ 실패' : '⟳ 실행중'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400 flex-wrap">
                        <span>🕐 {INTERVAL_OPTIONS.find(o => o.value === s.interval_hours)?.label || `${s.interval_hours}h`}</span>
                        {s.interval_hours >= 24 && <span>{s.run_at_hour}시</span>}
                        {s.last_run_at && <span>마지막: {formatRelativeTime(s.last_run_at)}</span>}
                        {s.next_run_at && s.is_active && <span className="text-blue-500">다음: {formatRelativeTime(s.next_run_at)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => runNow(s.id)} disabled={running === s.id} className="px-2.5 py-1 text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50">
                        {running === s.id ? '...' : '▶ 실행'}
                      </button>
                      <button onClick={() => openEdit(s)} className="px-2.5 py-1 text-[11px] bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100">수정</button>
                      <button onClick={() => deleteSchedule(s.id)} className="px-2.5 py-1 text-[11px] bg-red-50 text-red-500 border border-red-100 rounded-lg hover:bg-red-100">삭제</button>
                    </div>
                  </div>
                  <button onClick={() => loadLogs(s.id)} className="mt-3 text-[11px] text-gray-400 hover:text-gray-600">
                    {openLogId === s.id ? '▲ 로그 닫기' : '▼ 실행 로그'}
                  </button>
                </div>
                {openLogId === s.id && (
                  <div className="border-t border-gray-100 bg-gray-50 p-3 space-y-2 max-h-56 overflow-y-auto">
                    {!logs[s.id]?.length ? (
                      <p className="text-[11px] text-gray-400 text-center py-3">실행 기록 없음</p>
                    ) : (
                      (logs[s.id] as ScheduleLog[]).map(log => {
                        const publishedUrl = (log.result as Record<string, unknown> | null)?.url as string | undefined;
                        return (
                          <div key={log.id} className="text-[11px] space-y-0.5">
                            <div className="flex items-start gap-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] flex-shrink-0 ${STATUS_STYLE[log.status] || ''}`}>
                                {log.status === 'success' ? '✓' : log.status === 'failed' ? '✗' : '⟳'}
                              </span>
                              <span className="text-gray-500 flex-shrink-0">{new Date(log.started_at).toLocaleString('ko-KR')}</span>
                              {log.summary && <span className="text-gray-700 flex-1">{log.summary}</span>}
                              {log.error && (
                                <button onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                                  className="text-red-500 flex-1 text-left hover:text-red-700">
                                  {errorIcon(log.error)} {log.error.slice(0, 60)}{log.error.length > 60 ? '…' : ''}
                                </button>
                              )}
                            </div>
                            {log.error && expandedLogId === log.id && (
                              <div className="ml-8 p-2 bg-red-50 border border-red-100 rounded-lg">
                                <p className="text-[10px] font-semibold text-red-700 mb-1">{errorCategory(log.error)}</p>
                                <p className="text-[10px] text-red-600 break-all whitespace-pre-wrap">{log.error}</p>
                              </div>
                            )}
                            {publishedUrl && (
                              <div className="pl-8">
                                <a href={publishedUrl} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline break-all">
                                  🔗 {publishedUrl}
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal ───────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm p-2 md:p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="font-bold text-gray-900">{editId ? '스케줄 수정' : '새 스케줄 추가'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>

            <div className="p-5 space-y-4">
              {/* 이름 */}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">스케줄 이름</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="예: 매일 아침 블로그 발행" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
              </div>

              {/* 타입 */}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">자동화 유형</label>
                <div className="grid grid-cols-3 gap-1.5 md:grid-cols-5">
                  {SCHEDULE_TYPES.map(t => (
                    <button key={t.id} onClick={() => setForm(f => ({ ...f, type: t.id }))}
                      className={`py-2 px-1 text-xs font-medium rounded-xl border transition-colors text-center ${form.type === t.id ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                      <div>{t.icon}</div>
                      <div className="mt-0.5 leading-tight">{t.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 주기 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">실행 주기</label>
                  <select value={form.interval_hours} onChange={e => setForm(f => ({ ...f, interval_hours: parseInt(e.target.value) }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                    {INTERVAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {form.interval_hours >= 24 && (
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">실행 시각</label>
                    <select value={form.run_at_hour} onChange={e => setForm(f => ({ ...f, run_at_hour: parseInt(e.target.value) }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                      {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{i}시</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* ── WordPress 사이트 선택 (등록된 사이트) ───────────── */}
              {(['blog_auto', 'agoda_auto', 'shorts_auto', 'coupang_auto'].includes(form.type)) && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-gray-700">🌐 등록된 WordPress 사이트</p>
                  {!wpRegSitesLoaded ? (
                    <p className="text-[11px] text-gray-400">불러오는 중...</p>
                  ) : wpRegSites.length === 0 ? (
                    <p className="text-[11px] text-gray-400">등록된 WordPress 사이트가 없습니다 (<a href="/dashboard/wp-auto" className="text-blue-500 underline">WordPress 자동세팅</a>에서 추가)</p>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {wpRegSites.map(site => {
                        const field = form.type === 'blog_auto' ? 'blog' : form.type === 'agoda_auto' ? 'agoda' : form.type === 'coupang_auto' ? 'coupang' : 'shorts';
                        const cfg = (form as Record<string, unknown>)[field] as { blog_platform?: string; wp_site_id?: string };
                        const isSelected = field === 'coupang' ? cfg?.wp_site_id === site.id : (cfg?.blog_platform === 'wordpress' && cfg?.wp_site_id === site.id);
                        return (
                          <button key={site.id} onClick={() => {
                            setForm(f => ({ ...f, [field]: { ...(f as Record<string, unknown>)[field] as object, ...(field === 'coupang' ? {} : { blog_platform: 'wordpress' }), wp_site_id: site.id } }));
                          }} className={`w-full text-left px-3 py-2 rounded-lg border text-[11px] transition-colors ${isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50'}`}>
                            <div className="font-medium">{site.site_name}</div>
                            <div className={`truncate ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>{site.site_url}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── 블로그 설정 ────────────────────────────────────────── */}
              {form.type === 'blog_auto' && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <p className="text-xs font-bold text-gray-700">📝 블로그 설정</p>

                  {/* 키워드 완전 자동 안내 */}
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                    <p className="text-[11px] font-semibold text-blue-800 mb-1">🤖 키워드 완전 자동화</p>
                    <p className="text-[11px] text-blue-700">Google Trends 실시간 트렌딩 + Naver Ad 수익 분석으로 가장 돈이 되는 키워드를 자동 선택합니다.</p>
                    <p className="text-[10px] text-blue-400 mt-1">고급 키워드 분석 실행 이력이 있으면 캐시 우선 사용 → 없으면 실시간 발굴</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-gray-600">AI 모델</label>
                      <button onClick={loadAiModels} disabled={modelsLoading} className="text-[10px] text-blue-500 hover:text-blue-700">
                        {modelsLoading ? '⟳ 로딩중...' : '🔄 새로고침'}
                      </button>
                    </div>
                    {aiModels.filter(m => m.group === 'cloud').length > 0 && (
                      <p className="text-[10px] text-gray-400 mb-1">☁️ 클라우드</p>
                    )}
                    <div className="grid grid-cols-3 gap-1.5 mb-2">
                      {aiModels.filter(m => m.group === 'cloud').map(m => {
                        const selected = (form.blog.ai_model || 'qwen3') === m.id;
                        return (
                          <button key={m.id} onClick={() => setForm(f => ({ ...f, blog: { ...f.blog, ai_model: m.id } }))}
                            className={`py-2 px-1 text-center rounded-xl border transition-colors ${selected ? 'bg-purple-500 border-purple-500 text-white' : 'border-gray-200 text-gray-600 hover:border-purple-300'}`}>
                            <div className="text-base">{m.emoji}</div>
                            <div className="text-[10px] font-medium mt-0.5 truncate">{m.name}</div>
                          </button>
                        );
                      })}
                    </div>
                    {aiModels.filter(m => m.group === 'ollama').length > 0 && (
                      <>
                        <p className="text-[10px] text-gray-400 mb-1">🖥️ Ollama</p>
                        <div className="grid grid-cols-3 gap-1.5 max-h-32 overflow-y-auto">
                          {aiModels.filter(m => m.group === 'ollama').map(m => {
                            const selected = (form.blog.ai_model || 'qwen3') === m.id;
                            return (
                              <button key={m.id} onClick={() => setForm(f => ({ ...f, blog: { ...f.blog, ai_model: m.id } }))}
                                className={`py-2 px-1 text-center rounded-xl border transition-colors ${selected ? 'bg-purple-500 border-purple-500 text-white' : 'border-gray-200 text-gray-600 hover:border-purple-300'}`}>
                                <div className="text-base">{m.emoji}</div>
                                <div className="text-[10px] font-medium mt-0.5 truncate">{m.name}</div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1.5">현재: <b>{(form.blog.ai_model || 'qwen3')}</b> · 없으면 다음 모델로 자동 전환</p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">글 유형</label>
                    <div className="flex gap-2">
                      {[['info', '📖 정보글'], ['product', '🛒 상품 추천글']].map(([v, l]) => (
                        <button key={v} onClick={() => setForm(f => ({ ...f, blog: { ...f.blog, content_type: v as 'product' | 'info' } }))} className={`flex-1 py-2 text-sm rounded-xl border transition-colors ${form.blog.content_type === v ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">발행 플랫폼</label>
                    <div className="flex gap-2">
                      {['blogger', 'wordpress'].map(p => (
                        <button key={p} onClick={() => setForm(f => ({ ...f, blog: { ...f.blog, blog_platform: p as 'blogger' | 'wordpress' } }))} className={`flex-1 py-2 text-sm rounded-xl border transition-colors ${form.blog.blog_platform === p ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-200 text-gray-600'}`}>
                          {p === 'blogger' ? '📝 Blogger' : '🌐 WordPress'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.blog.blog_platform === 'wordpress' && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      {form.blog.wp_site_id
                        ? <p className="text-[11px] text-emerald-700">✓ {wpRegSites.find(s => s.id === form.blog.wp_site_id)?.site_name || '사이트 선택됨'} — 위에서 사이트를 선택하면 자동 연결됩니다</p>
                        : <p className="text-[11px] text-orange-600">위에서 등록된 WordPress 사이트를 선택하세요</p>
                      }
                    </div>
                  )}
                </div>
              )}

              {/* ── 쿠팡 설정 ─────────────────────────────────────────── */}
              {form.type === 'coupang_auto' && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <p className="text-xs font-bold text-gray-700">🛒 쿠팡 설정</p>
                  <div className="flex gap-2">
                    {[['goldbox', '🎁 골드박스'], ['keyword', '🔍 키워드 검색']].map(([v, l]) => (
                      <button key={v} onClick={() => setForm(f => ({ ...f, coupang: { ...f.coupang, product_source: v as 'goldbox' | 'keyword' } }))} className={`flex-1 py-2 text-sm rounded-xl border transition-colors ${form.coupang.product_source === v ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-200 text-gray-600'}`}>{l}</button>
                    ))}
                  </div>
                  {form.coupang.product_source === 'keyword' && (
                    <div>
                      <div className="flex gap-2 mb-1.5">
                        <input value={searchKwInput} onChange={e => setSearchKwInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { const t = searchKwInput.trim(); if (t) { setForm(f => ({ ...f, coupang: { ...f.coupang, search_keywords: [...new Set([...(f.coupang.search_keywords || []), t])] } })); setSearchKwInput(''); } } }} placeholder="검색 키워드" className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
                        <button onClick={() => { const t = searchKwInput.trim(); if (t) { setForm(f => ({ ...f, coupang: { ...f.coupang, search_keywords: [...new Set([...(f.coupang.search_keywords || []), t])] } })); setSearchKwInput(''); } }} className="px-3 bg-orange-500 text-white text-sm rounded-xl">추가</button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(form.coupang.search_keywords || []).map(kw => (
                          <span key={kw} className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-50 text-orange-700 text-[11px] rounded-full">{kw}<button onClick={() => setForm(f => ({ ...f, coupang: { ...f.coupang, search_keywords: (f.coupang.search_keywords || []).filter(k => k !== kw) } }))} className="text-orange-400">✕</button></span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">발행 대상</label>
                    <div className="flex gap-2">
                      {([['sns', '📱 SNS'], ['wordpress', '🌐 워드프레스']] as const).map(([v, l]) => {
                        const targets: ('sns' | 'wordpress')[] = form.coupang.publish_targets?.length ? form.coupang.publish_targets : ['sns'];
                        const active = targets.includes(v);
                        return (
                          <button key={v} onClick={() => setForm(f => {
                            const cur: ('sns' | 'wordpress')[] = f.coupang.publish_targets?.length ? f.coupang.publish_targets : ['sns'];
                            const next: ('sns' | 'wordpress')[] = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
                            return { ...f, coupang: { ...f.coupang, publish_targets: next.length ? next : ['sns'] } };
                          })} className={`flex-1 py-2 text-sm rounded-xl border transition-colors ${active ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-200 text-gray-600'}`}>{l}</button>
                        );
                      })}
                    </div>
                  </div>
                  {(form.coupang.publish_targets || ['sns']).includes('sns') && (
                    <div>
                      <label className="text-xs font-semibold text-gray-600 mb-1 block">발행 SNS</label>
                      <div className="flex flex-wrap gap-2">
                        {SNS_PLATFORMS.map(p => (
                          <button key={p.id} onClick={() => setForm(f => ({ ...f, coupang: { ...f.coupang, sns_platforms: f.coupang.sns_platforms.includes(p.id) ? f.coupang.sns_platforms.filter(x => x !== p.id) : [...f.coupang.sns_platforms, p.id] } }))} className={`px-3 py-1.5 text-sm rounded-xl border transition-colors ${form.coupang.sns_platforms.includes(p.id) ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-200 text-gray-600'}`}>{p.label}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {(form.coupang.publish_targets || []).includes('wordpress') && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      {form.coupang.wp_site_id
                        ? <p className="text-[11px] text-emerald-700">✓ {wpRegSites.find(s => s.id === form.coupang.wp_site_id)?.site_name || '사이트 선택됨'} — 위에서 사이트를 선택하면 자동 연결됩니다</p>
                        : <p className="text-[11px] text-orange-600">위에서 등록된 WordPress 사이트를 선택하세요</p>
                      }
                      <p className="text-[10px] text-gray-400 mt-1">실사용 리뷰를 스크래핑할 수 있으면 인용하고, 못 하면(쿠팡 봇 차단 등) 없는 리뷰를 지어내지 않고 상품 정보 기반으로만 씁니다.</p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">최소 할인율 (%)</label>
                    <input type="number" min={0} max={90} value={form.coupang.min_discount || 0} onChange={e => setForm(f => ({ ...f, coupang: { ...f.coupang, min_discount: parseInt(e.target.value) || 0 } }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
                  </div>
                </div>
              )}

              {/* ── 아고다 설정 ───────────────────────────────────────── */}
              {form.type === 'agoda_auto' && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <p className="text-xs font-bold text-gray-700">🏨 아고다 설정</p>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1.5 block">도시 선택 (복수 가능)</label>
                    <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
                      {AGODA_CITIES.map(city => {
                        const selected = form.agoda.cities.some(c => c.id === city.id);
                        return (
                          <button key={city.id} onClick={() => setForm(f => ({ ...f, agoda: { ...f.agoda, cities: selected ? f.agoda.cities.filter(c => c.id !== city.id) : [...f.agoda.cities, city] } }))} className={`px-2 py-1.5 text-[11px] rounded-lg border transition-colors text-left ${selected ? 'bg-teal-500 border-teal-500 text-white' : 'border-gray-200 text-gray-600 hover:border-teal-300'}`}>
                            {city.name}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">선택된 도시: {form.agoda.cities.map(c => c.name).join(', ') || '없음'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 mb-1 block">도시 순환 방식</label>
                      <select value={form.agoda.city_mode} onChange={e => setForm(f => ({ ...f, agoda: { ...f.agoda, city_mode: e.target.value as 'rotate' | 'random' } }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
                        <option value="rotate">순서대로</option>
                        <option value="random">랜덤</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 mb-1 block">여행 스타일</label>
                      <select value={form.agoda.travel_style || '커플'} onChange={e => setForm(f => ({ ...f, agoda: { ...f.agoda, travel_style: e.target.value } }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
                        {['커플', '가족', '솔로', '비즈니스', '친구'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">발행 플랫폼</label>
                    <div className="flex gap-2">
                      {['blogger', 'wordpress'].map(p => (
                        <button key={p} onClick={() => setForm(f => ({ ...f, agoda: { ...f.agoda, blog_platform: p as 'blogger' | 'wordpress' } }))} className={`flex-1 py-2 text-sm rounded-xl border transition-colors ${form.agoda.blog_platform === p ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-200 text-gray-600'}`}>
                          {p === 'blogger' ? '📝 Blogger' : '🌐 WordPress'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.agoda.blog_platform === 'wordpress' && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      {form.agoda.wp_site_id
                        ? <p className="text-[11px] text-emerald-700">✓ {wpRegSites.find(s => s.id === form.agoda.wp_site_id)?.site_name || '사이트 선택됨'} — 위에서 사이트를 선택하면 자동 연결됩니다</p>
                        : <p className="text-[11px] text-orange-600">위에서 등록된 WordPress 사이트를 선택하세요</p>
                      }
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">SNS 동시 발행 (선택)</label>
                    <div className="flex flex-wrap gap-2">
                      {SNS_PLATFORMS.map(p => (
                        <button key={p.id} onClick={() => setForm(f => ({ ...f, agoda: { ...f.agoda, sns_platforms: (f.agoda.sns_platforms || []).includes(p.id) ? (f.agoda.sns_platforms || []).filter(x => x !== p.id) : [...(f.agoda.sns_platforms || []), p.id] } }))} className={`px-3 py-1.5 text-sm rounded-xl border transition-colors ${(form.agoda.sns_platforms || []).includes(p.id) ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-200 text-gray-600'}`}>{p.label}</button>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">선택 시 연결된 해당 SNS 계정 전체에 1등 추천 호텔로 자동 발행됩니다.</p>
                  </div>
                </div>
              )}

              {/* ── 숏폼 설정 ─────────────────────────────────────────── */}
              {form.type === 'shorts_auto' && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <p className="text-xs font-bold text-gray-700">🎬 숏폼 설정</p>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">주제 목록</label>
                    <div className="flex gap-2 mb-2">
                      <input value={shortsTopicInput} onChange={e => setShortsTopicInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTopic('shorts', shortsTopicInput, setShortsTopicInput)} placeholder="주제 입력 후 Enter" className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
                      <button onClick={() => addTopic('shorts', shortsTopicInput, setShortsTopicInput)} className="px-3 bg-blue-500 text-white text-sm rounded-xl">추가</button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                      {form.shorts.topics.map(t => (
                        <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-700 text-[11px] rounded-full">{t}<button onClick={() => setForm(f => ({ ...f, shorts: { ...f.shorts, topics: f.shorts.topics.filter(k => k !== t) } }))} className="text-purple-400">✕</button></span>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 mb-1 block">영상 길이</label>
                      <select value={form.shorts.duration} onChange={e => setForm(f => ({ ...f, shorts: { ...f.shorts, duration: parseInt(e.target.value) as 30 | 60 | 120 } }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
                        <option value={30}>30초</option>
                        <option value={60}>60초</option>
                        <option value={120}>120초</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 mb-1 block">톤</label>
                      <select value={form.shorts.tone} onChange={e => setForm(f => ({ ...f, shorts: { ...f.shorts, tone: e.target.value } }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
                        {[['info','정보형'],['fun','코믹'],['emotion','감동'],['edu','교육'],['story','스토리'],['trend','트렌드']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 mb-1 block">플랫폼</label>
                      <select value={form.shorts.platform} onChange={e => setForm(f => ({ ...f, shorts: { ...f.shorts, platform: e.target.value } }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
                        {[['youtube','YouTube'],['instagram','Instagram'],['tiktok','TikTok'],['naver','네이버']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.shorts.save_to_blog} onChange={e => setForm(f => ({ ...f, shorts: { ...f.shorts, save_to_blog: e.target.checked } }))} className="rounded" />
                    <span className="text-sm text-gray-700">스크립트를 블로그에도 자동 발행</span>
                  </label>
                  {form.shorts.save_to_blog && (
                    <div className="space-y-2 bg-gray-50 rounded-xl p-3">
                      <div className="flex gap-2">
                        {['blogger', 'wordpress'].map(p => (
                          <button key={p} onClick={() => setForm(f => ({ ...f, shorts: { ...f.shorts, blog_platform: p as 'blogger' | 'wordpress' } }))} className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${form.shorts.blog_platform === p ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-200 text-gray-600'}`}>{p === 'blogger' ? 'Blogger' : 'WordPress'}</button>
                        ))}
                      </div>
                      {form.shorts.blog_platform === 'wordpress' && (
                        <div className="pt-1">
                          {form.shorts.wp_site_id
                            ? <p className="text-[11px] text-emerald-700">✓ {wpRegSites.find(s => s.id === form.shorts.wp_site_id)?.site_name || '사이트 선택됨'}</p>
                            : <p className="text-[11px] text-orange-600">위에서 등록된 WordPress 사이트를 선택하세요</p>
                          }
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── 인스타그램 설정 ───────────────────────────────────── */}
              {form.type === 'instagram_auto' && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <p className="text-xs font-bold text-gray-700">📸 인스타그램 설정</p>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">주제 목록</label>
                    <div className="flex gap-2 mb-2">
                      <input value={igTopicInput} onChange={e => setIgTopicInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTopic('instagram', igTopicInput, setIgTopicInput)} placeholder="주제 입력 후 Enter" className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
                      <button onClick={() => addTopic('instagram', igTopicInput, setIgTopicInput)} className="px-3 bg-pink-500 text-white text-sm rounded-xl">추가</button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                      {form.instagram.topics.map(t => (
                        <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 bg-pink-50 text-pink-700 text-[11px] rounded-full">{t}<button onClick={() => setForm(f => ({ ...f, instagram: { ...f.instagram, topics: f.instagram.topics.filter(k => k !== t) } }))} className="text-pink-400">✕</button></span>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 mb-1 block">주제 방식</label>
                      <select value={form.instagram.topic_mode} onChange={e => setForm(f => ({ ...f, instagram: { ...f.instagram, topic_mode: e.target.value as 'rotate' | 'random' } }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
                        <option value="rotate">순서대로</option>
                        <option value="random">랜덤</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 mb-1 block">말투</label>
                      <select value={form.instagram.tone} onChange={e => setForm(f => ({ ...f, instagram: { ...f.instagram, tone: e.target.value } }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
                        <option value="casual">친근한</option>
                        <option value="professional">전문적인</option>
                        <option value="trendy">트렌디한</option>
                      </select>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.instagram.auto_publish} onChange={e => setForm(f => ({ ...f, instagram: { ...f.instagram, auto_publish: e.target.checked } }))} className="rounded" />
                    <span className="text-sm text-gray-700">인스타그램 자동 발행 (Pixabay 이미지 키 필요)</span>
                  </label>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium">취소</button>
              <button onClick={saveSchedule} disabled={saving || !form.name.trim()} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                {saving ? '저장 중...' : editId ? '수정 저장' : '스케줄 추가'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
