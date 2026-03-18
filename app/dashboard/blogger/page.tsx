'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

const BLOG_ID = '7951763866955162015';

interface BlogInfo {
  id: string;
  name: string;
  url: string;
  postCount: number;
}

interface StatusData {
  connected: boolean;
  email?: string;
  blog?: BlogInfo | null;
}

interface GeneratedPost {
  title: string;
  content: string;
  metaDescription: string;
  labels: string[];
}

interface HistoryPost {
  id: string;
  post_id: string | null;
  title: string | null;
  keyword: string | null;
  content_type: string | null;
  labels: string[] | null;
  status: string | null;
  blogger_url: string | null;
  published_at: string | null;
  created_at: string;
}

interface BloggerPost {
  id: string;
  title: string;
  url: string;
  status: string;
  published: string;
  labels: string[];
}

type Tab = 'write' | 'history' | 'status';
type ContentType = 'product' | 'info';

export default function BloggerPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>('write');
  const [status, setStatus] = useState<StatusData | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // 글 작성
  const [contentType, setContentType] = useState<ContentType>('product');
  const [keyword, setKeyword] = useState('');
  const [productInfo, setProductInfo] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedPost | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editLabels, setEditLabels] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const [isDraft, setIsDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ url?: string; error?: string } | null>(null);

  // 발행 이력
  const [history, setHistory] = useState<HistoryPost[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 블로거 포스트 목록 (블로그 현황 탭)
  const [blogPosts, setBlogPosts] = useState<BloggerPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (searchParams.get('connected') === '1') {
      fetchStatus();
    }
  }, [searchParams]);

  useEffect(() => {
    if (preview && previewRef.current) {
      previewRef.current.innerHTML = editContent;
    }
  }, [preview, editContent]);

  async function fetchStatus() {
    setStatusLoading(true);
    try {
      const res = await fetch('/api/blogger/status');
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ connected: false });
    } finally {
      setStatusLoading(false);
    }
  }

  async function fetchHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/blogger/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }

  async function fetchBlogPosts() {
    setPostsLoading(true);
    try {
      const res = await fetch('/api/blogger/posts');
      if (res.ok) {
        const data = await res.json();
        setBlogPosts(data.posts || []);
      }
    } catch {
      // ignore
    } finally {
      setPostsLoading(false);
    }
  }

  async function handleGenerate() {
    if (!keyword.trim()) return;
    setGenerating(true);
    setGenerated(null);
    setPublishResult(null);
    try {
      const res = await fetch('/api/blogger/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, contentType, productInfo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '생성 실패');
      setGenerated(data);
      setEditTitle(data.title);
      setEditContent(data.content);
      setEditLabels(data.labels || []);
    } catch (err) {
      alert('AI 생성 오류: ' + String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function handlePublish() {
    if (!editTitle.trim() || !editContent.trim()) return;
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await fetch('/api/blogger/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          content: editContent,
          labels: editLabels,
          isDraft,
          keyword,
          contentType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '발행 실패');
      setPublishResult({ url: data.url });
    } catch (err) {
      setPublishResult({ error: String(err) });
    } finally {
      setPublishing(false);
    }
  }

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    if (tab === 'history') fetchHistory();
    if (tab === 'status') fetchBlogPosts();
  }

  function removeLabel(idx: number) {
    setEditLabels((prev) => prev.filter((_, i) => i !== idx));
  }

  const connectedError = searchParams.get('error');

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-gray-400 text-sm">로딩 중...</div>
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gray-800 rounded-2xl p-8 text-center">
          <div className="text-5xl mb-4">📝</div>
          <h1 className="text-xl font-bold text-white mb-2">Google 블로거 연동</h1>
          <p className="text-gray-400 text-sm mb-6">
            Google Blogger에 AI 글을 자동으로 발행하려면 Google 계정을 연결하세요.
          </p>

          {connectedError && (
            <div className="mb-4 bg-red-900/40 border border-red-700 rounded-lg p-3 text-red-300 text-xs text-left">
              오류: {connectedError}
            </div>
          )}

          <div className="mb-6 bg-gray-700/50 rounded-lg p-4 text-left text-xs text-gray-400 space-y-1">
            <p className="font-semibold text-gray-300">Google Cloud Console 설정 필요:</p>
            <p>승인된 리디렉션 URI에 추가:</p>
            <code className="block bg-gray-900 rounded px-2 py-1 text-indigo-300 break-all">
              {typeof window !== 'undefined' ? window.location.origin : 'https://loov.co.kr'}
              /api/blogger/callback
            </code>
          </div>

          <a
            href="/api/blogger/connect"
            className="inline-block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
          >
            Google Blogger 연결하기
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Google 블로거</h1>
            <p className="text-gray-400 text-sm mt-1">
              AI로 블로그 글을 생성하고 자동 발행합니다
            </p>
          </div>
          {status.email && (
            <div className="text-right">
              <div className="text-xs text-gray-400">연결된 계정</div>
              <div className="text-sm text-indigo-400">{status.email}</div>
            </div>
          )}
        </div>

        {/* 탭 */}
        <div className="flex gap-1 bg-gray-800 rounded-xl p-1 mb-6">
          {(['write', 'history', 'status'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab === 'write' && '✍️ 글 작성'}
              {tab === 'history' && '📋 발행 이력'}
              {tab === 'status' && '📊 블로그 현황'}
            </button>
          ))}
        </div>

        {/* 글 작성 탭 */}
        {activeTab === 'write' && (
          <div className="space-y-5">
            {/* 콘텐츠 타입 */}
            <div className="bg-gray-800 rounded-xl p-5">
              <label className="block text-sm font-medium text-gray-300 mb-3">
                콘텐츠 타입
              </label>
              <div className="flex gap-3">
                {(['product', 'info'] as ContentType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setContentType(type)}
                    className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-all ${
                      contentType === type
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {type === 'product' ? '🛒 상품 리뷰' : '📖 정보성 글'}
                  </button>
                ))}
              </div>
            </div>

            {/* 키워드 입력 */}
            <div className="bg-gray-800 rounded-xl p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  키워드 *
                </label>
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                  placeholder={
                    contentType === 'product'
                      ? '예: 에어프라이어 추천, 다이슨 청소기'
                      : '예: 갤럭시 S24 울트라 사용법, 다이어트 식단 계획'
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
                />
              </div>

              {contentType === 'product' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    상품 정보 (선택)
                  </label>
                  <textarea
                    value={productInfo}
                    onChange={(e) => setProductInfo(e.target.value)}
                    rows={2}
                    placeholder="가격, 특징, 링크 등 추가 정보를 입력하면 더 정확한 글이 생성됩니다"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm resize-none"
                  />
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={generating || !keyword.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    AI 생성 중...
                  </>
                ) : (
                  '✨ AI 글 생성'
                )}
              </button>
            </div>

            {/* 생성 결과 */}
            {generated && (
              <div className="bg-gray-800 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-200">생성 결과 편집</h3>

                {/* 제목 */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">제목</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 text-sm"
                  />
                </div>

                {/* 라벨 */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">라벨/태그</label>
                  <div className="flex flex-wrap gap-2">
                    {editLabels.map((label, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 bg-indigo-900/50 border border-indigo-700 text-indigo-300 text-xs px-2.5 py-1 rounded-full"
                      >
                        {label}
                        <button
                          onClick={() => removeLabel(idx)}
                          className="hover:text-white ml-0.5"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* 본문 + 미리보기 토글 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-gray-400">본문 (HTML)</label>
                    <button
                      onClick={() => setPreview((p) => !p)}
                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      {preview ? '✏️ HTML 편집' : '👁 미리보기'}
                    </button>
                  </div>

                  {preview ? (
                    <div
                      ref={previewRef}
                      className="min-h-64 bg-white text-gray-900 rounded-lg p-5 text-sm leading-relaxed prose prose-sm max-w-none overflow-auto"
                    />
                  ) : (
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={14}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 text-xs font-mono resize-y"
                    />
                  )}
                </div>

                {/* 메타 설명 */}
                {generated.metaDescription && (
                  <div className="bg-gray-700/50 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">메타 설명</div>
                    <div className="text-xs text-gray-300">{generated.metaDescription}</div>
                  </div>
                )}

                {/* 발행 옵션 */}
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={!isDraft}
                      onChange={() => setIsDraft(false)}
                      className="accent-indigo-500"
                    />
                    <span className="text-sm text-gray-300">즉시 발행</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={isDraft}
                      onChange={() => setIsDraft(true)}
                      className="accent-indigo-500"
                    />
                    <span className="text-sm text-gray-300">임시저장 (Draft)</span>
                  </label>
                </div>

                {/* 발행 결과 */}
                {publishResult && (
                  <div
                    className={`rounded-lg p-4 text-sm ${
                      publishResult.error
                        ? 'bg-red-900/40 border border-red-700 text-red-300'
                        : 'bg-green-900/40 border border-green-700 text-green-300'
                    }`}
                  >
                    {publishResult.error ? (
                      <>오류: {publishResult.error}</>
                    ) : (
                      <>
                        발행 성공!{' '}
                        {publishResult.url && (
                          <a
                            href={publishResult.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-green-200"
                          >
                            블로그에서 보기 →
                          </a>
                        )}
                      </>
                    )}
                  </div>
                )}

                <button
                  onClick={handlePublish}
                  disabled={publishing || !editTitle.trim() || !editContent.trim()}
                  className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {publishing ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      발행 중...
                    </>
                  ) : isDraft ? (
                    '💾 임시저장'
                  ) : (
                    '🚀 블로거에 발행'
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 발행 이력 탭 */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            {historyLoading ? (
              <div className="text-center py-12 text-gray-500 text-sm">로딩 중...</div>
            ) : history.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-3xl mb-3">📭</div>
                <div className="text-sm">발행 이력이 없습니다.</div>
              </div>
            ) : (
              history.map((item) => (
                <div
                  key={item.id}
                  className="bg-gray-800 rounded-xl p-4 flex items-start justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          item.status === 'LIVE'
                            ? 'bg-green-900/50 text-green-400 border border-green-700'
                            : 'bg-yellow-900/50 text-yellow-400 border border-yellow-700'
                        }`}
                      >
                        {item.status || 'DRAFT'}
                      </span>
                      {item.content_type && (
                        <span className="text-xs text-gray-500">
                          {item.content_type === 'product' ? '상품 리뷰' : '정보성 글'}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-white truncate">
                      {item.title || '(제목 없음)'}
                    </div>
                    {item.keyword && (
                      <div className="text-xs text-gray-400 mt-0.5">키워드: {item.keyword}</div>
                    )}
                    {item.labels && item.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {item.labels.map((label, i) => (
                          <span key={i} className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-1.5">
                      {item.published_at
                        ? new Date(item.published_at).toLocaleString('ko-KR')
                        : new Date(item.created_at).toLocaleString('ko-KR')}
                    </div>
                  </div>
                  {item.blogger_url && (
                    <a
                      href={item.blogger_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 text-xs bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                    >
                      보기 →
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* 블로그 현황 탭 */}
        {activeTab === 'status' && (
          <div className="space-y-5">
            {/* 블로그 정보 카드 */}
            <div className="bg-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">블로그 정보</h3>
              {status.blog ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">블로그 이름</span>
                    <span className="text-sm text-white font-medium">{status.blog.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">블로그 URL</span>
                    <a
                      href={status.blog.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-indigo-400 hover:text-indigo-300 underline"
                    >
                      {status.blog.url}
                    </a>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">총 포스트 수</span>
                    <span className="text-sm text-white font-medium">{status.blog.postCount}개</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Blog ID</span>
                    <span className="text-xs text-gray-500 font-mono">{BLOG_ID}</span>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500">블로그 정보를 불러오지 못했습니다.</div>
              )}
            </div>

            {/* 연결 상태 */}
            <div className="bg-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">연결 상태</h3>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-sm text-green-400 font-medium">연결됨</span>
              </div>
              {status.email && (
                <div className="text-xs text-gray-400">계정: {status.email}</div>
              )}
            </div>

            {/* 최근 포스트 목록 */}
            <div className="bg-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-300">최근 포스트</h3>
                <button
                  onClick={fetchBlogPosts}
                  disabled={postsLoading}
                  className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                >
                  {postsLoading ? '로딩 중...' : '새로고침'}
                </button>
              </div>
              {postsLoading ? (
                <div className="text-center py-6 text-gray-500 text-sm">로딩 중...</div>
              ) : blogPosts.length === 0 ? (
                <div className="text-center py-6 text-gray-500 text-sm">포스트가 없습니다.</div>
              ) : (
                <div className="space-y-2">
                  {blogPosts.map((post) => (
                    <div key={post.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-700/50 last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-white truncate">{post.title}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              post.status === 'LIVE'
                                ? 'bg-green-900/50 text-green-400'
                                : 'bg-yellow-900/50 text-yellow-400'
                            }`}
                          >
                            {post.status}
                          </span>
                          {post.published && (
                            <span className="text-xs text-gray-500">
                              {new Date(post.published).toLocaleDateString('ko-KR')}
                            </span>
                          )}
                        </div>
                      </div>
                      {post.url && (
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 text-xs text-indigo-400 hover:text-indigo-300"
                        >
                          보기 →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 연결 해제 */}
            <div className="bg-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">연결 관리</h3>
              <button
                onClick={async () => {
                  if (!confirm('Google Blogger 연결을 해제하시겠습니까?')) return;
                  await fetch('/api/blogger/disconnect', { method: 'POST' });
                  setStatus({ connected: false });
                }}
                className="bg-red-900/40 hover:bg-red-900/70 border border-red-700 text-red-400 hover:text-red-300 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
              >
                연결 해제
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
