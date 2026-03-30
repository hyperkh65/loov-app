'use client';

import { useState, useEffect, useCallback } from 'react';

type ViewTab = 'write' | 'calendar' | 'list' | 'settings';
const CATEGORIES = ['전체', '업무', '아이디어', '학습', '개인', '프로젝트', '회의', '일정', '기타'];
const CATEGORY_COLOR: Record<string, string> = {
  '업무': 'bg-blue-100 text-blue-700',
  '아이디어': 'bg-purple-100 text-purple-700',
  '학습': 'bg-green-100 text-green-700',
  '개인': 'bg-pink-100 text-pink-700',
  '프로젝트': 'bg-orange-100 text-orange-700',
  '회의': 'bg-yellow-100 text-yellow-700',
  '일정': 'bg-teal-100 text-teal-700',
  '기타': 'bg-gray-100 text-gray-600',
};

interface Memo {
  id: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  category: string;
  memo_date: string;
  backup_nas: boolean;
  backup_notion: boolean;
  notion_page_id: string;
  created_at: string;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default function MemoPage() {
  const [tab, setTab] = useState<ViewTab>('write');
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // 작성 폼
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [attachFiles, setAttachFiles] = useState<{name: string; base64: string; type: string}[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [category, setCategory] = useState('기타');
  const [summary, setSummary] = useState('');
  const [memoDate, setMemoDate] = useState(new Date().toISOString().split('T')[0]);
  const [aiLoading, setAiLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // 달력
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calMemos, setCalMemos] = useState<Memo[]>([]);

  // 목록
  const [filterCat, setFilterCat] = useState('전체');
  const [filterTag, setFilterTag] = useState('');
  const [search, setSearch] = useState('');
  const [backingUp, setBackingUp] = useState<string | null>(null);

  // 백업 설정 (localStorage)
  const [notionToken, setNotionToken] = useState('');
  const [notionDbId, setNotionDbId] = useState('');
  const [nasPath, setNasPath] = useState('/volume1/memos');
  const [notionPageId, setNotionPageId] = useState('');
  const [creatingDb, setCreatingDb] = useState(false);

  const showMsg = (m: string, isErr = false) => {
    setMsg((isErr ? '❌ ' : '✅ ') + m);
    setTimeout(() => setMsg(''), 3000);
  };

  // 목록 로드
  const loadMemos = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (filterCat !== '전체') p.set('category', filterCat);
    if (filterTag) p.set('tag', filterTag);
    if (search) p.set('q', search);
    const r = await fetch(`/api/memo?${p}`);
    const d = await r.json();
    setMemos(d.memos || []);
    setLoading(false);
  }, [filterCat, filterTag, search]);

  // 달력용 메모 로드
  const loadCalMemos = useCallback(async () => {
    const month = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
    const r = await fetch(`/api/memo?month=${month}`);
    const d = await r.json();
    setCalMemos(d.memos || []);
  }, [calYear, calMonth]);

  useEffect(() => {
    setNotionToken(localStorage.getItem('memo_notion_token') || localStorage.getItem('cafe_notion_token') || '');
    setNotionDbId(localStorage.getItem('memo_notion_dbid') || '');
    setNasPath(localStorage.getItem('memo_nas_path') || '/volume1/memos');
  }, []);

  useEffect(() => { if (tab === 'list') loadMemos(); }, [tab, loadMemos]);
  useEffect(() => { if (tab === 'calendar') loadCalMemos(); }, [tab, loadCalMemos]);

