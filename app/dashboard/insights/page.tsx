'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';

interface Insight {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  tags: string[];
  created_at: string;
}

const CATEGORY_COLOR: Record<string, string> = {
  '트렌드': 'from-blue-500 to-indigo-600',
  '전략': 'from-orange-400 to-red-500',
  '마케팅': 'from-pink-500 to-purple-600',
  '재무': 'from-emerald-500 to-teal-600',
  '도구': 'from-amber-400 to-yellow-500',
  '사례': 'from-violet-500 to-purple-600',
};

const CATEGORY_ICON: Record<string, string> = {
  '트렌드': '📈', '전략': '🎯', '마케팅': '📣', '재무': '💰', '도구': '🔧', '사례': '⭐',
};

const CATEGORIES = ['전체', '트렌드', '전략', '마케팅', '재무', '도구', '사례'];

// 초기 샘플 데이터 (DB가 비어있을 때)
const SAMPLE_INSIGHTS: Insight[] = [
  {
    id: 'sample-1',
    category: '트렌드',
    title: '2026 1인 기업 AI 도입 현황',
    summary: '국내 1인 기업의 67%가 AI 도구를 업무에 활용 중. 특히 콘텐츠 생성과 고객 응대 분야에서 생산성 3배 향상 보고.',
    content: '',
    tags: ['AI', '1인기업', '생산성'],
    created_at: new Date().toISOString(),
  },
  {
    id: 'sample-2',
    category: '전략',
    title: 'AI 직원 활용 최적 전략 5가지',
    summary: '반복 업무 자동화, 24시간 고객 응대, 데이터 분석 보조, 콘텐츠 대량 생산, 다국어 지원. 각 전략별 ROI 분석 포함.',
    content: '',
    tags: ['전략', 'ROI', '자동화'],
    created_at: new Date().toISOString(),
  },
  {
    id: 'sample-3',
    category: '마케팅',
    title: 'SNS 콘텐츠 자동화로 팔로워 10배',
    summary: 'AI가 매일 최적 시간대에 맞춤 콘텐츠를 발행하는 전략. 실제 사례: 월 팔로워 증가율 847%.',
    content: '',
    tags: ['SNS', '콘텐츠', '성장'],
    created_at: new Date().toISOString(),
  },
  {
    id: 'sample-4',
    category: '재무',
    title: 'AI 도입 후 비용 절감 분석',
    summary: '직원 1명 연봉 대비 AI 직원 비용은 97% 절감. 단순 반복 업무 처리 속도는 120배 향상. 초기 투자 회수 기간 평균 2.3개월.',
    content: '',
    tags: ['비용', '분석', '투자'],
    created_at: new Date().toISOString(),
  },
  {
    id: 'sample-5',
    category: '도구',
    title: '2026 필수 AI 도구 TOP 10',
    summary: 'Claude, GPT-4o, Gemini Ultra 비교 분석. 1인 기업 특성에 맞는 최적 AI 스택 추천. 월 $50 이하로 구축 가능한 AI 인프라.',
    content: '',
    tags: ['도구', '비교', '추천'],
    created_at: new Date().toISOString(),
  },
  {
    id: 'sample-6',
    category: '사례',
    title: 'LOOV 유저 성공 사례: 월 매출 5배',
    summary: '의류 브랜드 1인 창업자 김OO씨, LOOV AI 직원 도입 6개월 만에 월 매출 500만→2,500만원 달성. 핵심 전략 공개.',
    content: '',
    tags: ['성공사례', '매출', '브랜드'],
    created_at: new Date().toISOString(),
  },
];

export default function InsightsPage() {
  const { companySettings } = useStore();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [activeCategory, setActiveCategory] = useState('전체');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (activeCategory !== '전체') params.set('category', activeCategory);
      const res = await fetch(`/api/insights?${params}`);
      const data = await res.json();
      if (data.insights?.length > 0) {
        setInsights(data.insights);
      } else {
        setInsights(SAMPLE_INSIGHTS);
      }
    } catch {
      setInsights(SAMPLE_INSIGHTS);
    } finally {
      setLoading(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const handleGenerate = async () => {
    const apiKey = companySettings.globalAIConfig?.apiKey;
    const provider = companySettings.globalAIConfig?.provider || 'gemini';

    if (!apiKey) {
      setMessage('AI 설정에서 API 키를 먼저 등록해주세요.');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    setGenerating(true);
    setMessage('');
    try {
      const res = await fetch('/api/insights/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, provider }),
      });
      const data = await res.json();
      if (data.insights) {
        setMessage(`✨ 새 인사이트 ${data.count}개가 생성되었습니다!`);
        await fetchInsights();
      } else {
        setMessage('생성 중 오류가 발생했습니다: ' + data.error);
      }
    } catch {
      setMessage('인사이트 생성 중 오류가 발생했습니다.');
    } finally {
      setGenerating(false);
      setTimeout(() => setMessage(''), 4000);
    }
  };

  const filtered = insights.filter((card) => {
    const matchCategory = activeCategory === '전체' || card.category === activeCategory;
    const matchSearch = !searchQuery || card.title.includes(searchQuery) || card.summary.includes(searchQuery);
    return matchCategory && matchSearch;
  });

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
  };

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-4 md:px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h1 className="text-lg font-black text-gray-900">🧠 AI 인사이트</h1>
            <p className="text-sm text-gray-400 hidden sm:block">1인 기업을 위한 AI 트렌드 & 전략 인사이트</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="검색..."
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 w-28 sm:w-44"
            />
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-bold px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              {generating ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="hidden sm:inline">생성 중...</span>
                </>
              ) : (
                <>✨ <span className="hidden sm:inline">AI 새로 생성</span></>
              )}
            </button>
          </div>
        </div>
        {message && (
          <div className={`text-sm px-3 py-2 rounded-xl mb-2 ${
            message.includes('오류') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
          }`}>
            {message}
          </div>
        )}
        {/* 카테고리 필터 */}
        <div className="flex gap-1.5 flex-wrap">
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

      <div className="p-4 md:p-6">
        {loading ? (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
                <div className="h-1.5 bg-gray-200" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-gray-100 rounded w-1/3" />
                  <div className="h-5 bg-gray-100 rounded w-4/5" />
                  <div className="h-12 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((card) => {
                const color = CATEGORY_COLOR[card.category] || 'from-gray-400 to-gray-600';
                const icon = CATEGORY_ICON[card.category] || '💡';
                return (
                  <div key={card.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
                    <div className={`h-1.5 bg-gradient-to-r ${color}`} />
                    <div className="p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-gradient-to-r ${color} text-white`}>
                          {icon} {card.category}
                        </span>
                        <span className="text-xs text-gray-400 ml-auto">{formatDate(card.created_at)}</span>
                      </div>
                      <h3 className="font-bold text-gray-900 text-sm mb-2 leading-snug">{card.title}</h3>
                      <p className="text-xs text-gray-500 leading-relaxed">{card.summary}</p>
                      {card.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {card.tags.map((tag) => (
                            <span key={tag} className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">#{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-16 text-gray-400 text-sm">
                {searchQuery ? '검색 결과가 없습니다' : '인사이트가 없습니다. AI 새로 생성 버튼을 눌러보세요.'}
              </div>
            )}
          </>
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
