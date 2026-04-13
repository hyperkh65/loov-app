'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────
interface HistoryItem {
  id: string;
  original: string;
  translated: string;
  from: string;
  timestamp: Date;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
  interface SpeechRecognition extends EventTarget {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((e: SpeechRecognitionEvent) => void) | null;
    onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
    onstart: (() => void) | null;
  }
}

// ─── Language options ──────────────────────────────────────────────────────
const SOURCE_LANGS = [
  { code: 'zh-CN', label: '중국어(간체)', flag: '🇨🇳', hint: '普通话' },
  { code: 'zh-TW', label: '중국어(번체)', flag: '🇹🇼', hint: '繁體' },
  { code: 'en-US', label: '영어',         flag: '🇺🇸', hint: 'English' },
  { code: 'ja-JP', label: '일본어',       flag: '🇯🇵', hint: '日本語' },
];

// ─── Main ──────────────────────────────────────────────────────────────────
export default function TranslatePage() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening,  setListening]  = useState(false);
  const [fromLang,   setFromLang]   = useState('zh-CN');
  const [interim,    setInterim]    = useState('');          // 실시간 인식 중 텍스트
  const [finalText,  setFinalText]  = useState('');          // 마지막 확정 원문
  const [translated, setTranslated] = useState('');          // 번역 결과
  const [translating,setTranslating]= useState(false);
  const [history,    setHistory]    = useState<HistoryItem[]>([]);
  const [activeModel,setActiveModel]= useState('');
  const [error,      setError]      = useState('');
  const [copied,     setCopied]     = useState(false);

  const recogRef  = useRef<SpeechRecognition | null>(null);
  const shouldRunRef  = useRef(false);   // 자동 재시작 여부
  const translateTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── 지원 여부 체크 ───────────────────────────────────────────────────────
  useEffect(() => {
    const ok = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    setSupported(ok);
  }, []);

  // ── 번역 함수 ────────────────────────────────────────────────────────────
  const translateText = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setTranslating(true);
    setError('');
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, from: fromLang, to: 'ko-KR' }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setTranslated(data.translation ?? '');
      setActiveModel(data.model ?? '');

      // 히스토리 추가
      setHistory(prev => [
        {
          id: Date.now().toString(),
          original: text,
          translated: data.translation ?? '',
          from: fromLang,
          timestamp: new Date(),
        },
        ...prev.slice(0, 49), // 최대 50개
      ]);
    } catch (e) {
      setError(String(e));
    } finally {
      setTranslating(false);
    }
  }, [fromLang]);

  // ── SpeechRecognition 초기화 ─────────────────────────────────────────────
  const buildRecognition = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = fromLang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onstart = () => {
      setListening(true);
      setError('');
    };

    r.onresult = (e: SpeechRecognitionEvent) => {
      let interimStr = '';
      let finalStr   = '';

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalStr += t;
        } else {
          interimStr += t;
        }
      }

      if (interimStr) setInterim(interimStr);

      if (finalStr) {
        setInterim('');
        setFinalText(finalStr);

        // 300ms 디바운스 후 번역 (연속 문장을 합쳐서 번역)
        clearTimeout(translateTimerRef.current);
        translateTimerRef.current = setTimeout(() => {
          translateText(finalStr);
        }, 300);
      }
    };

    r.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'no-speech') return;       // 말 없음은 무시
      if (e.error === 'aborted') return;          // 수동 종료 무시
      if (e.error === 'not-allowed') {
        setError('마이크 권한이 없습니다. 브라우저 설정에서 마이크를 허용해주세요.');
        shouldRunRef.current = false;
        setListening(false);
      } else {
        setError(`음성 인식 오류: ${e.error}`);
      }
    };

    // 연속 모드: 종료 시 자동 재시작 (모바일에서 자주 끊김)
    r.onend = () => {
      setInterim('');
      if (shouldRunRef.current) {
        try { r.start(); } catch {}
      } else {
        setListening(false);
      }
    };

    return r;
  }, [fromLang, translateText]);

  // ── 시작/정지 ────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!supported) return;
    shouldRunRef.current = true;
    setFinalText('');
    setTranslated('');
    setInterim('');
    setError('');

    const r = buildRecognition();
    recogRef.current = r;
    try { r.start(); } catch (e) { setError(String(e)); }
  }, [supported, buildRecognition]);

  const stopListening = useCallback(() => {
    shouldRunRef.current = false;
    try { recogRef.current?.stop(); } catch {}
    setListening(false);
    setInterim('');
  }, []);

  // ── 언어 변경 시 재시작 ──────────────────────────────────────────────────
  useEffect(() => {
    if (listening) {
      stopListening();
      setTimeout(() => startListening(), 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromLang]);

  // ── 언마운트 정리 ────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      shouldRunRef.current = false;
      try { recogRef.current?.abort(); } catch {}
      clearTimeout(translateTimerRef.current);
    };
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const clearHistory = () => setHistory([]);

  // ── 지원 여부 미확인 ─────────────────────────────────────────────────────
  if (supported === null) return null;

  // ── 미지원 브라우저 ──────────────────────────────────────────────────────
  if (!supported) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="text-5xl mb-4">😔</div>
        <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-2">브라우저 미지원</h2>
        <p className="text-sm text-gray-500 max-w-xs">
          실시간 음성 인식은 Chrome, Edge 브라우저에서 지원됩니다.<br />
          iOS Safari는 일부 제한이 있습니다.
        </p>
        <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-300">
          권장 브라우저: <strong>Chrome (모바일/PC)</strong>
        </div>
      </div>
    );
  }

  const currentLang = SOURCE_LANGS.find(l => l.code === fromLang)!;

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 overflow-hidden">

      {/* ── 헤더 ──────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">🎙️ 실시간 번역기</h1>
            <p className="text-xs text-gray-400 mt-0.5">음성을 듣고 즉시 한국어로 번역</p>
          </div>
          {activeModel && (
            <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 px-2 py-1 rounded-full">
              {activeModel.split('/').pop()?.split(':')[0]}
            </span>
          )}
        </div>
      </div>

      {/* ── 언어 선택 ─────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 shrink-0">인식 언어:</span>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {SOURCE_LANGS.map(l => (
              <button
                key={l.code}
                onClick={() => setFromLang(l.code)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  fromLang === l.code
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                <span>{l.flag}</span>
                <span>{l.label}</span>
              </button>
            ))}
          </div>
          <div className="ml-auto shrink-0 text-xs text-gray-400">→ 🇰🇷 한국어</div>
        </div>
      </div>

      {/* ── 메인 영역 ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* 마이크 버튼 + 현재 인식 */}
        <div className={`flex flex-col items-center py-8 px-4 transition-colors ${
          listening ? 'bg-indigo-50 dark:bg-indigo-950/30' : 'bg-white dark:bg-gray-800'
        }`}>

          {/* 마이크 버튼 */}
          <div className="relative mb-6">
            {/* 파동 애니메이션 */}
            {listening && (
              <>
                <span className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-20" />
                <span className="absolute inset-[-8px] rounded-full bg-indigo-300 animate-ping opacity-10" style={{ animationDelay: '0.3s' }} />
              </>
            )}
            <button
              onClick={listening ? stopListening : startListening}
              className={`relative w-24 h-24 rounded-full flex items-center justify-center text-4xl shadow-xl transition-all active:scale-95 ${
                listening
                  ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-200 dark:shadow-red-900'
                  : 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-indigo-200 dark:shadow-indigo-900'
              }`}
              aria-label={listening ? '번역 중지' : '번역 시작'}
            >
              {listening ? '⏹' : '🎙️'}
            </button>
          </div>

          {/* 상태 표시 */}
          <div className="text-sm font-medium text-center">
            {listening ? (
              <span className="text-red-500 flex items-center gap-1.5">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                듣는 중... ({currentLang.flag} {currentLang.hint})
              </span>
            ) : (
              <span className="text-gray-400">버튼을 눌러 음성 번역 시작</span>
            )}
          </div>

          {/* 오류 메시지 */}
          {error && (
            <div className="mt-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 text-xs text-red-600 dark:text-red-400 max-w-sm text-center">
              {error}
            </div>
          )}
        </div>

        {/* 인식된 텍스트 + 번역 결과 */}
        <div className="px-4 pb-4 space-y-3">

          {/* 인식 중 (interim) */}
          {interim && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-2xl p-4">
              <div className="text-xs text-yellow-600 dark:text-yellow-400 font-medium mb-1">인식 중...</div>
              <div className="text-base text-gray-700 dark:text-gray-300 opacity-70 italic">{interim}</div>
            </div>
          )}

          {/* 확정된 원문 */}
          {finalText && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-400">
                  {currentLang.flag} 원문 ({currentLang.label})
                </span>
                <button
                  onClick={() => copyToClipboard(finalText)}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5 rounded hover:bg-gray-100"
                >
                  복사
                </button>
              </div>
              <p className="text-base text-gray-800 dark:text-white leading-relaxed">{finalText}</p>
            </div>
          )}

          {/* 번역 결과 */}
          {(translated || translating) && (
            <div className={`rounded-2xl p-4 shadow-sm transition-all ${
              translating
                ? 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800'
                : 'bg-indigo-500 text-white'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold ${translating ? 'text-indigo-400' : 'text-indigo-100'}`}>
                  🇰🇷 한국어 번역
                </span>
                {translated && !translating && (
                  <button
                    onClick={() => copyToClipboard(translated)}
                    className="text-xs text-indigo-200 hover:text-white px-2 py-0.5 rounded hover:bg-indigo-400/30"
                  >
                    {copied ? '✓ 복사됨' : '복사'}
                  </button>
                )}
              </div>
              {translating ? (
                <div className="flex gap-1 items-center py-1">
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="ml-1 text-xs text-indigo-400">번역 중...</span>
                </div>
              ) : (
                <p className="text-base leading-relaxed font-medium">{translated}</p>
              )}
            </div>
          )}

          {/* 빈 상태 */}
          {!interim && !finalText && !translating && !error && (
            <div className="text-center py-8">
              <div className="text-5xl mb-3 opacity-20">💬</div>
              <p className="text-sm text-gray-400">
                마이크 버튼을 누르고<br />말하면 자동으로 번역됩니다
              </p>
              <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-xs text-blue-600 dark:text-blue-400 max-w-xs mx-auto text-left space-y-1">
                <p className="font-semibold mb-1">💡 사용 팁</p>
                <p>• Chrome/Edge 브라우저 권장</p>
                <p>• 마이크 권한을 허용해주세요</p>
                <p>• 문장 단위로 자동 번역됩니다</p>
                <p>• 소음이 적은 환경에서 사용하세요</p>
              </div>
            </div>
          )}
        </div>

        {/* 번역 히스토리 */}
        {history.length > 0 && (
          <div className="px-4 pb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                번역 기록 ({history.length})
              </h2>
              <button
                onClick={clearHistory}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                전체 삭제
              </button>
            </div>
            <div className="space-y-2">
              {history.map(item => {
                const lang = SOURCE_LANGS.find(l => l.code === item.from);
                return (
                  <div key={item.id}
                    className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-gray-400">
                        {lang?.flag} → 🇰🇷 &nbsp;
                        {item.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <button
                        onClick={() => copyToClipboard(item.translated)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        복사
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1.5 leading-relaxed">{item.original}</p>
                    <div className="h-px bg-gray-100 dark:bg-gray-700 mb-1.5" />
                    <p className="text-sm font-medium text-gray-900 dark:text-white leading-relaxed">{item.translated}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
