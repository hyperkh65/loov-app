'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Schedule, ScheduleLog, BlogAutoConfig, CoupangAutoConfig } from '@/lib/scheduler';
import { INTERVAL_OPTIONS, formatRelativeTime } from '@/lib/scheduler';

const SNS_PLATFORMS = ['threads', 'instagram', 'twitter', 'facebook'];
const SNS_LABELS: Record<string, string> = { threads: '🧵 스레드', instagram: '📸 인스타', twitter: '🐦 트위터', facebook: '📘 페북' };

const TYPE_LABELS: Record<string, string> = {
  blog_auto: '📝 블로그 자동글',
  coupang_auto: '🛒 쿠팡 자동발행',
};

const STATUS_STYLE: Record<string, string> = {
  success: 'bg-emerald-100 text-emerald-700',
  failed:  'bg-red-100 text-red-700',
  running: 'bg-yellow-100 text-yellow-700',
};

const EMPTY_BLOG_CONFIG: BlogAutoConfig = {
  keywords: [],
  keyword_mode: 'rotate',
  content_type: 'info',
  blog_platform: 'blogger',
  blogger_blog_id: '',
  wp_url: '',
  wp_username: '',
  wp_app_password: '',
};

const EMPTY_COUPANG_CONFIG: CoupangAutoConfig = {
  product_source: 'goldbox',
  search_keywords: [],
  sns_platforms: ['threads'],
  min_discount: 0,
};

interface EditForm {
  name: string;
  type: string;
  interval_hours: number;
  run_at_hour: number;
  blog: BlogAutoConfig;
  coupang: CoupangAutoConfig;
}

const defaultForm = (): EditForm => ({
  name: '',
  type: 'blog_auto',
  interval_hours: 24,
  run_at_hour: 9,
  blog: { ...EMPTY_BLOG_CONFIG },
  coupang: { ...EMPTY_COUPANG_CONFIG, search_keywords: [], sns_platforms: ['threads'] },
});

