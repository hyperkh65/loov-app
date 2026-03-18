'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

const BLOG_ID = '7951763866955162015';

interface BlogInfo { id: string; name: string; url: string; postCount: number; }
interface StatusData { connected: boolean; email?: string; blog?: BlogInfo | null; }
interface GeneratedPost { title: string; content: string; metaDescription: string; labels: string[]; }
interface HistoryPost {
  id: string; post_id: string | null; title: string | null; keyword: string | null;
  content_type: string | null; labels: string[] | null; status: string | null;
  blogger_url: string | null; published_at: string | null; created_at: string;
}
interface BloggerPost { id: string; title: string; url: string; status: string; published: string; labels: string[]; }
interface CoupangProduct {
  productId: number | string; productName: string; productPrice: number;
  productUrl: string; productImage: string; discountRate?: number;
}
interface NotionPage { id: string; title: string; url: string; last_edited: string; }
interface ImageResult { id: number; url: string; thumb: string; tags: string; author: string; }

type Tab = 'write' | 'coupang' | 'notion' | 'history' | 'status';
type ContentType = 'product' | 'info';
type ImageSource = 'pixabay' | 'pexels' | 'dalle';

export default function BloggerPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>('write');
  const [blogStatus, setBlogStatus] = useState<StatusData | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // ── Write tab ──────────────────────────────────────
  const [contentType, setContentType] = useState<ContentType>('product');
  const [keyword, setKeyword] = useState('');
  const [productInfo, setProductInfo] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedPost | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editLabels, setEditLabels] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(true);
  const [isDraft, setIsDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ url?: string; error?: string } | null>(null);

  // ── Image search ───────────────────────────────────
  const [imageQuery, setImageQuery] = useState('');
  const [imageSource, setImageSource] = useState<ImageSource>('pixabay');
  const [images, setImages] = useState<ImageResult[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [featuredImage, setFeaturedImage] = useState('');
  const [showImageSearch, setShowImageSearch] = useState(false);

  // ── Coupang tab ────────────────────────────────────
  const [coupangKeyword, setCoupangKeyword] = useState('');
  const [coupangProducts, setCoupangProducts] = useState<CoupangProduct[]>([]);
  const [coupangLoading, setCoupangLoading] = useState(false);
  const [coupangError, setCoupangError] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<CoupangProduct[]>([]);
  const [hasCoupang, setHasCoupang] = useState<boolean | null>(null);

  // ── Notion tab ─────────────────────────────────────
  const [notionPages, setNotionPages] = useState<NotionPage[]>([]);
  const [notionLoading, setNotionLoading] = useState(false);
  const [notionError, setNotionError] = useState('');
  const [importing, setImporting] = useState<string | null>(null);
  const [notionContent, setNotionContent] = useState('');
  const [hasNotion, setHasNotion] = useState<boolean | null>(null);

  // ── History / Status ───────────────────────────────
  const [history, setHistory] = useState<HistoryPost[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [blogPosts, setBlogPosts] = useState<BloggerPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);

  const previewRef = useRef<HTMLIFrameElement>(null);

  // ── Init ───────────────────────────────────────────
  useEffect(() => {
    fetchBlogStatus();
    checkCoupang();
    checkNotion();
  }, []);

  useEffect(() => {
    if (searchParams.get('connected') === '1') fetchBlogStatus();
  }, [searchParams]);

  useEffect(() => {
    if (showPreview && previewRef.current && editContent) {
      const doc = previewRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
          body{font-family:'Noto Sans KR',sans-serif;padding:20px;max-width:800px;margin:0 auto;line-height:1.8;color:#333}
          h1,h2,h3{color:#111;margin-top:1.5em}
          h2{border-bottom:2px solid #e5e7eb;padding-bottom:.3em}
          img{max-width:100%}a{color:#4f46e5}
          pre{background:#f4f4f4;padding:1em;border-radius:4px;overflow-x:auto}
          blockquote{border-left:4px solid #ccc;padding-left:1em;color:#555;margin:1em 0}
          ul,ol{padding-left:1.5em}.callout{background:#f0f4ff;border-left:4px solid #4f8ef7;padding:1em;border-radius:4px;margin:1em 0}
        </style></head><body>${editContent}</body></html>`);
        doc.close();
      }
    }
  }, [showPreview, editContent]);

  async function fetchBlogStatus() {
    setStatusLoading(true);
    try {
      const res = await fetch('/api/blogger/status');
      setBlogStatus(await res.json());
    } catch { setBlogStatus({ connected: false }); }
    finally { setStatusLoading(false); }
  }

  async function checkCoupang() {
    try {
      const res = await fetch('/api/coupang/products?type=search&keyword=test');
      // 400 = no key, 200 = has key (even if no results)
      const data = await res.json();
      setHasCoupang(!data.error?.includes('API 키'));
    } catch { setHasCoupang(false); }
  }

  async function checkNotion() {
    try {
      const res = await fetch('/api/notion/settings');
      const data = await res.json();
      setHasNotion(data.hasApiKey === true);
    } catch { setHasNotion(false); }
  }

  async function fetchHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/blogger/history');
      if (res.ok) { const d = await res.json(); setHistory(d.history || []); }
    } catch {} finally { setHistoryLoading(false); }
  }

  async function fetchBlogPosts() {
    setPostsLoading(true);
    try {
      const res = await fetch('/api/blogger/posts');
      if (res.ok) { const d = await res.json(); setBlogPosts(d.posts || []); }
    } catch {} finally { setPostsLoading(false); }
  }

  // ── Coupang search ─────────────────────────────────
  async function handleCoupangSearch() {
    if (!coupangKeyword.trim()) return;
    setCoupangLoading(true);
    setCoupangError('');
    try {
      const res = await fetch(`/api/coupang/products?type=search&keyword=${encodeURIComponent(coupangKeyword)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '검색 실패');
      setCoupangProducts(data.products || []);
    } catch (err) { setCoupangError(String(err)); }
    finally { setCoupangLoading(false); }
  }

  function toggleProduct(product: CoupangProduct) {
    setSelectedProducts(prev => {
      const exists = prev.find(p => p.productId === product.productId);
      return exists ? prev.filter(p => p.productId !== product.productId) : [...prev, product];
    });
  }

  async function handleCoupangGenerate() {
    if (!selectedProducts.length) { alert('상품을 먼저 선택해주세요.'); return; }
    const kw = selectedProducts[0].productName.split(' ').slice(0, 3).join(' ');
    setKeyword(kw);
    setContentType('product');
    // auto-set featured image from first product
    if (selectedProducts[0].productImage && !featuredImage) {
      setFeaturedImage(selectedProducts[0].productImage);
    }
    setActiveTab('write');
    await generatePost('product', kw, selectedProducts, undefined, featuredImage || selectedProducts[0]?.productImage || '');
  }

  // ── Notion ─────────────────────────────────────────
  async function handleNotionLoad() {
    setNotionLoading(true);
    setNotionError('');
    setNotionPages([]);
    try {
      const res = await fetch('/api/notion/pages');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setNotionPages(data.pages || []);
    } catch (err) { setNotionError(String(err)); }
    finally { setNotionLoading(false); }
  }

  async function handleNotionImportAndGenerate(page: NotionPage) {
    setImporting(page.id);
    try {
      const res = await fetch(`/api/notion/import?pageId=${page.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '가져오기 실패');
      setNotionContent(data.plainText || '');
      setKeyword(page.title);
      setContentType('info');
      setActiveTab('write');
      await generatePost('info', page.title, undefined, data.plainText || '', '');
    } catch (err) { alert('노션 가져오기 오류: ' + String(err)); }
    finally { setImporting(null); }
  }

  // ── Image search ───────────────────────────────────
  async function handleImageSearch() {
    const q = imageQuery || keyword || editTitle;
    if (!q.trim()) return;
    setImagesLoading(true);
    setImages([]);
    try {
      const res = await fetch(`/api/shorts/images?q=${encodeURIComponent(q)}&source=${imageSource}&per_page=9`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '이미지 검색 실패');
      setImages(data.images || []);
    } catch (err) { alert('이미지 검색 오류: ' + String(err)); }
    finally { setImagesLoading(false); }
  }

  // ── Generate ───────────────────────────────────────
  async function generatePost(
    type: ContentType,
    kw: string,
    products?: CoupangProduct[],
    notionCtx?: string,
    imgUrl?: string,
  ) {
    setGenerating(true);
    setGenerated(null);
    setPublishResult(null);
    try {
      const res = await fetch('/api/blogger/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: kw,
          contentType: type,
          coupangProducts: products?.map(p => ({
            productName: p.productName,
            productPrice: p.productPrice,
            productUrl: p.productUrl,
            productImage: p.productImage,
          })),
          notionContent: notionCtx,
          featuredImage: imgUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '생성 실패');
      setGenerated(data);
      setEditTitle(data.title);
      setEditContent(data.content);
      setEditLabels(data.labels || []);
      setShowPreview(true);
    } catch (err) { alert('AI 생성 오류: ' + String(err)); }
    finally { setGenerating(false); }
  }

  async function handleGenerate() {
    if (!keyword.trim()) return;
    await generatePost(contentType, keyword, selectedProducts.length ? selectedProducts : undefined, notionContent || undefined, featuredImage || undefined);
  }

  async function handlePublish() {
    if (!editTitle.trim() || !editContent.trim()) return;
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await fetch('/api/blogger/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, content: editContent, labels: editLabels, isDraft, keyword, contentType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '발행 실패');
      setPublishResult({ url: data.url });
    } catch (err) { setPublishResult({ error: String(err) }); }
    finally { setPublishing(false); }
  }

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    if (tab === 'history') fetchHistory();
    if (tab === 'status') fetchBlogPosts();
  }

  const connectedError = searchParams.get('error');

  if (statusLoading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="text-gray-400 text-sm">로딩 중...</div>
    </div>
  );

  if (!blogStatus?.connected) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-gray-800 rounded-2xl p-8 text-center">
        <div className="text-5xl mb-4">📝</div>
        <h1 className="text-xl font-bold text-white mb-2">Google 블로거 연동</h1>
        <p className="text-gray-400 text-sm mb-6">Google Blogger에 AI 글을 자동으로 발행하려면 Google 계정을 연결하세요.</p>
        {connectedError && <div className="mb-4 bg-red-900/40 border border-red-700 rounded-lg p-3 text-red-300 text-xs">{connectedError}</div>}
        <a href="/api/blogger/connect" className="inline-block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-6 rounded-xl transition-colors">
          Google Blogger 연결하기
        </a>
      </div>
    </div>
  );

  const TABS: { id: Tab; label: string }[] = [
    { id: 'write', label: '✍️ 글 작성' },
    { id: 'coupang', label: '🛒 쿠팡' },
    { id: 'notion', label: '📄 노션' },
    { id: 'history', label: '📋 이력' },
    { id: 'status', label: '📊 현황' },
  ];

  const Spinner = () => (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Google 블로거 AI</h1>
            <p className="text-gray-400 text-sm mt-1">수익형(쿠팡) · 지식형(노션) · AI 글 자동 발행</p>
          </div>
          <div className="flex items-center gap-3">
            {selectedProducts.length > 0 && (
              <span className="text-xs bg-orange-900/50 border border-orange-700 text-orange-300 px-3 py-1 rounded-full">
                쿠팡 {selectedProducts.length}개 선택
              </span>
            )}
            {notionContent && (
              <span className="text-xs bg-purple-900/50 border border-purple-700 text-purple-300 px-3 py-1 rounded-full">
                노션 연동됨
              </span>
            )}
            {blogStatus.email && <div className="text-xs text-indigo-400">{blogStatus.email}</div>}
          </div>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 bg-gray-800 rounded-xl p-1 mb-6 overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => handleTabChange(tab.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ══════ 글 작성 탭 ══════ */}
        {activeTab === 'write' && (
          <div className="space-y-5">
            {/* 콘텐츠 타입 */}
            <div className="bg-gray-800 rounded-xl p-5">
              <label className="block text-sm font-medium text-gray-300 mb-3">콘텐츠 유형</label>
              <div className="flex gap-3">
                <button onClick={() => setContentType('product')}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-all ${contentType === 'product' ? 'bg-orange-600 border-orange-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'}`}>
                  🛒 수익형 (쿠팡 파트너스)
                </button>
                <button onClick={() => setContentType('info')}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-all ${contentType === 'info' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'}`}>
                  📖 지식형 (정보성)
                </button>
              </div>
            </div>

            {/* 키워드 + 생성 */}
            <div className="bg-gray-800 rounded-xl p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">키워드 *</label>
                <input type="text" value={keyword} onChange={e => setKeyword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                  placeholder={contentType === 'product' ? '예: 에어프라이어 추천, 다이슨 청소기 비교' : '예: 갤럭시 S24 사용법, 다이어트 식단'}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
                />
              </div>
              {contentType === 'product' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">상품 추가 정보 (선택)</label>
                  <textarea value={productInfo} onChange={e => setProductInfo(e.target.value)} rows={2}
                    placeholder="가격, 특징 등 추가 정보"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm resize-none"
                  />
                </div>
              )}

              {/* 선택된 쿠팡 상품 */}
              {selectedProducts.length > 0 && (
                <div className="bg-orange-900/20 border border-orange-700/50 rounded-lg p-3">
                  <div className="text-xs font-medium text-orange-300 mb-2">쿠팡 상품 {selectedProducts.length}개 포함</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedProducts.map(p => (
                      <span key={String(p.productId)} className="inline-flex items-center gap-1 bg-orange-900/40 border border-orange-700 text-orange-300 text-xs px-2 py-1 rounded-full">
                        {p.productName.slice(0, 20)}{p.productName.length > 20 ? '…' : ''}
                        <button onClick={() => toggleProduct(p)} className="hover:text-white ml-0.5">×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 노션 콘텐츠 */}
              {notionContent && (
                <div className="bg-purple-900/20 border border-purple-700/50 rounded-lg p-3 flex items-center justify-between">
                  <span className="text-xs text-purple-300">노션 원고 연동됨 ({notionContent.length}자)</span>
                  <button onClick={() => setNotionContent('')} className="text-xs text-purple-400 hover:text-purple-200">제거</button>
                </div>
              )}

              {/* 대표 이미지 */}
              {featuredImage && (
                <div className="relative">
                  <img src={featuredImage} alt="대표 이미지" className="w-full max-h-48 object-cover rounded-lg"/>
                  <button onClick={() => setFeaturedImage('')}
                    className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white text-xs px-2 py-1 rounded-lg">
                    이미지 제거
                  </button>
                  <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">대표 이미지</div>
                </div>
              )}

              {/* 이미지 검색 토글 */}
              <div>
                <button onClick={() => setShowImageSearch(s => !s)}
                  className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
                  {showImageSearch ? '▲ 이미지 검색 닫기' : '🖼 대표 이미지 선택/생성'}
                </button>
                {showImageSearch && (
                  <div className="mt-3 space-y-3">
                    <div className="flex gap-2">
                      <input type="text" value={imageQuery} onChange={e => setImageQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleImageSearch()}
                        placeholder={keyword || '이미지 검색어'}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                      />
                      <select value={imageSource} onChange={e => setImageSource(e.target.value as ImageSource)}
                        className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                        <option value="pixabay">Pixabay</option>
                        <option value="pexels">Pexels</option>
                        <option value="dalle">DALL-E 생성</option>
                      </select>
                      <button onClick={handleImageSearch} disabled={imagesLoading}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                        {imagesLoading ? '검색 중...' : '검색'}
                      </button>
                    </div>
                    {/* 쿠팡 상품 이미지 */}
                    {selectedProducts.filter(p => p.productImage).length > 0 && (
                      <div>
                        <div className="text-xs text-gray-400 mb-2">쿠팡 상품 이미지</div>
                        <div className="flex gap-2 flex-wrap">
                          {selectedProducts.filter(p => p.productImage).map(p => (
                            <button key={String(p.productId)} onClick={() => setFeaturedImage(p.productImage)}
                              className={`relative rounded-lg overflow-hidden border-2 transition-all ${featuredImage === p.productImage ? 'border-indigo-500' : 'border-transparent'}`}>
                              <img src={p.productImage} alt={p.productName} className="w-16 h-16 object-contain bg-white"/>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {images.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-400 mb-2">검색 결과 — 클릭하여 선택</div>
                        <div className="grid grid-cols-3 gap-2">
                          {images.map(img => (
                            <button key={img.id} onClick={() => { setFeaturedImage(img.url); }}
                              className={`relative rounded-lg overflow-hidden aspect-video border-2 transition-all ${featuredImage === img.url ? 'border-indigo-500 ring-2 ring-indigo-500' : 'border-transparent hover:border-gray-500'}`}>
                              <img src={img.thumb} alt={img.tags} className="w-full h-full object-cover"/>
                              {featuredImage === img.url && (
                                <div className="absolute inset-0 bg-indigo-600/30 flex items-center justify-center">
                                  <span className="text-white text-lg">✓</span>
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button onClick={handleGenerate} disabled={generating || !keyword.trim()}
                className={`w-full disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 ${contentType === 'product' ? 'bg-orange-600 hover:bg-orange-500' : 'bg-purple-600 hover:bg-purple-500'}`}>
                {generating ? <><Spinner />{contentType === 'product' ? '수익형 글 생성 중...' : '지식형 글 생성 중...'}</> :
                  contentType === 'product' ? '💰 수익형 AI 글 생성 (GPT-4o)' : '📚 지식형 AI 글 생성 (GPT-4o)'}
              </button>
            </div>

            {/* 생성 결과 — Split View */}
            {generated && (
              <div className="bg-gray-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-200">편집 및 미리보기</h3>
                  <button onClick={() => setShowPreview(p => !p)}
                    className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded-lg transition-colors">
                    {showPreview ? '미리보기 숨기기' : '미리보기 표시'}
                  </button>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">제목</label>
                  <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">라벨/태그</label>
                  <div className="flex flex-wrap gap-2">
                    {editLabels.map((label, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 bg-indigo-900/50 border border-indigo-700 text-indigo-300 text-xs px-2.5 py-1 rounded-full">
                        {label}
                        <button onClick={() => setEditLabels(prev => prev.filter((_, i) => i !== idx))} className="hover:text-white ml-0.5">×</button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className={showPreview ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : ''}>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">본문 (HTML)</label>
                    <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                      rows={showPreview ? 22 : 16}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 text-xs font-mono resize-y"
                    />
                  </div>
                  {showPreview && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1.5">미리보기</label>
                      <iframe ref={previewRef} className="w-full rounded-lg border border-gray-600 bg-white"
                        style={{ height: '500px' }} sandbox="allow-same-origin" title="preview"/>
                    </div>
                  )}
                </div>

                {generated.metaDescription && (
                  <div className="bg-gray-700/50 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">메타 설명</div>
                    <div className="text-xs text-gray-300">{generated.metaDescription}</div>
                  </div>
                )}

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={!isDraft} onChange={() => setIsDraft(false)} className="accent-indigo-500"/>
                    <span className="text-sm text-gray-300">즉시 발행</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={isDraft} onChange={() => setIsDraft(true)} className="accent-indigo-500"/>
                    <span className="text-sm text-gray-300">임시저장</span>
                  </label>
                </div>

                {publishResult && (
                  <div className={`rounded-lg p-4 text-sm ${publishResult.error ? 'bg-red-900/40 border border-red-700 text-red-300' : 'bg-green-900/40 border border-green-700 text-green-300'}`}>
                    {publishResult.error ? <>오류: {publishResult.error}</> : <>
                      발행 성공!{' '}
                      {publishResult.url && <a href={publishResult.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-green-200">블로그에서 보기 →</a>}
                    </>}
                  </div>
                )}

                <button onClick={handlePublish} disabled={publishing || !editTitle.trim() || !editContent.trim()}
                  className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {publishing ? <><Spinner />발행 중...</> : isDraft ? '💾 임시저장' : '🚀 블로거에 발행'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══════ 쿠팡 탭 ══════ */}
        {activeTab === 'coupang' && (
          <div className="space-y-5">
            {hasCoupang === false ? (
              <div className="bg-gray-800 rounded-xl p-8 text-center">
                <div className="text-4xl mb-3">🛒</div>
                <h3 className="text-lg font-semibold text-white mb-2">쿠팡 파트너스 연결 필요</h3>
                <p className="text-gray-400 text-sm mb-4">쿠팡 파트너스 API 키가 설정되지 않았습니다.</p>
                <a href="/dashboard/coupang" className="bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors inline-block">
                  쿠팡 설정 페이지로 →
                </a>
              </div>
            ) : (
              <>
                <div className="bg-gray-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-200">상품 검색</h3>
                    {selectedProducts.length > 0 && (
                      <button onClick={handleCoupangGenerate} disabled={generating}
                        className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
                        {generating ? <><Spinner />생성 중...</> : `💰 ${selectedProducts.length}개 상품으로 수익형 글 생성`}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={coupangKeyword} onChange={e => setCoupangKeyword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCoupangSearch()}
                      placeholder="예: 에어프라이어, 무선청소기"
                      className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
                    />
                    <button onClick={handleCoupangSearch} disabled={coupangLoading || !coupangKeyword.trim()}
                      className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-medium px-5 py-3 rounded-lg transition-colors text-sm">
                      {coupangLoading ? '검색 중...' : '검색'}
                    </button>
                  </div>
                  {coupangError && <div className="mt-3 text-xs text-red-400">{coupangError}</div>}
                </div>

                {selectedProducts.length > 0 && (
                  <div className="bg-orange-900/20 border border-orange-700/50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium text-orange-300">선택된 상품 {selectedProducts.length}개</div>
                      <button onClick={handleCoupangGenerate} disabled={generating}
                        className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                        {generating ? <><Spinner />생성 중...</> : '💰 수익형 글 생성 (GPT-4o)'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedProducts.map(p => (
                        <span key={String(p.productId)} className="inline-flex items-center gap-1 bg-orange-900/40 border border-orange-700 text-orange-300 text-xs px-2 py-1 rounded-full">
                          {p.productName.slice(0, 25)}{p.productName.length > 25 ? '…' : ''}
                          <button onClick={() => toggleProduct(p)} className="hover:text-white">×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {coupangProducts.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {coupangProducts.map(product => {
                      const isSelected = selectedProducts.some(p => p.productId === product.productId);
                      return (
                        <div key={String(product.productId)} className={`bg-gray-800 rounded-xl p-4 border transition-all ${isSelected ? 'border-orange-500 bg-orange-900/10' : 'border-gray-700'}`}>
                          <div className="flex gap-3 mb-3">
                            {product.productImage && (
                              <img src={product.productImage} alt={product.productName}
                                className="w-20 h-20 object-contain flex-shrink-0 bg-white rounded-lg p-1"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-white font-medium line-clamp-2 mb-1">{product.productName}</div>
                              <div className="text-orange-400 font-bold text-base">{product.productPrice.toLocaleString()}원</div>
                              {product.discountRate && product.discountRate > 0 && (
                                <div className="text-xs text-green-400">{product.discountRate}% 할인</div>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => toggleProduct(product)}
                              className={`flex-1 text-xs font-medium py-2 rounded-lg transition-colors ${isSelected ? 'bg-orange-600 hover:bg-orange-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
                              {isSelected ? '✓ 선택됨' : '글에 포함'}
                            </button>
                            <a href={product.productUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-2 rounded-lg transition-colors">
                              보기 ↗
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════ 노션 탭 ══════ */}
        {activeTab === 'notion' && (
          <div className="space-y-5">
            {hasNotion === false ? (
              <div className="bg-gray-800 rounded-xl p-8 text-center">
                <div className="text-4xl mb-3">📄</div>
                <h3 className="text-lg font-semibold text-white mb-2">Notion 연결 필요</h3>
                <p className="text-gray-400 text-sm mb-4">노션 API 키가 설정되지 않았습니다.</p>
                <a href="/dashboard/notion" className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors inline-block">
                  노션 설정 페이지로 →
                </a>
              </div>
            ) : (
              <>
                <div className="bg-gray-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-200">노션 페이지 가져오기</h3>
                      <p className="text-xs text-gray-500 mt-0.5">페이지를 선택하면 내용을 바탕으로 지식형 블로그 글을 AI가 작성합니다</p>
                    </div>
                    <button onClick={handleNotionLoad} disabled={notionLoading}
                      className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 text-sm px-4 py-2 rounded-lg transition-colors">
                      {notionLoading ? '로딩 중...' : notionPages.length > 0 ? '새로고침' : '페이지 불러오기'}
                    </button>
                  </div>
                  {notionError && <div className="text-xs text-red-400 mb-3">{notionError}</div>}
                  {notionPages.length === 0 && !notionLoading && (
                    <div className="text-center py-8 text-gray-500 text-sm">"페이지 불러오기"를 눌러주세요.</div>
                  )}
                  <div className="space-y-2">
                    {notionPages.map(page => (
                      <div key={page.id} className="flex items-center justify-between gap-3 py-3 border-b border-gray-700/50 last:border-0">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-white truncate">{page.title}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{new Date(page.last_edited).toLocaleDateString('ko-KR')}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <a href={page.url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-gray-200">열기 ↗</a>
                          <button onClick={() => handleNotionImportAndGenerate(page)} disabled={importing === page.id || generating}
                            className="text-xs bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                            {importing === page.id ? <><Spinner />생성 중...</> : '📚 지식형 글 생성'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════ 발행 이력 탭 ══════ */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            {historyLoading ? (
              <div className="text-center py-12 text-gray-500 text-sm">로딩 중...</div>
            ) : history.length === 0 ? (
              <div className="text-center py-12 text-gray-500"><div className="text-3xl mb-3">📭</div><div className="text-sm">발행 이력이 없습니다.</div></div>
            ) : (
              history.map(item => (
                <div key={item.id} className="bg-gray-800 rounded-xl p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.status === 'LIVE' ? 'bg-green-900/50 text-green-400 border border-green-700' : 'bg-yellow-900/50 text-yellow-400 border border-yellow-700'}`}>
                        {item.status || 'DRAFT'}
                      </span>
                      {item.content_type && <span className="text-xs text-gray-500">{item.content_type === 'product' ? '수익형' : '지식형'}</span>}
                    </div>
                    <div className="text-sm font-medium text-white truncate">{item.title || '(제목 없음)'}</div>
                    {item.keyword && <div className="text-xs text-gray-400 mt-0.5">키워드: {item.keyword}</div>}
                    <div className="text-xs text-gray-500 mt-1">{item.published_at ? new Date(item.published_at).toLocaleString('ko-KR') : new Date(item.created_at).toLocaleString('ko-KR')}</div>
                  </div>
                  {item.blogger_url && (
                    <a href={item.blogger_url} target="_blank" rel="noopener noreferrer"
                      className="flex-shrink-0 text-xs bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg transition-colors">보기 →</a>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ══════ 블로그 현황 탭 ══════ */}
        {activeTab === 'status' && (
          <div className="space-y-5">
            <div className="bg-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">블로그 정보</h3>
              {blogStatus.blog ? (
                <div className="space-y-3">
                  <div className="flex justify-between"><span className="text-sm text-gray-400">블로그 이름</span><span className="text-sm text-white">{blogStatus.blog.name}</span></div>
                  <div className="flex justify-between"><span className="text-sm text-gray-400">URL</span><a href={blogStatus.blog.url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-400 underline">{blogStatus.blog.url}</a></div>
                  <div className="flex justify-between"><span className="text-sm text-gray-400">총 포스트</span><span className="text-sm text-white">{blogStatus.blog.postCount}개</span></div>
                </div>
              ) : <div className="text-sm text-gray-500">정보를 불러오지 못했습니다.</div>}
            </div>

            <div className="bg-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-300">최근 포스트</h3>
                <button onClick={fetchBlogPosts} disabled={postsLoading} className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50">{postsLoading ? '로딩 중...' : '새로고침'}</button>
              </div>
              {postsLoading ? <div className="text-center py-6 text-gray-500 text-sm">로딩 중...</div> :
                blogPosts.length === 0 ? <div className="text-center py-6 text-gray-500 text-sm">포스트가 없습니다.</div> : (
                  <div className="space-y-2">
                    {blogPosts.map(post => (
                      <div key={post.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-700/50 last:border-0">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-white truncate">{post.title}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${post.status === 'LIVE' ? 'bg-green-900/50 text-green-400' : 'bg-yellow-900/50 text-yellow-400'}`}>{post.status}</span>
                            {post.published && <span className="text-xs text-gray-500">{new Date(post.published).toLocaleDateString('ko-KR')}</span>}
                          </div>
                        </div>
                        {post.url && <a href={post.url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-xs text-indigo-400 hover:text-indigo-300">보기 →</a>}
                      </div>
                    ))}
                  </div>
                )}
            </div>

            <div className="bg-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">연결 관리</h3>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-green-400"/>
                <span className="text-sm text-green-400">연결됨 · {blogStatus.email}</span>
              </div>
              <button onClick={async () => { if (!confirm('연결을 해제하시겠습니까?')) return; await fetch('/api/blogger/disconnect', { method: 'POST' }); setBlogStatus({ connected: false }); }}
                className="bg-red-900/40 hover:bg-red-900/70 border border-red-700 text-red-400 text-sm px-4 py-2 rounded-lg transition-colors">
                연결 해제
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
