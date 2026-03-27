'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant';
  content: string;
  grammar?: { original: string; corrected: string; explanation: string } | null;
  timestamp: Date;
}

interface VocabWord {
  id: string;
  language: string;
  word: string;
  translation: string;
  pronunciation?: string;
  example?: string;
  context?: string;
  level: number;
  next_review: string;
  created_at: string;
}

interface ParsedPart {
  type: 'text' | 'word';
  content: string;
  translation?: string;
  pronunciation?: string;
}

interface SelectedWord {
  word: string;
  translation: string;
  pronunciation?: string;
  context?: string;
  savedId?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'en', name: '영어', flag: '🇺🇸', native: 'English' },
  { code: 'zh', name: '중국어', flag: '🇨🇳', native: '中文' },
  { code: 'ja', name: '일본어', flag: '🇯🇵', native: '日本語' },
  { code: 'fr', name: '프랑스어', flag: '🇫🇷', native: 'Français' },
  { code: 'es', name: '스페인어', flag: '🇪🇸', native: 'Español' },
  { code: 'de', name: '독일어', flag: '🇩🇪', native: 'Deutsch' },
  { code: 'vi', name: '베트남어', flag: '🇻🇳', native: 'Tiếng Việt' },
  { code: 'th', name: '태국어', flag: '🇹🇭', native: 'ภาษาไทย' },
];

const LEVELS = [
  { value: 'beginner', label: '초급' },
  { value: 'intermediate', label: '중급' },
  { value: 'advanced', label: '고급' },
];

const MODES = [
  { value: 'conversation', label: '자유 대화', icon: '💬' },
  { value: 'grammar', label: '문법 교정', icon: '✏️' },
  { value: 'reading', label: '읽기 연습', icon: '📖' },
  { value: 'situation', label: '상황 대화', icon: '🎭' },
];

const SITUATIONS = [
  { value: 'restaurant', label: '🍽️ 레스토랑' },
  { value: 'hotel', label: '🏨 호텔' },
  { value: 'airport', label: '✈️ 공항' },
  { value: 'shopping', label: '🛍️ 쇼핑' },
  { value: 'business', label: '💼 비즈니스' },
  { value: 'hospital', label: '🏥 병원' },
];

const LEVEL_COLORS = ['bg-slate-500', 'bg-amber-500', 'bg-emerald-500'];
const LEVEL_LABELS = ['새 단어', '학습 중', '알고 있음'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseWords(text: string): ParsedPart[] {
  const parts = text.split(/\[\[(.+?)\]\]/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const [word, translation, pronunciation] = part.split('|');
      return { type: 'word' as const, content: word, translation, pronunciation };
    }
    return { type: 'text' as const, content: part };
  });
}

