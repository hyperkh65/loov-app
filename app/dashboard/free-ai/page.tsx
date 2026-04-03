'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// 기본 fallback 목록 (실제는 /api/ollama/models 에서 동적으로 로드됨)
const DEFAULT_OLLAMA_CLOUD_MODELS = [
  { id: 'qwen3.5',          name: 'Qwen 3.5',        emoji: '🔮', desc: '멀티모달 · vision · thinking', badge: 'CLOUD' },
  { id: 'qwen3',            name: 'Qwen 3',           emoji: '🔮', desc: 'Alibaba · 다국어 강점',        badge: 'CLOUD' },
  { id: 'qwen3-coder',      name: 'Qwen 3 Coder',    emoji: '💻', desc: '코딩 특화 · agentic',          badge: 'CLOUD' },
  { id: 'qwen3-vl',         name: 'Qwen 3 VL',       emoji: '👁️', desc: 'vision-language 모델',         badge: 'CLOUD' },
  { id: 'llama3.3',         name: 'Llama 3.3',        emoji: '🦙', desc: 'Meta AI · 범용',               badge: 'CLOUD' },
  { id: 'mistral',          name: 'Mistral',           emoji: '🌪️', desc: '유럽산 · 빠른 응답',           badge: 'CLOUD' },
  { id: 'ministral-3',      name: 'Ministral 3',      emoji: '🌪️', desc: 'Mistral · 경량 최신',          badge: 'CLOUD' },
  { id: 'gemma3',           name: 'Gemma 3',           emoji: '💎', desc: 'Google · 경량 고성능',         badge: 'CLOUD' },
  { id: 'deepseek-r1',      name: 'DeepSeek R1',       emoji: '🧠', desc: '추론 특화 · 사고과정 표시',    badge: 'CLOUD' },
  { id: 'phi4',             name: 'Phi 4',             emoji: '⚡', desc: 'Microsoft · 초경량',           badge: 'CLOUD' },
  { id: 'phi4-mini',        name: 'Phi 4 Mini',        emoji: '⚡', desc: 'Microsoft · 초소형',           badge: 'CLOUD' },
  { id: 'minimax-m2.7',     name: 'MiniMax M2.7',      emoji: '🤖', desc: 'agentic · productivity',      badge: 'CLOUD' },
];

const OPENROUTER_MODELS = [
  { id: 'qwen/qwen3-235b-a22b:free',             name: 'Qwen 3 235B',  emoji: '🔮', desc: 'Alibaba', badge: 'FREE' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free',name: 'Llama 3.3 70B',emoji: '🦙', desc: 'Meta AI', badge: 'FREE' },
  { id: 'deepseek/deepseek-r1:free',             name: 'DeepSeek R1',  emoji: '🧠', desc: '추론 특화', badge: 'FREE' },
  { id: 'google/gemma-3-27b-it:free',            name: 'Gemma 3 27B',  emoji: '💎', desc: 'Google',  badge: 'FREE' },
  { id: 'mistralai/mistral-7b-instruct:free',    name: 'Mistral 7B',   emoji: '🌪️', desc: 'Mistral', badge: 'FREE' },
];

const ALL_MODELS = [...DEFAULT_OLLAMA_CLOUD_MODELS, ...OPENROUTER_MODELS];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider?: string;
  model?: string;
  emoji?: string;
}

