'use client';

import { useState, useEffect } from 'react';

interface Course {
  id: string;
  title: string;
  description: string;
  instructor: string;
  level: string;
  duration: string;
  lessons_count: number;
  tags: string[];
  icon: string;
  color: string;
  enrolled_count: number;
  rating: number;
  isEnrolled?: boolean;
}

const LEVELS = ['전체', '입문', '중급', '고급'];

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeLevel, setActiveLevel] = useState('전체');
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeLevel !== '전체') params.set('level', activeLevel);
      const res = await fetch(`/api/courses?${params}`);
      const data = await res.json();
      setCourses(data.courses || []);
    } catch {
      setCourses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLevel]);

  const handleEnroll = async (courseId: string) => {
    if (enrolling) return;
    setEnrolling(courseId);
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      });
      const data = await res.json();
      if (data.enrollment) {
        setMessage('✅ 수강 신청이 완료되었습니다!');
        setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, isEnrolled: true } : c));
      } else {
        setMessage('오류: ' + (data.error || '수강 신청에 실패했습니다'));
      }
    } catch {
      setMessage('수강 신청 중 오류가 발생했습니다.');
    } finally {
      setEnrolling(null);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const totalEnrolled = courses.reduce((s, c) => s + (c.enrolled_count || 0), 0);
  const avgRating = courses.length > 0
    ? (courses.reduce((s, c) => s + (c.rating || 0), 0) / courses.length).toFixed(2)
    : '0';

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-4 md:px-6 py-4 sticky top-0 z-20">
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

      <div className="p-4 md:p-6">
        {message && (
          <div className={`mb-4 text-sm px-4 py-2.5 rounded-xl ${
            message.includes('오류') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
          }`}>
            {message}
          </div>
        )}

        {/* 강의 통계 */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: '전체 강의', value: courses.length, icon: '📚' },
            { label: '수강생', value: totalEnrolled.toLocaleString(), icon: '👥' },
            { label: '평균 평점', value: avgRating, icon: '⭐' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl border border-gray-100 p-3 md:p-4 text-center">
              <div className="text-xl md:text-2xl mb-1">{stat.icon}</div>
              <div className="font-black text-lg md:text-xl text-gray-900">{stat.value}</div>
              <div className="text-[10px] md:text-xs text-gray-400">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* 강의 목록 */}
        {loading ? (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
                <div className="h-28 bg-gray-200" />
                <div className="p-5 space-y-2">
                  <div className="h-4 bg-gray-100 rounded w-4/5" />
                  <div className="h-8 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">강의가 없습니다</div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {courses.map((course) => (
              <div key={course.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow cursor-pointer group">
                <div className={`bg-gradient-to-br ${course.color || 'from-indigo-500 to-purple-600'} p-6 text-center`}>
                  <div className="text-4xl mb-2">{course.icon || '🎓'}</div>
                  <span className="text-xs font-bold text-white/80 bg-white/20 px-2 py-0.5 rounded-full">{course.level}</span>
                </div>
                <div className="p-5">
                  <h3 className="font-bold text-gray-900 text-sm mb-1.5 leading-snug group-hover:text-indigo-600 transition-colors">{course.title}</h3>
                  <p className="text-xs text-gray-500 mb-3 leading-relaxed line-clamp-2">{course.description}</p>

                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-3 flex-wrap">
                    <span>🕐 {course.duration}</span>
                    <span>·</span>
                    <span>📖 {course.lessons_count}강</span>
                    <span>·</span>
                    <span>👥 {(course.enrolled_count || 0).toLocaleString()}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {(course.tags || []).slice(0, 3).map((tag) => (
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
                  <button
                    onClick={() => !course.isEnrolled && handleEnroll(course.id)}
                    disabled={course.isEnrolled || enrolling === course.id}
                    className={`w-full text-white text-sm font-bold py-2.5 rounded-xl transition-opacity ${
                      course.isEnrolled
                        ? 'bg-emerald-500 cursor-default'
                        : `bg-gradient-to-r ${course.color || 'from-indigo-500 to-purple-600'} hover:opacity-90 disabled:opacity-60`
                    }`}
                  >
                    {course.isEnrolled ? '✓ 수강 중' : enrolling === course.id ? '신청 중...' : '수강 시작'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 강의 요청 */}
        <div className="mt-8 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-6">
          <h3 className="font-bold text-gray-900 mb-2">💡 원하는 강의가 없나요?</h3>
          <p className="text-sm text-gray-500 mb-4">커뮤니티에서 강의를 요청하거나 AI 직원에게 맞춤 튜토리얼을 요청해보세요.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a href="/dashboard/community" className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors">
              🤝 커뮤니티 요청
            </a>
            <a href="/dashboard/chat" className="inline-flex items-center justify-center gap-2 bg-white border border-amber-200 text-amber-700 text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-amber-50 transition-colors">
              💬 AI 튜터에게 물어보기
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
