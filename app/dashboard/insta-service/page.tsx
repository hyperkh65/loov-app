'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type Tab = 'image' | 'reels';
type Tone = 'casual' | 'professional' | 'trendy';
type ImgItem = { id: string; url: string; thumb: string; source: 'pixabay' | 'upload' | 'blog' };

interface Article {
  id: string;
  title: string;
  keyword: string;
  focus_keyword: string;
  representative_image_url: string | null;
  status: string;
  created_at: string;
}

const BGM_TRACKS = [
  { id: 'none', label: '없음', url: '' },
  { id: 'chill1', label: '🎵 Chill Lofi', url: 'https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3' },
  { id: 'upbeat1', label: '🎶 Upbeat Pop', url: 'https://cdn.pixabay.com/audio/2022/03/10/audio_c8c8a73467.mp3' },
  { id: 'cinematic1', label: '🎼 Cinematic', url: 'https://cdn.pixabay.com/audio/2022/01/18/audio_d0c6ff1c23.mp3' },
  { id: 'acoustic1', label: '🎸 Acoustic', url: 'https://cdn.pixabay.com/audio/2021/12/13/audio_cb4e49b448.mp3' },
  { id: 'electronic1', label: '⚡ Electronic', url: 'https://cdn.pixabay.com/audio/2022/08/04/audio_2dde668d05.mp3' },
];

