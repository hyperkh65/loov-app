'use client';

import { useState, useRef, useEffect } from 'react';
import { Employee, Message, DirectChat, ORB_GRADIENT } from '@/lib/types';
import EmployeeAvatar from './EmployeeAvatar';

interface Props {
  employee: Employee;
  chat: DirectChat;
  characterImage?: string;
  offset: number;
  onSendMessage: (employeeId: string, message: Message) => void;
  onClose: () => void;
}

export default function DirectChatPanel({
  employee, chat, characterImage, offset, onSendMessage, onClose,
}: Props) {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const rightOffset = 4 + offset * 356;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages, isTyping]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isTyping) return;
    setInput('');

    const userMsg: Message = {
      id: crypto.randomUUID(),
      from: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    onSendMessage(employee.id, userMsg);

    setIsTyping(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee,
          userMessage: text,
          chatHistory: [...chat.messages, userMsg].slice(-20),
        }),
      });
      const data = await res.json();
      const reply: Message = {
        id: crypto.randomUUID(),
        from: employee.id,
        content: data.reply || '죄송합니다, 다시 시도해주세요.',
        timestamp: new Date().toISOString(),
      };
      onSendMessage(employee.id, reply);
    } catch {
      const errMsg: Message = {
        id: crypto.randomUUID(),
        from: employee.id,
        content: '연결이 불안정합니다. 잠시 후 다시 시도해주세요.',
        timestamp: new Date().toISOString(),
      };
      onSendMessage(employee.id, errMsg);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div
      className="fixed z-50 flex flex-col"
      style={{
        bottom: '92px',
        right: `${rightOffset}px`,
        width: '340px',
        maxHeight: minimized ? '52px' : '480px',
        transition: 'max-height 0.2s ease',
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col h-full">

        {/* Header */}
        <div
          className="flex items-center gap-2.5 px-4 py-3 cursor-pointer select-none"
          style={{ background: ORB_GRADIENT[employee.animal] }}
          onClick={() => setMinimized(!minimized)}
        >
          <EmployeeAvatar employee={employee} characterImage={characterImage} size={36} />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm leading-none">{employee.name}</p>
            <p className="text-gray-600 text-xs mt-0.5">{employee.role}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }}
              className="w-5 h-5 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center text-gray-600 text-xs transition-colors"
            >
              {minimized ? '▲' : '–'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="w-5 h-5 rounded-full bg-black/10 hover:bg-red-200 flex items-center justify-center text-gray-600 hover:text-red-700 text-xs transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {!minimized && (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-gray-50 min-h-0">
              {chat.messages.length === 0 && (
                <div className="text-center py-8">
                  <EmployeeAvatar employee={employee} characterImage={characterImage} size={48} className="mx-auto mb-2" />
                  <p className="text-xs text-gray-400">{employee.name}과 대화를 시작해보세요</p>
                </div>
              )}
              {chat.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${msg.from === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {msg.from !== 'user' && (
                    <EmployeeAvatar employee={employee} characterImage={characterImage} size={28} />
                  )}
                  <div
                    className={`max-w-[76%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                      msg.from === 'user'
                        ? 'bg-gray-800 text-white rounded-br-sm'
                        : 'bg-white text-gray-800 shadow-sm rounded-bl-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex items-end gap-2">
                  <EmployeeAvatar employee={employee} characterImage={characterImage} size={28} />
                  <div className="bg-white shadow-sm px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-t border-gray-100 bg-white">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder={`${employee.name}에게 메시지...`}
                className="flex-1 text-sm bg-gray-100 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder-gray-400"
                disabled={isTyping}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 disabled:bg-gray-200 flex items-center justify-center transition-colors flex-shrink-0"
              >
                <svg className="w-3.5 h-3.5 text-white rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