export default function FreeAIPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [ollamaCloudModels, setOllamaCloudModels] = useState(DEFAULT_OLLAMA_CLOUD_MODELS);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_OLLAMA_CLOUD_MODELS[0].id);
  const [currentProvider, setCurrentProvider] = useState<string>('');
  const [currentModel, setCurrentModel] = useState<string>('');
  const [currentEmoji, setCurrentEmoji] = useState<string>('');
  const [error, setError] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('당신은 친절하고 유능한 AI 어시스턴트입니다. 한국어로 답변해주세요.');
  const [showSettings, setShowSettings] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [ollamaModel, setOllamaModel] = useState('qwen3.5');
  const [showSidebar, setShowSidebar] = useState(false);
  const [ollamaApiKey, setOllamaApiKey] = useState('');
  const [openrouterApiKey, setOpenrouterApiKey] = useState('');
  const [showApiKeys, setShowApiKeys] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setOllamaApiKey(localStorage.getItem('freeai_ollama_key') || '');
    setOpenrouterApiKey(localStorage.getItem('freeai_openrouter_key') || '');
    // Ollama 모델 목록 동적 로드
    fetch('/api/ollama/models')
      .then((r) => r.ok ? r.json() : null)
      .then((d: { models?: string[]; installed?: string[] } | null) => {
        if (!d?.models?.length) return;
        // 설치된 모델 먼저, 나머지는 popular 순
        const newModels = d.models.slice(0, 20).map((id) => {
          const existing = DEFAULT_OLLAMA_CLOUD_MODELS.find((m) => m.id === id || id.startsWith(m.id));
          const isInstalled = d.installed?.includes(id);
          return existing
            ? { ...existing, id, badge: isInstalled ? 'LOCAL' : 'CLOUD' as const }
            : { id, name: id, emoji: '🤖', desc: isInstalled ? '로컬 설치됨' : 'ollama.com', badge: isInstalled ? 'LOCAL' : 'CLOUD' as const };
        });
        setOllamaCloudModels(newModels);
      })
      .catch(() => {});
  }, []);

  // AI 키를 localStorage + DB 설정 모두에 저장 (자동실행/서버 기능에서도 사용)
  const saveKeyToDb = async (dbKey: string, value: string) => {
    try {
      await fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [dbKey]: value }),
      });
    } catch { /* 저장 실패 무시 */ }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setError('');

    const aiMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: '' }]);

    try {
      const apiMessages = [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...newMessages.map(m => ({ role: m.role, content: m.content })),
      ];

      const res = await fetch('/api/free-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          model: selectedModel,
          ollamaUrl: ollamaUrl || undefined,
          ollamaModel: ollamaModel || undefined,
          clientOllamaKey: ollamaApiKey || undefined,
          clientOpenrouterKey: openrouterApiKey || undefined,
        }),
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.provider) {
              setCurrentProvider(data.provider);
              setCurrentModel(data.model);
              setCurrentEmoji(data.emoji || '🤖');
              setMessages(prev => prev.map(m => m.id === aiMsgId
                ? { ...m, provider: data.provider, model: data.model, emoji: data.emoji }
                : m
              ));
            }
            if (data.chunk) {
              fullText += data.chunk;
              setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullText } : m));
            }
            if (data.error) setError(data.error);
          } catch {}
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, messages, selectedModel, systemPrompt, ollamaUrl, ollamaModel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      {/* Sidebar overlay on mobile */}
      {showSidebar && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setShowSidebar(false)} />
      )}

      {/* Left Panel: Model Selector */}
      <div className={`
        fixed md:relative z-50 md:z-auto top-0 bottom-0 left-0
        w-72 flex-shrink-0 bg-slate-900 border-r border-slate-700/50
        flex flex-col transition-transform duration-300
        ${showSidebar ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-white flex items-center gap-2">
              <span className="text-lg">🆓</span> 무료 AI
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">API 키 없이 무료로 사용</p>
          </div>
          <button onClick={() => setShowSidebar(false)} className="md:hidden text-slate-400 hover:text-white">✕</button>
        </div>

        {/* Current provider badge */}
        {currentProvider && (
          <div className="mx-4 mt-3 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs">
            <div className="flex items-center gap-2 text-emerald-400">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              <span className="font-semibold">{currentEmoji} {currentModel}</span>
            </div>
            <div className="text-slate-400 mt-0.5">via {currentProvider}</div>
          </div>
        )}

        {/* Model list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          <div className="px-1 mb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1">
            ☁️ Ollama Cloud
          </div>
          {ollamaCloudModels.map(m => (
            <button
              key={m.id}
              onClick={() => { setSelectedModel(m.id); localStorage.setItem('freeai_last_model', m.id); setShowSidebar(false); }}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-all ${
                selectedModel === m.id ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{m.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{m.name}</div>
                  <div className={`text-[10px] truncate ${selectedModel === m.id ? 'text-indigo-200' : 'text-slate-500'}`}>{m.desc}</div>
                </div>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                  selectedModel === m.id ? 'bg-white/20 text-white' : 'bg-sky-500/20 text-sky-400'
                }`}>CLOUD</span>
              </div>
            </button>
          ))}

          <div className="px-1 mt-3 mb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
            🔄 OpenRouter 폴백
          </div>
          {OPENROUTER_MODELS.map(m => (
            <button
              key={m.id}
              onClick={() => { setSelectedModel(m.id); localStorage.setItem('freeai_last_model', m.id); setShowSidebar(false); }}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-all ${
                selectedModel === m.id ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{m.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{m.name}</div>
                  <div className={`text-[10px] truncate ${selectedModel === m.id ? 'text-indigo-200' : 'text-slate-500'}`}>{m.desc}</div>
                </div>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                  selectedModel === m.id ? 'bg-white/20 text-white' : 'bg-emerald-500/20 text-emerald-400'
                }`}>FREE</span>
              </div>
            </button>
          ))}

          {/* Ollama section */}
          <div className="px-1 mt-4 mb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
            Ollama (자체 서버)
          </div>
          <div className="px-1 space-y-2">
            <input
              type="text"
              placeholder="http://localhost:11434"
              value={ollamaUrl}
              onChange={e => setOllamaUrl(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <input
              type="text"
              placeholder="모델명 (예: llama3.2)"
              value={ollamaModel}
              onChange={e => setOllamaModel(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            {ollamaUrl && (
              <div className="text-[10px] text-slate-400 px-1">
                ✓ Ollama 우선 사용 설정됨
              </div>
            )}
          </div>
        </div>

        {/* API Key settings */}
        <div className="p-3 border-t border-slate-700/50 space-y-1">
          <button
            onClick={() => setShowApiKeys(!showApiKeys)}
            className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-2"
          >
            <span>🔑</span>
            <span>API 키 설정</span>
            <span className="ml-auto">{showApiKeys ? '▲' : '▼'}</span>
          </button>
          {showApiKeys && (
            <div className="space-y-2 px-1">
              <div>
                <label className="text-[10px] text-slate-500 px-1 mb-1 block">☁️ Ollama Cloud Key</label>
                <input
                  type="password"
                  placeholder="ollama cloud api key..."
                  value={ollamaApiKey}
                  onChange={e => {
                    setOllamaApiKey(e.target.value);
                    localStorage.setItem('freeai_ollama_key', e.target.value);
                    if (e.target.value.length > 10) saveKeyToDb('OLLAMA_API_KEY', e.target.value);
                  }}
                  className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 px-1 mb-1 block">🔄 OpenRouter Key</label>
                <input
                  type="password"
                  placeholder="sk-or-..."
                  value={openrouterApiKey}
                  onChange={e => {
                    setOpenrouterApiKey(e.target.value);
                    localStorage.setItem('freeai_openrouter_key', e.target.value);
                    if (e.target.value.length > 10) saveKeyToDb('OPENROUTER_API_KEY', e.target.value);
                  }}
                  className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="text-[10px] text-slate-500 px-1">키는 브라우저 + 서버에 저장되어 자동실행에도 사용됩니다</div>
            </div>
          )}

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-2"
          >
            <span>⚙️</span>
            <span>시스템 프롬프트</span>
            <span className="ml-auto">{showSettings ? '▲' : '▼'}</span>
          </button>
          {showSettings && (
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              rows={4}
              className="mt-2 w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
              placeholder="AI에게 역할을 부여하세요..."
            />
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-700/50 flex-shrink-0">
          <button onClick={() => setShowSidebar(true)} className="md:hidden text-slate-400 hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-white text-sm flex items-center gap-2">
              🆓 무료 AI 체험
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">무료</span>
            </h1>
            <p className="text-xs text-slate-400 truncate">
              {ALL_MODELS.find(m => m.id === selectedModel)?.name || 'AI 모델'} ·{' '}
              {ollamaCloudModels.find(m => m.id === selectedModel) ? 'Ollama Cloud' : 'OpenRouter'}
            </p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => { setMessages([]); setCurrentProvider(''); setCurrentModel(''); setError(''); }}
              className="text-xs text-slate-500 hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors flex-shrink-0"
            >
              🗑 초기화
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="text-6xl mb-4">🆓</div>
              <h2 className="text-xl font-bold text-white mb-2">무료 AI와 대화하기</h2>
              <p className="text-slate-400 text-sm mb-6 max-w-sm">
                API 키 없이 Llama, Mistral, Gemma 등 최신 AI 모델과 대화하세요.
                OpenRouter 무료 티어를 활용합니다.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                {[
                  '안녕! 자기소개 해줘',
                  '오늘 점심 메뉴 추천해줘',
                  '파이썬으로 Hello World 짜줘',
                  '마케팅 아이디어 5가지 알려줘',
                ].map(q => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); inputRef.current?.focus(); }}
                    className="px-3 py-2.5 text-xs text-left bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 rounded-xl text-slate-300 transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-3`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-base flex-shrink-0 mt-0.5">
                  {msg.emoji || '🤖'}
                </div>
              )}
              <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                {msg.role === 'assistant' && msg.model && (
                  <div className="text-[10px] text-slate-500 mb-1 flex items-center gap-1">
                    {msg.model} · {msg.provider}
                  </div>
                )}
                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-tr-sm'
                    : 'bg-slate-800 border border-slate-700/50 text-slate-100 rounded-tl-sm'
                }`}>
                  {msg.content || (loading && msg.role === 'assistant' && (
                    <span className="flex items-center gap-1 text-slate-400">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  ))}
                </div>
                {msg.role === 'assistant' && msg.content && (
                  <button
                    onClick={() => navigator.clipboard.writeText(msg.content)}
                    className="mt-1 text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                  >
                    📋 복사
                  </button>
                )}
              </div>
            </div>
          ))}

          {error && (
            <div className="mx-auto max-w-lg px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
              ⚠️ {error}
              <div className="mt-2 text-red-300/60">
                해결: 설정 &gt; OpenRouter API 키 추가 또는 왼쪽 Ollama URL 입력
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="p-4 bg-slate-900 border-t border-slate-700/50 flex-shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder="메시지를 입력하세요... (Enter 전송, Shift+Enter 줄바꿈)"
              rows={1}
              className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none disabled:opacity-50 transition-colors"
              style={{ maxHeight: '120px', overflowY: 'auto' }}
              onInput={e => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-all flex-shrink-0"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : '↑'}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-600">
            <span>powered by OpenRouter · Ollama</span>
            <span>{input.length > 0 ? `${input.length}자` : ''}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
