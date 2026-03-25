'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { CardSlide } from './types';

const CardNewsPlayer = dynamic(() => import('./CardNewsPlayer'), { ssr: false });

type Tab = 'image' | 'reels' | 'cardnews';
type Tone = 'casual' | 'professional' | 'trendy';
type CardTheme = 'blue' | 'dark' | 'warm' | 'green' | 'purple' | 'neon' | 'minimal' | 'sunset';
type ImgItem = { id: string; url: string; thumb: string; source: 'pixabay' | 'upload' | 'blog' | 'card'; isVideo?: boolean };
type CardViewMode = 'preview' | 'video';

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

const CARD_THEMES: { key: CardTheme; label: string; bg1: string; bg2: string; accent: string }[] = [
  { key: 'blue',    label: '💙 프로 블루',  bg1: '#1B4FD8', bg2: '#0D1B4A', accent: '#FDB913' },
  { key: 'dark',    label: '🖤 다크',       bg1: '#1a1a2e', bg2: '#0f0f1e', accent: '#e94560' },
  { key: 'warm',    label: '🔴 웜 레드',    bg1: '#C0392B', bg2: '#7B241C', accent: '#F9CA24' },
  { key: 'green',   label: '💚 내추럴',     bg1: '#00796B', bg2: '#004D40', accent: '#FFCA28' },
  { key: 'purple',  label: '💜 퍼플',       bg1: '#6C3483', bg2: '#4A235A', accent: '#F8C471' },
  { key: 'neon',    label: '🌈 네온 사이버', bg1: '#050510', bg2: '#0D0D2B', accent: '#00F5FF' },
  { key: 'minimal', label: '🤍 미니멀 화이트', bg1: '#F8F5F0', bg2: '#EDE8E1', accent: '#E63946' },
  { key: 'sunset',  label: '🌅 선셋 비이브', bg1: '#0F0820', bg2: '#1A0A35', accent: '#FF6B6B' },
];

const THEME_COLORS: Record<CardTheme, { bg1: string; bg2: string; accent: string; text: string; sub: string }> = {
  blue:    { bg1: '#1B4FD8', bg2: '#0D1B4A', accent: '#FDB913', text: '#fff', sub: 'rgba(255,255,255,0.65)' },
  dark:    { bg1: '#1a1a2e', bg2: '#0f0f1e', accent: '#e94560', text: '#fff', sub: 'rgba(255,255,255,0.60)' },
  warm:    { bg1: '#C0392B', bg2: '#7B241C', accent: '#F9CA24', text: '#fff', sub: 'rgba(255,255,255,0.70)' },
  green:   { bg1: '#00796B', bg2: '#004D40', accent: '#FFCA28', text: '#fff', sub: 'rgba(255,255,255,0.65)' },
  purple:  { bg1: '#6C3483', bg2: '#4A235A', accent: '#F8C471', text: '#fff', sub: 'rgba(255,255,255,0.65)' },
  neon:    { bg1: '#050510', bg2: '#0D0D2B', accent: '#00F5FF', text: '#fff', sub: 'rgba(255,255,255,0.75)' },
  minimal: { bg1: '#F8F5F0', bg2: '#EDE8E1', accent: '#E63946', text: '#1a1a2e', sub: '#4a4a6a' },
  sunset:  { bg1: '#0F0820', bg2: '#1A0A35', accent: '#FF6B6B', text: '#fff', sub: 'rgba(255,255,255,0.72)' },
};

/* ── Card Preview Component (CSS-rendered, always 1080×1080 intrinsic) ── */
const PF = '"Pretendard Variable", "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';

