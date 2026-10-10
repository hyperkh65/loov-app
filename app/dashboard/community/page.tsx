'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';

interface Post {
  id: string;
  user_id: string;
  author_name: string;
  author_avatar: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  likes: number;
  comments_count: number;
  created_at: string;
}

interface Comment {
  id: string;
  author_name: string;
  content: string;
  created_at: string;
}

const CATEGORIES = ['전체', '성공사례', '팁', '질문', '토론', '소개'];

const CATEGORY_STYLE: Record<string, string> = {
  '성공사례': 'bg-amber-100 text-amber-700',
  '팁': 'bg-green-100 text-green-700',
  '질문': 'bg-blue-100 text-blue-700',
  '토론': 'bg-purple-100 text-purple-700',
  '소개': 'bg-gray-100 text-gray-600',
};

const CATEGORY_ICON: Record<string, string> = {
  '성공사례': '🏆', '팁': '💡', '질문': '❓', '토론': '💬', '소개': '👋',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

// ── 댓글 섹션 ──────────────────────────────────────
function CommentsSection({ postId }: { postId: string }) {
  const { companySettings } = useStore();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    fetch(`/api/community/posts/${postId}/comments`)
      .then((r) => r.json())
      .then((d) => { setComments(d.comments || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [postId]);

  const handleComment = async () => {
    if (!newComment.trim() || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/community/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newComment.trim(),
          authorName: companySettings.ceoName || '익명',
        }),
      });
      const data = await res.json();
      if (data.comment) {
        setComments((prev) => [...prev, data.comment]);
        setNewComment('');
      }
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      {loading ? (
        <div className="text-xs text-gray-400">댓글 불러오는 중...</div>
      ) : (
        <>
          <div className="space-y-2 mb-3">
            {comments.map((c) => (
              <div key={c.id} className="flex gap-2 text-xs">
                <span className="font-bold text-gray-700 flex-shrink-0">{c.author_name}</span>
                <span className="text-gray-500">{c.content}</span>
              </div>
            ))}
            {comments.length === 0 && <p className="text-xs text-gray-400">첫 댓글을 달아보세요</p>}
          </div>
          <div className="flex gap-2">
            <input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleComment())}
              placeholder="댓글 달기..."
              className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
              disabled={posting}
            />
            <button
              onClick={handleComment}
              disabled={!newComment.trim() || posting}
              className="bg-indigo-600 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-xl font-bold"
            >
              댓글
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── 게시글 카드 ─────────────────────────────────────
function PostCard({ post, onLike }: { post: Post; onLike: (id: string) => void }) {
  const [showComments, setShowComments] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl flex-shrink-0">
          {post.author_avatar || '👤'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-bold text-gray-700">{post.author_name}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CATEGORY_STYLE[post.category] || 'bg-gray-100 text-gray-600'}`}>
              {CATEGORY_ICON[post.category] || '📝'} {post.category}
            </span>
            <span className="text-[10px] text-gray-400 ml-auto">{timeAgo(post.created_at)}</span>
          </div>
          <h3 className="font-bold text-gray-900 text-sm mb-1.5">{post.title}</h3>
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{post.content}</p>

          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={() => onLike(post.id)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-400 transition-colors"
            >
              <span>❤️</span><span>{post.likes}</span>
            </button>
            <button
              onClick={() => setShowComments((v) => !v)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-400 transition-colors"
            >
              <span>💬</span><span>{post.comments_count}</span>
            </button>
            <div className="flex flex-wrap gap-1 ml-auto">
              {(post.tags || []).map((tag) => (
                <span key={tag} className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">#{tag}</span>
              ))}
            </div>
          </div>

          {showComments && <CommentsSection postId={post.id} />}
        </div>
      </div>
    </div>
  );
}

export default function CommunityPage() {
  const { companySettings } = useStore();
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeCategory, setActiveCategory] = useState('전체');
  const [showNewPost, setShowNewPost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [form, setForm] = useState({ category: '토론', title: '', content: '', tags: '' });

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (activeCategory !== '전체') params.set('category', activeCategory);
      const res = await fetch(`/api/community/posts?${params}`);
      const data = await res.json();
      setPosts(data.posts || []);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handlePost = async () => {
    if (!form.title.trim() || !form.content.trim() || posting) return;
    setPosting(true);
    try {
      const res = await fetch('/api/community/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          content: form.content.trim(),
          category: form.category,
          tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
          authorName: companySettings.ceoName || '익명',
          authorAvatar: '👤',
        }),
      });
      const data = await res.json();
      if (data.post) {
        setPosts((prev) => [data.post, ...prev]);
        setForm({ category: '토론', title: '', content: '', tags: '' });
        setShowNewPost(false);
      }
    } finally {
      setPosting(false);
    }
  };

  const handleLike = async (postId: string) => {
    try {
      const res = await fetch(`/api/community/posts/${postId}/like`, { method: 'POST' });
      const data = await res.json();
      if (data.likes !== undefined) {
        setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, likes: data.likes } : p));
      }
    } catch {
      // ignore
    }
  };

  // 통계
  const stats = [
    { label: '게시글', value: posts.length.toLocaleString(), icon: '📝' },
    { label: '성공사례', value: posts.filter((p) => p.category === '성공사례').length.toString(), icon: '🏆' },
    { label: '팁 공유', value: posts.filter((p) => p.category === '팁').length.toString(), icon: '💡' },
    { label: '토론', value: posts.filter((p) => p.category === '토론').length.toString(), icon: '💬' },
  ];

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-4 md:px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-gray-900">🤝 커뮤니티</h1>
            <p className="text-sm text-gray-400 hidden sm:block">1인 기업가들의 AI 활용 경험 공유</p>
          </div>
          <button
            onClick={() => setShowNewPost(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">
            + 글쓰기
          </button>
        </div>
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

      <div className="p-4 md:p-6">
        {/* 커뮤니티 통계 */}
        <div className="grid grid-cols-4 gap-2 md:gap-3 mb-6">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl border border-gray-100 p-2 md:p-3 text-center">
              <div className="text-lg md:text-xl mb-0.5">{stat.icon}</div>
              <div className="font-black text-base md:text-lg text-gray-900">{stat.value}</div>
              <div className="text-[9px] md:text-[10px] text-gray-400">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* 글쓰기 모달 */}
        {showNewPost && (
          <div className="bg-white rounded-2xl border border-indigo-200 p-5 mb-6 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4">새 글 작성</h3>
            <div className="space-y-3">
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              >
                {CATEGORIES.filter((c) => c !== '전체').map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="제목을 입력하세요"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              />
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="내용을 입력하세요. LOOV 활용 경험, 팁, 질문 모두 환영합니다!"
                rows={5}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"
              />
              <input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="태그 (쉼표로 구분): AI, 마케팅, 전략"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={() => setShowNewPost(false)}
                className="text-sm text-gray-500 px-4 py-2 rounded-xl hover:bg-gray-100"
              >
                취소
              </button>
              <button
                onClick={handlePost}
                disabled={!form.title.trim() || !form.content.trim() || posting}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold px-5 py-2 rounded-xl transition-colors"
              >
                {posting ? '게시 중...' : '게시'}
              </button>
            </div>
          </div>
        )}

        {/* 게시글 목록 */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-100 rounded w-1/3" />
                    <div className="h-5 bg-gray-100 rounded w-4/5" />
                    <div className="h-8 bg-gray-100 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} onLike={handleLike} />
            ))}
            {posts.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <div className="text-4xl mb-3">🤝</div>
                <p className="text-sm">첫 번째 게시글을 작성해보세요!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
