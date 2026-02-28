'use client';

import { Employee } from '@/lib/types';
import AnimatedCharacter from './AnimatedCharacter';

interface Props {
  employees: Employee[];
  characterImages: Record<string, string>;
  generatingIds: string[];
  openChatIds: string[];
  selectedForMeeting: string[];
  onOpenChat: (employeeId: string) => void;
  onToggleMeetingSelect: (employeeId: string) => void;
  onStartMeeting: () => void;
  onDailyReport: () => void;
  onHire: () => void;
  meetingMode: boolean;
  setMeetingMode: (v: boolean) => void;
}

export default function CharacterDock({
  employees, characterImages, generatingIds,
  openChatIds, selectedForMeeting,
  onOpenChat, onToggleMeetingSelect, onStartMeeting,
  onDailyReport, onHire, meetingMode, setMeetingMode,
}: Props) {
  const sanmu = employees.find((e) => e.role === '대표' || e.role === ('상무' as string));
  const others = employees.filter((e) => e.role !== '대표' && e.role !== ('상무' as string));

  // Responsive sizing: shrink characters when there are many
  const total = employees.length;
  const charSize = total >= 10 ? 48 : total >= 7 ? 56 : 68;
  const sanmuSize = total >= 10 ? 60 : total >= 7 ? 70 : 86;

  const handleSelect = (employee: Employee) => {
    if (meetingMode) {
      onToggleMeetingSelect(employee.id);
    } else {
      onOpenChat(employee.id);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      {/* Meeting mode banner */}
      {meetingMode && (
        <div className="bg-indigo-600 text-white text-center py-2 text-sm font-medium">
          🤝 참석자 선택 ({selectedForMeeting.length}명)
          <button onClick={() => setMeetingMode(false)} className="ml-3 text-indigo-200 hover:text-white underline text-xs">취소</button>
          {selectedForMeeting.length >= 2 && (
            <button onClick={onStartMeeting} className="ml-3 bg-white text-indigo-700 text-xs font-bold px-3 py-0.5 rounded-full">회의 시작 →</button>
          )}
        </div>
      )}

      {/* Stage floor glow */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-200 to-transparent" />

      {/* Dock */}
      <div className="bg-white/85 backdrop-blur-2xl border-t border-gray-200/60 shadow-[0_-8px_40px_rgba(0,0,0,0.1)]">
        <div className="w-full px-6 pt-28 pb-4 flex items-end gap-6">

          {/* 상무 */}
          {sanmu && (
            <div className="relative flex-shrink-0">
              {meetingMode && (
                <div className={`absolute -inset-2 rounded-full border-2 transition-all ${selectedForMeeting.includes(sanmu.id) ? 'border-indigo-500 bg-indigo-50/40' : 'border-transparent'}`} />
              )}
              <AnimatedCharacter
                employee={sanmu}
                characterImage={characterImages[sanmu.id]}
                isGenerating={generatingIds.includes(sanmu.id)}
                isChatOpen={openChatIds.includes(sanmu.id)}
                isSanmu
                sizeOverride={sanmuSize}
                onSelect={() => handleSelect(sanmu)}
              />
              {!meetingMode && (
                <button
                  onClick={onDailyReport}
                  className="absolute -top-3 -right-1 bg-amber-400 hover:bg-amber-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm transition-colors whitespace-nowrap"
                >
                  📋 보고
                </button>
              )}
            </div>
          )}

          {/* Divider */}
          {sanmu && others.length > 0 && (
            <div className="w-px h-14 bg-gradient-to-b from-transparent via-gray-300 to-transparent flex-shrink-0 self-center" />
          )}

          {/* Other employees */}
          <div
            className="flex items-end gap-6 flex-1 pb-1 scrollbar-none"
            style={{ overflow: 'visible' }}
          >
            {others.map((employee) => (
              <div key={employee.id} className="relative flex-shrink-0">
                {meetingMode && (
                  <div className={`absolute -inset-2 rounded-full border-2 transition-all ${selectedForMeeting.includes(employee.id) ? 'border-indigo-500 bg-indigo-50/40' : 'border-transparent'}`} />
                )}
                <AnimatedCharacter
                  employee={employee}
                  characterImage={characterImages[employee.id]}
                  isGenerating={generatingIds.includes(employee.id)}
                  isChatOpen={openChatIds.includes(employee.id)}
                  sizeOverride={charSize}
                  onSelect={() => handleSelect(employee)}
                />
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex-shrink-0 flex items-center gap-3 pl-3 border-l border-gray-200">
            {!meetingMode && employees.length >= 2 && (
              <button onClick={() => setMeetingMode(true)} className="flex flex-col items-center gap-1 text-gray-400 hover:text-indigo-600 transition-colors">
                <span className="text-xl">🤝</span>
                <span className="text-[9px] font-medium">회의</span>
              </button>
            )}
            <button onClick={onHire} className="flex flex-col items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors">
              <span className="w-9 h-9 rounded-full border-2 border-dashed border-gray-300 hover:border-gray-400 flex items-center justify-center text-lg transition-colors">+</span>
              <span className="text-[9px] font-medium">채용</span>
            </button>
          </div>
        </div>

        {/* Empty state hint */}
        {employees.length === 0 && (
          <div className="text-center pb-3 text-xs text-gray-400">직원을 채용하면 여기에 나타납니다</div>
        )}
      </div>
    </div>
  );
}
