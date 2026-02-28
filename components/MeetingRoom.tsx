'use client';

import { useState, useRef, useEffect } from 'react';
import { Employee, MeetingMessage, Meeting } from '@/lib/types';
import EmployeeAvatar from './EmployeeAvatar';

interface Props {
  participants: Employee[];
  meeting: Meeting;
  characterImages: Record<string, string>;
  onAddMessage: (meetingId: string, message: MeetingMessage) => void;
  onClose: () => void;
}

export default function MeetingRoom({
  participants, meeting, characterImages, onAddMessage, onClose,
}: Props) {
  const [input, setInput] = useState('');
  const [respondingIds, setRespondingIds] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [meeting.messages, respondingIds]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || respondingIds.length > 0) return;
    setInput('');

    const userMsg: MeetingMessage = {
      id: crypto.randomUUID(),
      from: 'user',
      fromName: '나',
      content: text,
      timestamp: new Date().toISOString(),
    };
    onAddMessage(meeting.id, userMsg);
    const updatedHistory = [...meeting.messages, userMsg];

    for (const participant of participants) {
      setRespondingIds((prev) => [...prev, participant.id]);
      try {
        const res = await fetch('/api/meeting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee: participant,
            topic: meeting.title,
            meetingHistory: updatedHistory.slice(-16),
            userMessage: text,
          }),
        });
        const data = await res.json();
        const reply: MeetingMessage = {
          id: crypto.randomUUID(),
          from: participant.id,
          fromName: participant.name,
          content: data.reply || '...',
          timestamp: new Date().toISOString(),
        };
        onAddMessage(meeting.id, reply);
        updatedHistory.push(reply);
      } catch { /* skip */ } finally {
        setRespondingIds((prev) => prev.filter((id) => id !== participant.id));
      }
    }
  };

  const getEmployee = (id: string) => participants.find((p) => p.id === id);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-white font-bold text-lg">🤝 {meeting.title}</h2>
              <p className="text-indigo-200 text-sm mt-0.5">그룹 회의 · {participants.length}명 참석</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Participant avatars */}
          <div className="flex items-center gap-3 overflow-x-auto scrollbar-none pb-1">
            {participants.map((p) => (
              <div key={p.id} className="relative flex-shrink-0 flex flex-col items-center gap-1">
                <div className="relative">
                  <EmployeeAvatar
                    employee={p}
                    characterImage={characterImages[p.id]}
                    size={44}
                  />
                  {respondingIds.includes(p.id) && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border border-white animate-pulse" />
                  )}
                </div>
                <span className="text-white/80 text-[10px] font-medium">{p.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-gray-50 min-h-0">
          {meeting.messages.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-3xl mb-2">💬</p>
              <p className="text-sm">회의를 시작해보세요</p>
            </div>
          )}
          {meeting.messages.map((msg) => {
            if (msg.from === 'user') {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[70%] bg-indigo-600 text-white px-4 py-2.5 rounded-2xl rounded-br-sm text-sm leading-relaxed shadow-sm">
                    {msg.content}
                  </div>
                </div>
              );
            }
            const emp = getEmployee(msg.from);
            if (!emp) return null;
            return (
              <div key={msg.id} className="flex items-start gap-2.5">
                <EmployeeAvatar
                  employee={emp}
                  characterImage={characterImages[emp.id]}
                  size={32}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-xs text-gray-500 mb-1 font-medium">{emp.name} · {emp.role}</p>
                  <div className="bg-white px-4 py-2.5 rounded-2xl rounded-tl-sm text-sm text-gray-800 leading-relaxed shadow-sm max-w-[80%]">
                    {msg.content}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Typing indicators */}
          {respondingIds.map((id) => {
            const emp = getEmployee(id);
            if (!emp) return null;
            return (
              <div key={`typing-${id}`} className="flex items-end gap-2.5">
                <EmployeeAvatar
                  employee={emp}
                  characterImage={characterImages[emp.id]}
                  size={32}
                />
                <div className="bg-white shadow-sm px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-100 bg-white">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="회의 주제나 질문을 입력하세요..."
            className="flex-1 bg-gray-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder-gray-400"
            disabled={respondingIds.length > 0}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || respondingIds.length > 0}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 text-white text-sm font-semibold rounded-xl transition-colors flex-shrink-0"
          >
            {respondingIds.length > 0 ? '응답 중...' : '전송'}
          </button>
        </div>
      </div>
    </div>
  );
}