  // AI 분석
  const runAI = async () => {
    if (!content.trim()) { showMsg('내용을 먼저 입력하세요', true); return; }
    setAiLoading(true);
    try {
      const r = await fetch('/api/memo/ai-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, title }),
      });
      const d = await r.json();
      if (d.summary) setSummary(d.summary);
      if (d.tags?.length) setTags(d.tags);
      if (d.category) setCategory(d.category);
      showMsg('AI 분석 완료!');
    } catch { showMsg('AI 분석 실패', true); }
    setAiLoading(false);
  };

  // 저장
  const saveMemo = async () => {
    if (!content.trim()) { showMsg('내용을 입력하세요', true); return; }
    setSaving(true);
    try {
      const body = { title, content, summary, tags, category, memo_date: memoDate };
      const r = editId
        ? await fetch('/api/memo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editId, ...body }) })
        : await fetch('/api/memo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      showMsg(editId ? '수정됨' : '저장됨');
      setTitle(''); setContent(''); setTags([]); setCategory('기타'); setSummary(''); setEditId(null); setAttachFiles([]);
      setMemoDate(new Date().toISOString().split('T')[0]);
    } catch (e) { showMsg(String(e), true); }
    setSaving(false);
  };

  // 삭제
  const deleteMemo = async (id: string) => {
    if (!confirm('삭제할까요?')) return;
    await fetch(`/api/memo?id=${id}`, { method: 'DELETE' });
    loadMemos();
  };

  // 편집 시작
  const startEdit = (m: Memo) => {
    setEditId(m.id); setTitle(m.title); setContent(m.content);
    setSummary(m.summary); setTags(m.tags || []); setCategory(m.category);
    setMemoDate(m.memo_date); setTab('write');
  };

  // 백업
  const backup = async (id: string, memoData?: Memo) => {
    setBackingUp(id);
    // 최신 localStorage 값 읽기 (저장 버튼 없이도 동작)
    const token = notionToken || localStorage.getItem('memo_notion_token') || localStorage.getItem('cafe_notion_token') || '';
    const dbId  = notionDbId  || localStorage.getItem('memo_notion_dbid') || '';
    const nPath = nasPath     || localStorage.getItem('memo_nas_path') || '/volume1/memos';
    try {
      const r = await fetch('/api/memo/backup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, memo: memoData, files: attachFiles.slice(0, 4), notionToken: token, notionDbId: dbId, nasPath: nPath, addToCalendar: true }),
      });
      const d = await r.json();
      setMsg(d.message || `노션: ${d.notion ? '✅' : '❌'} NAS: ${d.nas ? '✅' : '❌'}`);
      setTimeout(() => setMsg(''), 8000); // 에러 메시지 8초 유지
      if (tab === 'list') loadMemos();
    } catch (e) { showMsg('백업 오류: ' + String(e), true); }
    setBackingUp(null);
  };

  // 달력 렌더
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);
  const memoDateMap: Record<string, Memo[]> = {};
  calMemos.forEach(m => {
    if (!memoDateMap[m.memo_date]) memoDateMap[m.memo_date] = [];
    memoDateMap[m.memo_date].push(m);
  });

  const selectedDateMemos = selectedDate ? (memoDateMap[selectedDate] || []) : [];

  // 전체 태그 목록
  const allTags = [...new Set(memos.flatMap(m => m.tags || []))];

  return (
    <div className="min-h-full">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100 px-4 md:px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-black text-gray-900">📓 세컨드 브레인</h1>
            <p className="text-xs text-gray-400 hidden sm:block">AI 자동 분류 · 해시태그 · 3중 백업 기록 시스템</p>
          </div>
          {msg && (
            <div className={`text-xs px-3 py-1.5 rounded-lg ${msg.startsWith('❌') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
              {msg}
            </div>
          )}
        </div>
        <div className="flex gap-1">
          {([
            { key: 'write', label: editId ? '✏️ 편집' : '✏️ 새 메모' },
            { key: 'calendar', label: '📅 달력' },
            { key: 'list', label: '📋 전체 목록' },
            { key: 'settings', label: '⚙️ 백업 설정' },
          ] as { key: ViewTab; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="p-4 md:p-6 max-w-4xl mx-auto">

        {/* ── 작성 탭 ── */}
        {tab === 'write' && (
          <div className="space-y-4">
            {editId && (
              <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                <span>✏️ 편집 모드</span>
                <button onClick={() => { setEditId(null); setTitle(''); setContent(''); setTags([]); setCategory('기타'); setSummary(''); }}
                  className="text-xs text-amber-500 hover:text-amber-700">취소</button>
              </div>
            )}

            {/* 날짜 + 카테고리 */}
            <div className="flex gap-3 flex-wrap">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">날짜</label>
                <input type="date" value={memoDate} onChange={e => setMemoDate(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">카테고리</label>
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
                  {CATEGORIES.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* 제목 */}
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="제목 (선택)"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />

            {/* 내용 */}
            <textarea value={content} onChange={e => setContent(e.target.value)}
              placeholder="메모를 자유롭게 입력하세요. AI가 자동으로 분류하고 해시태그를 생성합니다."
              rows={10}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />

            {/* AI 분석 결과 */}
            {(summary || tags.length > 0) && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-2">
                {summary && (
                  <p className="text-xs text-indigo-800"><span className="font-bold">요약:</span> {summary}</p>
                )}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map(t => (
                      <span key={t} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">#{t}</span>
                    ))}
                  </div>
                )}
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLOR[category] || CATEGORY_COLOR['기타']}`}>
                  {category}
                </span>
              </div>
            )}

            {/* 태그 직접 입력 */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">태그 (직접 입력, Enter로 추가)</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map(t => (
                  <span key={t} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    #{t}
                    <button onClick={() => setTags(tags.filter(x => x !== t))} className="text-gray-400 hover:text-red-500">×</button>
                  </span>
                ))}
              </div>
              <input
                placeholder="태그 입력 후 Enter"
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400 w-48"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const v = (e.target as HTMLInputElement).value.trim().replace(/^#/, '');
                    if (v && !tags.includes(v)) setTags([...tags, v]);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
              />
            </div>

            {/* 파일 첨부 (최대 4개) */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">📎 파일 첨부 (최대 4개 · 백업 시 NAS+Notion 저장)</label>
              <label className="flex items-center gap-2 w-full cursor-pointer border border-dashed border-gray-200 rounded-xl px-3 py-2.5 hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors">
                <span className="text-base">📎</span>
                <span className="text-xs text-gray-400">
                  {attachFiles.length > 0 ? `${attachFiles.length}개 선택됨 (클릭으로 추가)` : '이미지, PDF, 동영상 등 모든 파일'}
                </span>
                <input type="file" multiple className="hidden"
                  onChange={async (e) => {
                    const newFiles = Array.from(e.target.files || []).slice(0, 4 - attachFiles.length);
                    const converted = await Promise.all(newFiles.map(f => new Promise<{name: string; base64: string; type: string}>(res => {
                      const reader = new FileReader();
                      reader.onload = () => res({ name: f.name, base64: (reader.result as string).split(',')[1], type: f.type });
                      reader.readAsDataURL(f);
                    })));
                    setAttachFiles(prev => [...prev, ...converted].slice(0, 4));
                    e.target.value = '';
                  }}
                />
              </label>
              {attachFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {attachFiles.map((f, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {f.type.startsWith('image/') ? '🖼️' : f.type.startsWith('video/') ? '🎬' : '📄'} {f.name}
                      <button onClick={() => setAttachFiles(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 ml-0.5">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 버튼 */}
            <div className="flex gap-2 flex-wrap">
              <button onClick={runAI} disabled={aiLoading || !content.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl">
                {aiLoading ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />분석 중...</> : '🤖 AI 자동 분석'}
              </button>
              <button onClick={saveMemo} disabled={saving || !content.trim()}
                className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl">
                {saving ? '저장 중...' : editId ? '💾 수정 저장' : '💾 저장'}
              </button>
              {editId && (
                <button onClick={() => { setEditId(null); setTitle(''); setContent(''); setTags([]); setCategory('기타'); setSummary(''); }}
                  className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-xl hover:bg-gray-200">
                  취소
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── 달력 탭 ── */}
        {tab === 'calendar' && (
          <div className="space-y-4">
            {/* 월 이동 */}
            <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-3">
              <button onClick={() => { if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); } else setCalMonth(m => m - 1); }}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600">◀</button>
              <span className="font-bold text-gray-900">{calYear}년 {calMonth + 1}월</span>
              <button onClick={() => { if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); } else setCalMonth(m => m + 1); }}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600">▶</button>
            </div>

            {/* 달력 그리드 */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="grid grid-cols-7 text-center text-xs font-semibold text-gray-400 border-b border-gray-100">
                {['일', '월', '화', '수', '목', '금', '토'].map(d => (
                  <div key={d} className="py-2">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} className="h-16 border-b border-r border-gray-50" />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayMemos = memoDateMap[dateStr] || [];
                  const isToday = dateStr === today.toISOString().split('T')[0];
                  const isSelected = dateStr === selectedDate;
                  return (
                    <div key={day}
                      onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                      className={`h-16 border-b border-r border-gray-50 p-1 cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                      <div className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${isToday ? 'bg-indigo-600 text-white' : 'text-gray-700'}`}>{day}</div>
                      <div className="space-y-0.5">
                        {dayMemos.slice(0, 2).map(m => (
                          <div key={m.id} className={`text-[9px] truncate px-1 rounded ${CATEGORY_COLOR[m.category] || 'bg-gray-100 text-gray-500'}`}>
                            {m.title || m.content.slice(0, 12)}
                          </div>
                        ))}
                        {dayMemos.length > 2 && <div className="text-[9px] text-gray-400">+{dayMemos.length - 2}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 선택된 날짜 메모 */}
            {selectedDate && (
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">{selectedDate} 메모 ({selectedDateMemos.length}개)</h3>
                {selectedDateMemos.length === 0
                  ? <p className="text-sm text-gray-400">이 날의 메모가 없습니다.</p>
                  : selectedDateMemos.map(m => <MemoCard key={m.id} memo={m} onEdit={startEdit} onDelete={deleteMemo} onBackup={backup} backingUp={backingUp} />)
                }
              </div>
            )}
          </div>
        )}

        {/* ── 목록 탭 ── */}
        {tab === 'list' && (
          <div className="space-y-4">
            {/* 필터 */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="🔍 검색..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => setFilterCat(c)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterCat === c ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {c}
                  </button>
                ))}
              </div>
              {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {allTags.slice(0, 20).map(t => (
                    <button key={t} onClick={() => setFilterTag(filterTag === t ? '' : t)}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${filterTag === t ? 'bg-indigo-500 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200'}`}>
                      #{t}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={loadMemos} className="text-xs text-indigo-600 hover:text-indigo-500">🔄 새로고침</button>
            </div>

            {loading
              ? <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
              : memos.length === 0
                ? <div className="text-center py-10 text-gray-400 text-sm">메모가 없습니다. 첫 메모를 작성해보세요!</div>
                : memos.map(m => <MemoCard key={m.id} memo={m} onEdit={startEdit} onDelete={deleteMemo} onBackup={backup} backingUp={backingUp} />)
            }
          </div>
        )}

        {/* ── 백업 설정 탭 ── */}
        {tab === 'settings' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
              <p className="text-sm font-bold text-gray-800">📔 Notion 백업 설정</p>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Notion API 키 (Integration Token)</label>
                <input value={notionToken} onChange={e => setNotionToken(e.target.value)} type="password"
                  placeholder="secret_xxxx..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 font-mono" />
                <p className="text-xs text-gray-400 mt-1">없으면 네이버 카페 설정의 Notion 키 자동 사용</p>
              </div>

              {/* DB ID 입력 또는 자동 생성 */}
              <div className="space-y-2">
                <label className="text-xs text-gray-500 block">Notion 메모 DB ID</label>
                {notionDbId ? (
                  <div className="flex gap-2 items-center">
                    <input value={notionDbId} onChange={e => setNotionDbId(e.target.value)}
                      className="flex-1 border border-green-200 bg-green-50 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-400" />
                    <button onClick={() => setNotionDbId('')} className="text-xs text-red-400 hover:text-red-600 px-2">✕</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                      DB가 없습니다. 아래에서 자동 생성하거나 기존 DB ID를 입력하세요.
                    </p>
                    <input value={notionDbId} onChange={e => setNotionDbId(e.target.value)}
                      placeholder="기존 DB ID 직접 입력 (선택)"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-400" />
                    <div className="border border-indigo-100 bg-indigo-50 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-semibold text-indigo-700">✨ Notion DB 자동 생성</p>
                      <p className="text-xs text-indigo-500">Notion에서 통합(Integration)이 접근할 수 있는 페이지 ID를 입력하면 메모 DB가 자동으로 만들어집니다.</p>
                      <input value={notionPageId} onChange={e => setNotionPageId(e.target.value)}
                        placeholder="부모 페이지 ID (Notion URL 마지막 32자리)"
                        className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none bg-white" />
                      <button
                        onClick={async () => {
                          const t = notionToken || localStorage.getItem('cafe_notion_token') || '';
                          if (!t) { showMsg('Notion API 키를 먼저 입력하세요', true); return; }
                          if (!notionPageId.trim()) { showMsg('부모 페이지 ID를 입력하세요', true); return; }
                          setCreatingDb(true);
                          try {
                            const r = await fetch('/api/memo/notion-setup', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ token: t, pageId: notionPageId }),
                            });
                            const d = await r.json();
                            if (d.dbId) {
                              setNotionDbId(d.dbId);
                              localStorage.setItem('memo_notion_dbid', d.dbId);
                              showMsg('✨ Notion DB 자동 생성 완료!');
                            } else {
                              showMsg(d.error || 'DB 생성 실패', true);
                            }
                          } catch (e) { showMsg(String(e), true); }
                          setCreatingDb(false);
                        }}
                        disabled={creatingDb}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg">
                        {creatingDb ? '생성 중...' : '🚀 DB 자동 생성'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
              <p className="text-sm font-bold text-gray-800">🖥️ NAS 백업 설정</p>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">NAS 저장 경로</label>
                <input value={nasPath} onChange={e => setNasPath(e.target.value)}
                  placeholder="/volume1/memos"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 font-mono" />
                <p className="text-xs text-gray-400 mt-1">NAS SSH 접속 정보는 서버 환경변수에서 자동 사용</p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700 space-y-1">
              <p className="font-semibold">💡 백업 방법</p>
              <p>메모 저장 후 각 메모 카드의 <strong>☁️ 백업</strong> 버튼을 누르면 Notion + NAS 동시 저장됩니다.</p>
              <p>Notion DB는 이름, 카테고리, 태그, 날짜, 내용, 액션아이템이 구조화되어 저장됩니다.</p>
              <p>NAS는 <code>{nasPath || '/volume1/memos'}/날짜_ID.json</code> 형식으로 저장됩니다.</p>
            </div>

            <button
              onClick={() => {
                localStorage.setItem('memo_notion_token', notionToken);
                localStorage.setItem('memo_notion_dbid', notionDbId);
                localStorage.setItem('memo_nas_path', nasPath);
                showMsg('설정 저장됨');
              }}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl">
              💾 설정 저장
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MemoCard({ memo, onEdit, onDelete, onBackup, backingUp }: {
  memo: Memo;
  onEdit: (m: Memo) => void;
  onDelete: (id: string) => void;
  onBackup: (id: string, memo: Memo) => void;
  backingUp: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLOR[memo.category] || CATEGORY_COLOR['기타']}`}>
            {memo.category}
          </span>
          <span className="text-xs text-gray-400">{memo.memo_date}</span>
          {memo.backup_notion && <span className="text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">📔 Notion</span>}
          {memo.backup_nas && <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">🖥️ NAS</span>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => onBackup(memo.id, memo)} disabled={backingUp === memo.id}
            className="text-[11px] px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-lg disabled:opacity-50">
            {backingUp === memo.id ? '...' : '☁️ 백업'}
          </button>
          <button onClick={() => onEdit(memo)} className="text-[11px] px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-lg">✏️</button>
          <button onClick={() => onDelete(memo.id)} className="text-[11px] px-2 py-1 bg-red-50 hover:bg-red-100 text-red-400 rounded-lg">🗑</button>
        </div>
      </div>
      {memo.title && <p className="font-bold text-gray-900 text-sm mb-1">{memo.title}</p>}
      {memo.summary && <p className="text-xs text-indigo-700 bg-indigo-50 rounded px-2 py-1 mb-2">{memo.summary}</p>}
      <p className={`text-sm text-gray-600 whitespace-pre-wrap leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>
        {memo.content}
      </p>
      {memo.content.length > 150 && (
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-indigo-500 mt-1">
          {expanded ? '접기 ▲' : '더 보기 ▼'}
        </button>
      )}
      {memo.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {memo.tags.map(t => (
            <span key={t} className="text-[11px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">#{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
