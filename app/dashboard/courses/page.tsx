'use client';

import { useState } from 'react';

const COURSES = [
  {
    id: 1,
    title: 'AI 직원 세팅 완벽 가이드',
    instructor: 'LOOV 공식',
    level: '입문',
    duration: '2시간 30분',
    lessons: 12,
    icon: '🚀',
    color: 'from-indigo-500 to-purple-600',
    description: 'LOOV에서 AI 직원을 처음 고용하는 분들을 위한 단계별 완벽 가이드. 설정부터 첫 업무 지시까지.',
    tags: ['입문', 'AI설정', '필수'],
    enrolled: 1240,
    rating: 4.9,
  },
  {
    id: 2,
    title: '1인 기업 AI 마케팅 자동화',
    instructor: '마케팅 전문가',
    level: '중급',
    duration: '4시간',
    lessons: 18,
    icon: '📣',
    color: 'from-pink-500 to-rose-600',
    description: 'SNS 자동 발행부터 이메일 마케팅, 광고 최적화까지. AI로 혼자서 마케팅팀 수준의 성과 내기.',
    tags: ['마케팅', '자동화', 'SNS'],
    enrolled: 890,
    rating: 4.8,
  },
  {
    id: 3,
    title: 'AI 영업팀장 활용 실전',
    instructor: '영업 전략가',
    level: '중급',
    duration: '3시간',
    lessons: 15,
    icon: '💼',
    color: 'from-blue-500 to-cyan-600',
    description: '고객 발굴부터 제안서 작성, 계약 클로징까지. AI 영업 직원으로 월 1억 매출 달성하는 법.',
    tags: ['영업', '매출', '실전'],
    enrolled: 672,
    rating: 4.7,
  },
  {
    id: 4,
    title: 'AI 회계 & 세무 자동화',
    instructor: '세무사 협력',
    level: '입문',
    duration: '1시간 30분',
    lessons: 8,
    icon: '💰',
    color: 'from-emerald-500 to-teal-600',
    description: '일일 장부 관리, 세금 계산, 세무신고 준비까지. 회계를 몰라도 AI 회계팀장이 다 해결.',
    tags: ['회계', '세무', '자동화'],
    enrolled: 534,
    rating: 4.6,
  },
  {
    id: 5,
    title: 'Claude API 기반 커스텀 AI 직원',
    instructor: '개발자',
    level: '고급',
    duration: '6시간',
    lessons: 24,
    icon: '⚙️',
    color: 'from-gray-600 to-slate-800',
    description: 'Claude API를 활용해 나만의 특화된 AI 직원 프롬프트 엔지니어링. 업종별 커스터마이징 전략.',
    tags: ['개발', 'API', '고급'],
    enrolled: 312,
    rating: 4.9,
  },
  {
    id: 6,
    title: '1인 기업 AI 전략 플래닝',
    instructor: '경영 컨설턴트',
    level: '중급',
    duration: '2시간',
    lessons: 10,
    icon: '🎯',
    color: 'from-amber-500 to-orange-600',
    description: '비즈니스 목표 설정부터 AI 도입 로드맵 작성, KPI 관리까지. 전략적 1인 기업 경영법.',
    tags: ['전략', '경영', '로드맵'],
    enrolled: 445,
    rating: 4.7,
  },
];

const LEVELS = ['전체', '입문', '중급', '고급'];

export default function CoursesPage() {
  const [activeLevel, setActiveLevel] = useState('전체');

  const filtered = COURSES.filter((c) => activeLevel === '전체' || c.level === activeLevel);

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div>
          <h1 className="text-lg font-black text-gray-900">🎓 강의</h1>
          <p className="text-sm text-gray-400">1인 기업 AI 활용 실전 강의</p>
        </div>
        <div className="flex gap-1.5 mt-3">
          {LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => setActiveLevel(level)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeLevel === level
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200'
              }`}>
              {level}
            </button>
          ))}
        </div>
      </header>

      <div className="p-6">
        {/* 강의 통계 */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: '전체 강의', value: COURSES.length, icon: '📚' },
            { label: '수강생', value: '4,093', icon: '👥' },
            { label: '평균 평점', value: '4.77', icon: '⭐' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="font-black text-xl text-gray-900">{stat.value}</div>
              <div className="text-xs text-gray-400">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* 강의 목록 */}
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((course) => (
            <div key={course.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow cursor-pointer group">
              <div className={`bg-gradient-to-br ${course.color} p-6 text-center`}>
                <div className="text-4xl mb-2">{course.icon}</div>
                <span className="text-xs font-bold text-white/80 bg-white/20 px-2 py-0.5 rounded-full">{course.level}</span>
              </div>
              <div className="p-5">
                <h3 className="font-bold text-gray-900 text-sm mb-1.5 leading-snug group-hover:text-indigo-600 transition-colors">{course.title}</h3>
                <p className="text-xs text-gray-500 mb-3 leading-relaxed">{course.description}</p>

                <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
                  <span>🕐 {course.duration}</span>
                  <span>·</span>
                  <span>📖 {course.lessons}강</span>
                  <span>·</span>
                  <span>👥 {course.enrolled.toLocaleString()}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">
                    {course.tags.map((tag) => (
                      <span key={tag} className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">#{tag}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-amber-400 text-xs">★</span>
                    <span className="text-xs font-bold text-gray-700">{course.rating}</span>
                  </div>
                </div>
              </div>
              <div className="px-5 pb-4">
                <button className={`w-full bg-gradient-to-r ${course.color} text-white text-sm font-bold py-2.5 rounded-xl hover:opacity-90 transition-opacity`}>
                  수강 시작
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* 강의 요청 */}
        <div className="mt-8 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-6">
          <h3 className="font-bold text-gray-900 mb-2">💡 원하는 강의가 없나요?</h3>
          <p className="text-sm text-gray-500 mb-4">커뮤니티에서 강의를 요청하거나 AI 직원에게 맞춤 튜토리얼을 요청해보세요.</p>
          <div className="flex gap-3">
            <a href="/dashboard/community" className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors">
              🤝 커뮤니티 요청
            </a>
            <a href="/dashboard/chat" className="inline-flex items-center gap-2 bg-white border border-amber-200 text-amber-700 text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-amber-50 transition-colors">
              💬 AI 튜터에게 물어보기
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
