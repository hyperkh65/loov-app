'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChatRoom } from '@/app/api/wechat/rooms/route';
import type { WeChatMessage } from '@/app/api/wechat/messages/route';
import type { SearchResult } from '@/app/api/wechat/search/route';

// ─── 색상 ───────────────────────────────────────────────────────
const SENDER_COLORS = ['text-amber-400','text-emerald-400','text-sky-400','text-rose-400','text-violet-400','text-orange-400','text-teal-400','text-pink-400'];
function getSenderColor(sender: string, map: Map<string, string>) {
  if (sender === '나') return 'text-indigo-400';
  if (!map.has(sender)) map.set(sender, SENDER_COLORS[map.size % SENDER_COLORS.length]);
  return map.get(sender)!;
}

// ─── 달력 유틸 ──────────────────────────────────────────────────
function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDay(y: number, m: number)    { return new Date(y, m, 1).getDay(); }

type LeftView = 'rooms' | 'search' | 'calendar';
type RightTab = 'chat' | 'images' | 'files';

export default function WeChatPage() {
  // ─ 좌측 상태
  const [leftView, setLeftView] = useState<LeftView>('rooms');
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState('');
  const [search, setSearch] = useState('');
  const [showGroupOnly, setShowGroupOnly] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calDay, setCalDay] = useState<string | null>(null);

  // ─ 검색
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─ 우측 상태
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [roomHash, setRoomHash] = useState('');
  const [messages, setMessages] = useState<WeChatMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgError, setMsgError] = useState('');
  const [roomName, setRoomName] = useState('');
  const [senderFilter, setSenderFilter] = useState('');
  const [rightTab, setRightTab] = useState<RightTab>('chat');

  // ─ AI 요약
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showAi, setShowAi] = useState(false);

  // ─ 미디어
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [filePaths, setFilePaths] = useState<{ path: string; name: string; date: string }[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);

  // ─ 백업
  const [backupStatus, setBackupStatus] = useState<{ status?: string; message?: string; daemon?: string } | null>(null);
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupLog, setBackupLog] = useState<string[]>([]);

  const colorMapRef  = useRef(new Map<string, string>());
  const msgScrollRef = useRef<HTMLDivElement>(null);

  // ─────────────── 초기 로드 ────────────────────────────────────
  useEffect(() => {
    fetch('/api/wechat/rooms').then(r => r.json()).then(d => {
      setRooms(d.rooms ?? []);
      if (d.error) setRoomsError(d.error);
    }).catch(e => setRoomsError(e.message)).finally(() => setRoomsLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/wechat/backup-trigger').then(r => r.json()).then(setBackupStatus).catch(() => {});
  }, []);

  // ─────────────── 대화방 열기 ──────────────────────────────────
  const openRoom = useCallback(async (room: ChatRoom) => {
    setSelectedRoom(room);
    setMessages([]); setMsgError(''); setMsgLoading(true);
    setSenderFilter(''); setRightTab('chat'); setAiSummary(''); setShowAi(false);
    setImagePaths([]); setFilePaths([]); setRoomHash('');
    colorMapRef.current = new Map();

    try {
      const res = await fetch(`/api/wechat/messages?room=${encodeURIComponent(room.filename)}`);
      const data = await res.json();
      if (data.error) setMsgError(data.error);
      else { setMessages(data.messages ?? []); setRoomName(data.name ?? room.name); setRoomHash(data.roomHash ?? ''); }
    } catch (e) { setMsgError(String(e)); }
    finally { setMsgLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 스크롤 to bottom
  useEffect(() => {
    if (!msgLoading && messages.length > 0) {
      const t = setTimeout(() => { const el = msgScrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, 50);
      return () => clearTimeout(t);
    }
  }, [msgLoading, messages.length]);

  // ─────────────── AI 요약 ─────────────────────────────────────
  const generateSummary = useCallback(async () => {
    if (!selectedRoom || messages.length === 0) return;
    setAiLoading(true); setShowAi(true); setAiSummary('');
    try {
      const res = await fetch('/api/wechat/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: roomName, messages: messages.slice(-150) }),
      });
      const d = await res.json() as { summary?: string };
      setAiSummary(d.summary ?? '요약 실패');
    } catch (e) { setAiSummary(String(e)); }
    finally { setAiLoading(false); }
  }, [selectedRoom, messages, roomName]);

  // ─────────────── 검색 ────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/wechat/search?q=${encodeURIComponent(q)}`);
      const d = await res.json() as { results: SearchResult[] };
      setSearchResults(d.results ?? []);
    } finally { setSearching(false); }
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(searchQ), 500);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQ, doSearch]);

  // ─────────────── 미디어 ──────────────────────────────────────
  const loadImages = useCallback(async (roomId: string) => {
    setImagesLoading(true);
    try {
      const res = await fetch(`/api/wechat/media?room_id=${encodeURIComponent(roomId)}&type=images`);
      const d = await res.json();
      setImagePaths(d.paths ?? []);
    } finally { setImagesLoading(false); }
  }, []);

  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const res = await fetch('/api/wechat/media?type=files');
      const d = await res.json();
      setFilePaths(d.files ?? []);
    } finally { setFilesLoading(false); }
  }, []);

  const handleTabChange = (tab: RightTab) => {
    setRightTab(tab);
    if (tab === 'images' && imagePaths.length === 0 && selectedRoom) loadImages(selectedRoom.id);
    if (tab === 'files' && filePaths.length === 0) loadFiles();
  };

  // ─────────────── 백업 ────────────────────────────────────────
  const triggerBackup = async () => {
    setBackupRunning(true); setBackupLog([]);
    try {
      const res = await fetch('/api/wechat/backup-trigger', { method: 'POST' });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value);
        const events = buf.split('\n\n'); buf = events.pop() ?? '';
        for (const ev of events) {
          const dl = ev.split('\n').find(l => l.startsWith('data: '));
          if (!dl) continue;
          try {
            const p = JSON.parse(dl.slice(6)) as { status?: string; message?: string };
            if (p.message) setBackupLog(prev => [...prev, p.message!]);
            setBackupStatus(p);
            if (p.status === 'done') {
              // 목록 갱신
              fetch('/api/wechat/rooms').then(r => r.json()).then(d => setRooms(d.rooms ?? []));
              // 현재 열려있는 대화방 메시지도 갱신
              setSelectedRoom(prev => {
                if (prev) {
                  setMsgLoading(true);
                  fetch(`/api/wechat/messages?room=${encodeURIComponent(prev.filename)}`)
                    .then(r => r.json())
                    .then(data => {
                      if (!data.error) {
                        setMessages(data.messages ?? []);
                        setRoomName(data.name ?? prev.name);
                        setRoomHash(data.roomHash ?? '');
                      }
                    })
                    .finally(() => setMsgLoading(false));
                }
                return prev;
              });
            }
          } catch { /**/ }
        }
      }
    } finally { setBackupRunning(false); }
  };

  // ─────────────── 달력 데이터 ──────────────────────────────────
  const msgDates = new Set(messages.map(m => m.time.slice(0, 10)));
  const calDaysInMonth = getDaysInMonth(calYear, calMonth);
  const calFirstDay   = getFirstDay(calYear, calMonth);
  const calDayMsgs = calDay ? messages.filter(m => m.time.startsWith(calDay)) : [];

  // ─────────────── 필터 ────────────────────────────────────────
  const filteredRooms = rooms.filter(r => {
    if (showGroupOnly && !r.isGroup) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const senders = [...new Set(messages.map(m => m.sender))].filter(s => s !== '나');
  const filteredMessages = senderFilter ? messages.filter(m => m.sender === senderFilter || m.sender === '나') : messages;
  const mediaSummary = messages.reduce<Record<string, number>>((acc, m) => {
    if (m.isMedia && m.mediaType) acc[m.mediaType] = (acc[m.mediaType] ?? 0) + 1;
    return acc;
  }, {});
  const fileMessages = filteredMessages.filter(m => m.filePath);
  const calViewMsgs = calDay ? filteredMessages.filter(m => m.time.startsWith(calDay)) : filteredMessages;

  const isDaemonRunning = backupStatus?.daemon === 'running' || backupStatus?.status === 'idle' || backupStatus?.status === 'done' || backupStatus?.status === 'running';

  // ─────────────── 렌더 ────────────────────────────────────────
  return (
    <div className="flex h-full bg-slate-950 text-slate-100 overflow-hidden">

      {/* ══════════════ 좌측 패널 ══════════════ */}
      <div className="w-72 flex-shrink-0 border-r border-slate-700/50 flex flex-col">

        {/* 탑바 */}
        <div className="p-3 border-b border-slate-700/50 flex-shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-bold text-white">💬 위챗 히스토리</h1>
            {/* 백업 버튼 */}
            <button onClick={triggerBackup} disabled={backupRunning}
              className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                backupRunning ? 'bg-amber-600/50 text-amber-300 cursor-not-allowed'
                : isDaemonRunning ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-slate-600 hover:bg-slate-500 text-slate-200'
              }`}>
              {backupRunning ? '⟳ 백업 중...' : '⬆ 백업'}
            </button>
          </div>

          {/* 백업 상태 */}
          {backupStatus && (
            <div className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 ${
              backupStatus.status === 'running' ? 'bg-amber-900/30 text-amber-300'
              : backupStatus.status === 'done' ? 'bg-emerald-900/30 text-emerald-400'
              : backupStatus.status === 'error' ? 'bg-red-900/30 text-red-400'
              : 'bg-slate-800/50 text-slate-500'
            }`}>
              <span>{backupStatus.status === 'running' ? '⟳' : backupStatus.status === 'done' ? '✓' : backupStatus.status === 'error' ? '✗' : '●'}</span>
              <span className="truncate">{backupStatus.message ?? backupStatus.status}</span>
            </div>
          )}
          {backupLog.length > 0 && (
            <div className="bg-slate-800/50 rounded p-1.5 text-[10px] text-slate-400 max-h-14 overflow-y-auto">
              {backupLog.slice(-4).map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}

          {/* 뷰 전환 탭 */}
          <div className="flex gap-1">
            {(['rooms', 'search', 'calendar'] as const).map((v, i) => (
              <button key={v} onClick={() => setLeftView(v)}
                className={`flex-1 text-[10px] py-1 rounded transition-colors ${leftView === v ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                {['목록', '검색', '달력'][i]}
              </button>
            ))}
          </div>
        </div>

        {/* ── 목록 뷰 ── */}
        {leftView === 'rooms' && (
          <>
            <div className="px-3 pt-2 pb-1 flex-shrink-0 space-y-1.5">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="대화방 검색..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
              <div className="flex gap-1">
                {(['전체','그룹방'] as const).map((l, i) => (
                  <button key={l} onClick={() => setShowGroupOnly(i === 1)}
                    className={`flex-1 text-[10px] py-0.5 rounded transition-colors ${showGroupOnly === (i===1) ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {roomsLoading && <div className="p-4 text-center text-slate-400 text-xs">불러오는 중...</div>}
              {roomsError && <div className="p-3 text-xs text-red-400">❌ {roomsError}</div>}
              {filteredRooms.map(room => (
                <button key={room.filename} onClick={() => openRoom(room)}
                  className={`w-full text-left px-3 py-2.5 border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors ${selectedRoom?.filename === room.filename ? 'bg-slate-800 border-l-2 border-l-indigo-500' : ''}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">{room.isGroup ? '👥' : '👤'}</span>
                    <span className="text-xs font-medium text-white truncate flex-1">{room.name}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 ml-5">{room.count.toLocaleString()}개 메시지</div>
                </button>
              ))}
              {!roomsLoading && <div className="p-2 text-center text-[10px] text-slate-700">{filteredRooms.length}/{rooms.length}개</div>}
            </div>
          </>
        )}

        {/* ── 검색 뷰 ── */}
        {leftView === 'search' && (
          <>
            <div className="px-3 pt-2 pb-1 flex-shrink-0">
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="메시지 전체 검색..."
                autoFocus
                className="w-full bg-slate-800 border border-indigo-600 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none" />
              {searching && <p className="text-[10px] text-slate-500 mt-1 text-center">검색 중...</p>}
            </div>
            <div className="flex-1 overflow-y-auto">
              {searchResults.length === 0 && searchQ.length >= 2 && !searching && (
                <div className="p-4 text-center text-slate-500 text-xs">결과 없음</div>
              )}
              {searchResults.map((r, i) => (
                <button key={i} onClick={() => {
                  const room = rooms.find(rm => rm.filename === r.filename || rm.name === r.room);
                  if (room) { openRoom(room); setLeftView('rooms'); }
                }} className="w-full text-left px-3 py-2 border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors">
                  <div className="text-[11px] font-medium text-indigo-400 truncate">{r.room}</div>
                  <div className="text-[10px] text-slate-300 mt-0.5 truncate">{r.content}</div>
                  <div className="text-[10px] text-slate-600 mt-0.5">{r.time} · {r.sender}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── 달력 뷰 (대화방 선택 필요) ── */}
        {leftView === 'calendar' && (
          <div className="flex-1 overflow-y-auto p-3">
            {!selectedRoom ? (
              <div className="text-center text-slate-500 text-xs py-8">먼저 대화방을 선택하세요</div>
            ) : (
              <>
                {/* 월 네비게이션 */}
                <div className="flex items-center justify-between mb-3">
                  <button onClick={() => { const d = new Date(calYear, calMonth - 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
                    className="text-slate-400 hover:text-white px-2">‹</button>
                  <span className="text-xs font-medium text-slate-300">{calYear}.{String(calMonth+1).padStart(2,'0')}</span>
                  <button onClick={() => { const d = new Date(calYear, calMonth + 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
                    className="text-slate-400 hover:text-white px-2">›</button>
                </div>
                {/* 요일 헤더 */}
                <div className="grid grid-cols-7 mb-1">
                  {['일','월','화','수','목','금','토'].map(d => (
                    <div key={d} className="text-center text-[10px] text-slate-600">{d}</div>
                  ))}
                </div>
                {/* 날짜 그리드 */}
                <div className="grid grid-cols-7 gap-0.5">
                  {Array.from({ length: calFirstDay }).map((_, i) => <div key={`e${i}`} />)}
                  {Array.from({ length: calDaysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                    const hasMsg = msgDates.has(dateStr);
                    const isSelected = calDay === dateStr;
                    return (
                      <button key={day} onClick={() => setCalDay(isSelected ? null : dateStr)}
                        className={`aspect-square rounded text-[11px] flex items-center justify-center transition-colors ${
                          isSelected ? 'bg-indigo-600 text-white font-bold'
                          : hasMsg ? 'bg-indigo-900/50 text-indigo-300 hover:bg-indigo-800/50'
                          : 'text-slate-600 hover:text-slate-400'
                        }`}>
                        {day}
                      </button>
                    );
                  })}
                </div>
                {calDay && (
                  <p className="mt-3 text-center text-[10px] text-slate-400">
                    {calDay} — {calDayMsgs.length}개 메시지
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ══════════════ 우측 패널 ══════════════ */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedRoom ? (
          <div className="flex-1 flex items-center justify-center text-slate-600">
            <div className="text-center"><div className="text-5xl mb-4">💬</div><p className="text-sm">좌측에서 대화방을 선택하세요</p></div>
          </div>
        ) : (
          <>
            {/* 헤더 */}
            <div className="p-3 border-b border-slate-700/50 flex-shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold text-white flex items-center gap-1.5 truncate">
                    {selectedRoom.isGroup ? '👥' : '👤'} {roomName || selectedRoom.name}
                  </h2>
                  <p className="text-[10px] text-slate-500">{selectedRoom.id} · {messages.length.toLocaleString()}개</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {Object.entries(mediaSummary).slice(0,3).map(([t, c]) => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 bg-slate-700 rounded-full text-slate-300">{t} {c}</span>
                  ))}
                  <button onClick={() => openRoom(selectedRoom)} disabled={msgLoading}
                    className="text-[10px] px-2.5 py-1 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                    title="메시지 새로고침">
                    {msgLoading ? '⟳' : '↺'}
                  </button>
                  <button onClick={generateSummary} disabled={aiLoading || messages.length === 0}
                    className="text-[10px] px-2.5 py-1 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white rounded-lg transition-colors">
                    {aiLoading ? '⟳ 요약 중' : '✦ AI 요약'}
                  </button>
                </div>
              </div>

              {/* AI 요약 패널 */}
              {showAi && (
                <div className="mt-2 p-2.5 bg-violet-900/20 border border-violet-700/30 rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider">✦ AI 요약</span>
                    <button onClick={() => setShowAi(false)} className="text-slate-500 hover:text-slate-300 text-xs">✕</button>
                  </div>
                  {aiLoading ? (
                    <div className="text-xs text-slate-400 animate-pulse">요약 생성 중...</div>
                  ) : (
                    <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{aiSummary}</p>
                  )}
                </div>
              )}

              {/* 탭 */}
              <div className="flex gap-1 mt-2">
                {(['chat','images','files'] as const).map((tab, i) => (
                  <button key={tab} onClick={() => handleTabChange(tab)}
                    className={`text-xs px-3 py-1 rounded-lg transition-colors ${rightTab === tab ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                    {['💬 메시지','🖼 이미지','📎 파일'][i]}
                  </button>
                ))}
              </div>

              {/* 발신자 필터 */}
              {rightTab === 'chat' && senders.length > 1 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <button onClick={() => setSenderFilter('')}
                    className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${!senderFilter ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400'}`}>전체</button>
                  {senders.slice(0,12).map(s => (
                    <button key={s} onClick={() => setSenderFilter(s === senderFilter ? '' : s)}
                      className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${senderFilter === s ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── 채팅 탭 ── */}
            {rightTab === 'chat' && (
              <>
                {/* 달력 뷰에서 날짜 선택 시 필터 표시 */}
                {leftView === 'calendar' && calDay && (
                  <div className="px-4 py-1.5 bg-indigo-900/20 text-[10px] text-indigo-300 flex items-center justify-between flex-shrink-0">
                    <span>📅 {calDay} 메시지 ({calViewMsgs.length}개)</span>
                    <button onClick={() => setCalDay(null)} className="text-slate-400 hover:text-white">✕ 필터 해제</button>
                  </div>
                )}
                <div ref={msgScrollRef} className="flex-1 overflow-y-auto p-4">
                  {msgLoading && <div className="flex items-center justify-center h-32 text-slate-400 text-sm">불러오는 중...</div>}
                  {msgError && <div className="p-3 text-red-400 text-xs">❌ {msgError}</div>}
                  {!msgLoading && !msgError && (
                    <div className="space-y-1">
                      {(leftView === 'calendar' && calDay ? calViewMsgs : filteredMessages).map((msg, i) => {
                        const isMe = msg.sender === '나';
                        const color = getSenderColor(msg.sender, colorMapRef.current);
                        return (
                          <div key={i} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                            {!isMe && <span className={`text-[10px] font-medium flex-shrink-0 w-16 text-right truncate ${color}`}>{msg.sender}</span>}
                            <div className={`max-w-[68%] rounded-xl px-3 py-1.5 text-xs leading-relaxed ${
                              msg.filePath ? 'bg-slate-700/60 text-slate-200 flex items-center gap-2'
                              : msg.isMedia ? 'bg-slate-700/50 text-slate-400 italic'
                              : isMe ? 'bg-indigo-600/40 text-slate-200'
                              : 'bg-slate-700/60 text-slate-200'
                            }`}>
                              {msg.filePath ? (
                                <>
                                  <span className="flex-1 truncate">{msg.content}</span>
                                  <a href={`/api/wechat/media?serve=${encodeURIComponent(msg.filePath)}`} target="_blank" rel="noopener noreferrer"
                                    className="flex-shrink-0 text-[10px] px-1.5 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors">↓</a>
                                </>
                              ) : (
                                <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                              )}
                              <span className="ml-1.5 text-[10px] text-slate-500 whitespace-nowrap">{msg.time.slice(11)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="p-1.5 border-t border-slate-700/30 text-center text-[10px] text-slate-600 flex-shrink-0">
                  {filteredMessages.length.toLocaleString()}개{senderFilter && ` · ${senderFilter}`}
                </div>
              </>
            )}

            {/* ── 이미지 탭 ── */}
            {rightTab === 'images' && (
              <div className="flex-1 overflow-y-auto p-4">
                {imagesLoading && <div className="flex items-center justify-center h-32 text-slate-400 text-sm">이미지 목록 불러오는 중...</div>}
                {!imagesLoading && imagePaths.length === 0 && <div className="text-center text-slate-500 text-xs py-8">이미지 없음</div>}
                {!imagesLoading && imagePaths.length > 0 && (
                  <>
                    <p className="text-xs text-slate-500 mb-3">{imagePaths.length}개 이미지 (최신순)</p>
                    <div className="grid grid-cols-3 gap-2">
                      {imagePaths.map((path, i) => (
                        <a key={i} href={`/api/wechat/media?serve=${encodeURIComponent(path)}`} target="_blank" rel="noopener noreferrer"
                          className="aspect-square bg-slate-800 rounded-lg overflow-hidden hover:opacity-80 transition-opacity">
                          <img src={`/api/wechat/media?serve=${encodeURIComponent(path)}`} alt="" className="w-full h-full object-cover" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── 파일 탭 ── */}
            {rightTab === 'files' && (
              <div className="flex-1 overflow-y-auto p-4">
                {filesLoading && <div className="flex items-center justify-center h-32 text-slate-400 text-sm">파일 목록 불러오는 중...</div>}
                {!filesLoading && (
                  <>
                    {fileMessages.length > 0 && (
                      <div className="mb-5">
                        <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">이 대화방 파일 ({fileMessages.length})</p>
                        <div className="space-y-1.5">
                          {fileMessages.map((m, i) => (
                            <div key={i} className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-3 py-2">
                              <span className="text-sm">📄</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-slate-200 truncate">{m.fileName}</p>
                                <p className="text-[10px] text-slate-500">{m.time}</p>
                              </div>
                              <a href={`/api/wechat/media?serve=${encodeURIComponent(m.filePath!)}`} target="_blank" rel="noopener noreferrer"
                                className="flex-shrink-0 text-[10px] px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors">다운로드</a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {filePaths.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">전체 파일 ({filePaths.length})</p>
                        <div className="space-y-1">
                          {filePaths.map((f, i) => (
                            <div key={i} className="flex items-center gap-2 bg-slate-800/30 rounded-lg px-3 py-1.5">
                              <span className="text-xs">📄</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] text-slate-300 truncate">{f.name}</p>
                                <p className="text-[10px] text-slate-600">{f.date}</p>
                              </div>
                              <a href={`/api/wechat/media?serve=${encodeURIComponent(f.path)}`} target="_blank" rel="noopener noreferrer"
                                className="flex-shrink-0 text-[10px] px-2 py-0.5 bg-slate-600 hover:bg-slate-500 text-white rounded">↓</a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {filePaths.length === 0 && fileMessages.length === 0 && (
                      <div className="text-center text-slate-500 text-xs py-8">파일 없음</div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
