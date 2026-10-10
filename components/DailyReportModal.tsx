'use client';

import { useState } from 'react';
import { Employee, Project, DirectChat, DailyReport, ANIMAL_IMG, ANIMAL_LABEL, ORB_GRADIENT, ORB_SHADOW } from '@/lib/types';
import Image from 'next/image';

interface Props {
  sanmu: Employee;
  employees: Employee[];
  projects: Project[];
  directChats: DirectChat[];
  onReport: (report: DailyReport) => void;
  onClose: () => void;
}

export default function DailyReportModal({ sanmu, employees, projects, directChats, onReport, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState('');
  const [copied, setCopied] = useState(false);

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const recentMessages = directChats.flatMap((chat) => {
        const emp = employees.find((e) => e.id === chat.employeeId);
        return chat.messages.slice(-3).map((m) => ({
          employeeName: emp?.name ?? '직원',
          content: m.content,
        }));
      });

      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sanmu, employees, projects, recentMessages }),
      });
      const data = await res.json();
      setReport(data.report);

      const newReport: DailyReport = {
        id: crypto.randomUUID(),
        date: new Date().toISOString().split('T')[0],
        content: data.report,
        generatedAt: new Date().toISOString(),
      };
      onReport(newReport);
    } catch {
      setReport('보고서 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[88vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-full flex-shrink-0 relative"
            style={{ background: ORB_GRADIENT[sanmu.animal], boxShadow: ORB_SHADOW[sanmu.animal] }}
          >
            <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle at 33% 28%, rgba(255,255,255,0.7) 0%, transparent 60%)' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <Image src={ANIMAL_IMG[sanmu.animal]} alt={ANIMAL_LABEL[sanmu.animal]} width={36} height={36} unoptimized />
            </div>
            {/* Gold crown */}
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-base">👑</div>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900">{sanmu.name} 상무</h2>
            <p className="text-sm text-gray-500">{today} 일일 보고</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!report ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📋</div>
              <p className="text-gray-600 font-medium mb-2">오늘의 일일 보고를 생성합니다</p>
              <p className="text-sm text-gray-400 mb-6">
                팀원 {employees.length}명 · 프로젝트 {projects.length}건 현황을 분석합니다
              </p>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-200 text-white px-6 py-3 rounded-xl font-semibold transition-colors flex items-center gap-2 mx-auto"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    보고서 작성 중...
                  </>
                ) : (
                  '📋 일일 보고 생성'
                )}
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-gray-600">보고 내용</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-100"
                  >
                    {copied ? '✅ 복사됨' : '📋 복사'}
                  </button>
                  <button
                    onClick={() => { setReport(''); handleGenerate(); }}
                    className="text-xs text-indigo-500 hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50"
                  >
                    재생성
                  </button>
                </div>
              </div>
              <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{report}</p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
