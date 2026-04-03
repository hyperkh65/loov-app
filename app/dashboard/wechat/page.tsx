'use client';

import { useState, useEffect, useCallback } from 'react';

interface BackupRecord {
  id: string;
  title: string;
  date: string;
  count: number | null;
}

interface ContentBlock {
  type: string;
  text: string;
}

interface Message {
  time: string;
  sender: string;
  text: string;
  isFile: boolean;
}

interface DetailState {
  summary: string;
  messages: Message[];
  senders: string[];
  nextBlockCursor: string | null;
  hasMoreBlocks: boolean;
}

function parseBlocks(content: ContentBlock[], existing?: DetailState): DetailState {
  const summary = existing?.summary ?? '';
  const messages: Message[] = existing?.messages ? [...existing.messages] : [];
  let inSummary = false;
  let inLog = existing ? true : false; // 더보기로 온 블록은 모두 메시지 로그
  let parsedSummary = summary;

  for (const block of content) {
    if (block.type === 'heading_2') {
      inSummary = block.text === 'AI 요약';
      inLog = block.text === '메시지 로그';
      continue;
    }
    if (inSummary && block.type === 'paragraph') {
      parsedSummary = block.text;
      inSummary = false;
    }
    if (inLog && block.type === 'paragraph' && block.text) {
      const m = block.text.match(/^\[(.+?)\]\s+(.+?):\s+(.+)$/s);
      if (m) {
        const isFile = /^\[(이미지|영상|음성|스티커|공유\/파일|위치|미디어)\]$/.test(m[3].trim());
        messages.push({ time: m[1], sender: m[2], text: m[3], isFile });
      }
    }
  }

  const senders = [...new Set(messages.filter((m) => m.sender !== '나').map((m) => m.sender))];
  return { summary: parsedSummary, messages, senders, nextBlockCursor: null, hasMoreBlocks: false };
}

