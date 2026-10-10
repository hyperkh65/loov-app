'use client';

import { useState, useRef, useEffect } from 'react';
import { Employee, DirectChat, Meeting, MeetingMessage, Message, ORB_GRADIENT } from '@/lib/types';
import EmployeeAvatar from './EmployeeAvatar';

interface Props {
  openChatIds: string[];
  activeChatId: string | null;
  onActivateChat: (id: string) => void;
  onCloseChat: (id: string) => void;
  employees: Employee[];
  directChats: DirectChat[];
  characterImages: Record<string, string>;
  onSendMessage: (employeeId: string, message: Message) => void;
  activeMeeting: Meeting | null;
  onAddMeetingMessage: (meetingId: string, message: MeetingMessage) => void;
  onCloseMeeting: () => void;
}

/* ─────────────────── Inline Chat ─────────────────── */
function ChatView({ employee, chat, characterImage, onSendMessage }: {
  employee: Employee;
  chat: DirectChat;
  characterImage?: string;
  onSendMessage: (employeeId: string, message: Message) => void;
}) {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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
      onSendMessage(employee.id, {
        id: crypto.randomUUID(),
        from: employee.id,
        content: '연결이 불안정합니다. 잠시 후 다시 시도해주세요.',
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {chat.messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <EmployeeAvatar employee={employee} characterImage={characterImage} size={64} />
            <p className="text-sm text-gray-400">{employee.name}과 대화를 시작해보세요</p>
          </div>
        )}
        {chat.messages.map((msg) => (
          <div key={msg.id} className={`flex items-end gap-2 ${msg.from === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            {msg.from !== 'user' && (
              <EmployeeAvatar employee={employee} characterImage={characterImage} size={28} className="flex-shrink-0" />
            )}
            <div className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
              msg.from === 'user'
                ? 'bg-indigo-600 text-white rounded-br-sm'
                : 'bg-white text-gray-800 shadow-sm rounded-bl-sm'
            }`}>
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
      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-white">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder={`${employee.name}에게 메시지...`}
          disabled={isTyping}
          className="flex-1 text-sm bg-gray-100 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder-gray-400"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isTyping}
          className="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 flex items-center justify-center transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4 text-white rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </>
  );
}

/* ─────────────────── Inline Meeting ─────────────────── */
function MeetingView({ meeting, participants, characterImages, onAddMessage, onClose }: {
  meeting: Meeting;
  participants: Employee[];
  characterImages: Record<string, string>;
  onAddMessage: (meetingId: string, message: MeetingMessage) => void;
  onClose: () => void;
}) {
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

  const getParticipant = (id: string) => participants.find((p) => p.id === id);

  return (
    <>
      {/* Meeting messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
        {meeting.messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-3xl">💬</p>
            <p className="text-sm text-gray-400">회의를 시작해보세요</p>
          </div>
        )}
        {meeting.messages.map((msg) => {
          if (msg.from === 'user') {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[78%] bg-indigo-600 text-white px-3.5 py-2.5 rounded-2xl rounded-br-sm text-sm leading-relaxed shadow-sm">
                  {msg.content}
                </div>
              </div>
            );
          }
          const emp = getParticipant(msg.from);
          if (!emp) return null;
          return (
            <div key={msg.id} className="flex items-start gap-2">
              <EmployeeAvatar employee={emp} characterImage={characterImages[emp.id]} size={28} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500 mb-1 font-medium">{emp.name} · {emp.role}</p>
                <div className="bg-white px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-sm text-gray-800 leading-relaxed shadow-sm max-w-[80%]">
                  {msg.content}
                </div>
              </div>
            </div>
          );
        })}
        {respondingIds.map((id) => {
          const emp = getParticipant(id);
          if (!emp) return null;
          return (
            <div key={`typing-${id}`} className="flex items-end gap-2">
              <EmployeeAvatar employee={emp} characterImage={characterImages[emp.id]} size={28} />
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
      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-white">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="회의 주제나 질문을 입력하세요..."
          disabled={respondingIds.length > 0}
          className="flex-1 text-sm bg-gray-100 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder-gray-400"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || respondingIds.length > 0}
          className="px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 text-white text-sm font-semibold rounded-xl transition-colors flex-shrink-0"
        >
          {respondingIds.length > 0 ? '응답 중' : '전송'}
        </button>
      </div>
    </>
  );
}

/* ─────────────────── Right Panel ─────────────────── */
export default function RightPanel({
  openChatIds, activeChatId, onActivateChat, onCloseChat,
  employees, directChats, characterImages, onSendMessage,
  activeMeeting, onAddMeetingMessage, onCloseMeeting,
}: Props) {
  const activeEmployee = activeChatId ? employees.find((e) => e.id === activeChatId) : null;
  const activeChat = activeChatId ? directChats.find((c) => c.employeeId === activeChatId) : null;
  const meetingParticipants = activeMeeting
    ? employees.filter((e) => activeMeeting.participantIds.includes(e.id))
    : [];

  const showMeeting = !!activeMeeting;
  const showChat = !showMeeting && !!activeChatId && !!activeEmployee && !!activeChat;
  const showEmpty = !showMeeting && !showChat;

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">

      {/* Panel Header */}
      <div className="flex-shrink-0 border-b border-gray-100">

        {/* Chat tabs */}
        {openChatIds.length > 0 && !showMeeting && (
          <div className="flex items-center gap-1 px-3 pt-2 pb-0 overflow-x-auto scrollbar-none">
            {openChatIds.map((id) => {
              const emp = employees.find((e) => e.id === id);
              if (!emp) return null;
              const isActive = id === activeChatId;
              return (
                <div
                  key={id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-xl cursor-pointer flex-shrink-0 border-b-2 transition-all ${
                    isActive
                      ? 'bg-white border-indigo-500 text-gray-800'
                      : 'bg-gray-50 border-transparent text-gray-500 hover:bg-gray-100'
                  }`}
                  onClick={() => onActivateChat(id)}
                >
                  <EmployeeAvatar employee={emp} characterImage={characterImages[id]} size={18} />
                  <span className="text-xs font-medium">{emp.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onCloseChat(id); }}
                    className="text-gray-400 hover:text-gray-600 text-xs ml-0.5 leading-none"
                  >×</button>
                </div>
              );
            })}
          </div>
        )}

        {/* Active chat header */}
        {showChat && activeEmployee && (
          <div className="flex items-center gap-3 px-4 py-3" style={{ background: ORB_GRADIENT[activeEmployee.animal] }}>
            <EmployeeAvatar employee={activeEmployee} characterImage={characterImages[activeEmployee.id]} size={36} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm truncate">{activeEmployee.name}</p>
              <p className="text-xs text-gray-600">{activeEmployee.role}</p>
            </div>
          </div>
        )}

        {/* Meeting header */}
        {showMeeting && activeMeeting && (
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-white font-bold text-sm">🤝 {activeMeeting.title}</p>
                <p className="text-indigo-200 text-xs mt-0.5">그룹 회의 · {meetingParticipants.length}명</p>
              </div>
              <button
                onClick={onCloseMeeting}
                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-xs transition-colors"
              >✕</button>
            </div>
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {meetingParticipants.map((p) => (
                <div key={p.id} className="flex flex-col items-center gap-0.5 flex-shrink-0">
                  <div className="relative">
                    <EmployeeAvatar employee={p} characterImage={characterImages[p.id]} size={32} />
                    {activeMeeting && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border border-white" />
                    )}
                  </div>
                  <span className="text-white/80 text-[9px]">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Panel Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {showEmpty && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
            <div className="text-5xl">💼</div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">대화를 시작해보세요</p>
              <p className="text-sm text-gray-400">아래 도크에서 직원을 클릭하거나<br />팀원 카드를 선택하세요</p>
            </div>
          </div>
        )}

        {showChat && activeEmployee && activeChat && (
          <ChatView
            employee={activeEmployee}
            chat={activeChat}
            characterImage={characterImages[activeEmployee.id]}
            onSendMessage={onSendMessage}
          />
        )}

        {showMeeting && activeMeeting && (
          <MeetingView
            meeting={activeMeeting}
            participants={meetingParticipants}
            characterImages={characterImages}
            onAddMessage={onAddMeetingMessage}
            onClose={onCloseMeeting}
          />
        )}
      </div>
    </div>
  );
}
