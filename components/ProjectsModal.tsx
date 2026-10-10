'use client';

import { useState } from 'react';
import { Project, Employee, PROJECT_COLORS, ANIMAL_IMG, ANIMAL_LABEL } from '@/lib/types';
import Image from 'next/image';

interface Props {
  projects: Project[];
  employees: Employee[];
  onAddProject: (project: Project) => void;
  onUpdateProject: (id: string, updates: Partial<Project>) => void;
  onRemoveProject: (id: string) => void;
  onClose: () => void;
}

const COLOR_KEYS = Object.keys(PROJECT_COLORS);
const STATUS_LABELS = { planning: '기획', active: '진행 중', done: '완료' };
const STATUS_COLORS = {
  planning: 'bg-gray-100 text-gray-600',
  active: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
};

export default function ProjectsModal({ projects, employees, onAddProject, onUpdateProject, onRemoveProject, onClose }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [colorKey, setColorKey] = useState('indigo');
  const [assignedIds, setAssignedIds] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAddProject({
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      colorKey,
      assignedEmployeeIds: assignedIds,
      status: 'planning',
      createdAt: new Date().toISOString(),
    });
    setName(''); setDescription(''); setColorKey('indigo'); setAssignedIds([]);
    setShowForm(false);
  };

  const toggleEmployee = (id: string) => {
    setAssignedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">📁 프로젝트 관리</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowForm(!showForm)} className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
              + 새 프로젝트
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* New project form */}
          {showForm && (
            <form onSubmit={handleSubmit} className="bg-indigo-50 rounded-2xl p-4 space-y-3 border border-indigo-100">
              <p className="font-semibold text-indigo-800 text-sm">새 프로젝트 추가</p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="프로젝트 이름"
                className="w-full border border-indigo-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                required autoFocus
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="간단한 설명 (선택)"
                className="w-full border border-indigo-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
              />

              {/* Color */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-indigo-600 font-medium">색상</span>
                {COLOR_KEYS.map((key) => (
                  <button key={key} type="button" onClick={() => setColorKey(key)}
                    className={`w-5 h-5 rounded-full ${PROJECT_COLORS[key].dot} transition-all ${colorKey === key ? 'ring-2 ring-offset-1 ring-indigo-400 scale-125' : ''}`}
                  />
                ))}
              </div>

              {/* Assign employees */}
              {employees.length > 0 && (
                <div>
                  <p className="text-xs text-indigo-600 font-medium mb-2">담당 직원</p>
                  <div className="flex flex-wrap gap-2">
                    {employees.map((e) => (
                      <button key={e.id} type="button" onClick={() => toggleEmployee(e.id)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-all ${
                          assignedIds.includes(e.id) ? 'bg-indigo-500 text-white' : 'bg-white text-gray-600 border border-gray-200'
                        }`}
                      >
                        <Image src={ANIMAL_IMG[e.animal]} alt={ANIMAL_LABEL[e.animal]} width={14} height={14} unoptimized />
                        {e.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-xl border border-indigo-200 text-indigo-600 text-sm hover:bg-indigo-100">취소</button>
                <button type="submit" className="flex-1 py-2 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600">추가</button>
              </div>
            </form>
          )}

          {/* Project list */}
          {projects.length === 0 && !showForm ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-3xl mb-2">📂</p>
              <p className="text-sm">프로젝트가 없습니다</p>
            </div>
          ) : (
            projects.map((project) => {
              const color = PROJECT_COLORS[project.colorKey] || PROJECT_COLORS.indigo;
              const assignedEmps = employees.filter((e) => project.assignedEmployeeIds.includes(e.id));
              return (
                <div key={project.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${color.dot}`} />
                      <div>
                        <p className="font-semibold text-gray-800">{project.name}</p>
                        {project.description && <p className="text-xs text-gray-500 mt-0.5">{project.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <select
                        value={project.status}
                        onChange={(e) => onUpdateProject(project.id, { status: e.target.value as Project['status'] })}
                        className={`text-xs px-2 py-1 rounded-lg font-medium border-0 focus:outline-none cursor-pointer ${STATUS_COLORS[project.status]}`}
                      >
                        {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <button onClick={() => onRemoveProject(project.id)} className="text-gray-300 hover:text-red-400 text-xs transition-colors">✕</button>
                    </div>
                  </div>
                  {assignedEmps.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-3">
                      {assignedEmps.map((e) => (
                        <div key={e.id} className="flex items-center gap-1 text-xs text-gray-500">
                          <Image src={ANIMAL_IMG[e.animal]} alt="" width={14} height={14} unoptimized />
                          {e.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