export default function WeChatHistoryPage() {
  const [records, setRecords] = useState<BackupRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState<BackupRecord | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadingMoreMsgs, setLoadingMoreMsgs] = useState(false);

  const [filterSender, setFilterSender] = useState('');
  const [allSenders, setAllSenders] = useState<string[]>([]);

  const fetchList = useCallback(async (cursor?: string) => {
    const url = '/api/wechat/history' + (cursor ? `?cursor=${cursor}` : '');
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data as { pages: BackupRecord[]; nextCursor: string | null; hasMore: boolean };
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchList()
      .then((data) => {
        setRecords(data.pages);
        setNextCursor(data.nextCursor);
        setHasMore(data.hasMore);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fetchList]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const data = await fetchList(nextCursor);
      setRecords((prev) => [...prev, ...data.pages]);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } finally {
      setLoadingMore(false);
    }
  };

  const openDetail = async (rec: BackupRecord) => {
    setSelected(rec);
    setDetail(null);
    setDetailLoading(true);
    setFilterSender('');
    try {
      const res = await fetch(`/api/wechat/history?id=${rec.id}`);
      const data = await res.json() as { content: ContentBlock[]; nextBlockCursor: string | null; hasMoreBlocks: boolean };
      const parsed = parseBlocks(data.content ?? []);
      parsed.nextBlockCursor = data.nextBlockCursor;
      parsed.hasMoreBlocks = data.hasMoreBlocks;
      setDetail(parsed);
      setAllSenders((prev) => [...new Set([...prev, ...parsed.senders])]);
    } finally {
      setDetailLoading(false);
    }
  };

  const loadMoreMessages = async () => {
    if (!selected || !detail?.nextBlockCursor) return;
    setLoadingMoreMsgs(true);
    try {
      const res = await fetch(`/api/wechat/history?id=${selected.id}&blockCursor=${detail.nextBlockCursor}`);
      const data = await res.json() as { content: ContentBlock[]; nextBlockCursor: string | null; hasMoreBlocks: boolean };
      // 더보기 블록은 모두 메시지 로그이므로 inLog=true로 시작
      const updated = parseBlocks(data.content ?? [], detail);
      updated.nextBlockCursor = data.nextBlockCursor;
      updated.hasMoreBlocks = data.hasMoreBlocks;
      setDetail(updated);
      setAllSenders((prev) => [...new Set([...prev, ...updated.senders])]);
    } finally {
      setLoadingMoreMsgs(false);
    }
  };

  const filteredMessages = detail?.messages.filter(
    (m) => !filterSender || m.sender === filterSender
  );

  const fileCounts = detail?.messages.reduce<Record<string, number>>((acc, m) => {
    if (m.isFile) {
      const key = m.text.replace(/[\[\]]/g, '');
      acc[key] = (acc[key] ?? 0) + 1;
    }
    return acc;
  }, {});

  return (
    <div className="flex h-full bg-slate-950 text-slate-100">
      {/* 좌측: 백업 목록 */}
      <div className="w-64 flex-shrink-0 border-r border-slate-700/50 flex flex-col">
        <div className="p-4 border-b border-slate-700/50">
          <h1 className="text-base font-bold text-white flex items-center gap-2">
            💬 위챗 백업 히스토리
          </h1>
          <p className="text-xs text-slate-400 mt-1">Notion에 저장된 백업 목록</p>
        </div>

        {/* 발신자 필터 */}
        {allSenders.length > 0 && (
          <div className="p-3 border-b border-slate-700/50">
            <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider">채팅 상대 필터</p>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setFilterSender('')}
                className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                  !filterSender ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                전체
              </button>
              {allSenders.map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterSender(s === filterSender ? '' : s)}
                  className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                    filterSender === s ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-4 text-center text-slate-400 text-sm">불러오는 중...</div>}
          {error && (
            <div className="p-4 text-red-400 text-sm">
              ❌ {error}
              <p className="text-xs mt-1 text-slate-500">설정 → 위챗 백업에서 Notion 연동을 확인하세요</p>
            </div>
          )}
          {!loading && !error && records.length === 0 && (
            <div className="p-4 text-slate-500 text-sm text-center">
              <p>백업 기록이 없습니다</p>
              <p className="text-xs mt-1">파이프라인을 실행하여 첫 백업을 진행하세요</p>
            </div>
          )}
          {records.map((rec) => (
            <button
              key={rec.id}
              onClick={() => openDetail(rec)}
              className={`w-full text-left px-4 py-3 border-b border-slate-800 hover:bg-slate-800/50 transition-colors ${
                selected?.id === rec.id ? 'bg-slate-800 border-l-2 border-l-indigo-500' : ''
              }`}
            >
              <div className="text-sm font-medium text-white">{rec.date}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {rec.count !== null ? `${rec.count}개 메시지` : '메시지 수 없음'}
              </div>
            </button>
          ))}
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-3 text-xs text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors"
            >
              {loadingMore ? '불러오는 중...' : '더 보기'}
            </button>
          )}
        </div>
      </div>

      {/* 우측: 상세 */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selected && (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            <div className="text-center">
              <div className="text-4xl mb-3">💬</div>
              <p className="text-sm">좌측에서 백업 날짜를 선택하세요</p>
            </div>
          </div>
        )}

        {selected && (
          <>
            {/* 헤더 */}
            <div className="p-4 border-b border-slate-700/50 flex items-start justify-between gap-4 flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-white">{selected.date} 백업</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {detail ? `${detail.messages.length}개 로드됨` : ''}
                  {selected.count !== null && detail && detail.messages.length < selected.count
                    ? ` / 전체 ${selected.count}개` : ''}
                </p>
              </div>
              {fileCounts && Object.keys(fileCounts).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(fileCounts).map(([type, cnt]) => (
                    <span key={type} className="text-xs px-2 py-0.5 bg-slate-700 rounded-full text-slate-300">
                      {type} {cnt}건
                    </span>
                  ))}
                </div>
              )}
            </div>

            {detailLoading && (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                불러오는 중...
              </div>
            )}

            {!detailLoading && detail && (
              <div className="flex-1 overflow-y-auto">
                {/* AI 요약 */}
                {detail.summary && (
                  <div className="p-4 border-b border-slate-700/50">
                    <div className="text-xs font-semibold text-indigo-400 mb-2 uppercase tracking-wider">AI 요약</div>
                    <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed bg-slate-800/50 rounded-xl p-3">
                      {detail.summary}
                    </div>
                  </div>
                )}

                {/* 메시지 로그 */}
                <div className="p-4">
                  <div className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wider">
                    메시지 로그
                    {filterSender && <span className="ml-2 text-indigo-400 normal-case">— {filterSender} 필터</span>}
                  </div>
                  <div className="space-y-1.5">
                    {(filteredMessages ?? []).map((msg, i) => (
                      <div
                        key={i}
                        className={`flex gap-2 text-xs ${msg.sender === '나' ? 'flex-row-reverse' : ''}`}
                      >
                        <div className={`flex-shrink-0 font-medium ${
                          msg.sender === '나' ? 'text-indigo-400' : 'text-amber-400'
                        }`}>
                          {msg.sender}
                        </div>
                        <div className={`rounded-lg px-2.5 py-1.5 max-w-lg ${
                          msg.isFile
                            ? 'bg-slate-700/50 text-slate-400 italic'
                            : msg.sender === '나'
                            ? 'bg-indigo-600/30 text-slate-200'
                            : 'bg-slate-700/60 text-slate-200'
                        }`}>
                          {msg.text}
                          <span className="ml-2 text-[10px] text-slate-500">{msg.time.slice(11, 16)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 메시지 더보기 */}
                  {detail.hasMoreBlocks && (
                    <div className="mt-4 text-center">
                      <button
                        onClick={loadMoreMessages}
                        disabled={loadingMoreMsgs}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white text-xs rounded-lg transition-colors disabled:opacity-50"
                      >
                        {loadingMoreMsgs ? '불러오는 중...' : `메시지 더보기 (100개씩)`}
                      </button>
                    </div>
                  )}
                  {!detail.hasMoreBlocks && detail.messages.length > 0 && (
                    <p className="mt-4 text-center text-xs text-slate-600">— 전체 {detail.messages.length}개 메시지 —</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
