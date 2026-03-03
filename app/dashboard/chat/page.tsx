'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { ANIMAL_EMOJI, ANIMAL_PERSONALITY, Message } from '@/lib/types';

interface Tool {
  id: string;
  label: string;
  icon: string;
  prompt: string;
}

// ── 툴 패널 ──────────────────────────────────────────
function ToolsPanel({ employeeId, onToolResult }: { employeeId: string; onToolResult: (result: string) => void }) {
  const { employees, companySettings } = useStore();
  const employee = employees.find((e) => e.id === employeeId);
  const [tools, setTools] = useState<Tool[]>([]);
  const [runningTool, setRunningTool] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState('');
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);

  const fetchTools = useCallback(async () => {
    if (!employee?.role) return;
    const res = await fetch(`/api/tools?role=${encodeURIComponent(employee.role)}`);
    const data = await res.json();
    setTools(data.tools || []);
  }, [employee?.role]);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  const runTool = async (tool: Tool) => {
    const hasEmpKey = !!employee?.aiConfig?.apiKey;
    const apiKey = hasEmpKey ? employee!.aiConfig!.apiKey : companySettings.globalAIConfig?.apiKey;
    const provider = hasEmpKey ? employee!.aiConfig!.provider : (companySettings.globalAIConfig?.provider || 'gemini');

    if (!apiKey) {
      onToolResult('⚠️ AI 설정에서 API 키를 먼저 등록해주세요.');
      return;
    }

    if (tool.prompt.endsWith(':') && !customInput.trim()) {
      setSelectedTool(tool);
      return;
    }

    setRunningTool(tool.id);
    try {
      const res = await fetch('/api/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolId: tool.id,
          role: employee?.role,
          customInput: customInput || undefined,
          apiKey,
          provider,
          model: employee?.aiConfig?.model || companySettings.globalAIConfig?.model,
        }),
      });
      const data = await res.json();
      if (data.reply) {
        onToolResult(`[${tool.icon} ${tool.label}]\n\n${data.reply}`);
        setCustomInput('');
        setSelectedTool(null);
      } else {
        onToolResult('툴 실행 중 오류가 발생했습니다: ' + data.error);
      }
    } finally {
      setRunningTool(null);
    }
  };

  if (!employee) return null;

  return (
    <div className="border-t border-gray-100 bg-gray-50/80 p-3">
      <div className="text-xs font-semibold text-gray-400 mb-2">
        🔧 {employee.role} 툴
      </div>
      {selectedTool ? (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-700">{selectedTool.icon} {selectedTool.label}</div>
          <textarea
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="입력할 내용을 작성해주세요..."
            rows={3}
            className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-400 resize-none bg-white"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setSelectedTool(null); setCustomInput(''); }}
              className="flex-1 text-xs border border-gray-200 text-gray-500 py-2 rounded-xl hover:bg-gray-100"
            >취소</button>
            <button
              onClick={() => runTool(selectedTool)}
              disabled={!customInput.trim() || !!runningTool}
              className="flex-1 text-xs bg-indigo-600 text-white py-2 rounded-xl font-bold disabled:opacity-50 hover:bg-indigo-500"
            >{runningTool ? '실행 중...' : '실행'}</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => runTool(tool)}
              disabled={runningTool === tool.id}
              className="text-[11px] flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 hover:border-indigo-400 hover:text-indigo-600 transition-colors disabled:opacity-60"
            >
              <span>{tool.icon}</span>
              <span>{tool.label}</span>
              {runningTool === tool.id && (
                <span className="w-3 h-3 border border-gray-400 border-t-indigo-500 rounded-full animate-spin" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 채팅 뷰 ──────────────────────────────────────────
function ChatPanel({ employeeId, onBack }: { employeeId: string; onBack?: () => void }) {
  const { employees, directChats, addDirectMessage, companySettings } = useStore();
  const employee = employees.find((e) => e.id === employeeId);
  const chat = directChats.find((c) => c.employeeId === employeeId);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.messages, typing]);

  if (!employee || !chat) return null;

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || typing) return;
    if (!text) setInput('');

    const userMsg: Message = { id: crypto.randomUUID(), from: 'user', content: msg, timestamp: new Date().toISOString() };
    addDirectMessage(employeeId, userMsg);
    setTyping(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          employeeName: employee.name,
          employeeRole: employee.role,
          employeePersonality: ANIMAL_PERSONALITY[employee.animal],
          message: msg,
          history: chat.messages.slice(-10),
          companyName: companySettings.companyName,
          ceoName: companySettings.ceoName,
          // 직원 개별 키가 있을 때만 직원 설정 사용, 없으면 글로벌 전체 사용
          ...(employee.aiConfig?.apiKey
            ? { apiKey: employee.aiConfig.apiKey, provider: employee.aiConfig.provider, model: employee.aiConfig.model }
            : { apiKey: companySettings.globalAIConfig?.apiKey, provider: companySettings.globalAIConfig?.provider || 'gemini', model: companySettings.globalAIConfig?.model }
          ),
          // 커스터마이징 설정
          customInstructions: employee.customInstructions,
          companyBio: companySettings.companyBio,
          responseLanguage: companySettings.responseLanguage,
          responseLength: companySettings.responseLength,
          globalCustomInstructions: companySettings.globalCustomInstructions,
        }),
      });
      const data = await res.json();
      const reply = data.reply || data.error || '응답이 없습니다.';
      const aiMsg: Message = { id: crypto.randomUUID(), from: employeeId, content: reply, timestamp: new Date().toISOString() };
      addDirectMessage(employeeId, aiMsg);
    } catch (err) {
      const content = err instanceof Error ? `오류: ${err.message}` : '네트워크 오류가 발생했습니다.';
      const errMsg: Message = { id: crypto.randomUUID(), from: employeeId, content, timestamp: new Date().toISOString() };
      addDirectMessage(employeeId, errMsg);
    } finally {
      setTyping(false);
    }
  };

  const handleToolResult = (result: string) => {
    // 툴 결과를 채팅으로 전송
    handleSend(result);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 직원 헤더 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white flex-shrink-0">
        {onBack && (
          <button onClick={onBack} className="md:hidden text-gray-400 hover:text-gray-600 p-1 -ml-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-xl flex-shrink-0">
          {ANIMAL_EMOJI[employee.animal]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-gray-900 text-sm">{employee.name}</div>
          <div className="text-xs text-gray-400">{employee.role} · {employee.department}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTools((v) => !v)}
            className={`text-xs px-2.5 py-1.5 rounded-xl border transition-colors ${
              showTools
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'border-gray-200 text-gray-500 hover:border-indigo-400 hover:text-indigo-600'
            }`}
          >
            🔧 툴
          </button>
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${typing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
        </div>
      </div>

      {/* 메시지 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {chat.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-4xl mb-3">{ANIMAL_EMOJI[employee.animal]}</div>
            <p className="text-sm font-semibold text-gray-700 mb-1">{employee.name} {employee.role}</p>
            <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
              {ANIMAL_PERSONALITY[employee.animal]}
            </p>
            <p className="text-xs text-gray-300 mt-4">첫 메시지를 보내보세요</p>
          </div>
        ) : (
          chat.messages.map((msg) => {
            const isUser = msg.from === 'user';
            return (
              <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && (
                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-base mr-2 flex-shrink-0 mt-1">
                    {ANIMAL_EMOJI[employee.animal]}
                  </div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  isUser
                    ? 'bg-indigo-600 text-white rounded-tr-sm'
                    : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                }`}>
                  {msg.content}
                  <div className={`text-[10px] mt-1 ${isUser ? 'text-indigo-200' : 'text-gray-400'}`}>
                    {new Date(msg.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })
        )}
        {typing && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-base mr-2 flex-shrink-0">
              {ANIMAL_EMOJI[employee.animal]}
            </div>
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 툴 패널 */}
      {showTools && (
        <ToolsPanel employeeId={employeeId} onToolResult={handleToolResult} />
      )}

      {/* 입력창 */}
      <div className="flex-shrink-0 border-t border-gray-100 p-4 bg-white">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
            placeholder={`${employee.name}에게 업무를 지시하세요...`}
            disabled={typing}
          />
          <button onClick={() => handleSend()} disabled={!input.trim() || typing}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-colors">
            전송
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 직원 목록 ──────────────────────────────────────────
function EmployeeList({ activeId, onSelect }: { activeId: string | null; onSelect: (id: string) => void }) {
  const { employees, directChats } = useStore();
  const totalMessages = directChats.reduce((s, c) => s + c.messages.length, 0);

  return (
    <>
      <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
        <h1 className="text-base font-black text-gray-900">💬 채팅 센터</h1>
        <p className="text-xs text-gray-400 mt-0.5">직원 {employees.length}명 · 대화 {totalMessages}건</p>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {employees.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-sm text-gray-400">직원을 채용하면 채팅할 수 있어요</p>
            <a href="/dashboard/employees" className="text-xs text-indigo-600 mt-2 inline-block">직원 채용 →</a>
          </div>
        ) : (
          employees.map((emp) => {
            const chat = directChats.find((c) => c.employeeId === emp.id);
            const lastMsg = chat?.messages.slice(-1)[0];
            const isActive = activeId === emp.id;

            return (
              <button key={emp.id} onClick={() => onSelect(emp.id)}
                className={`w-full text-left px-4 py-3.5 transition-colors ${
                  isActive ? 'bg-indigo-50 border-l-2 border-indigo-500' : 'hover:bg-gray-50 border-l-2 border-transparent'
                }`}>
                <div className="flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg">
                      {ANIMAL_EMOJI[emp.animal]}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                      emp.status === 'active' ? 'bg-emerald-400' : 'bg-gray-300'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-gray-800">{emp.name}</span>
                      {lastMsg && (
                        <span className="text-[10px] text-gray-400">
                          {new Date(lastMsg.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{lastMsg ? lastMsg.content : emp.role}</p>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

export default function ChatPage() {
  const { employees } = useStore();
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(employees[0]?.id ?? null);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  useEffect(() => {
    if (!activeEmployeeId && employees.length > 0) {
      setActiveEmployeeId(employees[0].id);
    }
  }, [employees, activeEmployeeId]);

  const handleSelectEmployee = (id: string) => {
    setActiveEmployeeId(id);
    setMobileView('chat');
  };

  return (
    <div className="flex overflow-hidden bg-gray-50" style={{ height: 'calc(100dvh - 52px - 60px)' }}>
      {/* ── 데스크탑: 사이드바 + 채팅 ── */}
      <div className="hidden md:flex w-full h-full" style={{ height: '100dvh' }}>
        <div className="w-72 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col h-full">
          <EmployeeList activeId={activeEmployeeId} onSelect={setActiveEmployeeId} />
        </div>
        <div className="flex-1 min-w-0 h-full">
          {activeEmployeeId ? (
            <ChatPanel employeeId={activeEmployeeId} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-5xl mb-4">💬</div>
              <h2 className="text-xl font-bold text-gray-700 mb-2">채팅을 시작하세요</h2>
              <p className="text-gray-400 text-sm">왼쪽에서 AI 직원을 선택하세요</p>
            </div>
          )}
        </div>
      </div>

      {/* ── 모바일: 탭 전환 ── */}
      <div className="flex md:hidden flex-col w-full h-full bg-white">
        {mobileView === 'list' ? (
          <EmployeeList activeId={activeEmployeeId} onSelect={handleSelectEmployee} />
        ) : (
          activeEmployeeId && (
            <ChatPanel
              employeeId={activeEmployeeId}
              onBack={() => setMobileView('list')}
            />
          )
        )}
      </div>
    </div>
  );
}
