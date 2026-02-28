'use client';

import { useState } from 'react';

const INSIGHT_CARDS = [
  {
    category: '트렌드',
    icon: '📈',
    color: 'from-blue-500 to-indigo-600',
    title: '2026 1인 기업 AI 도입 현황',
    summary: '국내 1인 기업의 67%가 AI 도구를 업무에 활용 중. 특히 콘텐츠 생성과 고객 응대 분야에서 생산성 3배 향상 보고.',
    tags: ['AI', '1인기업', '생산성'],
    date: '2026.02.28',
  },
  {
    category: '전략',
    icon: '🎯',
    color: 'from-orange-400 to-red-500',
    title: 'AI 직원 활용 최적 전략 5가지',
    summary: '반복 업무 자동화, 24시간 고객 응대, 데이터 분석 보조, 콘텐츠 대량 생산, 다국어 지원. 각 전략별 ROI 분석 포함.',
    tags: ['전략', 'ROI', '자동화'],
    date: '2026.02.25',
  },
  {
    category: '마케팅',
    icon: '📣',
    color: 'from-pink-500 to-purple-600',
    title: 'SNS 콘텐츠 자동화로 팔로워 10배',
    summary: 'AI가 매일 최적 시간대에 맞춤 콘텐츠를 발행하는 전략. 실제 사례: 월 팔로워 증가율 847%.',
    tags: ['SNS', '콘텐츠', '성장'],
    date: '2026.02.22',
  },
  {
    category: '재무',
    icon: '💰',
    color: 'from-emerald-500 to-teal-600',
    title: 'AI 도입 후 비용 절감 분석',
    summary: '직원 1명 연봉 대비 AI 직원 비용은 97% 절감. 단순 반복 업무 처리 속도는 120배 향상. 초기 투자 회수 기간 평균 2.3개월.',
    tags: ['비용', '분석', '투자'],
    date: '2026.02.20',
  },
  {
    category: '도구',
    icon: '🔧',
    color: 'from-amber-400 to-yellow-500',
    title: '2026 필수 AI 도구 TOP 10',
    summary: 'Claude, GPT-4o, Gemini Ultra 비교 분석. 1인 기업 특성에 맞는 최적 AI 스택 추천. 월 $50 이하로 구축 가능한 AI 인프라.',
    tags: ['도구', '비교', '추천'],
    date: '2026.02.18',
  },
  {
    category: '사례',
    icon: '⭐',
    color: 'from-violet-500 to-purple-600',
    title: 'LOOV 유저 성공 사례: 월 매출 5배',
    summary: '의류 브랜드 1인 창업자 김OO씨, LOOV AI 직원 도입 6개월 만에 월 매출 500만→2,500만원 달성. 핵심 전략 공개.',
    tags: ['성공사례', '매출', '브랜드'],
    date: '2026.02.15',
  },
];

const CATEGORIES = ['전체', '트렌드', '전략', '마케팅', '재무', '도구', '사례'];

export default function InsightsPage() {
  const [activeCategory, setActiveCategory] = useState('전체');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = INSIGHT_CARDS.filter((card) => {
    const matchCategory = activeCategory === '전체' || card.category === activeCategory;
    const matchSearch = !searchQuery || card.title.includes(searchQuery) || card.summary.includes(searchQuery);
    return matchCategory && matchSearch;
  });

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-black text-gray-900">🧠 AI 인사이트</h1>
            <p className="text-sm text-gray-400">1인 기업을 위한 AI 트렌드 & 전략 인사이트</p>
          </div>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="인사이트 검색..."
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 w-48"
          />
        </div>
        {/* 카테고리 필터 */}
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200'
              }`}>
              {cat}
            </button>
          ))}
        </div>
      </header>

      <div className="p-6">
        {/* 주요 인사이트 */}
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((card, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
              <div className={`h-1.5 bg-gradient-to-r ${card.color}`} />
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-gradient-to-r ${card.color} text-white`}>
                    {card.icon} {card.category}
                  </span>
                  <span className="text-xs text-gray-400 ml-auto">{card.date}</span>
                </div>
                <h3 className="font-bold text-gray-900 text-sm mb-2 leading-snug">{card.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{card.summary}</p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {card.tags.map((tag) => (
                    <span key={tag} className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">#{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">
            검색 결과가 없습니다
          </div>
        )}

        {/* AI 인사이트 요청 */}
        <div className="mt-8 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-6">
          <h3 className="font-bold text-gray-900 mb-2">✨ 맞춤 인사이트 요청</h3>
          <p className="text-sm text-gray-500 mb-4">내 비즈니스에 특화된 AI 인사이트가 필요하다면 AI 직원에게 리서치를 요청하세요.</p>
          <a href="/dashboard/chat" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors">
            💬 채팅 센터에서 요청하기 →
          </a>
        </div>
      </div>
    </div>
  );
}
