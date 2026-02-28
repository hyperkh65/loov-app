'use client';

import { useState } from 'react';

const POSTS = [
  {
    id: 1,
    category: '성공사례',
    icon: '🏆',
    author: '김서윤',
    avatar: '👩‍💼',
    title: 'AI 마케터 고용 후 인스타 팔로워 5천→3만 달성!',
    content: '처음엔 반신반의했는데, AI 마케터한테 매일 3개 포스팅 지시했더니 2달 만에 팔로워 6배 성장했어요. 콘텐츠 기획부터 해시태그까지 다 알아서 해줘서 저는 사업에만 집중할 수 있었어요.',
    likes: 142,
    comments: 38,
    date: '2시간 전',
    tags: ['마케팅', 'SNS', '성공사례'],
  },
  {
    id: 2,
    category: '질문',
    icon: '❓',
    author: '박민준',
    avatar: '👨‍💻',
    title: 'AI 영업팀장 프롬프트 어떻게 쓰세요?',
    content: 'B2B 영업 중인데 잠재 고객 발굴이랑 초기 연락 메일 작성에 AI 영업팀장 쓰고 싶은데, 좋은 지시사항 예시 공유해주실 분 계신가요?',
    likes: 67,
    comments: 22,
    date: '5시간 전',
    tags: ['영업', '프롬프트', '질문'],
  },
  {
    id: 3,
    category: '팁',
    icon: '💡',
    author: '이지현',
    avatar: '👩‍🎨',
    title: '회계 AI 활용 꿀팁: 세금계산서 자동화',
    content: '세금계산서 발행할 때마다 번거로웠는데, AI 회계팀장한테 매월 말일에 자동으로 발행 목록 정리해달라고 했더니 완전 자동화됐어요. 스케줄 기능이랑 같이 쓰면 진짜 편해요.',
    likes: 89,
    comments: 15,
    date: '1일 전',
    tags: ['회계', '자동화', '팁'],
  },
  {
    id: 4,
    category: '소개',
    icon: '👋',
    author: '최동욱',
    avatar: '👨‍🍳',
    title: '식품 브랜드 운영 중인 LOOV 신입입니다!',
    content: '수제 잼 브랜드 운영하는 1인 사업자예요. 마케팅이랑 고객 응대에 너무 시간이 많이 걸려서 LOOV 시작했는데 첫인상이 너무 좋아요. 잘 부탁드립니다!',
    likes: 45,
    comments: 12,
    date: '2일 전',
    tags: ['자기소개', '식품', '신입'],
  },
  {
    id: 5,
    category: '토론',
    icon: '💬',
    author: '정하은',
    avatar: '👩‍🔬',
    title: 'AI 직원한테 어느 수준까지 위임하시나요?',
    content: '저는 처음엔 단순 업무만 맡겼는데 이제 계약서 초안 작성, 협상 준비까지 맡기고 있어요. 여러분은 어느 선에서 관리감독 하시나요? 다양한 의견 궁금해요.',
    likes: 103,
    comments: 47,
    date: '3일 전',
    tags: ['토론', '위임', '관리'],
  },
];

const CATEGORIES = ['전체', '성공사례', '팁', '질문', '토론', '소개'];

export default function CommunityPage() {
  const [activeCategory, setActiveCategory] = useState('전체');
  const [newPost, setNewPost] = useState(false);

  const filtered = POSTS.filter((p) => activeCategory === '전체' || p.category === activeCategory);

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-gray-900">🤝 커뮤니티</h1>
            <p className="text-sm text-gray-400">1인 기업가들의 AI 활용 경험 공유</p>
          </div>
          <button
            onClick={() => setNewPost(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">
            + 글쓰기
          </button>
        </div>
        <div className="flex gap-1.5 mt-3">
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
        {/* 커뮤니티 통계 */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: '회원', value: '2,847', icon: '👥' },
            { label: '게시글', value: '12,493', icon: '📝' },
            { label: '오늘 활동', value: '342', icon: '🔥' },
            { label: '성공사례', value: '891', icon: '🏆' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
              <div className="text-xl mb-0.5">{stat.icon}</div>
              <div className="font-black text-lg text-gray-900">{stat.value}</div>
              <div className="text-[10px] text-gray-400">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* 글쓰기 모달 */}
        {newPost && (
          <div className="bg-white rounded-2xl border border-indigo-200 p-5 mb-6 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4">새 글 작성</h3>
            <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 mb-3">
              {CATEGORIES.filter((c) => c !== '전체').map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              placeholder="제목을 입력하세요"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 mb-3"
            />
            <textarea
              placeholder="내용을 입력하세요. LOOV 활용 경험, 팁, 질문 모두 환영합니다!"
              rows={5}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none mb-3"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setNewPost(false)} className="text-sm text-gray-500 px-4 py-2 rounded-xl hover:bg-gray-100">취소</button>
              <button className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold px-5 py-2 rounded-xl transition-colors">게시</button>
            </div>
          </div>
        )}

        {/* 게시글 목록 */}
        <div className="space-y-3">
          {filtered.map((post) => (
            <div key={post.id} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-sm transition-shadow cursor-pointer">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl flex-shrink-0">
                  {post.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-gray-700">{post.author}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      post.category === '성공사례' ? 'bg-amber-100 text-amber-700' :
                      post.category === '팁' ? 'bg-green-100 text-green-700' :
                      post.category === '질문' ? 'bg-blue-100 text-blue-700' :
                      post.category === '토론' ? 'bg-purple-100 text-purple-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {post.icon} {post.category}
                    </span>
                    <span className="text-[10px] text-gray-400 ml-auto">{post.date}</span>
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm mb-1.5">{post.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{post.content}</p>

                  <div className="flex items-center gap-4 mt-3">
                    <button className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-400 transition-colors">
                      <span>❤️</span><span>{post.likes}</span>
                    </button>
                    <button className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-400 transition-colors">
                      <span>💬</span><span>{post.comments}</span>
                    </button>
                    <div className="flex flex-wrap gap-1 ml-auto">
                      {post.tags.map((tag) => (
                        <span key={tag} className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">#{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">게시글이 없습니다</div>
        )}
      </div>
    </div>
  );
}