export default function InstaServicePage() {
  const [tab, setTab] = useState<Tab>('image');

  // Article
  const [articles, setArticles] = useState<Article[]>([]);
  const [articleSearch, setArticleSearch] = useState('');
  const [showArticleList, setShowArticleList] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [loadingArticles, setLoadingArticles] = useState(false);

  // Caption
  const [caption, setCaption] = useState('');
  const [tone, setTone] = useState<Tone>('casual');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  // Images (carousel, up to 10)
  const [images, setImages] = useState<ImgItem[]>([]);
  const [imgQuery, setImgQuery] = useState('');
  const [imgResults, setImgResults] = useState<{ id: number; url: string; thumb: string }[]>([]);
  const [imgSearching, setImgSearching] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const imgFileRef = useRef<HTMLInputElement>(null);

  // Reels
  const [videoUrl, setVideoUrl] = useState('');
  const [xUrl, setXUrl] = useState('');
  const [fetchingX, setFetchingX] = useState(false);
  const [overlayText, setOverlayText] = useState('');
  const [overlayPos, setOverlayPos] = useState<'top' | 'center' | 'bottom'>('bottom');
  const [overlayColor, setOverlayColor] = useState('#ffffff');
  const [muteOriginal, setMuteOriginal] = useState(false);
  const [bgm, setBgm] = useState('none');
  const [xVideos, setXVideos] = useState<{ id: string; title: string; video_url: string; thumbnail_url?: string }[]>([]);
  const [loadingXVideos, setLoadingXVideos] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Publish
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ ok?: boolean; url?: string; error?: string } | null>(null);

  // Load articles
  const loadArticles = useCallback(async (q = '') => {
    setLoadingArticles(true);
    const res = await fetch(`/api/auto-service/articles?status=published&limit=50${q ? `&q=${encodeURIComponent(q)}` : ''}`);
    const data = await res.json();
    setArticles(data.items || []);
    setLoadingArticles(false);
  }, []);

  // Load X videos
  const loadXVideos = useCallback(async () => {
    setLoadingXVideos(true);
    try {
      const res = await fetch('/api/x-videos?limit=20');
      const data = await res.json();
      setXVideos(data.items || []);
    } catch { /* ignore */ }
    setLoadingXVideos(false);
  }, []);

  useEffect(() => { loadArticles(); }, [loadArticles]);
  useEffect(() => { if (tab === 'reels') loadXVideos(); }, [tab, loadXVideos]);

  // Article select → auto-generate caption
  const selectArticle = async (article: Article) => {
    setSelectedArticle(article);
    setShowArticleList(false);
    setImgQuery(article.focus_keyword || article.keyword || article.title);

    // Blog image auto-add
    if (article.representative_image_url && images.length === 0) {
      setImages([{ id: 'blog_main', url: article.representative_image_url, thumb: article.representative_image_url, source: 'blog' }]);
    }

    // Auto-generate caption
    await generateCaption(article.id);
  };

  const generateCaption = async (articleId?: string) => {
    setGenerating(true);
    setGenError('');
    try {
      const res = await fetch('/api/insta-service/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: articleId || selectedArticle?.id, tone }),
      });
      const data = await res.json();
      if (data.caption) setCaption(data.caption);
      else setGenError(data.error || 'AI 생성 실패');
    } catch (e) {
      setGenError(String(e));
    }
    setGenerating(false);
  };

  // Pixabay search
  const searchImages = async () => {
    if (!imgQuery) return;
    setImgSearching(true);
    try {
      const res = await fetch(`/api/shorts/images?q=${encodeURIComponent(imgQuery)}&source=pixabay&per_page=12`);
      const data = await res.json();
      setImgResults(data.images || []);
    } catch { /* ignore */ }
    setImgSearching(false);
  };

  const addPixabayImage = (img: { id: number; url: string; thumb: string }) => {
    if (images.length >= 10) return;
    if (images.find(i => i.url === img.thumb)) return;
    setImages(prev => [...prev, { id: String(img.id), url: img.thumb, thumb: img.thumb, source: 'pixabay' }]);
  };

  const removeImage = (id: string) => setImages(prev => prev.filter(i => i.id !== id));

  const uploadImage = async (file: File) => {
    if (images.length >= 10) return;
    setUploadingImg(true);
    const form = new FormData();
    form.append('file', file);
    form.append('type', 'image');
    const res = await fetch('/api/sns/media', { method: 'POST', body: form });
    const data = await res.json();
    if (data.url) setImages(prev => [...prev, { id: `upload_${Date.now()}`, url: data.url, thumb: data.url, source: 'upload' }]);
    setUploadingImg(false);
  };

  // X.com video fetch
  const fetchXVideo = async () => {
    if (!xUrl.trim()) return;
    setFetchingX(true);
    // X.com 동영상은 직접 다운로드 API 없음 - URL을 직접 사용
    // 트위터 임베드 URL 형태 변환 시도
    const tweetId = xUrl.match(/status\/(\d+)/)?.[1];
    if (tweetId) {
      setVideoUrl(`https://video.twimg.com/tweet_video/${tweetId}.mp4`);
    } else {
      setVideoUrl(xUrl);
    }
    setFetchingX(false);
  };

  // Publish
  const publish = async () => {
    if (!caption.trim()) { alert('캡션을 입력하세요'); return; }
    const mediaUrls = tab === 'image' ? images.map(i => i.url) : videoUrl ? [videoUrl] : [];
    if (!mediaUrls.length) { alert('이미지 또는 영상을 추가하세요'); return; }

    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await fetch('/api/sns/post-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: caption, platforms: ['instagram'], media_urls: mediaUrls }),
      });
      const data = await res.json();
      const r = data.results?.find((x: { platform: string }) => x.platform === 'instagram');
      setPublishResult(r ? { ok: r.success, url: r.url, error: r.error } : { error: '결과 없음' });
    } catch (e) {
      setPublishResult({ error: String(e) });
    } finally {
      setPublishing(false);
    }
  };

  const charCount = caption.length;

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center text-white text-sm font-bold">IG</div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">인스타그램 자동화</h1>
          <p className="text-xs text-gray-500">블로그 → 인스타 캡션 + 이미지/릴스 자동 생성 & 발행</p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          {/* Tab */}
          <div className="flex gap-1 p-3 border-b border-gray-100">
            {([['image', '🖼️ 이미지 포스트'], ['reels', '🎬 릴스/영상']] as [Tab, string][]).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === t ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Article Selector */}
          <div className="p-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-600 mb-2">📝 블로그 글 선택</p>
            <div className="relative">
              <input
                value={selectedArticle ? selectedArticle.title : articleSearch}
                onChange={e => { setArticleSearch(e.target.value); setSelectedArticle(null); if (!showArticleList) { setShowArticleList(true); loadArticles(e.target.value); } }}
                onFocus={() => setShowArticleList(true)}
                placeholder="글 제목으로 검색..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-purple-400"
              />
              {showArticleList && (
                <div className="absolute z-20 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto mt-1">
                  {loadingArticles ? (
                    <p className="p-3 text-xs text-gray-400 text-center">불러오는 중...</p>
                  ) : articles.length === 0 ? (
                    <p className="p-3 text-xs text-gray-400 text-center">발행된 글이 없습니다</p>
                  ) : articles.filter(a => !articleSearch || a.title.includes(articleSearch)).map(a => (
                    <button key={a.id} onClick={() => selectArticle(a)}
                      className="w-full text-left px-3 py-2 hover:bg-purple-50 border-b border-gray-50 last:border-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{a.title}</p>
                      <p className="text-xs text-gray-400">{a.focus_keyword || a.keyword} · {a.created_at.slice(0, 10)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedArticle && (
              <div className="mt-2 flex items-center gap-2 bg-purple-50 rounded-lg p-2">
                {selectedArticle.representative_image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedArticle.representative_image_url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-purple-800 truncate">{selectedArticle.title}</p>
                  <button onClick={() => generateCaption()} disabled={generating}
                    className="mt-1 text-xs text-purple-600 hover:text-purple-800 font-medium disabled:opacity-50">
                    {generating ? '생성 중...' : '🔄 캡션 재생성'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* IMAGE TAB */}
          {tab === 'image' && (
            <>
              {/* Pixabay Search */}
              <div className="p-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-600 mb-2">🔍 이미지 검색 (픽사베이)</p>
                <div className="flex gap-1.5">
                  <input value={imgQuery} onChange={e => setImgQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchImages()}
                    placeholder="키워드 입력..."
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-400" />
                  <button onClick={searchImages} disabled={imgSearching}
                    className="px-2 py-1.5 bg-purple-600 text-white rounded-lg text-xs hover:bg-purple-700 disabled:opacity-50">
                    {imgSearching ? '...' : '검색'}
                  </button>
                </div>
                {imgResults.length > 0 && (
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    {imgResults.map(img => (
                      <button key={img.id} onClick={() => addPixabayImage(img)}
                        disabled={images.length >= 10}
                        className="aspect-square rounded overflow-hidden border-2 border-transparent hover:border-purple-400 transition-all disabled:opacity-40">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.thumb} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Upload */}
              <div className="p-3 border-b border-gray-100">
                <label className="flex items-center gap-2 cursor-pointer border border-dashed border-gray-300 rounded-lg p-2.5 hover:border-purple-400 hover:bg-purple-50 transition-colors">
                  <span>📎</span>
                  <span className="text-xs text-gray-500">{uploadingImg ? '업로드 중...' : '파일 업로드 (최대 10개)'}</span>
                  <input ref={imgFileRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={async e => { for (const f of Array.from(e.target.files || [])) await uploadImage(f); e.target.value = ''; }} />
                </label>
              </div>

              {/* Selected Images */}
              {images.length > 0 && (
                <div className="p-3 border-b border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-600">선택된 이미지 ({images.length}/10)</p>
                    {images.length > 1 && <span className="text-xs text-gray-400">캐러셀로 발행</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {images.map((img, i) => (
                      <div key={img.id} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.thumb} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                          <button onClick={() => removeImage(img.id)} className="w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">✕</button>
                        </div>
                        <div className="absolute top-1 left-1 w-4 h-4 bg-black/60 text-white text-xs rounded flex items-center justify-center">{i + 1}</div>
                        {img.source === 'blog' && <div className="absolute bottom-1 right-1 bg-purple-500 text-white text-xs px-1 rounded">블로그</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* REELS TAB */}
          {tab === 'reels' && (
            <>
              {/* X.com Import */}
              <div className="p-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-600 mb-2">🐦 X.com 영상 가져오기</p>
                <div className="flex gap-1.5">
                  <input value={xUrl} onChange={e => setXUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && fetchXVideo()}
                    placeholder="X.com 트윗 URL..."
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-400" />
                  <button onClick={fetchXVideo} disabled={fetchingX}
                    className="px-2 py-1.5 bg-gray-800 text-white rounded-lg text-xs hover:bg-black disabled:opacity-50">
                    {fetchingX ? '...' : '가져오기'}
                  </button>
                </div>

                {/* X Video Library */}
                {loadingXVideos ? (
                  <p className="text-xs text-gray-400 mt-2 text-center">불러오는 중...</p>
                ) : xVideos.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    {xVideos.map(v => (
                      <button key={v.id} onClick={() => setVideoUrl(v.video_url)}
                        className={`w-full text-left flex items-center gap-2 p-1.5 rounded-lg border transition-colors ${videoUrl === v.video_url ? 'border-purple-500 bg-purple-50' : 'border-gray-100 hover:border-gray-300'}`}>
                        {v.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.thumbnail_url} alt="" className="w-10 h-8 object-cover rounded flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-8 bg-gray-200 rounded flex-shrink-0 flex items-center justify-center text-gray-400 text-xs">🎬</div>
                        )}
                        <span className="text-xs text-gray-700 truncate">{v.title || '영상'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Direct Video URL */}
              <div className="p-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-600 mb-1.5">🔗 직접 영상 URL</p>
                <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
                  placeholder="mp4 영상 URL..."
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-400" />
              </div>

              {/* Overlay Text */}
              <div className="p-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-600 mb-1.5">✍️ 텍스트 오버레이</p>
                <input value={overlayText} onChange={e => setOverlayText(e.target.value)}
                  placeholder="영상 위 텍스트 (선택)"
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-400 mb-1.5" />
                <div className="flex gap-1.5">
                  {(['top', 'center', 'bottom'] as const).map(p => (
                    <button key={p} onClick={() => setOverlayPos(p)}
                      className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${overlayPos === p ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {p === 'top' ? '상단' : p === 'center' ? '중앙' : '하단'}
                    </button>
                  ))}
                  <input type="color" value={overlayColor} onChange={e => setOverlayColor(e.target.value)}
                    className="w-8 h-7 rounded border border-gray-300 cursor-pointer" title="텍스트 색상" />
                </div>
              </div>

              {/* BGM & Mute */}
              <div className="p-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-600 mb-1.5">🎵 배경음악</p>
                <select value={bgm} onChange={e => setBgm(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-400 mb-2">
                  {BGM_TRACKS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={muteOriginal} onChange={e => setMuteOriginal(e.target.checked)}
                    className="w-4 h-4 rounded accent-purple-600" />
                  <span className="text-xs text-gray-600">원본 오디오 음소거</span>
                </label>
              </div>
            </>
          )}
        </div>

        {/* Center - Preview & Caption */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* Instagram Phone Preview */}
          <div className="flex-1 flex items-start justify-center p-6 gap-6">
            {/* Phone mockup */}
            <div className="flex-shrink-0">
              <div className="w-64 bg-black rounded-[2.5rem] p-3 shadow-2xl border-4 border-gray-800">
                <div className="bg-white rounded-[2rem] overflow-hidden" style={{ aspectRatio: '9/16' }}>
                  {tab === 'image' ? (
                    images.length > 0 ? (
                      <div className="relative w-full h-full bg-gray-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={images[0].url} alt="" className="w-full h-full object-cover" />
                        {images.length > 1 && (
                          <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                            1/{images.length}
                          </div>
                        )}
                        {/* IG overlay */}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                          <p className="text-white text-xs line-clamp-2">{caption.slice(0, 100)}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-4xl mb-2">📸</div>
                          <p className="text-xs text-gray-500">이미지를 추가하세요</p>
                        </div>
                      </div>
                    )
                  ) : (
                    videoUrl ? (
                      <div className="relative w-full h-full bg-black">
                        <video ref={videoRef} src={videoUrl} className="w-full h-full object-cover"
                          muted={muteOriginal} loop playsInline controls />
                        {overlayText && (
                          <div className={`absolute inset-x-3 ${overlayPos === 'top' ? 'top-3' : overlayPos === 'center' ? 'top-1/2 -translate-y-1/2' : 'bottom-8'}`}>
                            <p className="text-center text-sm font-bold drop-shadow-lg" style={{ color: overlayColor }}>
                              {overlayText}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-4xl mb-2">🎬</div>
                          <p className="text-xs text-gray-400">영상을 추가하세요</p>
                        </div>
                      </div>
                    )
                  )}
                </div>
                {/* IG bottom dots */}
                {tab === 'image' && images.length > 1 && (
                  <div className="flex justify-center gap-1 mt-2">
                    {images.slice(0, 5).map((_, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-white' : 'bg-white/40'}`} />
                    ))}
                  </div>
                )}
              </div>
              <p className="text-center text-xs text-gray-400 mt-2">
                {tab === 'image' ? (images.length > 1 ? `캐러셀 ${images.length}장` : '단일 이미지') : '릴스'}
              </p>
            </div>

            {/* Caption & Controls */}
            <div className="flex-1 max-w-md space-y-4">
              {/* Tone */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1.5">톤 선택</p>
                <div className="flex gap-2">
                  {([['casual', '😊 캐주얼'], ['trendy', '✨ 트렌디'], ['professional', '💼 전문적']] as [Tone, string][]).map(([t, label]) => (
                    <button key={t} onClick={() => setTone(t)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${tone === t ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Caption */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-gray-600">캡션</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${charCount > 2000 ? 'text-red-500' : 'text-gray-400'}`}>{charCount}/2200</span>
                    <button onClick={() => generateCaption()} disabled={generating || (!selectedArticle)}
                      className="px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-1">
                      {generating ? (
                        <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />생성 중</>
                      ) : '✨ AI 생성'}
                    </button>
                  </div>
                </div>
                {genError && <p className="text-xs text-red-500 mb-1">{genError}</p>}
                <textarea
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  rows={10}
                  placeholder="인스타그램 캡션을 작성하거나 AI로 생성하세요...&#10;&#10;블로그 글을 선택하면 자동으로 인스타 스타일로 요약됩니다."
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-400 resize-none"
                />
              </div>

              {/* Hashtag quick-add */}
              {caption && (
                <div className="flex flex-wrap gap-1">
                  {['#일상', '#감성', '#소통', '#맞팔', '#인스타그램', '#daily', '#lifestyle'].map(tag => (
                    <button key={tag} onClick={() => setCaption(prev => prev.includes(tag) ? prev : prev + '\n' + tag)}
                      className="text-xs px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full hover:bg-purple-100 border border-purple-200">
                      {tag}
                    </button>
                  ))}
                </div>
              )}

              {/* Publish Result */}
              {publishResult && (
                <div className={`p-4 rounded-xl border text-sm ${publishResult.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  {publishResult.ok ? (
                    <div>
                      <p className="font-semibold">✅ 인스타그램 발행 완료!</p>
                      {publishResult.url && <a href={publishResult.url} target="_blank" rel="noopener noreferrer" className="text-xs underline mt-1 block">{publishResult.url}</a>}
                    </div>
                  ) : (
                    <div>
                      <p className="font-semibold">❌ 발행 실패</p>
                      <p className="text-xs mt-0.5">{publishResult.error}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Publish Bar */}
      <div className="bg-white border-t border-gray-200 px-6 py-4 flex items-center gap-4">
        <div className="flex-1">
          {tab === 'image'
            ? <p className="text-sm text-gray-600">이미지 <span className="font-semibold text-purple-600">{images.length}장</span> · 캡션 <span className="font-semibold">{charCount}자</span></p>
            : <p className="text-sm text-gray-600">영상: <span className="font-semibold text-purple-600">{videoUrl ? '선택됨' : '미선택'}</span> · BGM: {BGM_TRACKS.find(t => t.id === bgm)?.label}</p>
          }
        </div>
        <button
          onClick={publish}
          disabled={publishing || !caption.trim() || (tab === 'image' ? images.length === 0 : !videoUrl)}
          className="px-8 py-2.5 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white rounded-xl font-bold text-sm hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-2"
        >
          {publishing ? (
            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />발행 중...</>
          ) : (
            <>📱 인스타그램 발행</>
          )}
        </button>
      </div>

      {/* Click outside to close */}
      {showArticleList && <div className="fixed inset-0 z-10" onClick={() => setShowArticleList(false)} />}
    </div>
  );
}
