'use client';

import { useState, useEffect, useRef } from 'react';
import { VOCAB_DB, VOCAB_CATEGORIES, WordEntry } from './data/vocabulary';
import { GRAMMAR_DB } from './data/grammar';
import { CONVERSATIONS, CONVERSATION_CATEGORIES, Conversation } from './data/conversations';

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = 'vocab' | 'grammar' | 'conversation' | 'video' | 'ai';
type QuizMode = 'flashcard' | 'multi' | 'input' | null;

interface SavedWord {
  word: string;
  pinyin: string;
  meaning: string;
  savedAt: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── YouTube video categories ─────────────────────────────────────────────────
const VIDEO_CATEGORIES = [
  { label: '전체', query: '중국어 회화 학습' },
  { label: '입문 회화', query: '중국어 입문 회화' },
  { label: '비즈니스', query: '비즈니스 중국어 무역' },
  { label: '발음·성조', query: '중국어 발음 성조 배우기' },
  { label: 'HSK', query: 'HSK 중국어 시험' },
  { label: '중국문화', query: '중국 문화 역사' },
  { label: 'CCTV뉴스', query: 'CCTV 뉴스 중국어' },
  { label: '무역·협상', query: '중국 무역 협상 중국어' },
];

// ─── Highlight helper ─────────────────────────────────────────────────────────
function HL({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return <>
    {parts.map((p, i) =>
      p.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-700 rounded px-0.5">{p}</mark>
        : p
    )}
  </>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
export default function ChinesePage() {
  const [tab, setTab] = useState<Tab>('vocab');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'vocab', label: '📖 단어장' },
    { id: 'grammar', label: '📐 문법·패턴' },
    { id: 'conversation', label: '💬 회화' },
    { id: 'video', label: '🎬 영상' },
    { id: 'ai', label: '🤖 AI 대화' },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 shrink-0">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">🇨🇳 중국어 학습센터</h1>
        <p className="text-xs text-gray-500 mt-0.5">단어 {VOCAB_DB.length}+ · 문법 {GRAMMAR_DB.length}+ · 회화 {CONVERSATIONS.length}+</p>
      </div>

      {/* Tab Bar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex overflow-x-auto shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.id
                ? 'border-red-500 text-red-600 dark:text-red-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'vocab' && <VocabTab />}
        {tab === 'grammar' && <GrammarTab />}
        {tab === 'conversation' && <ConversationTab />}
        {tab === 'video' && <VideoTab />}
        {tab === 'ai' && <AITab />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VOCAB TAB
// ═══════════════════════════════════════════════════════════════════════════════
function VocabTab() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('전체');
  const [page, setPage] = useState(1);
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [quizMode, setQuizMode] = useState<QuizMode>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [expandedWord, setExpandedWord] = useState<string | null>(null);
  const PER_PAGE = 40;

  useEffect(() => {
    const stored = localStorage.getItem('chinese_saved_words');
    if (stored) setSavedWords(JSON.parse(stored));
  }, []);

  const saveWord = (w: WordEntry) => {
    if (savedWords.some(s => s.word === w.word)) return;
    const updated = [...savedWords, { word: w.word, pinyin: w.pinyin, meaning: w.meaning, savedAt: new Date().toISOString() }];
    setSavedWords(updated);
    localStorage.setItem('chinese_saved_words', JSON.stringify(updated));
  };

  const removeWord = (word: string) => {
    const updated = savedWords.filter(s => s.word !== word);
    setSavedWords(updated);
    localStorage.setItem('chinese_saved_words', JSON.stringify(updated));
  };

  const filtered = VOCAB_DB.filter(w => {
    if (category !== '전체' && w.category !== category) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return w.word.includes(q) || w.pinyin.toLowerCase().includes(q) || w.meaning.includes(q);
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  useEffect(() => { setPage(1); }, [search, category]);

  const quizPool = savedWords.length > 0
    ? savedWords.map(s => ({ word: s.word, pinyin: s.pinyin, meaning: s.meaning, category: '저장됨' }))
    : filtered.slice(0, 100);

  if (quizMode) return <VocabQuiz words={quizPool} mode={quizMode} onClose={() => setQuizMode(null)} />;

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-3 space-y-2 shrink-0">
        <div className="flex gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="한자·병음·뜻 검색..."
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <button
            onClick={() => setShowSaved(!showSaved)}
            className={`px-3 py-2 text-sm rounded-lg border transition-colors ${showSaved ? 'bg-yellow-400 text-white border-yellow-400' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}
          >
            ⭐ {savedWords.length}
          </button>
          <button
            onClick={() => setQuizMode('flashcard')}
            className="px-3 py-2 text-sm rounded-lg bg-blue-500 text-white hover:bg-blue-600"
          >
            퀴즈
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {VOCAB_CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${category === c ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Saved words panel */}
      {showSaved && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 p-3 max-h-44 overflow-y-auto shrink-0">
          <h3 className="text-xs font-semibold text-yellow-800 dark:text-yellow-300 mb-2">⭐ 저장된 단어 ({savedWords.length})</h3>
          {savedWords.length === 0 ? (
            <p className="text-xs text-gray-400">단어카드 우측 ★을 클릭해서 저장하세요.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {savedWords.map(s => (
                <span key={s.word} className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-gray-700 rounded-full text-xs border border-yellow-300 dark:border-yellow-600">
                  <span className="font-medium text-gray-900 dark:text-white">{s.word}</span>
                  <span className="text-gray-400">{s.meaning}</span>
                  <button onClick={() => removeWord(s.word)} className="text-gray-300 hover:text-red-500 ml-0.5">×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Word list */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="text-xs text-gray-400 mb-2">{filtered.length}개 단어 · {page}/{totalPages} 페이지</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {paged.map(w => {
            const isSaved = savedWords.some(s => s.word === w.word);
            const isExp = expandedWord === w.word;
            return (
              <div key={`${w.word}-${w.category}`}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-1">
                  <div className="flex-1 cursor-pointer min-w-0" onClick={() => setExpandedWord(isExp ? null : w.word)}>
                    <div className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                      <HL text={w.word} query={search} />
                    </div>
                    <div className="text-xs text-red-500 mt-0.5 truncate">
                      <HL text={w.pinyin} query={search} />
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 leading-tight">
                      <HL text={w.meaning} query={search} />
                    </div>
                    {w.hsk && (
                      <span className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded-full mt-1 inline-block">
                        HSK{w.hsk}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => isSaved ? removeWord(w.word) : saveWord(w)}
                    className={`text-base transition-colors shrink-0 ${isSaved ? 'text-yellow-400' : 'text-gray-200 dark:text-gray-600 hover:text-yellow-400'}`}
                  >
                    ★
                  </button>
                </div>
                {isExp && w.example && (
                  <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{w.example}</p>
                    {w.exampleMeaning && <p className="text-xs text-gray-400 mt-0.5">{w.exampleMeaning}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-1.5 mt-4 pb-4 flex-wrap">
            <button onClick={() => setPage(1)} disabled={page === 1}
              className="px-2 py-1 text-xs rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 disabled:opacity-40">
              ««
            </button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-2 py-1 text-xs rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 disabled:opacity-40">
              ‹
            </button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 3, totalPages - 6));
              const p = start + i;
              if (p > totalPages) return null;
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={`w-7 h-7 text-xs rounded ${p === page ? 'bg-red-500 text-white' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 hover:bg-gray-50'}`}>
                  {p}
                </button>
              );
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-2 py-1 text-xs rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 disabled:opacity-40">
              ›
            </button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
              className="px-2 py-1 text-xs rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 disabled:opacity-40">
              »»
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Vocab Quiz ───────────────────────────────────────────────────────────────
function VocabQuiz({ words, mode: initMode, onClose }: {
  words: { word: string; pinyin: string; meaning: string; category: string }[];
  mode: QuizMode;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<QuizMode>(initMode);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<'correct' | 'wrong' | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [choices, setChoices] = useState<string[]>([]);
  const shuffled = useRef([...words].sort(() => Math.random() - 0.5));
  const current = shuffled.current[idx % shuffled.current.length];

  useEffect(() => {
    if (mode === 'multi' && current) {
      const others = words
        .filter(w => w.meaning !== current.meaning)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      setChoices([...others.map(w => w.meaning), current.meaning].sort(() => Math.random() - 0.5));
    }
    setFlipped(false);
    setAnswer('');
    setResult(null);
  }, [idx, mode]);

  const next = () => setIdx(i => i + 1);

  const checkInput = () => {
    const ok = answer.trim() === current.meaning || answer.trim() === current.word;
    setResult(ok ? 'correct' : 'wrong');
    setScore(s => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1 }));
  };

  if (!current) return null;

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-3 flex items-center justify-between shrink-0">
        <div className="flex gap-1.5">
          {(['flashcard', 'multi', 'input'] as QuizMode[]).map(m => (
            <button key={m!} onClick={() => setMode(m)}
              className={`px-3 py-1 text-xs rounded-full ${mode === m ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
              {m === 'flashcard' ? '플래시카드' : m === 'multi' ? '4지선다' : '직접입력'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 font-medium">{score.correct}/{score.total} 정답</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5">
        <div className="text-xs text-gray-400">{(idx % words.length) + 1} / {words.length}</div>

        {mode === 'flashcard' && (
          <div className="w-full max-w-sm">
            <div onClick={() => setFlipped(f => !f)}
              className={`w-full h-48 rounded-2xl cursor-pointer flex flex-col items-center justify-center gap-2 shadow-lg select-none transition-all ${flipped ? 'bg-green-50 dark:bg-green-900/30 border-2 border-green-400' : 'bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600'}`}>
              {!flipped ? (
                <>
                  <div className="text-5xl font-bold text-gray-900 dark:text-white">{current.word}</div>
                  <div className="text-sm text-red-500">{current.pinyin}</div>
                  <div className="text-xs text-gray-300 mt-1">탭해서 뒤집기</div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{current.meaning}</div>
                  <div className="text-sm text-gray-500">{current.word} · {current.pinyin}</div>
                </>
              )}
            </div>
            <button onClick={next} className="w-full mt-4 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600">
              다음 →
            </button>
          </div>
        )}

        {mode === 'multi' && (
          <div className="w-full max-w-sm space-y-3">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 text-center border-2 border-gray-200 dark:border-gray-700">
              <div className="text-4xl font-bold text-gray-900 dark:text-white">{current.word}</div>
              <div className="text-sm text-red-500 mt-1">{current.pinyin}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {choices.map((c, i) => (
                <button key={i} disabled={result !== null}
                  onClick={() => {
                    const ok = c === current.meaning;
                    setResult(ok ? 'correct' : 'wrong');
                    setScore(s => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1 }));
                    setTimeout(next, 900);
                  }}
                  className={`py-3 px-2 rounded-xl text-sm font-medium transition-colors border-2 ${
                    result === null
                      ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 hover:border-blue-400 hover:bg-blue-50'
                      : c === current.meaning
                        ? 'bg-green-100 dark:bg-green-900/40 border-green-500 text-green-700 dark:text-green-300'
                        : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 opacity-50'
                  }`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'input' && (
          <div className="w-full max-w-sm space-y-3">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 text-center border-2 border-gray-200 dark:border-gray-700">
              <div className="text-4xl font-bold text-gray-900 dark:text-white">{current.word}</div>
              <div className="text-sm text-red-500 mt-1">{current.pinyin}</div>
            </div>
            <input value={answer} onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !result) checkInput(); }}
              placeholder="한국어 뜻 입력..."
              disabled={!!result}
              className={`w-full px-4 py-3 rounded-xl border-2 text-center text-sm focus:outline-none ${
                result === 'correct' ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                : result === 'wrong' ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white'
              }`}
            />
            {result && (
              <div className={`text-center text-sm font-semibold ${result === 'correct' ? 'text-green-600' : 'text-red-600'}`}>
                {result === 'correct' ? '✓ 정답!' : `✗ 정답: ${current.meaning}`}
              </div>
            )}
            {!result
              ? <button onClick={checkInput} disabled={!answer.trim()} className="w-full py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 disabled:opacity-40">확인</button>
              : <button onClick={next} className="w-full py-3 bg-gray-500 text-white rounded-xl font-medium hover:bg-gray-600">다음 →</button>
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRAMMAR TAB
// ═══════════════════════════════════════════════════════════════════════════════
function GrammarTab() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('전체');
  const [expanded, setExpanded] = useState<number | null>(null);

  const categories = ['전체', ...Array.from(new Set(GRAMMAR_DB.map(g => g.category)))];

  const filtered = GRAMMAR_DB.filter(g => {
    if (category !== '전체' && g.category !== category) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return g.title.toLowerCase().includes(q) || g.pattern.toLowerCase().includes(q) ||
      g.structure.toLowerCase().includes(q) ||
      g.examples.some(e => e.zh.includes(q) || e.kr.includes(q));
  });

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-3 space-y-2 shrink-0">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="패턴·구조·예문 검색..."
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
        />
        <div className="flex gap-1 overflow-x-auto pb-1">
          {categories.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={`px-3 py-1 text-xs rounded-full whitespace-nowrap ${category === c ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <div className="text-xs text-gray-400 mb-1">{filtered.length}개 패턴</div>
        {filtered.map((g, i) => {
          const isOpen = expanded === i;
          return (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button onClick={() => setExpanded(isOpen ? null : i)}
                className="w-full text-left p-4 flex items-start justify-between gap-2 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 dark:text-white text-sm">
                    <HL text={g.title} query={search} />
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <code className="text-xs bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded">
                      {g.pattern}
                    </code>
                    <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded">
                      {g.category}
                    </span>
                  </div>
                </div>
                <span className={`text-gray-400 text-xs transition-transform duration-200 shrink-0 mt-1 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
              </button>
              {isOpen && (
                <div className="border-t border-gray-100 dark:border-gray-700 p-4 space-y-3">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                    <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">구조</div>
                    <div className="text-sm text-gray-700 dark:text-gray-300">{g.structure}</div>
                  </div>
                  {g.notes && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3">
                      <div className="text-xs font-semibold text-yellow-600 dark:text-yellow-400 mb-1">노트</div>
                      <div className="text-sm text-gray-700 dark:text-gray-300">{g.notes}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">예문</div>
                    <div className="space-y-2">
                      {g.examples.map((ex, j) => (
                        <div key={j} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            <HL text={ex.zh} query={search} />
                          </div>
                          <div className="text-xs text-red-500 mt-0.5">{ex.pinyin}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            <HL text={ex.kr} query={search} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSATION TAB
// ═══════════════════════════════════════════════════════════════════════════════
function ConversationTab() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('전체');
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [showPinyin, setShowPinyin] = useState(true);
  const [showKorean, setShowKorean] = useState(true);

  const filtered = CONVERSATIONS.filter(c => {
    if (category !== '전체' && c.category !== category) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.titleKo.includes(q) || c.title.toLowerCase().includes(q) ||
      c.keywords.some(k => k.includes(q)) ||
      c.lines.some(l => l.chinese.includes(q) || l.korean.includes(q));
  });

  if (selected) {
    return (
      <div className="h-full flex flex-col">
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              ← 목록
            </button>
            <div className="flex gap-1.5">
              <button onClick={() => setShowPinyin(p => !p)}
                className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${showPinyin ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                병음
              </button>
              <button onClick={() => setShowKorean(p => !p)}
                className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${showKorean ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                한국어
              </button>
            </div>
          </div>
          <h2 className="font-bold text-gray-900 dark:text-white">{selected.titleKo}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{selected.title}</p>
          <div className="flex gap-2 mt-1.5">
            <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded">{selected.category}</span>
            <span className={`text-xs px-2 py-0.5 rounded ${selected.difficulty === '초급' ? 'bg-green-100 dark:bg-green-900/40 text-green-600' : selected.difficulty === '중급' ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600' : 'bg-red-100 dark:bg-red-900/40 text-red-600'}`}>
              {selected.difficulty}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-8">
          {selected.lines.map((line, i) => (
            <div key={i} className={`flex gap-3 ${line.speaker === 'B' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${line.speaker === 'A' ? 'bg-blue-500 text-white' : 'bg-emerald-500 text-white'}`}>
                {line.speakerName.slice(0, 1)}
              </div>
              <div className={`flex-1 max-w-xs ${line.speaker === 'B' ? 'items-end flex flex-col' : ''}`}>
                <div className="text-xs text-gray-400 mb-1">{line.speakerName}</div>
                <div className={`inline-block rounded-2xl px-4 py-2.5 max-w-full ${line.speaker === 'A' ? 'bg-blue-50 dark:bg-blue-900/30 rounded-tl-sm' : 'bg-emerald-50 dark:bg-emerald-900/30 rounded-tr-sm'}`}>
                  <div className="text-sm font-medium text-gray-900 dark:text-white leading-relaxed">{line.chinese}</div>
                  {showPinyin && <div className="text-xs text-red-500 mt-0.5">{line.pinyin}</div>}
                  {showKorean && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{line.korean}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-3 space-y-2 shrink-0">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="주제·키워드·중국어 검색..."
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
        />
        <div className="flex gap-1 overflow-x-auto pb-1">
          {CONVERSATION_CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={`px-3 py-1 text-xs rounded-full whitespace-nowrap ${category === c ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <div className="text-xs text-gray-400 mb-2">{filtered.length}개 회화</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {filtered.map(c => (
            <button key={c.id} onClick={() => setSelected(c)}
              className="text-left bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-red-400 hover:shadow-md transition-all group">
              <div className="font-semibold text-gray-900 dark:text-white text-sm group-hover:text-red-600">
                <HL text={c.titleKo} query={search} />
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{c.title}</div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 px-2 py-0.5 rounded">{c.category}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${c.difficulty === '초급' ? 'bg-green-100 text-green-600' : c.difficulty === '중급' ? 'bg-yellow-100 text-yellow-600' : 'bg-red-100 text-red-600'}`}>
                  {c.difficulty}
                </span>
                <span className="text-xs text-gray-400">{c.lines.length}줄</span>
              </div>
              <div className="mt-2 text-xs text-gray-400 italic truncate">
                "{c.lines[0]?.chinese}"
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIDEO TAB
// ═══════════════════════════════════════════════════════════════════════════════
function VideoTab() {
  const [vidCatIdx, setVidCatIdx] = useState(0);
  const [embedUrl, setEmbedUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');

  const parseYouTubeId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  };

  const loadVideo = () => {
    const id = parseYouTubeId(inputUrl);
    if (id) {
      setEmbedUrl(`https://www.youtube.com/embed/${id}?autoplay=1`);
      setInputUrl('');
    } else {
      alert('올바른 YouTube URL을 입력해주세요.\n예: https://www.youtube.com/watch?v=...');
    }
  };

  const searchUrl = (query: string) =>
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

  return (
    <div className="h-full flex flex-col">
      {/* Player */}
      <div className="bg-black shrink-0" style={{ aspectRatio: '16/9', maxHeight: '220px' }}>
        {embedUrl ? (
          <iframe src={embedUrl} className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white">
            <div className="text-3xl opacity-40">▶</div>
            <div className="text-xs text-gray-500">URL을 입력하거나 아래에서 검색하세요</div>
          </div>
        )}
      </div>

      {/* URL input */}
      <div className="bg-gray-900 px-3 py-2 flex gap-2 shrink-0">
        <input value={inputUrl} onChange={e => setInputUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadVideo()}
          placeholder="YouTube URL 붙여넣기..."
          className="flex-1 px-3 py-1.5 text-xs bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-red-400 placeholder-gray-400"
        />
        <button onClick={loadVideo} className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 font-medium">
          재생 ▶
        </button>
      </div>

      {/* Category bar */}
      <div className="bg-white dark:bg-gray-800 border-y border-gray-200 dark:border-gray-700 flex overflow-x-auto shrink-0">
        {VIDEO_CATEGORIES.map((vc, i) => (
          <button key={i} onClick={() => setVidCatIdx(i)}
            className={`px-4 py-2.5 text-xs whitespace-nowrap border-b-2 font-medium transition-colors ${vidCatIdx === i ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {vc.label}
          </button>
        ))}
      </div>

      {/* Search links grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-center mb-5">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            YouTube에서 영상을 찾은 후 URL을 복사해 위에 붙여넣으세요
          </p>
          <a href={searchUrl(VIDEO_CATEGORIES[vidCatIdx].query)} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 font-medium text-sm transition-colors">
            🔍 YouTube에서 "{VIDEO_CATEGORIES[vidCatIdx].label}" 검색
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {VIDEO_CATEGORIES.map((vc, i) => (
            <a key={i} href={searchUrl(vc.query)} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-red-400 hover:shadow-md transition-all group">
              <div className="w-9 h-9 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center justify-center text-lg shrink-0">🎬</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-red-600 transition-colors">{vc.label}</div>
                <div className="text-xs text-gray-400 truncate">{vc.query}</div>
              </div>
              <div className="text-red-400 text-sm shrink-0">↗</div>
            </a>
          ))}
        </div>

        <div className="mt-5 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800">
          <h3 className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-2">💡 동영상 재생 방법</h3>
          <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-decimal list-inside">
            <li>위 카테고리 또는 검색 버튼을 클릭해 YouTube로 이동</li>
            <li>원하는 영상 페이지에서 URL 복사 (주소창 또는 공유→복사)</li>
            <li>위 입력창에 붙여넣기 후 재생 클릭</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI TAB
// ═══════════════════════════════════════════════════════════════════════════════
function AITab() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState('qwen3');
  const [mode, setMode] = useState<'tutor' | 'business' | 'free'>('tutor');
  const [activeModel, setActiveModel] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const systemPrompts = {
    tutor: `당신은 친절한 중국어 선생님입니다. 사용자의 중국어 학습을 도와주세요.
- 중국어 예문에는 항상 병음(pinyin)과 한국어 번역을 함께 제공하세요.
- 무역, LED조명, 비즈니스 상황의 실용적인 중국어를 중심으로 가르쳐 주세요.
- 한국어로 설명하되, 중국어 연습 기회를 많이 주세요.
- 교정 시 칭찬 먼저, 그다음 개선사항을 알려주세요.`,
    business: `당신은 중국 비즈니스 전문가이자 무역 중국어 코치입니다.
- LED조명, 무역, 협상, 계약 관련 실무 중국어를 가르쳐 주세요.
- FOB, CIF, L/C, B/L 등 무역 용어를 중국어로 자연스럽게 설명하세요.
- 비즈니스 이메일, 협상 스크립트, 실전 회화 예시를 제공하세요.
- 중국 비즈니스 문화와 에티켓도 함께 알려주세요.`,
    free: `당신은 중국어 학습 도우미입니다. 사용자의 질문에 자유롭게 답변해 주세요.
한국어로 소통하되, 중국어 예문이 필요할 때는 병음과 한국어 번역을 함께 제공하세요.`,
  };

  const quickPrompts = {
    tutor: ['안녕하세요를 중국어로?', '자기소개 연습해줘', '오늘의 HSK 단어', '발음 어려운 것들'],
    business: ['FOB 견적 이메일 작성', '가격 협상 표현', '납기 지연 사과문', '계약서 핵심 표현'],
    free: ['중국어 학습 팁', '중국 비즈니스 문화', '중국어 독학 방법', '중국 여행 필수 회화'],
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setActiveModel('');

    let assistant = '';

    try {
      const res = await fetch('/api/chinese/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, systemPrompt: systemPrompts[mode], model }),
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const j = JSON.parse(line.slice(6));
            if (j.error) assistant += `\n⚠️ ${j.error}`;
            if (j.model) setActiveModel(j.model);
            if (j.chunk) {
              assistant += j.chunk;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant') {
                  return [...prev.slice(0, -1), { role: 'assistant', content: assistant }];
                }
                return [...prev, { role: 'assistant', content: assistant }];
              });
            }
          } catch {}
        }
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `오류가 발생했습니다: ${String(e)}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-3 space-y-2 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {(['tutor', 'business', 'free'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setMessages([]); setActiveModel(''); }}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${mode === m ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                {m === 'tutor' ? '📚 튜터' : m === 'business' ? '💼 비즈니스' : '🆓 자유대화'}
              </button>
            ))}
          </div>
          <select value={model} onChange={e => setModel(e.target.value)}
            className="ml-auto px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none">
            <option value="qwen3">Qwen3</option>
            <option value="deepseek-r1">DeepSeek-R1</option>
            <option value="llama3.3">Llama 3.3</option>
            <option value="qwen2.5">Qwen 2.5</option>
          </select>
        </div>
        {activeModel && (
          <div className="text-xs text-gray-400">모델: {activeModel}</div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center mt-6">
            <div className="text-4xl mb-3">
              {mode === 'tutor' ? '📚' : mode === 'business' ? '💼' : '💬'}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {mode === 'tutor' ? '중국어 선생님과 대화를 시작하세요!' : mode === 'business' ? '비즈니스 중국어를 연습해 보세요!' : '자유롭게 대화하세요!'}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {quickPrompts[mode].map(q => (
                <button key={q} onClick={() => setInput(q)}
                  className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-sm shrink-0">🤖</div>
            )}
            <div className={`max-w-xs sm:max-w-md rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
              m.role === 'user'
                ? 'bg-red-500 text-white rounded-tr-sm'
                : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-tl-sm'
            }`}>
              {m.content}
            </div>
            {m.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-sm shrink-0">👤</div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-sm shrink-0">🤖</div>
            <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <div className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-3 shrink-0">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="메시지 입력... (Enter로 전송)"
            className="flex-1 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-400"
          />
          <button onClick={send} disabled={loading || !input.trim()}
            className="px-4 py-2 bg-red-500 text-white rounded-xl disabled:opacity-40 hover:bg-red-600 transition-colors font-medium">
            ↑
          </button>
        </div>
        {messages.length > 0 && (
          <button onClick={() => { setMessages([]); setActiveModel(''); }}
            className="mt-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            대화 초기화
          </button>
        )}
      </div>
    </div>
  );
}