export default function SchedulerPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [logs, setLogs] = useState<Record<string, ScheduleLog[]>>({});
  const [openLogId, setOpenLogId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');
  const [searchKwInput, setSearchKwInput] = useState('');
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadSchedules = useCallback(async () => {
    const res = await fetch('/api/scheduler/schedules');
    if (res.ok) {
      const data = await res.json() as Schedule[];
      setSchedules(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadSchedules(); }, [loadSchedules]);

  const loadLogs = async (scheduleId: string) => {
    if (logs[scheduleId]) { setOpenLogId(openLogId === scheduleId ? null : scheduleId); return; }
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
    const res = await fetch(`/api/scheduler/schedules/${s.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !s.is_active }),
    });
    if (res.ok) await loadSchedules();
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
      const res = await fetch('/api/scheduler/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule_id: scheduleId }),
      });
      const data = await res.json() as { results?: Array<{ success: boolean; summary?: string; error?: string }> };
      const r = data.results?.[0];
      if (r?.success) showToast(`✓ ${r.summary || '실행 완료'}`);
      else showToast(`✗ ${r?.error || '실행 실패'}`);
      await loadSchedules();
      await refreshLogs(scheduleId);
    } finally {
      setRunning(null);
    }
  };

  const openAdd = () => {
    setEditId(null);
    setForm(defaultForm());
    setKeywordInput('');
    setSearchKwInput('');
    setShowModal(true);
  };

  const openEdit = (s: Schedule) => {
    setEditId(s.id);
    const isBlog = s.type === 'blog_auto';
    setForm({
      name: s.name,
      type: s.type,
      interval_hours: s.interval_hours,
      run_at_hour: s.run_at_hour,
      blog: isBlog ? (s.config as BlogAutoConfig) : { ...EMPTY_BLOG_CONFIG },
      coupang: !isBlog ? (s.config as CoupangAutoConfig) : { ...EMPTY_COUPANG_CONFIG, search_keywords: [], sns_platforms: ['threads'] },
    });
    setKeywordInput('');
    setSearchKwInput('');
    setShowModal(true);
  };

  const saveSchedule = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const config = form.type === 'blog_auto' ? form.blog : form.coupang;
    const body = { name: form.name, type: form.type, interval_hours: form.interval_hours, run_at_hour: form.run_at_hour, config };
    const url = editId ? `/api/scheduler/schedules/${editId}` : '/api/scheduler/schedules';
    const method = editId ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      await loadSchedules();
      setShowModal(false);
      showToast(editId ? '스케줄 수정됨' : '스케줄 추가됨');
    }
    setSaving(false);
  };

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (!kw || form.blog.keywords.includes(kw)) { setKeywordInput(''); return; }
    setForm(f => ({ ...f, blog: { ...f.blog, keywords: [...f.blog.keywords, kw] } }));
    setKeywordInput('');
  };

  const addSearchKw = () => {
    const kw = searchKwInput.trim();
    if (!kw) { setSearchKwInput(''); return; }
    const current = form.coupang.search_keywords || [];
    if (!current.includes(kw)) {
      setForm(f => ({ ...f, coupang: { ...f.coupang, search_keywords: [...current, kw] } }));
    }
    setSearchKwInput('');
  };

  const toggleSnsPlatform = (p: string) => {
    const current = form.coupang.sns_platforms;
    setForm(f => ({ ...f, coupang: { ...f.coupang, sns_platforms: current.includes(p) ? current.filter(x => x !== p) : [...current, p] } }));
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">로딩 중...</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">⏰ 발행 스케줄러</h1>
          <p className="text-xs text-gray-400 mt-0.5">블로그·쿠팡 콘텐츠를 자동으로 생성하고 발행합니다</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
        >+ 스케줄 추가</button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2.5 bg-gray-900 text-white text-sm rounded-xl shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      {/* NAS 크론 안내 */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-amber-800">⚙️ NAS 자동 실행 설정 (1회 설정 필요)</p>
        <p className="text-[11px] text-amber-700">NAS 터미널에서 아래 명령어로 1분마다 스케줄러가 자동 실행됩니다:</p>
        <code className="block text-[11px] bg-amber-100 rounded-lg px-3 py-2 text-amber-900 font-mono break-all">
          {'(crontab -l 2>/dev/null; echo "* * * * * curl -s -X POST https://loov.co.kr/api/scheduler/run -H \'x-internal-key: YOUR_TELEGRAM_WEBHOOK_SECRET\' 2>/dev/null") | crontab -'}
        </code>
        <p className="text-[10px] text-amber-600">설정 후 NAS cron이 매 분마다 실행 시간이 된 스케줄을 자동으로 처리합니다.</p>
      </div>

      {/* Schedule List */}
      {schedules.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">⏰</p>
          <p className="text-sm">아직 스케줄이 없습니다</p>
          <p className="text-xs mt-1">+ 스케줄 추가 버튼으로 자동화를 시작하세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map(s => (
            <div key={s.id} className={`border rounded-2xl overflow-hidden ${s.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
              <div className="p-4 bg-white">
                <div className="flex items-start gap-3">
                  {/* Toggle */}
                  <button
                    onClick={() => toggleActive(s)}
                    className={`mt-0.5 w-10 h-6 rounded-full transition-colors flex-shrink-0 relative ${s.is_active ? 'bg-blue-500' : 'bg-gray-200'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${s.is_active ? 'left-5' : 'left-1'}`} />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{s.name}</span>
                      <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{TYPE_LABELS[s.type]}</span>
                      {s.last_status && (
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_STYLE[s.last_status] || 'bg-gray-100 text-gray-500'}`}>
                          {s.last_status === 'success' ? '✓ 성공' : s.last_status === 'failed' ? '✗ 실패' : '⟳ 실행중'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                      <span>🕐 {INTERVAL_OPTIONS.find(o => o.value === s.interval_hours)?.label || `${s.interval_hours}h마다`}</span>
                      {s.interval_hours >= 24 && <span>기준시각 {s.run_at_hour}시</span>}
                      {s.last_run_at && <span>마지막: {formatRelativeTime(s.last_run_at)}</span>}
                      {s.next_run_at && s.is_active && (
                        <span className="text-blue-500">다음: {formatRelativeTime(s.next_run_at)}</span>
                      )}
                    </div>

                    {/* Config summary */}
                    {s.type === 'blog_auto' && (
                      <div className="mt-1.5 text-[11px] text-gray-500">
                        키워드 {(s.config as BlogAutoConfig).keywords?.length || 0}개
                        · {(s.config as BlogAutoConfig).blog_platform === 'blogger' ? 'Blogger' : 'WordPress'}
                        · {(s.config as BlogAutoConfig).keyword_mode === 'rotate' ? '순서대로' : '랜덤'}
                      </div>
                    )}
                    {s.type === 'coupang_auto' && (
                      <div className="mt-1.5 text-[11px] text-gray-500">
                        {(s.config as CoupangAutoConfig).product_source === 'goldbox' ? '골드박스' : '키워드 검색'}
                        · {(s.config as CoupangAutoConfig).sns_platforms?.map(p => SNS_LABELS[p]).join(' ')}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => runNow(s.id)}
                      disabled={running === s.id}
                      className="px-2.5 py-1 text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                    >
                      {running === s.id ? '실행중...' : '▶ 실행'}
                    </button>
                    <button onClick={() => openEdit(s)} className="px-2.5 py-1 text-[11px] bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
                      수정
                    </button>
                    <button onClick={() => deleteSchedule(s.id)} className="px-2.5 py-1 text-[11px] bg-red-50 text-red-500 border border-red-100 rounded-lg hover:bg-red-100 transition-colors">
                      삭제
                    </button>
                  </div>
                </div>

                {/* Log toggle */}
                <button
                  onClick={() => loadLogs(s.id)}
                  className="mt-3 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {openLogId === s.id ? '▲ 실행 로그 닫기' : '▼ 실행 로그 보기'}
                </button>
              </div>

              {/* Log Panel */}
              {openLogId === s.id && (
                <div className="border-t border-gray-100 bg-gray-50 p-3 space-y-2 max-h-64 overflow-y-auto">
                  {!logs[s.id]?.length ? (
                    <p className="text-[11px] text-gray-400 text-center py-4">실행 기록이 없습니다</p>
                  ) : (
                    logs[s.id].map(log => (
                      <div key={log.id} className="text-[11px] flex items-start gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${STATUS_STYLE[log.status] || ''}`}>
                          {log.status === 'success' ? '✓' : log.status === 'failed' ? '✗' : '⟳'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="text-gray-500">{new Date(log.started_at).toLocaleString('ko-KR')}</span>
                          {log.summary && <span className="ml-2 text-gray-700">{log.summary}</span>}
                          {log.error && <span className="ml-2 text-red-500">{log.error.slice(0, 80)}</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">{editId ? '스케줄 수정' : '새 스케줄 추가'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>

            <div className="p-5 space-y-4">
              {/* 이름 */}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">스케줄 이름</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="예: 매일 아침 블로그 발행"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                />
              </div>

              {/* 타입 */}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">자동화 유형</label>
                <div className="flex gap-2">
                  {Object.entries(TYPE_LABELS).map(([t, l]) => (
                    <button
                      key={t}
                      onClick={() => setForm(f => ({ ...f, type: t }))}
                      className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-colors ${form.type === t ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}
                    >{l}</button>
                  ))}
                </div>
              </div>

              {/* 주기 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">실행 주기</label>
                  <select
                    value={form.interval_hours}
                    onChange={e => setForm(f => ({ ...f, interval_hours: parseInt(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  >
                    {INTERVAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {form.interval_hours >= 24 && (
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">실행 시각</label>
                    <select
                      value={form.run_at_hour}
                      onChange={e => setForm(f => ({ ...f, run_at_hour: parseInt(e.target.value) }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{i}시</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* 블로그 설정 */}
              {form.type === 'blog_auto' && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <p className="text-xs font-bold text-gray-700">📝 블로그 설정</p>

                  {/* 키워드 */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">키워드 목록</label>
                    <div className="flex gap-2 mb-2">
                      <input
                        value={keywordInput}
                        onChange={e => setKeywordInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addKeyword()}
                        placeholder="키워드 입력 후 Enter"
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                      />
                      <button onClick={addKeyword} className="px-3 py-2 bg-blue-500 text-white text-sm rounded-xl">추가</button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {form.blog.keywords.map(kw => (
                        <span key={kw} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-[11px] rounded-full">
                          {kw}
                          <button onClick={() => setForm(f => ({ ...f, blog: { ...f.blog, keywords: f.blog.keywords.filter(k => k !== kw) } }))} className="text-blue-400 hover:text-blue-700">✕</button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 mb-1 block">키워드 방식</label>
                      <select
                        value={form.blog.keyword_mode}
                        onChange={e => setForm(f => ({ ...f, blog: { ...f.blog, keyword_mode: e.target.value as 'rotate' | 'random' } }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                      >
                        <option value="rotate">순서대로</option>
                        <option value="random">랜덤</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 mb-1 block">글 유형</label>
                      <select
                        value={form.blog.content_type}
                        onChange={e => setForm(f => ({ ...f, blog: { ...f.blog, content_type: e.target.value as 'product' | 'info' } }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                      >
                        <option value="info">정보글</option>
                        <option value="product">상품 추천글</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">발행 플랫폼</label>
                    <div className="flex gap-2">
                      {['blogger', 'wordpress'].map(p => (
                        <button
                          key={p}
                          onClick={() => setForm(f => ({ ...f, blog: { ...f.blog, blog_platform: p as 'blogger' | 'wordpress' } }))}
                          className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-colors ${form.blog.blog_platform === p ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-200 text-gray-600'}`}
                        >{p === 'blogger' ? '📝 Blogger' : '🌐 WordPress'}</button>
                      ))}
                    </div>
                  </div>

                  {form.blog.blog_platform === 'wordpress' && (
                    <div className="space-y-2 bg-gray-50 rounded-xl p-3">
                      <input value={form.blog.wp_url || ''} onChange={e => setForm(f => ({ ...f, blog: { ...f.blog, wp_url: e.target.value } }))} placeholder="WordPress URL (예: https://myblog.com)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                      <input value={form.blog.wp_username || ''} onChange={e => setForm(f => ({ ...f, blog: { ...f.blog, wp_username: e.target.value } }))} placeholder="WordPress 사용자명" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                      <input type="password" value={form.blog.wp_app_password || ''} onChange={e => setForm(f => ({ ...f, blog: { ...f.blog, wp_app_password: e.target.value } }))} placeholder="앱 패스워드 (WP 관리자 → 사용자 → 앱 패스워드)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                    </div>
                  )}
                </div>
              )}

              {/* 쿠팡 설정 */}
              {form.type === 'coupang_auto' && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <p className="text-xs font-bold text-gray-700">🛒 쿠팡 설정</p>

                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">상품 소스</label>
                    <div className="flex gap-2">
                      {[['goldbox', '🎁 골드박스'], ['keyword', '🔍 키워드 검색']].map(([v, l]) => (
                        <button
                          key={v}
                          onClick={() => setForm(f => ({ ...f, coupang: { ...f.coupang, product_source: v as 'goldbox' | 'keyword' } }))}
                          className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-colors ${form.coupang.product_source === v ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-200 text-gray-600'}`}
                        >{l}</button>
                      ))}
                    </div>
                  </div>

                  {form.coupang.product_source === 'keyword' && (
                    <div>
                      <label className="text-xs font-semibold text-gray-600 mb-1 block">검색 키워드</label>
                      <div className="flex gap-2 mb-2">
                        <input value={searchKwInput} onChange={e => setSearchKwInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSearchKw()} placeholder="검색 키워드 입력 후 Enter" className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                        <button onClick={addSearchKw} className="px-3 py-2 bg-orange-500 text-white text-sm rounded-xl">추가</button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(form.coupang.search_keywords || []).map(kw => (
                          <span key={kw} className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-50 text-orange-700 text-[11px] rounded-full">
                            {kw}
                            <button onClick={() => setForm(f => ({ ...f, coupang: { ...f.coupang, search_keywords: (f.coupang.search_keywords || []).filter(k => k !== kw) } }))} className="text-orange-400 hover:text-orange-700">✕</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">발행 SNS</label>
                    <div className="flex flex-wrap gap-2">
                      {SNS_PLATFORMS.map(p => (
                        <button
                          key={p}
                          onClick={() => toggleSnsPlatform(p)}
                          className={`px-3 py-1.5 text-sm rounded-xl border transition-colors ${form.coupang.sns_platforms.includes(p) ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-200 text-gray-600'}`}
                        >{SNS_LABELS[p]}</button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">최소 할인율 (%) — 0이면 무관</label>
                    <input
                      type="number"
                      min={0} max={90}
                      value={form.coupang.min_discount || 0}
                      onChange={e => setForm(f => ({ ...f, coupang: { ...f.coupang, min_discount: parseInt(e.target.value) || 0 } }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium">취소</button>
              <button
                onClick={saveSchedule}
                disabled={saving || !form.name.trim()}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
              >{saving ? '저장 중...' : editId ? '수정 저장' : '스케줄 추가'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
