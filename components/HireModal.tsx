'use client';

import { useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { AnimalType, Role, Employee, ANIMAL_LABEL, ANIMAL_EMOJI, ORB_GRADIENT, ROLE_BADGE, ANIMAL_MODEL, ANIMAL_MODEL_ROTATION, ROLE_DEFAULT_SKILLS, ROLE_DEPARTMENT } from '@/lib/types';

const Character3DViewer = dynamic(() => import('./Character3DViewer'), { ssr: false });

interface Props {
  onHire: (employee: Employee) => void;
  onClose: () => void;
}

const ANIMALS: AnimalType[] = ['pig', 'cat', 'rabbit', 'fox', 'otter', 'tiger', 'deer', 'elephant', 'monkey'];
const ROLES: Role[] = ['영업팀장', '회계팀장', '마케터', '개발자', '디자이너', 'HR매니저', '고객지원', '전략기획'];

const ROLE_ICON: Record<Role, string> = {
  '대표':     '👑',
  '영업팀장': '📊',
  '회계팀장': '💰',
  '마케터':   '📣',
  '개발자':   '💻',
  '디자이너': '🎨',
  'HR매니저': '🤝',
  '고객지원': '💬',
  '전략기획': '🎯',
};

export default function HireModal({ onHire, onClose }: Props) {
  const [name, setName] = useState('');
  const [selectedAnimal, setSelectedAnimal] = useState<AnimalType>('fox');
  const [selectedRole, setSelectedRole] = useState<Role>('영업팀장');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onHire({
      id: crypto.randomUUID(),
      name: name.trim(),
      animal: selectedAnimal,
      role: selectedRole,
      department: ROLE_DEPARTMENT[selectedRole],
      hiredAt: new Date().toISOString(),
      skills: ROLE_DEFAULT_SKILLS[selectedRole],
      taskCount: 0,
      completedTaskCount: 0,
      status: 'active',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">AI 직원 채용</h2>
          <p className="text-sm text-gray-400 mt-0.5">AI 직원을 채용하여 업무를 지시하세요</p>
        </div>

        <div className="flex">
          {/* 3D 캐릭터 미리보기 */}
          <div
            className="w-48 flex-shrink-0 flex flex-col items-center justify-end pb-4 relative"
            style={{ background: ORB_GRADIENT[selectedAnimal], minHeight: 220 }}
          >
            <div style={{ width: 160, height: 200, position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)' }}>
              <Character3DViewer
                url={ANIMAL_MODEL[selectedAnimal]}
                hovered={false}
                greeting={false}
                rotationY={ANIMAL_MODEL_ROTATION[selectedAnimal]}
              />
            </div>
            {name && (
              <div className="relative z-10 text-center mt-auto pt-36">
                <p className="font-bold text-white text-sm drop-shadow">{name}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${ROLE_BADGE[selectedRole]}`}>{selectedRole}</span>
              </div>
            )}
          </div>

          {/* 오른쪽 폼 */}
          <form onSubmit={handleSubmit} className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[70vh]">
            {/* 이름 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">직원 이름</label>
              <input
                value={name} onChange={(e) => setName(e.target.value)}
                placeholder="예: 김영업, 이회계..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                required autoFocus
              />
            </div>

            {/* 직책 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">담당 직책</label>
              <div className="grid grid-cols-2 gap-1.5">
                {ROLES.map((role) => (
                  <button key={role} type="button" onClick={() => setSelectedRole(role)}
                    className={`px-3 py-2 rounded-xl text-sm border-2 text-left transition-all flex items-center gap-1.5 ${
                      selectedRole === role ? 'border-indigo-400 bg-indigo-50 text-indigo-700 font-semibold'
                        : 'border-gray-100 hover:border-gray-200 text-gray-600 bg-gray-50'
                    }`}
                  >
                    <span>{ROLE_ICON[role]}</span>
                    <span className="truncate">{role}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 동물 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">캐릭터 선택</label>
              <div className="grid grid-cols-3 gap-1.5">
                {ANIMALS.map((animal) => (
                  <button key={animal} type="button" onClick={() => setSelectedAnimal(animal)}
                    className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl border-2 transition-all ${
                      selectedAnimal === animal ? 'border-indigo-400 bg-indigo-50' : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                    }`}
                  >
                    <span className="text-xl">{ANIMAL_EMOJI[animal]}</span>
                    <span className="text-[10px] text-gray-600">{ANIMAL_LABEL[animal]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 스킬 미리보기 */}
            <div className="bg-indigo-50 rounded-xl p-3">
              <div className="text-xs font-semibold text-indigo-600 mb-2">채용 시 기본 역량</div>
              <div className="flex flex-wrap gap-1">
                {ROLE_DEFAULT_SKILLS[selectedRole].map((skill) => (
                  <span key={skill} className="text-[10px] bg-white border border-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">취소</button>
              <button type="submit" disabled={!name.trim()} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 disabled:opacity-40">
                채용하기
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
