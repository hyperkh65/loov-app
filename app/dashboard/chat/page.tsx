'use client';

import { useState, useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import { ANIMAL_EMOJI, ANIMAL_PERSONALITY, Message } from '@/lib/types';

// ── 채팅 뷰 ──────────────────────────────────────────
function ChatPanel({ employeeId }: { employeeId: string }) {
  const { employees, directChats, addDirectMessage, companySettings } = useStore();
  const employee = employees.find((e) => e.id === employeeId);
  const chat = directChats.find((c) => c.employeeId === employeeId);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.messages, typing]);

  if (!employee || !chat) return null;

  const handleSend = async () => {
    const text = input.trim();
    if (!text || typing) return;
    setInput('');

    const userMsg: Message = { id: crypto.randomUUID(), from: 'user', content: text, timestamp: new Date().toISOString() };
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
          message: text,
          history: chat.messages.slice(-10),
          companyName: companySettings.companyName,
          ceoName: companySettings.ceoName,
          apiKey: employee.aiConfig?.apiKey || companySettings.globalAIConfig?.apiKey,
        }),
      });
      const data = await res.json();
      if (data.reply) {
        const aiMsg: Message = { id: crypto.randomUUID(), from: employeeId, content: data.reply, timestamp: new Date().toISOString() };
        addDirectMessage(employeeId, aiMsg);
      }
    } catch {
      const errMsg: Message = { id: crypto.randomUUID(), from: employeeId, content: '죄송합니다. 일시적인 오류가 발생했습니다.', timestamp: new Date().toISOString() };
      addDirectMessage(employeeId, errMsg);
    } finally {
      setTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 직원 헤더 */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-white flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-xl">
          {ANIMAL_EMOJI[employee.animal]}
        </div>
        <div>
          <div className="font-bold text-gray-900">{employee.name}</div>
          <div className="text-xs text-gray-400">{employee.role} · {employee.department}</div>
        </div>
        <div className={`ml-auto w-2 h-2 rounded-full ${typing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
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
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
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

      {/* 입력창 */}
      <div className="flex-shrink-0 border-t border-gray-100 p-4 bg-white">
        <div className="flex gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
            placeholder={`${employee.name}에게 업무를 지시하세요...`}
            disabled={typing}
          />
          <button onClick={handleSend} disabled={!input.trim() || typing}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-colors">
            전송
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { employees, directChats } = useStore();
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(employees[0]?.id ?? null);

  useEffect(() => {
    if (!activeEmployeeId && employees.length > 0) {
      setActiveEmployeeId(employees[0].id);
    }
  }, [employees, activeEmployeeId]);

  const totalMessages = directChats.reduce((s, c) => s + c.messages.length, 0);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* 직원 목록 사이드바 */}
      <div className="w-72 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100">
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
              const isActive = activeEmployeeId === emp.id;
              const unread = chat?.messages.filter((m) => m.from !== 'user').length ?? 0;

              return (
                <button key={emp.id} onClick={() => setActiveEmployeeId(emp.id)}
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
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-400 truncate flex-1">{lastMsg ? lastMsg.content : emp.role}</p>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 채팅 영역 */}
      <div className="flex-1 min-w-0">
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
  );
}
