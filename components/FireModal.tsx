'use client';

import { useState } from 'react';
import { Employee } from '@/lib/types';
import EmployeeAvatar from './EmployeeAvatar';

interface Props {
  employees: Employee[];
  characterImages: Record<string, string>;
  onFire: (id: string) => void;
  onClose: () => void;
}

export default function FireModal({ employees, characterImages, onFire, onClose }: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const handleFire = (id: string) => {
    onFire(id);
    setConfirmId(null);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">직원 해고</h2>
          <p className="text-sm text-gray-400 mt-0.5">해고할 직원을 선택하세요</p>
        </div>

        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
          {employees.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">해고할 직원이 없습니다</div>
          )}
          {employees.map((emp) => (
            <div key={emp.id} className="bg-gray-50 rounded-2xl px-4 py-3">
              {confirmId === emp.id ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <EmployeeAvatar employee={emp} characterImage={characterImages[emp.id]} size={36} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{emp.name}</p>
                      <p className="text-xs text-gray-400">정말 해고하시겠어요?</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleFire(emp.id)}
                      className="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                    >
                      해고
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="text-xs bg-white hover:bg-gray-100 text-gray-500 px-3 py-1.5 rounded-lg font-medium border border-gray-200 transition-colors"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <EmployeeAvatar employee={emp} characterImage={characterImages[emp.id]} size={36} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{emp.name}</p>
                      <p className="text-xs text-gray-400">{emp.role}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setConfirmId(emp.id)}
                    className="text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0 font-medium border border-transparent hover:border-red-200"
                  >
                    해고
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="px-4 pb-4">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