function CardPreview({ slide, theme, num, total }: { slide: CardSlide; theme: CardTheme; num: number; total: number }) {
  const c = THEME_COLORS[theme];
  const W = 1080; const H = 1080;

  if (slide.type === 'title') {
    return (
      <div style={{ width: W, height: H, background: `linear-gradient(140deg, ${c.bg1} 0%, ${c.bg2} 100%)`, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: PF }}>
        <div style={{ position: 'absolute', top: -120, right: -120, width: 480, height: 480, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ position: 'absolute', bottom: -60, right: -20, fontSize: 500, fontWeight: 900, color: c.accent, opacity: 0.05, lineHeight: 1 }}>01</div>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '64px 80px 0' }}>
          <div style={{ width: 52, height: 52, background: c.accent, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 23, fontWeight: 900, color: c.bg2 }}>2D</div>
          <span style={{ color: c.sub, fontSize: 28, fontWeight: 700 }}>2days.kr</span>
        </div>
        {/* Center */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 80px', textAlign: 'center' }}>
          <div style={{ width: 180, height: 9, background: c.accent, borderRadius: 5, marginBottom: 56 }} />
          <div style={{ fontSize: 96, fontWeight: 900, color: c.text, lineHeight: 1.1, letterSpacing: -2 }}>{slide.title}</div>
          {slide.body && <div style={{ marginTop: 36, fontSize: 44, color: c.sub, lineHeight: 1.55 }}>{slide.body}</div>}
          <div style={{ marginTop: 64, display: 'flex', gap: 10 }}>
            {Array.from({ length: total }, (_, i) => (
              <div key={i} style={{ width: i === 0 ? 38 : 12, height: 12, borderRadius: 6, background: i === 0 ? c.accent : 'rgba(255,255,255,0.25)' }} />
            ))}
          </div>
        </div>
        <div style={{ height: 16, background: c.accent }} />
      </div>
    );
  }

  if (slide.type === 'brand') {
    const bpts = slide.points?.length > 0 ? slide.points : ['📲 팔로우하고 매일 유용한 정보 받기', '💾 저장해두고 필요할 때 꺼내보기', '🔗 친구에게 공유해서 함께 성장하기'];
    return (
      <div style={{ width: W, height: H, background: `linear-gradient(160deg, ${c.bg2} 0%, ${c.bg1} 55%, ${c.bg2} 100%)`, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: PF }}>
        <div style={{ width: 160, height: 160, background: c.accent, borderRadius: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 72, fontWeight: 900, color: c.bg2, marginBottom: 48 }}>2D</div>
        <div style={{ fontSize: 96, fontWeight: 900, color: c.text }}>{slide.title}</div>
        <div style={{ fontSize: 38, color: c.sub, marginTop: 18 }}>{slide.body || '오늘의 정보, 내일의 성공'}</div>
        <div style={{ width: 120, height: 6, background: c.accent, borderRadius: 3, margin: '52px 0 48px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, width: 880 }}>
          {bpts.slice(0, 3).map((pt, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 24, background: 'rgba(255,255,255,0.09)', borderRadius: 20, padding: '24px 36px' }}>
              <span style={{ fontSize: 38, flexShrink: 0 }}>{pt.slice(0, 2)}</span>
              <span style={{ fontSize: 36, color: c.text, fontWeight: 700 }}>{pt.slice(2).trim()}</span>
            </div>
          ))}
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 16, background: c.accent }} />
      </div>
    );
  }

  // content card
  const pts = slide.points?.length > 0 ? slide.points : slide.body ? [slide.body] : [];
  return (
    <div style={{ width: W, height: H, background: `linear-gradient(160deg, ${c.bg2} 0%, #07101f 100%)`, position: 'relative', overflow: 'hidden', display: 'flex', fontFamily: PF }}>
      {/* Left accent bar */}
      <div style={{ width: 16, background: c.accent, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '60px 68px 60px 56px', position: 'relative' }}>
        {/* Large watermark number */}
        <div style={{ position: 'absolute', bottom: -60, right: -10, fontSize: 520, fontWeight: 900, color: c.accent, opacity: 0.05, lineHeight: 1, userSelect: 'none' }}>{String(num).padStart(2,'0')}</div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 44 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, background: c.accent, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 900, color: c.bg2 }}>2D</div>
            <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: 22, fontWeight: 700 }}>2days.kr</span>
          </div>
          <div style={{ background: c.accent, color: c.bg2, fontSize: 22, fontWeight: 900, padding: '8px 24px', borderRadius: 32 }}>{num} / {total}</div>
        </div>
        {/* Badge + Title */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 22, marginBottom: 20 }}>
          <div style={{ width: 90, height: 90, background: c.accent, borderRadius: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 50, fontWeight: 900, color: c.bg2, flexShrink: 0 }}>{num}</div>
          <div>
            <div style={{ fontSize: 72, fontWeight: 900, color: c.text, lineHeight: 1.15, letterSpacing: -1 }}>{slide.title}</div>
            {slide.body && <div style={{ fontSize: 34, color: c.sub, marginTop: 8, lineHeight: 1.45 }}>{slide.body}</div>}
          </div>
        </div>
        {/* Divider */}
        <div style={{ display: 'flex', marginBottom: 28 }}>
          <div style={{ width: 80, height: 4, background: c.accent, borderRadius: 2 }} />
          <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.08)', marginTop: 1 }} />
        </div>
        {/* Bullet points — fill remaining space evenly */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1, justifyContent: 'space-evenly' }}>
          {pts.slice(0, 5).map((pt, i) => {
            const hasEmoji = pt.length > 1 && /\p{Emoji}/u.test(pt[0] + pt[1]);
            const emo = hasEmoji ? pt.slice(0, 2) : '▶';
            const txt = hasEmoji ? pt.slice(2).trim() : pt;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20, background: 'rgba(255,255,255,0.07)', borderRadius: 18, padding: '22px 28px', borderLeft: `5px solid ${c.accent}` }}>
                <div style={{ width: 58, height: 58, background: `${c.accent}28`, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, flexShrink: 0, border: `2px solid ${c.accent}55` }}>{emo}</div>
                <span style={{ fontSize: 40, color: c.text, lineHeight: 1.5, fontWeight: 700 }}>{txt}</span>
              </div>
            );
          })}
        </div>
        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          {Array.from({ length: total }, (_, i) => (
            <div key={i} style={{ width: i === num - 1 ? 30 : 10, height: 10, borderRadius: 5, background: i === num - 1 ? c.accent : 'rgba(255,255,255,0.22)' }} />
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 16, background: c.accent }} />
    </div>
  );
}

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

  // Card News
  const [cardSlides, setCardSlides] = useState<CardSlide[]>([]);
  const [activeCardIdx, setActiveCardIdx] = useState(0);
  const [cardTheme, setCardTheme] = useState<CardTheme>('blue');
  const [slideCount, setSlideCount] = useState(6);
  const [generatingCards, setGeneratingCards] = useState(false);
  const [cardGenError, setCardGenError] = useState('');
  const [generatingImages, setGeneratingImages] = useState(false);
  const [cardImgProgress, setCardImgProgress] = useState(0);
  const [cardViewMode, setCardViewMode] = useState<CardViewMode>('preview');
  const [cardBgm, setCardBgm] = useState('none');

  // Publish
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ ok?: boolean; url?: string; error?: string } | null>(null);

  // Load Pretendard font once
  useEffect(() => {
    const id = 'pretendard-var';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css';
      document.head.appendChild(link);
    }
  }, []);

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

    if (article.representative_image_url && images.length === 0) {
      setImages([{ id: 'blog_main', url: article.representative_image_url, thumb: article.representative_image_url, source: 'blog' }]);
    }

    if (tab !== 'cardnews') await generateCaption(article.id);
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
    } catch (e) { setGenError(String(e)); }
    setGenerating(false);
  };

  // Card News: generate slides from article
  const generateCardNews = async () => {
    setGeneratingCards(true);
    setCardGenError('');
    try {
      const res = await fetch('/api/insta-service/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: selectedArticle?.id, topic: selectedArticle?.title || imgQuery, slide_count: slideCount }),
      });
      const data = await res.json();
      if (data.slides) { setCardSlides(data.slides); setActiveCardIdx(0); }
      else setCardGenError(data.error || '생성 실패');
    } catch (e) { setCardGenError(String(e)); }
    setGeneratingCards(false);
  };

  // Generate PNG images for each card → upload → add to images[]
  const generateCardImages = async () => {
    if (!cardSlides.length) { alert('먼저 카드 슬라이드를 생성하세요'); return; }
    setGeneratingImages(true);
    setCardImgProgress(0);
    const total = cardSlides.length;
    const newImages: ImgItem[] = [];

    for (let i = 0; i < cardSlides.length; i++) {
      const slide = cardSlides[i];
      const num = slide.type === 'title' ? 1 : slide.type === 'brand' ? total : i + 1;
      const params = new URLSearchParams({
        type: slide.type,
        title: slide.title,
        body: slide.body,
        num: String(num),
        total: String(total),
        theme: cardTheme,
        brand: '2days.kr',
        points: JSON.stringify(slide.points || []),
      });

      try {
        const res = await fetch(`/api/insta-service/card-image?${params}`);
        if (!res.ok) continue;
        const blob = await res.blob();
        const file = new File([blob], `card_${i + 1}.png`, { type: 'image/png' });
        const form = new FormData();
        form.append('file', file);
        const uploadRes = await fetch('/api/sns/media', { method: 'POST', body: form });
        const uploadData = await uploadRes.json();
        if (uploadData.url) {
          newImages.push({ id: `card_${i}_${Date.now()}`, url: uploadData.url, thumb: uploadData.url, source: 'card' });
        }
      } catch { /* skip */ }

      setCardImgProgress(Math.round(((i + 1) / total) * 100));
    }

    if (newImages.length) {
      setImages(newImages);
      setTab('image');
      alert(`✅ ${newImages.length}장의 카드 이미지가 생성되었습니다!\n이미지 포스트 탭에서 확인 후 발행하세요.`);
    } else {
      alert('이미지 생성에 실패했습니다.');
    }
    setGeneratingImages(false);
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
    const res = await fetch('/api/sns/media', { method: 'POST', body: form });
    const data = await res.json();
    if (data.url) {
      setImages(prev => [...prev, {
        id: `upload_${Date.now()}`,
        url: data.url,
        thumb: data.url,
        source: 'upload',
        isVideo: data.isVideo,
      }]);
    }
    setUploadingImg(false);
  };

  // X.com video fetch
  const fetchXVideo = async () => {
    if (!xUrl.trim()) return;
    setFetchingX(true);
    const tweetId = xUrl.match(/status\/(\d+)/)?.[1];
    if (tweetId) setVideoUrl(`https://video.twimg.com/tweet_video/${tweetId}.mp4`);
    else setVideoUrl(xUrl);
    setFetchingX(false);
  };

  // Publish
  const publish = async () => {
    if (!caption.trim()) { alert('캡션을 입력하세요'); return; }
    // 이미지/영상 탭 모두 지원: 영상이 포함된 경우 단독 발행
    let mediaUrls: string[];
    if (tab === 'reels') {
      mediaUrls = videoUrl ? [videoUrl] : [];
    } else {
      // 이미지 탭: 영상 파일이 있으면 첫 번째 영상으로 릴스 발행, 없으면 이미지 캐러셀
      const videoItem = images.find(i => i.isVideo);
      mediaUrls = videoItem ? [videoItem.url] : images.map(i => i.url);
    }
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
          <p className="text-xs text-gray-500">블로그 → 인스타 캡션 + 이미지/릴스/카드뉴스 자동 생성 & 발행</p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          {/* Tab */}
          <div className="flex gap-1 p-3 border-b border-gray-100">
            {([
              ['image', '🖼️ 이미지'],
              ['reels', '🎬 릴스'],
              ['cardnews', '📰 카드뉴스'],
            ] as [Tab, string][]).map(([t, label]) => (
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
                  {tab !== 'cardnews' && (
                    <button onClick={() => generateCaption()} disabled={generating}
                      className="mt-1 text-xs text-purple-600 hover:text-purple-800 font-medium disabled:opacity-50">
                      {generating ? '생성 중...' : '🔄 캡션 재생성'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── IMAGE TAB ── */}
          {tab === 'image' && (
            <>
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

              <div className="p-3 border-b border-gray-100">
                <label className="flex items-center gap-2 cursor-pointer border border-dashed border-gray-300 rounded-lg p-2.5 hover:border-purple-400 hover:bg-purple-50 transition-colors">
                  <span>📎</span>
                  <span className="text-xs text-gray-500">{uploadingImg ? '업로드 중...' : '이미지 / 동영상 업로드 (이미지 최대 10개, 동영상은 릴스로 발행)'}</span>
                  <input ref={imgFileRef} type="file" accept="image/*,video/mp4,video/quicktime,video/mov" multiple className="hidden"
                    onChange={async e => { for (const f of Array.from(e.target.files || [])) await uploadImage(f); e.target.value = ''; }} />
                </label>
              </div>

              {images.length > 0 && (
                <div className="p-3 border-b border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-600">선택된 이미지 ({images.length}/10)</p>
                    {images.length > 1 && <span className="text-xs text-gray-400">캐러셀로 발행</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {images.map((img, i) => (
                      <div key={img.id} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 group bg-black">
                        {img.isVideo ? (
                          <div className="w-full h-full flex items-center justify-center bg-gray-900">
                            <video src={img.url} className="w-full h-full object-contain" muted playsInline />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-8 h-8 bg-black/60 rounded-full flex items-center justify-center text-white text-sm">▶</div>
                            </div>
                          </div>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img.thumb} alt="" className="w-full h-full object-contain bg-black" />
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button onClick={() => removeImage(img.id)} className="w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">✕</button>
                        </div>
                        <div className="absolute top-1 left-1 w-4 h-4 bg-black/60 text-white text-xs rounded flex items-center justify-center">{i + 1}</div>
                        {img.isVideo && <div className="absolute bottom-1 right-1 bg-orange-500 text-white text-xs px-1 rounded">🎬</div>}
                        {img.source === 'card' && !img.isVideo && <div className="absolute bottom-1 right-1 bg-blue-600 text-white text-xs px-1 rounded">카드</div>}
                        {img.source === 'blog' && !img.isVideo && <div className="absolute bottom-1 right-1 bg-purple-500 text-white text-xs px-1 rounded">블로그</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── REELS TAB ── */}
          {tab === 'reels' && (
            <>
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

              <div className="p-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-600 mb-1.5">🔗 직접 영상 URL</p>
                <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
                  placeholder="mp4 영상 URL..."
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-400" />
              </div>

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

          {/* ── CARD NEWS TAB ── */}
          {tab === 'cardnews' && (
            <>
              {/* Theme selector */}
              <div className="p-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-600 mb-2">🎨 브랜드 테마</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {CARD_THEMES.map(t => (
                    <button key={t.key} onClick={() => setCardTheme(t.key)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border-2 transition-all ${cardTheme === t.key ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="flex gap-1 flex-shrink-0">
                        <div className="w-4 h-4 rounded" style={{ background: t.bg1 }} />
                        <div className="w-4 h-4 rounded" style={{ background: t.bg2 }} />
                        <div className="w-4 h-4 rounded" style={{ background: t.accent }} />
                      </div>
                      <span className="text-xs font-medium text-gray-700">{t.label}</span>
                      {cardTheme === t.key && <span className="ml-auto text-purple-500 text-xs">✓</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Slide count */}
              <div className="p-3 border-b border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-600">슬라이드 수</p>
                  <span className="text-xs font-bold text-purple-600">{slideCount}장</span>
                </div>
                <input type="range" min={4} max={10} value={slideCount} onChange={e => setSlideCount(Number(e.target.value))}
                  className="w-full accent-purple-600" />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>4장</span><span>10장</span>
                </div>
              </div>

              {/* Generate button */}
              <div className="p-3 border-b border-gray-100">
                <button onClick={generateCardNews} disabled={generatingCards || (!selectedArticle && !imgQuery)}
                  className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2">
                  {generatingCards ? (
                    <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />AI 생성 중...</>
                  ) : '✨ AI 카드뉴스 자동 생성'}
                </button>
                {cardGenError && <p className="text-xs text-red-500 mt-1">{cardGenError}</p>}
                {!selectedArticle && !imgQuery && <p className="text-xs text-gray-400 mt-1 text-center">블로그 글을 선택하거나 키워드를 입력하세요</p>}
              </div>

              {/* Slide list */}
              {cardSlides.length > 0 && (
                <div className="p-3 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-600 mb-2">슬라이드 목록 (클릭하여 편집)</p>
                  <div className="space-y-1.5">
                    {cardSlides.map((slide, i) => {
                      const c = THEME_COLORS[cardTheme];
                      const isActive = activeCardIdx === i;
                      return (
                        <div key={i}
                          onClick={() => setActiveCardIdx(i)}
                          className={`flex items-start gap-2 p-2 rounded-lg border-2 cursor-pointer transition-all ${isActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                          {/* Mini preview */}
                          <div className="flex-shrink-0" style={{ width: 40, height: 40, borderRadius: 4, overflow: 'hidden', background: `linear-gradient(135deg, ${c.bg1}, ${c.bg2})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ color: c.accent, fontSize: 14, fontWeight: 900 }}>{i + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 mb-0.5">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${slide.type === 'title' ? 'bg-purple-100 text-purple-700' : slide.type === 'brand' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                {slide.type === 'title' ? '타이틀' : slide.type === 'brand' ? '브랜드' : `내용 ${i}`}
                              </span>
                            </div>
                            <p className="text-xs font-medium text-gray-800 truncate">{slide.title}</p>
                            <p className="text-xs text-gray-400 truncate">{slide.body}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Edit active slide */}
              {cardSlides.length > 0 && (
                <div className="p-3 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-600 mb-2">✏️ 슬라이드 편집 ({activeCardIdx + 1}/{cardSlides.length})</p>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-gray-500">제목</label>
                      <input
                        value={cardSlides[activeCardIdx]?.title || ''}
                        onChange={e => setCardSlides(prev => prev.map((s, i) => i === activeCardIdx ? { ...s, title: e.target.value } : s))}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400 mt-0.5"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">부제목</label>
                      <input
                        value={cardSlides[activeCardIdx]?.body || ''}
                        onChange={e => setCardSlides(prev => prev.map((s, i) => i === activeCardIdx ? { ...s, body: e.target.value } : s))}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400 mt-0.5"
                      />
                    </div>
                    {cardSlides[activeCardIdx]?.type === 'content' && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-gray-500">포인트 (한 줄씩 입력)</label>
                          <button
                            onClick={() => setCardSlides(prev => prev.map((s, i) => i === activeCardIdx ? { ...s, points: [...(s.points || []), '✅ 새 포인트'] } : s))}
                            className="text-xs text-blue-600 hover:text-blue-800">+ 추가</button>
                        </div>
                        {(cardSlides[activeCardIdx]?.points || []).map((pt, pi) => (
                          <div key={pi} className="flex gap-1 mb-1">
                            <input
                              value={pt}
                              onChange={e => setCardSlides(prev => prev.map((s, i) => i === activeCardIdx ? { ...s, points: s.points.map((p, j) => j === pi ? e.target.value : p) } : s))}
                              className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
                            />
                            <button
                              onClick={() => setCardSlides(prev => prev.map((s, i) => i === activeCardIdx ? { ...s, points: s.points.filter((_, j) => j !== pi) } : s))}
                              className="text-xs text-red-400 hover:text-red-600 px-1">✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Generate card images */}
              {cardSlides.length > 0 && (
                <div className="p-3">
                  <button onClick={generateCardImages} disabled={generatingImages}
                    className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2">
                    {generatingImages ? (
                      <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />{cardImgProgress}% 이미지 생성 중...</>
                    ) : '🖼️ PNG 이미지로 변환 → 발행 준비'}
                  </button>
                  <p className="text-xs text-gray-400 text-center mt-1">이미지 생성 후 이미지 포스트 탭에서 발행</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Center - Preview & Caption */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          <div className="flex-1 flex items-start justify-center p-6 gap-6">

            {/* Card News Preview */}
            {tab === 'cardnews' ? (
              <div className="flex flex-col gap-4 w-full max-w-4xl">
                {/* Mode toggle */}
                {cardSlides.length > 0 && (
                  <div className="flex gap-2 bg-gray-100 rounded-xl p-1 self-start">
                    <button onClick={() => setCardViewMode('preview')}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${cardViewMode === 'preview' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                      🖼️ 슬라이드 보기
                    </button>
                    <button onClick={() => setCardViewMode('video')}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${cardViewMode === 'video' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                      🎬 영상 미리보기 (Remotion)
                    </button>
                  </div>
                )}

                {cardSlides.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white text-3xl font-black mb-6 shadow-xl">2D</div>
                    <h2 className="text-xl font-bold text-gray-800 mb-2">2days.kr 카드뉴스</h2>
                    <p className="text-gray-500 text-sm mb-1">블로그 글을 선택하고 AI로 카드뉴스를 자동 생성하세요</p>
                    <p className="text-gray-400 text-xs">정적 이미지 카드뉴스 + Remotion 애니메이션 영상 모두 지원</p>
                    <div className="mt-8 flex gap-2">
                      {CARD_THEMES.map(t => (
                        <div key={t.key} className="w-16 h-16 rounded-xl shadow-md flex items-center justify-center text-white font-black text-sm"
                          style={{ background: `linear-gradient(135deg, ${t.bg1}, ${t.bg2})`, border: `3px solid ${t.accent}` }}>
                          2D
                        </div>
                      ))}
                    </div>
                  </div>

                ) : cardViewMode === 'video' ? (
                  /* ── REMOTION VIDEO MODE ── */
                  <CardNewsPlayer
                    slides={cardSlides}
                    theme={cardTheme}
                    bgm={cardBgm}
                    caption={caption}
                    onBgmChange={setCardBgm}
                  />

                ) : (
                  /* ── STATIC SLIDE PREVIEW MODE ── */
                  <div className="flex gap-6 w-full">
                    {/* Big preview */}
                    <div className="flex-shrink-0">
                      <div className="text-xs text-gray-500 mb-2 text-center font-medium">
                        {activeCardIdx + 1} / {cardSlides.length} — {cardSlides[activeCardIdx]?.type === 'title' ? '타이틀 카드' : cardSlides[activeCardIdx]?.type === 'brand' ? '브랜드 카드' : '내용 카드'}
                      </div>
                      {/* Correct scale container: outer clips to scaled size, inner at natural 1080px */}
                      <div style={{ width: 454, height: 454, overflow: 'hidden', borderRadius: 12, flexShrink: 0 }}>
                        <div style={{ width: 1080, height: 1080, transform: 'scale(0.42)', transformOrigin: '0 0' }}>
                          <CardPreview
                            slide={cardSlides[activeCardIdx]}
                            theme={cardTheme}
                            num={activeCardIdx + 1}
                            total={cardSlides.length}
                          />
                        </div>
                      </div>
                      {/* Nav arrows */}
                      <div className="flex items-center justify-center gap-3 mt-3">
                        <button onClick={() => setActiveCardIdx(i => Math.max(0, i - 1))} disabled={activeCardIdx === 0}
                          className="px-3 py-1.5 bg-gray-200 rounded-lg text-sm disabled:opacity-30 hover:bg-gray-300">◀</button>
                        <span className="text-xs text-gray-500">{activeCardIdx + 1} / {cardSlides.length}</span>
                        <button onClick={() => setActiveCardIdx(i => Math.min(cardSlides.length - 1, i + 1))} disabled={activeCardIdx === cardSlides.length - 1}
                          className="px-3 py-1.5 bg-gray-200 rounded-lg text-sm disabled:opacity-30 hover:bg-gray-300">▶</button>
                      </div>
                    </div>

                    {/* Thumbnail strip */}
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-gray-600 mb-3">전체 슬라이드</p>
                      <div className="grid grid-cols-3 gap-2.5">
                        {cardSlides.map((slide, i) => (
                          <button key={i} onClick={() => setActiveCardIdx(i)}
                            className={`relative rounded-lg overflow-hidden border-2 transition-all ${activeCardIdx === i ? 'border-blue-500 shadow-md' : 'border-gray-200 hover:border-gray-400'}`}
                            style={{ aspectRatio: '1/1' }}>
                            <div style={{ width: 1080 * 0.22, height: 1080 * 0.22, overflow: 'hidden', pointerEvents: 'none' }}>
                              <div style={{ width: 1080, height: 1080, transform: 'scale(0.22)', transformOrigin: '0 0' }}>
                                <CardPreview slide={slide} theme={cardTheme} num={i + 1} total={cardSlides.length} />
                              </div>
                            </div>
                            <div className="absolute bottom-1 left-1 right-1 bg-black/50 rounded text-white text-xs text-center py-0.5">
                              {i + 1} {slide.type === 'brand' ? '🏷️' : ''}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Phone mockup */}
                <div className="flex-shrink-0">
                  <div className="w-64 bg-black rounded-[2.5rem] p-3 shadow-2xl border-4 border-gray-800">
                    <div className="bg-white rounded-[2rem] overflow-hidden" style={{ aspectRatio: '9/16' }}>
                      {tab === 'image' ? (
                        images.length > 0 ? (
                          <div className="relative w-full h-full bg-black">
                            {images[0].isVideo ? (
                              <video src={images[0].url} className="w-full h-full object-contain" muted playsInline loop autoPlay />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={images[0].url} alt="" className="w-full h-full object-contain" />
                            )}
                            {images.length > 1 && (
                              <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">1/{images.length}</div>
                            )}
                            {images[0].isVideo && (
                              <div className="absolute top-2 left-2 bg-orange-500/80 text-white text-xs px-2 py-0.5 rounded-full">🎬 릴스</div>
                            )}
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
                                <p className="text-center text-sm font-bold drop-shadow-lg" style={{ color: overlayColor }}>{overlayText}</p>
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
                      placeholder="인스타그램 캡션을 작성하거나 AI로 생성하세요..."
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-400 resize-none"
                    />
                  </div>

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
              </>
            )}
          </div>
        </div>
      </div>

      {/* Publish Bar */}
      {tab !== 'cardnews' && (
        <div className="bg-white border-t border-gray-200 px-6 py-4 flex items-center gap-4">
          <div className="flex-1">
            {tab === 'image'
              ? (() => {
                  const videoItem = images.find(i => i.isVideo);
                  return videoItem
                    ? <p className="text-sm text-gray-600">🎬 <span className="font-semibold text-orange-500">릴스(영상)</span>로 발행 · 캡션 <span className="font-semibold">{charCount}자</span></p>
                    : <p className="text-sm text-gray-600">이미지 <span className="font-semibold text-purple-600">{images.length}장</span> · 캡션 <span className="font-semibold">{charCount}자</span></p>;
                })()
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
            ) : '📱 인스타그램 발행'}
          </button>
        </div>
      )}

      {showArticleList && <div className="fixed inset-0 z-10" onClick={() => setShowArticleList(false)} />}
    </div>
  );
}