function stripMarkers(text: string): string {
  return text.replace(/\[\[(.+?)\]\]/g, (_, inner) => inner.split('|')[0]);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function WordSpan({
  part,
  onClick,
}: {
  part: ParsedPart;
  onClick: (word: SelectedWord) => void;
}) {
  if (part.type === 'text') {
    return <span>{part.content}</span>;
  }
  return (
    <span
      className="inline-block bg-amber-100 text-amber-900 border-b-2 border-amber-400 cursor-pointer hover:bg-amber-200 transition-colors px-0.5 rounded-sm"
      title={`${part.translation}${part.pronunciation ? ` [${part.pronunciation}]` : ''}`}
      onClick={() =>
        onClick({
          word: part.content,
          translation: part.translation || '',
          pronunciation: part.pronunciation,
        })
      }
    >
      {part.content}
    </span>
  );
}

function GrammarBox({
  grammar,
}: {
  grammar: { original: string; corrected: string; explanation: string };
}) {
  return (
    <div className="mt-2 p-3 bg-orange-50 border border-orange-300 rounded-lg text-sm">
      <div className="font-semibold text-orange-700 mb-1">⚠️ 문법 교정</div>
      <div className="text-slate-600">
        <span className="text-red-500 line-through mr-2">{grammar.original}</span>
        <span className="text-green-600 font-medium">{grammar.corrected}</span>
      </div>
      <div className="text-slate-500 mt-1 text-xs">{grammar.explanation}</div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LanguagePage() {
  // Core state
  const [language, setLanguage] = useState('en');
  const [level, setLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [mode, setMode] = useState<'conversation' | 'grammar' | 'reading' | 'situation'>('conversation');
  const [situation, setSituation] = useState('restaurant');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Vocabulary state
  const [vocab, setVocab] = useState<VocabWord[]>([]);
  const [vocabFilter, setVocabFilter] = useState<string>('all');
  const [selectedWord, setSelectedWord] = useState<SelectedWord | null>(null);
  const [savingWord, setSavingWord] = useState(false);

  // Quiz state
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizRevealed, setQuizRevealed] = useState(false);
  const [quizWords, setQuizWords] = useState<VocabWord[]>([]);

  // TTS state
  const [playingMsgIdx, setPlayingMsgIdx] = useState<number | null>(null);
  const [playingWord, setPlayingWord] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialized = useRef<string | null>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load vocabulary on mount
  useEffect(() => {
    fetchVocab();
  }, []);

  // Send initial greeting when language/mode changes
  useEffect(() => {
    const key = `${language}-${level}-${mode}`;
    if (initialized.current === key) return;
    initialized.current = key;

    const lang = LANGUAGES.find((l) => l.code === language);
    if (!lang) return;

    setMessages([]);

    const greetingMsg =
      mode === 'situation'
        ? `안녕하세요! ${lang.flag} ${lang.name} 상황 대화 연습을 시작합니다. "${SITUATIONS.find((s) => s.value === situation)?.label}" 상황으로 연습해 볼까요?`
        : `안녕하세요! ${lang.flag} ${lang.name} 학습을 시작합니다. 먼저 ${lang.native}로 인사해 주세요!`;

    setMessages([
      {
        role: 'assistant',
        content: greetingMsg,
        timestamp: new Date(),
      },
    ]);
  }, [language, level, mode, situation]);

  const fetchVocab = async () => {
    try {
      const res = await fetch('/api/language/vocabulary');
      if (res.ok) {
        const data = await res.json() as { words: VocabWord[] };
        setVocab(data.words || []);
      }
    } catch {
      // silently ignore
    }
  };

  const sendMessage = useCallback(
    async (userMessage?: string) => {
      const text = (userMessage ?? input).trim();
      if (!text || loading) return;

      const userMsg: Message = { role: 'user', content: text, timestamp: new Date() };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);

      try {
        // Build Gemini-compatible history from previous messages
        const history = messages.slice(-10).map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          content: stripMarkers(m.content),
        }));

        const clientOllamaKey = localStorage.getItem('freeai_ollama_key') || undefined;
        // 무료AI에서 마지막 사용 모델 (없으면 qwen3.5)
        const clientModel = localStorage.getItem('freeai_last_model') || 'qwen3.5';

        const res = await fetch('/api/language/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            language,
            level,
            mode,
            situation: mode === 'situation' ? situation : undefined,
            history,
            clientOllamaKey,
            clientModel,
          }),
        });

        const data = await res.json() as {
          reply?: string;
          grammar?: { original: string; corrected: string; explanation: string } | null;
          error?: string;
        };

        if (data.error) throw new Error(data.error);

        const assistantMsg: Message = {
          role: 'assistant',
          content: data.reply || '',
          grammar: data.grammar,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `오류가 발생했습니다: ${String(err)}`,
            timestamp: new Date(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, language, level, mode, situation]
  );

  const playTTS = (text: string, msgIdx?: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const langMap: Record<string, string> = {
      en: 'en-US', zh: 'zh-CN', ja: 'ja-JP',
      fr: 'fr-FR', es: 'es-ES', de: 'de-DE',
      vi: 'vi-VN', th: 'th-TH', ko: 'ko-KR',
    };

    window.speechSynthesis.cancel();

    const clean = stripMarkers(text);
    if (!clean.trim()) return;

    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = langMap[language] || 'en-US';
    utter.rate = 0.9;
    utter.onend = () => { setPlayingMsgIdx(null); setPlayingWord(false); };
    utter.onerror = () => { setPlayingMsgIdx(null); setPlayingWord(false); };

    if (msgIdx !== undefined) setPlayingMsgIdx(msgIdx);
    else setPlayingWord(true);

    window.speechSynthesis.speak(utter);
  };

  const saveWord = async (word: SelectedWord) => {
    setSavingWord(true);
    try {
      const res = await fetch('/api/language/vocabulary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language,
          word: word.word,
          translation: word.translation,
          pronunciation: word.pronunciation,
          context: word.context,
        }),
      });
      if (res.ok) {
        await fetchVocab();
        // Update selectedWord with saved id
        const data = await res.json() as { word: VocabWord };
        setSelectedWord((prev) => prev ? { ...prev, savedId: data.word?.id } : prev);
      }
    } finally {
      setSavingWord(false);
    }
  };

  const removeWord = async (id: string) => {
    try {
      await fetch(`/api/language/vocabulary?id=${id}`, { method: 'DELETE' });
      await fetchVocab();
      setSelectedWord((prev) => prev ? { ...prev, savedId: undefined } : prev);
    } catch {
      // ignore
    }
  };

  const updateWordLevel = async (id: string, level: number) => {
    try {
      // Calculate next review based on level (spaced repetition)
      const daysMap = [1, 3, 7];
      const days = daysMap[Math.min(level, 2)];
      const nextReview = new Date();
      nextReview.setDate(nextReview.getDate() + days);

      await fetch('/api/language/vocabulary', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, level, next_review: nextReview.toISOString() }),
      });
      await fetchVocab();
    } catch {
      // ignore
    }
  };

  const startQuiz = () => {
    const filteredWords = vocab.filter(
      (w) => vocabFilter === 'all' || w.language === vocabFilter
    );
    if (filteredWords.length === 0) return;
    setQuizWords([...filteredWords].sort(() => Math.random() - 0.5));
    setQuizIndex(0);
    setQuizRevealed(false);
    setShowQuiz(true);
  };

  const filteredVocab = vocab.filter(
    (w) => vocabFilter === 'all' || w.language === vocabFilter
  );

  const savedWordIds = new Set(vocab.map((v) => `${v.language}::${v.word}`));
  const isWordSaved = (word: string) => savedWordIds.has(`${language}::${word}`);
  const getSavedWordId = (word: string) =>
    vocab.find((v) => v.language === language && v.word === word)?.id;

  const currentLang = LANGUAGES.find((l) => l.code === language);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 bg-slate-900 border-b border-slate-700/50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-bold flex items-center gap-2">
            🌍 <span>외국어 학습</span>
          </h1>

          {/* Language selector */}
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              initialized.current = null;
            }}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.name}
              </option>
            ))}
          </select>

          {/* Level selector */}
          <select
            value={level}
            onChange={(e) => {
              setLevel(e.target.value as typeof level);
              initialized.current = null;
            }}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>

          {/* Mode selector */}
          <div className="flex gap-1 flex-wrap">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => {
                  setMode(m.value as typeof mode);
                  initialized.current = null;
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  mode === m.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Situation picker */}
        {mode === 'situation' && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {SITUATIONS.map((s) => (
              <button
                key={s.value}
                onClick={() => {
                  setSituation(s.value);
                  initialized.current = null;
                }}
                className={`px-3 py-1 rounded-full text-xs transition-all ${
                  situation === s.value
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat area */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  } flex flex-col gap-1`}
                >
                  {/* Message bubble */}
                  <div
                    className={`relative group px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : 'bg-slate-800 text-slate-100 rounded-bl-sm'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">
                      {msg.role === 'assistant'
                        ? parseWords(msg.content).map((part, pi) => (
                            <WordSpan
                              key={pi}
                              part={part}
                              onClick={(w) =>
                                setSelectedWord({
                                  ...w,
                                  context: msg.content,
                                  savedId: getSavedWordId(w.word),
                                })
                              }
                            />
                          ))
                        : msg.content}
                    </div>

                    {/* TTS button for assistant messages */}
                    {msg.role === 'assistant' && (
                      <button
                        onClick={() => playTTS(msg.content, idx)}
                        className={`absolute -bottom-3 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all shadow-lg ${
                          playingMsgIdx === idx
                            ? 'bg-indigo-500 text-white animate-pulse'
                            : 'bg-slate-700 text-slate-300 hover:bg-indigo-600 hover:text-white opacity-0 group-hover:opacity-100'
                        }`}
                        title="발음 듣기"
                      >
                        🔊
                      </button>
                    )}
                  </div>

                  {/* Grammar correction */}
                  {msg.grammar && <GrammarBox grammar={msg.grammar} />}

                  <span className="text-[10px] text-slate-600 px-1">
                    {msg.timestamp.toLocaleTimeString('ko-KR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1 items-center">
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="flex-shrink-0 p-4 bg-slate-900 border-t border-slate-700/50">
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={`${currentLang?.flag} ${currentLang?.native}로 말해보세요... (Shift+Enter: 줄바꿈)`}
                rows={2}
                className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
              <button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-4 py-3 rounded-xl font-medium text-sm transition-all"
              >
                전송
              </button>
              <button
                onClick={() => {
                  if (messages.length > 0) {
                    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
                    if (lastAssistant) playTTS(lastAssistant.content);
                  }
                }}
                className="flex-shrink-0 bg-slate-800 hover:bg-slate-700 text-white px-3 py-3 rounded-xl text-sm transition-all"
                title="마지막 AI 메시지 듣기"
              >
                🔊
              </button>
            </div>
          </div>
        </div>

        {/* Vocabulary panel */}
        <div className="w-72 flex-shrink-0 bg-slate-900 border-l border-slate-700/50 flex flex-col hidden lg:flex">
          {/* Panel header */}
          <div className="flex-shrink-0 p-4 border-b border-slate-700/50">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                📚 내 단어장
                <span className="text-xs text-slate-400">({filteredVocab.length})</span>
              </h2>
              <button
                onClick={startQuiz}
                disabled={filteredVocab.length === 0}
                className="text-xs bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-2 py-1 rounded-lg transition-all"
              >
                퀴즈
              </button>
            </div>

            {/* Language filter */}
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setVocabFilter('all')}
                className={`text-xs px-2 py-1 rounded-full transition-all ${
                  vocabFilter === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                전체
              </button>
              {LANGUAGES.filter((l) => vocab.some((v) => v.language === l.code)).map((l) => (
                <button
                  key={l.code}
                  onClick={() => setVocabFilter(l.code)}
                  className={`text-xs px-2 py-1 rounded-full transition-all ${
                    vocabFilter === l.code
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {l.flag}
                </button>
              ))}
            </div>
          </div>

          {/* Word list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {filteredVocab.length === 0 ? (
              <div className="text-center text-slate-500 text-xs mt-8 px-4">
                <div className="text-2xl mb-2">📝</div>
                <div>AI 응답에서 단어를 클릭하면</div>
                <div>여기에 저장됩니다</div>
              </div>
            ) : (
              filteredVocab.map((word) => (
                <div
                  key={word.id}
                  className="bg-slate-800 rounded-xl p-3 hover:bg-slate-750 transition-all group cursor-pointer"
                  onClick={() =>
                    setSelectedWord({
                      word: word.word,
                      translation: word.translation,
                      pronunciation: word.pronunciation,
                      context: word.context,
                      savedId: word.id,
                    })
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm text-white truncate">{word.word}</div>
                      <div className="text-xs text-slate-400 truncate">{word.translation}</div>
                      {word.pronunciation && (
                        <div className="text-xs text-slate-500">[{word.pronunciation}]</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full text-white ${LEVEL_COLORS[word.level] || LEVEL_COLORS[0]}`}
                      >
                        {LEVEL_LABELS[word.level] || '새 단어'}
                      </span>
                      {/* Level up button */}
                      {word.level < 2 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateWordLevel(word.id, word.level + 1);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-emerald-400 hover:text-emerald-300 text-xs transition-all"
                          title="알고 있음으로 표시"
                        >
                          ✓
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Language flag */}
                  <div className="text-[10px] text-slate-600 mt-1">
                    {LANGUAGES.find((l) => l.code === word.language)?.flag}{' '}
                    {LANGUAGES.find((l) => l.code === word.language)?.name}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Word Popup Modal */}
      {selectedWord && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedWord(null)}
        >
          <div
            className="bg-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <div className="text-3xl font-bold text-white mb-1">{selectedWord.word}</div>
              {selectedWord.pronunciation && (
                <div className="text-slate-400 text-sm">[{selectedWord.pronunciation}]</div>
              )}
              <div className="text-indigo-300 text-lg mt-2">{selectedWord.translation}</div>
            </div>

            {selectedWord.context && (
              <div className="bg-slate-700/50 rounded-xl p-3 mb-4 text-xs text-slate-400 italic">
                &ldquo;{stripMarkers(selectedWord.context).slice(0, 120)}&rdquo;
              </div>
            )}

            <div className="flex gap-2 justify-center mb-4">
              {/* TTS button */}
              <button
                onClick={() => playTTS(selectedWord.word)}
                disabled={playingWord}
                className={`flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl text-sm transition-all ${
                  playingWord ? 'animate-pulse' : ''
                }`}
              >
                🔊 {playingWord ? '재생 중...' : '발음 듣기'}
              </button>

              {/* Save/Remove button */}
              {isWordSaved(selectedWord.word) ? (
                <button
                  onClick={() => {
                    const id = getSavedWordId(selectedWord.word);
                    if (id) removeWord(id);
                  }}
                  className="flex items-center gap-2 bg-red-900/50 hover:bg-red-800/50 text-red-300 px-4 py-2 rounded-xl text-sm transition-all"
                >
                  💔 삭제
                </button>
              ) : (
                <button
                  onClick={() => saveWord(selectedWord)}
                  disabled={savingWord}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm transition-all"
                >
                  ❤️ {savingWord ? '저장 중...' : '단어장 저장'}
                </button>
              )}
            </div>

            <button
              onClick={() => setSelectedWord(null)}
              className="w-full text-slate-500 hover:text-slate-300 text-sm py-2 transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* Quiz Modal */}
      {showQuiz && quizWords.length > 0 && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">단어 퀴즈</h3>
              <div className="text-xs text-slate-400">
                {quizIndex + 1} / {quizWords.length}
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-slate-700 rounded-full mb-6">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all"
                style={{ width: `${((quizIndex + 1) / quizWords.length) * 100}%` }}
              />
            </div>

            {quizIndex < quizWords.length ? (
              <>
                {/* Question */}
                <div className="text-center mb-6">
                  <div className="text-2xl font-bold text-white mb-2">
                    {quizWords[quizIndex].word}
                  </div>
                  {quizWords[quizIndex].pronunciation && (
                    <div className="text-slate-400 text-sm">
                      [{quizWords[quizIndex].pronunciation}]
                    </div>
                  )}
                  <div className="text-xs text-slate-500 mt-2">
                    {LANGUAGES.find((l) => l.code === quizWords[quizIndex].language)?.flag}{' '}
                    {LANGUAGES.find((l) => l.code === quizWords[quizIndex].language)?.name}
                  </div>
                </div>

                {/* Answer reveal */}
                {quizRevealed ? (
                  <>
                    <div className="text-center text-indigo-300 text-xl font-semibold mb-6">
                      {quizWords[quizIndex].translation}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          await updateWordLevel(quizWords[quizIndex].id, Math.max(0, quizWords[quizIndex].level - 1));
                          if (quizIndex + 1 < quizWords.length) {
                            setQuizIndex((i) => i + 1);
                            setQuizRevealed(false);
                          } else {
                            setShowQuiz(false);
                          }
                        }}
                        className="flex-1 bg-red-900/50 hover:bg-red-800/50 text-red-300 py-3 rounded-xl text-sm font-medium transition-all"
                      >
                        ✗ 몰랐어요
                      </button>
                      <button
                        onClick={async () => {
                          await updateWordLevel(quizWords[quizIndex].id, Math.min(2, quizWords[quizIndex].level + 1));
                          if (quizIndex + 1 < quizWords.length) {
                            setQuizIndex((i) => i + 1);
                            setQuizRevealed(false);
                          } else {
                            setShowQuiz(false);
                          }
                        }}
                        className="flex-1 bg-emerald-900/50 hover:bg-emerald-800/50 text-emerald-300 py-3 rounded-xl text-sm font-medium transition-all"
                      >
                        ✓ 알았어요
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => setQuizRevealed(true)}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-medium transition-all"
                  >
                    정답 확인
                  </button>
                )}
              </>
            ) : (
              <div className="text-center">
                <div className="text-4xl mb-3">🎉</div>
                <div className="text-white font-bold mb-2">퀴즈 완료!</div>
                <div className="text-slate-400 text-sm mb-6">
                  {quizWords.length}개 단어를 모두 학습했습니다
                </div>
                <button
                  onClick={() => setShowQuiz(false)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl font-medium transition-all"
                >
                  닫기
                </button>
              </div>
            )}

            <button
              onClick={() => setShowQuiz(false)}
              className="w-full text-slate-500 hover:text-slate-300 text-sm py-2 mt-2 transition-colors"
            >
              퀴즈 종료
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
