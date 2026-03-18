'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

const BLOG_ID = '7951763866955162015';

// ── Types ──────────────────────────────────────────────────────────────────
interface BlogInfo { id: string; name: string; url: string; postCount: number; }
interface StatusData { connected: boolean; email?: string; blog?: BlogInfo | null; }
interface GeneratedPost { title: string; content: string; metaDescription: string; labels: string[]; }
interface HistoryPost {
  id: string; post_id: string | null; title: string | null; keyword: string | null;
  content_type: string | null; labels: string[] | null; status: string | null;
  blogger_url: string | null; published_at: string | null; created_at: string;
}
interface BloggerPost { id: string; title: string; url: string; status: string; published: string; labels: string[]; }
interface NotionProduct {
  id: string; name: string; price: number; partnerLink: string; originalUrl: string;
  review1: string; review2: string;
  image1: string; image2: string; image3: string; image4: string; image5: string;
}
interface NotionDB { id: string; title: string; url: string; last_edited: string; }
interface NotionItem { id: string; title: string; url: string; coverUrl: string; last_edited: string; }
interface ImageResult { id: number; url: string; thumb: string; tags: string; author: string; }
interface AgodaHotel {
  hotelId: number; hotelName: string; starRating: number; reviewScore: number; reviewCount: number;
  currency: string; dailyRate: number; crossedOutRate: number; discountPercentage: number;
  imageURL: string; landingURL: string; includeBreakfast: boolean; freeWifi: boolean;
}
interface AgodaCity { id: number; name: string; country: string; emoji: string; }

const AGODA_CITIES: AgodaCity[] = [
  { id: 17193, name: '발리 쿠타', country: '인도네시아', emoji: '🌴' },
  { id: 9395,  name: '방콕', country: '태국', emoji: '🏮' },
  { id: 9443,  name: '푸켓', country: '태국', emoji: '🏖️' },
  { id: 9407,  name: '치앙마이', country: '태국', emoji: '🌸' },
  { id: 10303, name: '도쿄', country: '일본', emoji: '🗼' },
  { id: 10294, name: '오사카', country: '일본', emoji: '🏯' },
  { id: 10285, name: '교토', country: '일본', emoji: '⛩️' },
  { id: 10267, name: '후쿠오카', country: '일본', emoji: '🍜' },
  { id: 10318, name: '삿포로', country: '일본', emoji: '⛄' },
  { id: 6139,  name: '싱가포르', country: '싱가포르', emoji: '🦁' },
  { id: 1746,  name: '홍콩', country: '홍콩', emoji: '🌆' },
  { id: 9649,  name: '세부', country: '필리핀', emoji: '🏝️' },
  { id: 14988, name: '호치민', country: '베트남', emoji: '🛵' },
  { id: 14997, name: '다낭', country: '베트남', emoji: '🌊' },
  { id: 15020, name: '나트랑', country: '베트남', emoji: '🏄' },
  { id: 14977, name: '하노이', country: '베트남', emoji: '🎋' },
  { id: 16655, name: '쿠알라룸푸르', country: '말레이시아', emoji: '🏙️' },
  { id: 2371,  name: '두바이', country: 'UAE', emoji: '🌇' },
  { id: 3956,  name: '파리', country: '프랑스', emoji: '🗺️' },
  { id: 3797,  name: '뉴욕', country: '미국', emoji: '🗽' },
];

type Tab = 'write' | 'coupang' | 'notion' | 'agoda' | 'history' | 'status';
type ContentType = 'product' | 'info';
type ImageSource = 'pixabay' | 'pexels' | 'dalle' | 'upload';

// ── Thumbnail Generator Component ─────────────────────────────────────────────
interface ThumbnailGeneratorProps {
  defaultTitle: string;
  defaultKeyword: string;
  onInsert: (imageUrl: string) => void;
}

function ThumbnailGenerator({ defaultTitle, defaultKeyword, onInsert }: ThumbnailGeneratorProps) {
  const [bgQuery, setBgQuery] = useState('');
  const [bgImages, setBgImages] = useState<{ id: number; url: string; thumb: string }[]>([]);
  const [bgLoading, setBgLoading] = useState(false);
  const [selectedBg, setSelectedBg] = useState('');
  const [mainTitle, setMainTitle] = useState('');
  const [subTitle, setSubTitle] = useState('');
  const [colorScheme, setColorScheme] = useState<'dark' | 'blue' | 'green'>('dark');
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef2 = useRef<HTMLInputElement>(null);

  // Auto-fill from props
  useEffect(() => {
    if (defaultTitle && !mainTitle) {
      // Split long title into main + sub
      if (defaultTitle.length > 20) {
        const mid = Math.ceil(defaultTitle.length * 0.6);
        setMainTitle(defaultTitle.slice(0, mid));
        setSubTitle(defaultTitle.slice(mid));
      } else {
        setMainTitle(defaultTitle);
        setSubTitle(defaultKeyword);
      }
    }
  }, [defaultTitle, defaultKeyword]); // eslint-disable-line

  async function searchBgImages() {
    const q = bgQuery || defaultKeyword || defaultTitle;
    if (!q) return;
    setBgLoading(true);
    try {
      const res = await fetch(`/api/shorts/images?q=${encodeURIComponent(q)}&source=pixabay&per_page=9`);
      const data = await res.json();
      setBgImages((data.images || []).map((img: { id: number; url: string; thumb: string }) => ({ id: img.id, url: img.url, thumb: img.thumb })));
    } catch { /* ignore */ }
    finally { setBgLoading(false); }
  }

  function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    let currentLine = '';
    for (const char of text) {
      const testLine = currentLine + char;
      if (ctx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  async function generateThumbnail() {
    const bgSrc = selectedBg;
    if (!bgSrc || !mainTitle) { alert('배경 이미지와 제목을 입력해주세요.'); return; }

    setGenerating(true);
    try {
      const canvas = canvasRef.current!;
      canvas.width = 1080;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d')!;

      // 1. Load background image via proxy
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const proxyUrl = bgSrc.startsWith('http') ? `/api/proxy-image?url=${encodeURIComponent(bgSrc)}` : bgSrc;
      img.src = proxyUrl;
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('이미지 로드 실패'));
        setTimeout(() => rej(new Error('이미지 로드 타임아웃')), 15000);
      });

      // Cover-fit draw
      const scale = Math.max(1080 / img.naturalWidth, 1080 / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (1080 - w) / 2, (1080 - h) / 2, w, h);

      // 2. Light dark overlay (투명도 낮게)
      const grad = ctx.createLinearGradient(0, 0, 0, 1080);
      if (colorScheme === 'blue') {
        grad.addColorStop(0, 'rgba(0,10,40,0.50)');
        grad.addColorStop(0.5, 'rgba(0,15,50,0.65)');
        grad.addColorStop(1, 'rgba(0,10,40,0.55)');
      } else if (colorScheme === 'green') {
        grad.addColorStop(0, 'rgba(0,20,10,0.50)');
        grad.addColorStop(0.5, 'rgba(0,25,15,0.65)');
        grad.addColorStop(1, 'rgba(0,20,10,0.55)');
      } else {
        // 다크: 중앙만 살짝 더 어둡게 (비네팅 효과)
        grad.addColorStop(0, 'rgba(0,0,0,0.48)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0.62)');
        grad.addColorStop(1, 'rgba(0,0,0,0.52)');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1080);

      // 비네팅 (테두리 어둡게)
      const vignette = ctx.createRadialGradient(540, 540, 300, 540, 540, 760);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, 1080, 1080);

      // 3. Gold top bar
      ctx.fillStyle = '#f0b429';
      ctx.fillRect(0, 0, 1080, 10);

      // 4. Main title — blur halo + crisp white text
      const fontSize = mainTitle.length <= 8 ? 120 : mainTitle.length <= 14 ? 100 : mainTitle.length <= 20 ? 86 : 72;
      ctx.font = `bold ${fontSize}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "나눔고딕", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const lines = wrapText(ctx, mainTitle, 960);
      const lineHeight = fontSize * 1.3;
      const totalTextH = lines.length * lineHeight;
      const subH = subTitle ? 80 : 0;
      const totalH = totalTextH + subH + (subTitle ? 30 : 0);
      const startY = (1080 - totalH) / 2;

      const drawTextWithBlur = (text: string, x: number, y: number, size: number) => {
        ctx.font = `bold ${size}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;

        // 1단계: 넓은 blur 레이어 (주변 번짐 효과)
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.95)';
        ctx.shadowBlur = 45;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        for (let i = 0; i < 6; i++) ctx.fillText(text, x, y);
        ctx.restore();

        // 2단계: 중간 blur (그림자 강화)
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,1)';
        ctx.shadowBlur = 18;
        ctx.fillStyle = 'rgba(20,20,20,0.8)';
        for (let i = 0; i < 3; i++) ctx.fillText(text, x, y);
        ctx.restore();

        // 3단계: 선명한 흰 텍스트 (no shadow)
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, x, y);
        ctx.restore();
      };

      lines.forEach((line, i) => {
        const y = startY + i * lineHeight + lineHeight / 2;
        drawTextWithBlur(line, 540, y, fontSize);
      });

      // 5. Subtitle — blur 효과 동일 적용, 색상만 다르게
      if (subTitle) {
        const subFontSize = 54;
        const subY = startY + totalTextH + 45;

        // blur halo
        ctx.save();
        ctx.font = `bold ${subFontSize}px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
        ctx.shadowColor = 'rgba(0,0,0,0.95)';
        ctx.shadowBlur = 30;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        for (let i = 0; i < 5; i++) ctx.fillText(subTitle, 540, subY);
        ctx.restore();

        // 선명한 텍스트
        ctx.save();
        ctx.font = `bold ${subFontSize}px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
        ctx.shadowBlur = 0;
        ctx.fillStyle = colorScheme === 'green' ? '#86efac' : colorScheme === 'blue' ? '#93c5fd' : '#e2e8f0';
        ctx.fillText(subTitle, 540, subY);
        ctx.restore();
      }

      // 6. Thin bottom bar
      ctx.fillStyle = '#f0b429';
      ctx.fillRect(0, 1070, 1080, 10);

      // Preview
      const url = canvas.toDataURL('image/png');
      setPreviewUrl(url);
    } catch (e) {
      alert('썸네일 생성 오류: ' + String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function handleUploadAndInsert() {
    if (!previewUrl) return;
    setUploading(true);
    try {
      const res = await fetch(previewUrl);
      const blob = await res.blob();
      const file = new File([blob], `thumbnail_${Date.now()}.png`, { type: 'image/png' });
      const form = new FormData();
      form.append('file', file);
      const uploadRes = await fetch('/api/blogger/upload-image', { method: 'POST', body: form });
      const data = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(data.error || '업로드 실패');
      onInsert(data.url);
    } catch {
      // Fallback: insert data URL directly
      onInsert(previewUrl);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-gray-800 rounded-xl p-5 space-y-4 border border-gray-700">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200">🖼 대표 이미지 자동 생성</h3>
        <div className="flex gap-2">
          {(['dark', 'blue', 'green'] as const).map(c => (
            <button key={c} onClick={() => setColorScheme(c)}
              className={`w-6 h-6 rounded-full border-2 transition-all ${colorScheme === c ? 'border-white scale-125' : 'border-transparent'} ${c === 'dark' ? 'bg-gray-800' : c === 'blue' ? 'bg-blue-800' : 'bg-green-800'}`}
              title={c} />
          ))}
        </div>
      </div>

      {/* Background image search */}
      <div>
        <label className="text-xs text-gray-400 mb-1.5 block">배경 이미지 선택</label>
        <div className="flex gap-2 mb-2">
          <input type="text" value={bgQuery} onChange={e => setBgQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchBgImages()}
            placeholder={defaultKeyword || '배경 이미지 검색어 (영어 권장)'}
            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
          <button onClick={searchBgImages} disabled={bgLoading}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 text-sm px-4 py-2 rounded-lg">
            {bgLoading ? '...' : '검색'}
          </button>
          <button onClick={() => fileInputRef2.current?.click()}
            className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm px-3 py-2 rounded-lg" title="파일 업로드">
            ⬆️
          </button>
        </div>
        <input ref={fileInputRef2} type="file" accept="image/*" className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) { const reader = new FileReader(); reader.onload = ev => { if (ev.target?.result) setSelectedBg(ev.target.result as string); }; reader.readAsDataURL(f); }
          }}
        />
        {bgImages.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {bgImages.map(img => (
              <button key={img.id} onClick={() => setSelectedBg(img.url)}
                className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${selectedBg === img.url ? 'border-indigo-500 ring-2 ring-indigo-500' : 'border-transparent hover:border-gray-500'}`}>
                <img src={img.thumb} alt="" className="w-full h-full object-cover"/>
              </button>
            ))}
          </div>
        )}
        {selectedBg && bgImages.length === 0 && (
          <div className="text-xs text-green-400 mt-1">배경 이미지 선택됨</div>
        )}
      </div>

      {/* Text inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">메인 제목 (크게 표시)</label>
          <textarea value={mainTitle} onChange={e => setMainTitle(e.target.value)} rows={2}
            placeholder="예: 월급만으로는&#10;답이 없다면?"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">서브 제목 (작게 표시, 선택)</label>
          <textarea value={subTitle} onChange={e => setSubTitle(e.target.value)} rows={2}
            placeholder="예: 월배당 ETF로 현금흐름 만들기"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden"/>

      <div className="flex gap-3">
        <button onClick={generateThumbnail} disabled={generating || !selectedBg || !mainTitle}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm">
          {generating ? '생성 중...' : '✨ 썸네일 생성'}
        </button>
      </div>

      {/* Preview */}
      {previewUrl && (
        <div className="space-y-3">
          <div className="text-xs text-gray-400">미리보기</div>
          <img src={previewUrl} alt="thumbnail preview" className="w-full max-w-xs mx-auto rounded-xl border border-gray-600 block"/>
          <div className="flex gap-2">
            <a href={previewUrl} download={`thumbnail_${Date.now()}.png`}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium py-2.5 rounded-xl text-center transition-colors">
              ⬇️ 다운로드
            </a>
            <button onClick={handleUploadAndInsert} disabled={uploading}
              className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">
              {uploading ? '업로드 중...' : '📎 글 맨 위에 삽입'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function BloggerPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>('write');
  const [blogStatus, setBlogStatus] = useState<StatusData | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // ── Write / Editor state ───────────────────────────────────────────────
  const [contentType, setContentType] = useState<ContentType>('product');
  const [keyword, setKeyword] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedPost | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editLabels, setEditLabels] = useState<string[]>([]);
  const [editorMode, setEditorMode] = useState<'edit' | 'preview'>('edit');
  const [isDraft, setIsDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ url?: string; error?: string } | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);

  // ── Image modal state ──────────────────────────────────────────────────
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageSource, setImageSource] = useState<ImageSource>('pixabay');
  const [imageQuery, setImageQuery] = useState('');
  const [images, setImages] = useState<ImageResult[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState('');
  const [dallePrompt, setDallePrompt] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Coupang tab state ──────────────────────────────────────────────────
  const [cpApiKey, setCpApiKey] = useState('');
  const [cpDbId, setCpDbId] = useState('');
  const [cpShowSettings, setCpShowSettings] = useState(false);
  const [cpProducts, setCpProducts] = useState<NotionProduct[]>([]);
  const [cpLoading, setCpLoading] = useState(false);
  const [cpError, setCpError] = useState('');
  const [cpSelected, setCpSelected] = useState<NotionProduct | null>(null);
  const [cpGenerating, setCpGenerating] = useState(false);

  // ── Notion tab state ───────────────────────────────────────────────────
  const [ntDbId, setNtDbId] = useState('');
  const [ntShowSettings, setNtShowSettings] = useState(false);
  const [ntDatabases, setNtDatabases] = useState<NotionDB[]>([]);
  const [ntDbLoading, setNtDbLoading] = useState(false);
  const [ntItems, setNtItems] = useState<NotionItem[]>([]);
  const [ntItemsLoading, setNtItemsLoading] = useState(false);
  const [ntError, setNtError] = useState('');
  const [ntGenerating, setNtGenerating] = useState<string | null>(null);

  // ── Agoda tab state ────────────────────────────────────────────────────
  const [agCity, setAgCity] = useState<AgodaCity | null>(null);
  const [agCustomCityId, setAgCustomCityId] = useState('');
  const [agMinStars, setAgMinStars] = useState(0);
  const [agMinReview, setAgMinReview] = useState(0);
  const [agMaxResult, setAgMaxResult] = useState(10);
  const [agSortBy, setAgSortBy] = useState('AllGuestsReviewScore');
  const [agHotels, setAgHotels] = useState<AgodaHotel[]>([]);
  const [agLoading, setAgLoading] = useState(false);
  const [agError, setAgError] = useState('');
  const [agCheckIn, setAgCheckIn] = useState('');
  const [agCheckOut, setAgCheckOut] = useState('');
  const [agSelected, setAgSelected] = useState<Set<number>>(new Set());
  const [agTravelStyle, setAgTravelStyle] = useState('커플');
  const [agGenerating, setAgGenerating] = useState(false);

  // ── History / Status ───────────────────────────────────────────────────
  const [history, setHistory] = useState<HistoryPost[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [blogPosts, setBlogPosts] = useState<BloggerPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);

  // ── Init ───────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchBlogStatus();
    // Load saved configs
    try {
      const cp = localStorage.getItem('blogger_cp_config');
      if (cp) { const p = JSON.parse(cp); setCpApiKey(p.apiKey || ''); setCpDbId(p.dbId || ''); }
      const nt = localStorage.getItem('blogger_nt_config');
      if (nt) { const p = JSON.parse(nt); setNtDbId(p.dbId || ''); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (cpApiKey && cpDbId) loadCoupangProducts();
    else if (activeTab === 'coupang') setCpShowSettings(true);
  }, []); // eslint-disable-line

  useEffect(() => {
    if (ntDbId) loadNotionItems();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (searchParams.get('connected') === '1') fetchBlogStatus();
  }, [searchParams]);

  // Update preview iframe
  useEffect(() => {
    if (editorMode === 'preview' && previewRef.current) {
      const doc = previewRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
          body{font-family:'Noto Sans KR',sans-serif;padding:24px;max-width:800px;margin:0 auto;line-height:1.8;color:#222}
          h1{font-size:1.8em;margin:1em 0 0.5em}h2{font-size:1.4em;border-bottom:2px solid #e5e7eb;padding-bottom:.3em;margin:1.5em 0 .5em}
          h3{font-size:1.2em;margin:1.2em 0 .4em}p{margin:.8em 0}
          img{max-width:100%;border-radius:6px;display:block;margin:1em auto}
          a{color:#4f46e5}blockquote{border-left:4px solid #6366f1;padding:.5em 1em;background:#f5f3ff;margin:1em 0;border-radius:0 8px 8px 0}
          ul,ol{padding-left:1.5em}pre{background:#f4f4f4;padding:1em;border-radius:6px;overflow-x:auto}
          .callout{background:#f0f4ff;border-left:4px solid #4f8ef7;padding:1em;border-radius:4px;margin:1em 0}
        </style></head><body>${editContent}</body></html>`);
        doc.close();
      }
    }
  }, [editorMode, editContent]);

  // ── API calls ──────────────────────────────────────────────────────────
  async function fetchBlogStatus() {
    setStatusLoading(true);
    try { setBlogStatus(await (await fetch('/api/blogger/status')).json()); }
    catch { setBlogStatus({ connected: false }); }
    finally { setStatusLoading(false); }
  }

  async function loadCoupangProducts() {
    if (!cpApiKey || !cpDbId) { setCpShowSettings(true); return; }
    setCpLoading(true); setCpError('');
    try {
      const res = await fetch(`/api/coupang/notion-products?apiKey=${encodeURIComponent(cpApiKey)}&dbId=${encodeURIComponent(cpDbId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setCpProducts(data.products || []);
    } catch (e) { setCpError(String(e)); }
    finally { setCpLoading(false); }
  }

  async function loadNotionDatabases() {
    setNtDbLoading(true); setNtError('');
    try {
      const res = await fetch('/api/notion/databases');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setNtDatabases(data.databases || []);
    } catch (e) { setNtError(String(e)); }
    finally { setNtDbLoading(false); }
  }

  async function loadNotionItems() {
    if (!ntDbId) { setNtShowSettings(true); return; }
    setNtItemsLoading(true); setNtError('');
    try {
      const res = await fetch(`/api/notion/database-items?dbId=${encodeURIComponent(ntDbId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setNtItems(data.items || []);
    } catch (e) { setNtError(String(e)); }
    finally { setNtItemsLoading(false); }
  }

  async function searchImages() {
    const q = imageQuery || keyword || editTitle;
    if (!q && imageSource !== 'dalle') return;
    setImagesLoading(true); setImages([]);
    try {
      const params = new URLSearchParams({ q: imageSource === 'dalle' ? (dallePrompt || q) : q, source: imageSource, per_page: '9' });
      if (imageSource === 'dalle') params.set('dalle_prompt', dallePrompt || q);
      const res = await fetch(`/api/shorts/images?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '검색 실패');
      setImages(data.images || []);
    } catch (e) { alert(String(e)); }
    finally { setImagesLoading(false); }
  }

  function insertImageAtCursor(url: string, alt = '') {
    const imgHtml = `<img src="${url}" alt="${alt}" style="max-width:100%;border-radius:6px;display:block;margin:1em auto">`;
    const ta = editorRef.current;
    if (ta) {
      const start = ta.selectionStart ?? editContent.length;
      const end = ta.selectionEnd ?? start;
      const next = editContent.slice(0, start) + '\n' + imgHtml + '\n' + editContent.slice(end);
      setEditContent(next);
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + imgHtml.length + 2; ta.focus(); }, 0);
    } else {
      setEditContent(prev => prev + '\n' + imgHtml + '\n');
    }
    setShowImageModal(false);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { if (ev.target?.result) setUploadPreview(ev.target.result as string); };
    reader.readAsDataURL(file);
  }

  function insertToolbarTag(tagOpen: string, tagClose: string) {
    const ta = editorRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const selected = editContent.slice(start, end);
    const next = editContent.slice(0, start) + tagOpen + selected + tagClose + editContent.slice(end);
    setEditContent(next);
    setTimeout(() => {
      ta.selectionStart = start + tagOpen.length;
      ta.selectionEnd = start + tagOpen.length + selected.length;
      ta.focus();
    }, 0);
  }

  async function generatePost(type: ContentType, kw: string, products?: NotionProduct[], notionContent?: string, featuredImg?: string) {
    setGenerating(true); setGenerated(null); setPublishResult(null);
    const coupangProducts = products?.map(p => ({
      productName: p.name, productPrice: p.price,
      productUrl: p.partnerLink || p.originalUrl,
      productImage: p.image1,
    }));
    try {
      const res = await fetch('/api/blogger/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw, contentType: type, coupangProducts, notionContent, featuredImage: featuredImg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '생성 실패');
      setGenerated(data);
      setEditTitle(data.title);
      setEditContent(data.content);
      setEditLabels(data.labels || []);
      setEditorMode('edit');
      setActiveTab('write');
    } catch (err) { alert('AI 생성 오류: ' + String(err)); }
    finally { setGenerating(false); }
  }

  async function handlePublish() {
    if (!editTitle.trim() || !editContent.trim()) return;
    setPublishing(true); setPublishResult(null);
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

  async function handleCoupangGenerate() {
    if (!cpSelected) return;
    setCpGenerating(true);
    const kw = cpSelected.name.split(' ').slice(0, 4).join(' ');
    setKeyword(kw); setContentType('product');
    await generatePost('product', kw, [cpSelected], undefined, cpSelected.image1 || '');
    setCpGenerating(false);
  }

  async function handleNotionGenerate(item: NotionItem) {
    setNtGenerating(item.id);
    try {
      const res = await fetch(`/api/notion/import?pageId=${item.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '가져오기 실패');
      setKeyword(item.title); setContentType('info');
      await generatePost('info', item.title, undefined, data.plainText || '', item.coverUrl || '');
    } catch (err) { alert(String(err)); }
    finally { setNtGenerating(null); }
  }

  async function searchAgodaHotels() {
    const cityId = agCity?.id || (agCustomCityId ? parseInt(agCustomCityId) : 0);
    if (!cityId) { setAgError('도시를 선택하거나 City ID를 입력해주세요.'); return; }
    setAgLoading(true); setAgError(''); setAgSelected(new Set());
    try {
      const res = await fetch('/api/agoda/hotels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cityId,
          checkIn: agCheckIn || undefined,
          checkOut: agCheckOut || undefined,
          minStars: agMinStars,
          minReview: agMinReview,
          maxResult: agMaxResult,
          sortBy: agSortBy,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '검색 실패');
      setAgHotels(data.hotels || []);
      if (data.checkIn) setAgCheckIn(data.checkIn);
      if (data.checkOut) setAgCheckOut(data.checkOut);
    } catch (e) { setAgError(String(e)); }
    finally { setAgLoading(false); }
  }

  async function generateAgodaPost() {
    const selectedHotels = agHotels.filter(h => agSelected.has(h.hotelId));
    if (!selectedHotels.length) { alert('호텔을 1개 이상 선택해주세요.'); return; }
    const city = agCity || (agCustomCityId ? { name: agCustomCityId, id: parseInt(agCustomCityId) } as AgodaCity : null);
    if (!city) return;
    setAgGenerating(true);
    try {
      const res = await fetch('/api/agoda/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cityName: city.name,
          cityNameKo: city.name,
          hotels: selectedHotels,
          checkIn: agCheckIn,
          checkOut: agCheckOut,
          travelStyle: agTravelStyle,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '생성 실패');
      setEditTitle(data.title || '');
      setEditContent(data.content || '');
      setKeyword(city.name + ' 호텔 추천');
      setActiveTab('write');
    } catch (e) { alert(String(e)); }
    finally { setAgGenerating(false); }
  }

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    if (tab === 'history') fetchHistory();
    if (tab === 'status') fetchBlogPosts();
    if (tab === 'coupang' && !cpProducts.length && cpApiKey && cpDbId) loadCoupangProducts();
    if (tab === 'notion' && !ntItems.length && ntDbId) loadNotionItems();
  }

  async function fetchHistory() {
    setHistoryLoading(true);
    try { const d = await (await fetch('/api/blogger/history')).json(); setHistory(d.history || []); }
    catch {} finally { setHistoryLoading(false); }
  }

  async function fetchBlogPosts() {
    setPostsLoading(true);
    try { const d = await (await fetch('/api/blogger/posts')).json(); setBlogPosts(d.posts || []); }
    catch {} finally { setPostsLoading(false); }
  }

  const cpImages = cpSelected ? [cpSelected.image1, cpSelected.image2, cpSelected.image3, cpSelected.image4, cpSelected.image5].filter(Boolean) : [];
  const connectedError = searchParams.get('error');

  const Spinner = () => <svg className="animate-spin w-4 h-4 inline" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>;

  if (statusLoading) return <div className="flex items-center justify-center min-h-screen bg-gray-900"><div className="text-gray-400 text-sm">로딩 중...</div></div>;

  if (!blogStatus?.connected) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-gray-800 rounded-2xl p-8 text-center">
        <div className="text-5xl mb-4">📝</div>
        <h1 className="text-xl font-bold text-white mb-2">Google 블로거 연동</h1>
        <p className="text-gray-400 text-sm mb-6">Google Blogger에 AI 글을 자동으로 발행하려면 Google 계정을 연결하세요.</p>
        {connectedError && <div className="mb-4 bg-red-900/40 border border-red-700 rounded-lg p-3 text-red-300 text-xs">{connectedError}</div>}
        <a href="/api/blogger/connect" className="inline-block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-6 rounded-xl transition-colors">Google Blogger 연결하기</a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Image Insert Modal */}
      {showImageModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h3 className="font-semibold text-white">이미지 삽입</h3>
              <button onClick={() => { setShowImageModal(false); setUploadPreview(''); }} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            {/* Source tabs */}
            <div className="flex gap-1 p-3 border-b border-gray-700">
              {(['pixabay', 'pexels', 'dalle', 'upload'] as ImageSource[]).map(src => (
                <button key={src} onClick={() => { setImageSource(src); setImages([]); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${imageSource === src ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                  {src === 'pixabay' ? '🖼 Pixabay' : src === 'pexels' ? '📷 Pexels' : src === 'dalle' ? '🤖 DALL-E' : '⬆️ 업로드'}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {imageSource !== 'upload' ? (
                <>
                  <div className="flex gap-2 mb-4">
                    {imageSource === 'dalle' ? (
                      <input type="text" value={dallePrompt} onChange={e => setDallePrompt(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchImages()}
                        placeholder="이미지 생성 프롬프트 (영어 권장)"
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                      />
                    ) : (
                      <input type="text" value={imageQuery} onChange={e => setImageQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchImages()}
                        placeholder={`${imageSource} 이미지 검색어 (영어 권장)`}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                      />
                    )}
                    <button onClick={searchImages} disabled={imagesLoading}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg">
                      {imagesLoading ? <Spinner /> : '검색'}
                    </button>
                  </div>
                  {images.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {images.map(img => (
                        <button key={img.id} onClick={() => insertImageAtCursor(img.url, img.tags)}
                          className="relative aspect-video rounded-lg overflow-hidden hover:ring-2 hover:ring-indigo-500 transition-all group">
                          <img src={img.thumb} alt={img.tags} className="w-full h-full object-cover"/>
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-all">
                            <span className="text-white opacity-0 group-hover:opacity-100 font-medium text-sm">삽입</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {imageSource === 'dalle' && images.length > 0 && (
                    <p className="text-xs text-gray-500 mt-2">* DALL-E 이미지 URL은 일시적입니다. 빠른 발행을 권장합니다.</p>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-500 transition-colors">
                    {uploadPreview ? (
                      <img src={uploadPreview} alt="preview" className="max-h-48 mx-auto rounded-lg"/>
                    ) : (
                      <>
                        <div className="text-3xl mb-2">⬆️</div>
                        <div className="text-gray-400 text-sm">클릭하여 이미지 선택</div>
                        <div className="text-gray-500 text-xs mt-1">JPG, PNG, GIF, WebP</div>
                      </>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden"/>
                  {uploadPreview && (
                    <button onClick={() => insertImageAtCursor(uploadPreview, '업로드 이미지')}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-xl transition-colors">
                      이 이미지 삽입
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Google 블로거 AI</h1>
            <p className="text-gray-400 text-sm mt-1">수익형(쿠팡) · 지식형(노션) · AI 글 자동 발행</p>
          </div>
          {blogStatus.email && <div className="text-xs text-indigo-400">{blogStatus.email}</div>}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-800 rounded-xl p-1 mb-6 overflow-x-auto">
          {([
            { id: 'write', label: '✍️ 글 작성' },
            { id: 'coupang', label: '🛒 쿠팡' },
            { id: 'notion', label: '📄 노션' },
            { id: 'agoda', label: '🏨 아고다' },
            { id: 'history', label: '📋 이력' },
            { id: 'status', label: '📊 현황' },
          ] as { id: Tab; label: string }[]).map(tab => (
            <button key={tab.id} onClick={() => handleTabChange(tab.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ══════ 글 작성 탭 ══════ */}
        {activeTab === 'write' && (
          <div className="space-y-4">
            {/* 콘텐츠 타입 + 키워드 */}
            <div className="bg-gray-800 rounded-xl p-5 space-y-4">
              <div className="flex gap-2">
                <button onClick={() => setContentType('product')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${contentType === 'product' ? 'bg-orange-600 border-orange-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'}`}>
                  🛒 수익형
                </button>
                <button onClick={() => setContentType('info')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${contentType === 'info' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'}`}>
                  📖 지식형
                </button>
              </div>
              <div className="flex gap-2">
                <input type="text" value={keyword} onChange={e => setKeyword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && generatePost(contentType, keyword)}
                  placeholder="키워드 입력 (예: 에어프라이어 추천, 갤럭시 사용법)"
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
                />
                <button onClick={() => generatePost(contentType, keyword)} disabled={generating || !keyword.trim()}
                  className={`px-5 py-2.5 rounded-lg font-semibold text-sm text-white disabled:opacity-50 transition-colors flex items-center gap-2 ${contentType === 'product' ? 'bg-orange-600 hover:bg-orange-500' : 'bg-purple-600 hover:bg-purple-500'}`}>
                  {generating ? <><Spinner /> 생성 중...</> : '✨ AI 글 생성'}
                </button>
              </div>
            </div>

            {/* Editor */}
            {(generated || editContent) && (
              <div className="bg-gray-800 rounded-xl overflow-hidden">
                {/* Title */}
                <div className="p-4 border-b border-gray-700">
                  <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    placeholder="글 제목"
                    className="w-full bg-transparent text-white text-xl font-bold focus:outline-none placeholder-gray-600"
                  />
                </div>

                {/* Labels */}
                <div className="px-4 py-2 border-b border-gray-700 flex flex-wrap gap-2 items-center">
                  <span className="text-xs text-gray-500">태그:</span>
                  {editLabels.map((label, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 bg-indigo-900/50 border border-indigo-700 text-indigo-300 text-xs px-2 py-0.5 rounded-full">
                      {label}
                      <button onClick={() => setEditLabels(prev => prev.filter((_, i) => i !== idx))} className="hover:text-white">×</button>
                    </span>
                  ))}
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-700 flex-wrap">
                  {[
                    { label: 'H1', open: '<h1>', close: '</h1>' },
                    { label: 'H2', open: '<h2>', close: '</h2>' },
                    { label: 'H3', open: '<h3>', close: '</h3>' },
                  ].map(t => (
                    <button key={t.label} onClick={() => insertToolbarTag(t.open, t.close)}
                      className="w-8 h-8 text-xs font-bold bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors">
                      {t.label}
                    </button>
                  ))}
                  <div className="w-px h-5 bg-gray-600 mx-1"/>
                  <button onClick={() => insertToolbarTag('<strong>', '</strong>')} className="w-8 h-8 text-sm font-bold bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors">B</button>
                  <button onClick={() => insertToolbarTag('<em>', '</em>')} className="w-8 h-8 text-sm italic bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors">I</button>
                  <button onClick={() => insertToolbarTag('<u>', '</u>')} className="w-8 h-8 text-sm underline bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors">U</button>
                  <div className="w-px h-5 bg-gray-600 mx-1"/>
                  <button onClick={() => insertToolbarTag('<blockquote>', '</blockquote>')} title="인용구" className="w-8 h-8 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors">&quot;</button>
                  <button onClick={() => insertToolbarTag('<ul>\n<li>', '</li>\n</ul>')} title="목록" className="w-8 h-8 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors">≡</button>
                  <button onClick={() => insertToolbarTag('<ol>\n<li>', '</li>\n</ol>')} title="번호목록" className="w-8 h-8 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors">1.</button>
                  <button onClick={() => { const url = prompt('링크 URL:'); if (url) insertToolbarTag(`<a href="${url}" target="_blank" rel="noopener noreferrer">`, '</a>'); }} title="링크" className="w-8 h-8 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors">🔗</button>
                  <div className="w-px h-5 bg-gray-600 mx-1"/>
                  <button onClick={() => { setImageQuery(keyword); setShowImageModal(true); }} title="이미지 삽입"
                    className="px-2 h-8 text-xs bg-indigo-700 hover:bg-indigo-600 text-white rounded transition-colors">🖼 이미지</button>
                  <div className="flex-1"/>
                  <div className="flex bg-gray-700 rounded-lg overflow-hidden">
                    <button onClick={() => setEditorMode('edit')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${editorMode === 'edit' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>편집</button>
                    <button onClick={() => setEditorMode('preview')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${editorMode === 'preview' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>미리보기</button>
                  </div>
                </div>

                {/* Editor body */}
                {editorMode === 'edit' ? (
                  <textarea ref={editorRef} value={editContent} onChange={e => setEditContent(e.target.value)}
                    className="w-full bg-gray-900 text-gray-200 text-sm font-mono p-4 focus:outline-none resize-none"
                    style={{ minHeight: '460px' }}
                  />
                ) : (
                  <iframe ref={previewRef} className="w-full bg-white"
                    style={{ minHeight: '460px' }} sandbox="allow-same-origin" title="preview"/>
                )}

                {/* Publish bar */}
                <div className="p-4 border-t border-gray-700 flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={!isDraft} onChange={() => setIsDraft(false)} className="accent-indigo-500"/>
                    <span className="text-sm text-gray-300">즉시 발행</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={isDraft} onChange={() => setIsDraft(true)} className="accent-indigo-500"/>
                    <span className="text-sm text-gray-300">임시저장</span>
                  </label>
                  {publishResult && (
                    <div className={`flex-1 rounded-lg px-3 py-2 text-sm ${publishResult.error ? 'bg-red-900/40 text-red-300' : 'bg-green-900/40 text-green-300'}`}>
                      {publishResult.error ? `오류: ${publishResult.error}` : <>발행 성공! {publishResult.url && <a href={publishResult.url} target="_blank" rel="noopener noreferrer" className="underline">블로그에서 보기 →</a>}</>}
                    </div>
                  )}
                  <button onClick={handlePublish} disabled={publishing || !editTitle.trim() || !editContent.trim()}
                    className="ml-auto bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors flex items-center gap-2">
                    {publishing ? <><Spinner /> 발행 중...</> : isDraft ? '💾 임시저장' : '🚀 블로거에 발행'}
                  </button>
                </div>
              </div>
            )}

            {/* Thumbnail Generator - always shown in write tab */}
            <ThumbnailGenerator
              defaultTitle={editTitle || keyword}
              defaultKeyword={keyword}
              onInsert={(imageUrl) => {
                const imgHtml = `<div style="text-align:center;margin:0 0 1.5em"><img src="${imageUrl}" alt="${editTitle}" style="max-width:100%;border-radius:8px;display:block;margin:0 auto"></div>\n`;
                setEditContent(prev => imgHtml + prev);
              }}
            />

            {!generated && !editContent && (
              <div className="text-center py-16 text-gray-600">
                <div className="text-4xl mb-3">✍️</div>
                <div className="text-sm">키워드를 입력하고 AI 글 생성을 누르거나<br/>쿠팡/노션 탭에서 상품/페이지를 선택하세요</div>
              </div>
            )}
          </div>
        )}

        {/* ══════ 쿠팡 탭 ══════ */}
        {activeTab === 'coupang' && (
          <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold">🛒 쿠팡파트너스 Notion DB</h2>
                <p className="text-sm text-gray-400 mt-0.5">상품 선택 → AI 수익형 블로그 글 생성</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setCpShowSettings(s => !s)} className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg">⚙️</button>
                <button onClick={loadCoupangProducts} disabled={cpLoading} className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                  {cpLoading ? '⏳' : '🔄'}
                </button>
              </div>
            </div>

            {/* Settings */}
            {cpShowSettings && (
              <div className="mb-4 p-4 bg-gray-800 border border-gray-700 rounded-xl">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Notion 설정</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Notion API Key</label>
                    <input type="password" value={cpApiKey} onChange={e => setCpApiKey(e.target.value)}
                      placeholder="secret_..."
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Database ID</label>
                    <input type="text" value={cpDbId} onChange={e => setCpDbId(e.target.value)}
                      placeholder="32자리 DB ID"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"/>
                  </div>
                </div>
                <button onClick={() => { localStorage.setItem('blogger_cp_config', JSON.stringify({ apiKey: cpApiKey, dbId: cpDbId })); setCpShowSettings(false); loadCoupangProducts(); }}
                  className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">
                  💾 저장 &amp; 불러오기
                </button>
              </div>
            )}

            {cpError && <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{cpError}</div>}

            {/* Product list + detail */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Left: product list */}
              <div className="space-y-2 max-h-[72vh] overflow-y-auto pr-1">
                {cpLoading && <div className="text-center py-12 text-gray-400">⏳ 로딩중...</div>}
                {!cpLoading && cpProducts.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <div className="text-3xl mb-2">📦</div>
                    <p className="text-sm">상품이 없습니다. Notion 설정 후 새로고침하세요.</p>
                  </div>
                )}
                {cpProducts.map(p => (
                  <button key={p.id} onClick={() => { setCpSelected(p); }}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${cpSelected?.id === p.id ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700 bg-gray-800 hover:border-gray-600'}`}>
                    <div className="flex gap-3 items-start">
                      {p.image1 && <img src={p.image1} alt="" className="w-14 h-14 object-cover rounded-lg flex-shrink-0"/>}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white line-clamp-2">{p.name || '상품명 없음'}</p>
                        <p className="text-sm font-bold text-red-400 mt-0.5">{p.price ? `₩${Number(p.price).toLocaleString()}` : '-'}</p>
                        <div className="flex gap-1.5 mt-1.5">
                          {p.review1 && <span className="text-xs bg-blue-900/50 text-blue-400 px-1.5 py-0.5 rounded">리뷰 ✓</span>}
                          {p.image1 && <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">사진 ✓</span>}
                          {p.partnerLink ? <span className="text-xs bg-green-900/50 text-green-400 px-1.5 py-0.5 rounded">링크 ✓</span>
                            : <span className="text-xs bg-orange-900/50 text-orange-400 px-1.5 py-0.5 rounded">링크 ✗</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Right: detail + generate */}
              <div>
                {!cpSelected ? (
                  <div className="flex items-center justify-center h-64 text-gray-500 bg-gray-800 rounded-xl border border-gray-700">
                    ← 상품을 선택하세요
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                      <h3 className="font-semibold text-white mb-1 line-clamp-2">{cpSelected.name}</h3>
                      <p className="text-lg font-bold text-red-400 mb-3">{cpSelected.price ? `₩${Number(cpSelected.price).toLocaleString()}` : '가격 없음'}</p>
                      {cpImages.length > 0 && (
                        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                          {cpImages.map((img, i) => <img key={i} src={img} alt="" className="w-16 h-16 object-cover rounded-lg flex-shrink-0 border border-gray-600"/>)}
                        </div>
                      )}
                      {cpSelected.review1 && (
                        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3 text-xs text-gray-300 mb-2">
                          <span className="text-yellow-400 font-semibold">📌 AI 참고 상품평</span>
                          <p className="mt-1 line-clamp-4">{cpSelected.review1}</p>
                        </div>
                      )}
                      {cpSelected.partnerLink ? (
                        <a href={cpSelected.partnerLink} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-900/30 border border-green-700/50 px-2 py-1 rounded-lg">
                          🔗 파트너스 링크 ✓
                        </a>
                      ) : (
                        <span className="text-xs text-orange-400 bg-orange-900/20 border border-orange-700/50 px-2 py-1 rounded-lg">⚠️ 파트너스 링크 없음</span>
                      )}
                    </div>

                    <button onClick={handleCoupangGenerate} disabled={cpGenerating || generating}
                      className="w-full py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
                      {cpGenerating || generating ? <><Spinner /> 수익형 글 생성 중 (GPT-4o)...</> : '💰 수익형 블로그 글 생성 (GPT-4o)'}
                    </button>
                    <p className="text-xs text-gray-500 text-center">생성 후 자동으로 글 작성 탭으로 이동합니다</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════ 노션 탭 ══════ */}
        {activeTab === 'notion' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold">📄 노션 데이터베이스</h2>
                <p className="text-sm text-gray-400 mt-0.5">DB 항목 선택 → AI 지식형 블로그 글 생성</p>
              </div>
              <button onClick={() => setNtShowSettings(s => !s)} className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg">⚙️ 설정</button>
            </div>

            {/* Settings */}
            {(ntShowSettings || !ntDbId) && (
              <div className="mb-4 p-4 bg-gray-800 border border-gray-700 rounded-xl space-y-4">
                <h3 className="text-sm font-semibold text-gray-300">노션 설정</h3>
                <p className="text-xs text-gray-500">노션 API 키는 설정 페이지의 기존 연동 정보를 자동으로 사용합니다.</p>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-gray-400">데이터베이스 선택</label>
                    <button onClick={loadNotionDatabases} disabled={ntDbLoading}
                      className="px-3 py-1 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-xs rounded-lg">
                      {ntDbLoading ? '⏳ 로딩...' : '🔄 DB 목록 불러오기'}
                    </button>
                  </div>
                  {ntDatabases.length > 0 && (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto mt-2">
                      {ntDatabases.map(db => (
                        <button key={db.id} onClick={() => setNtDbId(db.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${ntDbId === db.id ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                          {db.title}
                          <span className="text-xs opacity-60 ml-2">{new Date(db.last_edited).toLocaleDateString('ko-KR')}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">또는 Database ID 직접 입력</label>
                  <input type="text" value={ntDbId} onChange={e => setNtDbId(e.target.value)}
                    placeholder="32자리 Database ID"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"/>
                </div>
                <button onClick={() => {
                  localStorage.setItem('blogger_nt_config', JSON.stringify({ dbId: ntDbId }));
                  setNtShowSettings(false);
                  loadNotionItems();
                }} disabled={!ntDbId}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm rounded-lg">
                  💾 저장 &amp; 항목 불러오기
                </button>
              </div>
            )}

            {ntError && <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{ntError}</div>}

            {/* Items list */}
            {ntItemsLoading && <div className="text-center py-12 text-gray-400">⏳ 로딩중...</div>}
            {!ntItemsLoading && ntItems.length === 0 && ntDbId && (
              <div className="text-center py-12 text-gray-500">
                <div className="text-3xl mb-2">📄</div>
                <p className="text-sm">항목이 없거나 설정을 확인해주세요.</p>
                <button onClick={loadNotionItems} className="mt-3 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg">불러오기</button>
              </div>
            )}
            <div className="space-y-2">
              {ntItems.map(item => (
                <div key={item.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center gap-4">
                  {item.coverUrl && <img src={item.coverUrl} alt="" className="w-12 h-12 object-cover rounded-lg flex-shrink-0"/>}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{item.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{new Date(item.last_edited).toLocaleDateString('ko-KR')}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-gray-200">열기 ↗</a>
                    <button onClick={() => handleNotionGenerate(item)} disabled={ntGenerating === item.id || generating}
                      className="text-xs bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                      {ntGenerating === item.id ? <><Spinner /> 생성 중...</> : '📚 지식형 글 생성'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════ 아고다 탭 ══════ */}
        {activeTab === 'agoda' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold">🏨 아고다 호텔 추천 블로그</h2>
                <p className="text-sm text-gray-400 mt-0.5">도시 선택 → 호텔 검색 → AI 후기형 블로그 글 자동 생성</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              {/* ── 왼쪽: 검색 ── */}
              <div className="space-y-4">
                {/* 인기 도시 그리드 */}
                <div className="bg-gray-800 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">📍 인기 여행지 선택</h3>
                  <div className="grid grid-cols-4 gap-1.5">
                    {AGODA_CITIES.map(city => (
                      <button key={city.id} onClick={() => { setAgCity(city); setAgCustomCityId(''); }}
                        className={`flex flex-col items-center py-2 px-1 rounded-lg text-xs transition-colors ${agCity?.id === city.id ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                        <span className="text-base">{city.emoji}</span>
                        <span className="mt-0.5 leading-tight text-center">{city.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3">
                    <input type="text" value={agCustomCityId} onChange={e => { setAgCustomCityId(e.target.value); setAgCity(null); }}
                      placeholder="또는 Agoda City ID 직접 입력 (예: 17193)"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"/>
                  </div>
                </div>

                {/* 필터 */}
                <div className="bg-gray-800 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-300">⚙️ 검색 필터</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">최소 별점</label>
                      <select value={agMinStars} onChange={e => setAgMinStars(Number(e.target.value))}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500">
                        <option value={0}>전체</option>
                        <option value={3}>3성급 이상</option>
                        <option value={4}>4성급 이상</option>
                        <option value={5}>5성급</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">최소 리뷰점수</label>
                      <select value={agMinReview} onChange={e => setAgMinReview(Number(e.target.value))}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500">
                        <option value={0}>전체</option>
                        <option value={7}>7.0 이상</option>
                        <option value={8}>8.0 이상</option>
                        <option value={9}>9.0 이상</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">정렬</label>
                      <select value={agSortBy} onChange={e => setAgSortBy(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500">
                        <option value="AllGuestsReviewScore">리뷰 높은순</option>
                        <option value="StarRatingDesc">별점 높은순</option>
                        <option value="PriceAsc">가격 낮은순</option>
                        <option value="PriceDesc">가격 높은순</option>
                        <option value="Recommended">추천순</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">결과 수</label>
                      <select value={agMaxResult} onChange={e => setAgMaxResult(Number(e.target.value))}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500">
                        <option value={5}>5개</option>
                        <option value={10}>10개</option>
                        <option value={20}>20개</option>
                        <option value={30}>30개</option>
                      </select>
                    </div>
                  </div>
                  <button onClick={searchAgodaHotels} disabled={agLoading || (!agCity && !agCustomCityId)}
                    className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
                    {agLoading ? '⏳ 검색 중...' : '🔍 호텔 검색'}
                  </button>
                </div>

                {agError && <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{agError}</div>}

                {/* 호텔 목록 */}
                {agHotels.length > 0 && (
                  <div className="bg-gray-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-300">호텔 목록 ({agHotels.length}개)</h3>
                      <span className="text-xs text-gray-500">블로그에 포함할 호텔 선택 (최대 5개)</span>
                    </div>
                    <div className="space-y-2 max-h-[480px] overflow-y-auto">
                      {agHotels.map(hotel => {
                        const isSelected = agSelected.has(hotel.hotelId);
                        const canSelect = isSelected || agSelected.size < 5;
                        return (
                          <button key={hotel.hotelId}
                            onClick={() => {
                              if (!canSelect && !isSelected) return;
                              setAgSelected(prev => {
                                const next = new Set(prev);
                                isSelected ? next.delete(hotel.hotelId) : next.add(hotel.hotelId);
                                return next;
                              });
                            }}
                            className={`w-full text-left flex gap-3 p-3 rounded-xl border transition-colors ${isSelected ? 'border-orange-500 bg-orange-950/30' : canSelect ? 'border-gray-700 bg-gray-750 hover:border-gray-600' : 'border-gray-700 bg-gray-800 opacity-40 cursor-not-allowed'}`}>
                            {hotel.imageURL && (
                              <img src={hotel.imageURL} alt={hotel.hotelName}
                                className="w-16 h-16 object-cover rounded-lg flex-shrink-0"/>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-2">
                                {isSelected && <span className="flex-shrink-0 text-xs bg-orange-600 text-white px-1.5 py-0.5 rounded">✓</span>}
                                <span className="text-sm font-medium text-white leading-tight">{hotel.hotelName}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-xs text-yellow-400">{'⭐'.repeat(Math.round(hotel.starRating))}</span>
                                <span className="text-xs text-green-400">리뷰 {hotel.reviewScore}/10</span>
                                <span className="text-xs text-gray-500">({hotel.reviewCount.toLocaleString()}개)</span>
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {hotel.crossedOutRate > 0 && (
                                  <span className="text-xs text-gray-500 line-through">{Math.round(hotel.crossedOutRate).toLocaleString()}원</span>
                                )}
                                <span className="text-xs font-semibold text-orange-400">1박 {Math.round(hotel.dailyRate).toLocaleString()}원</span>
                                {hotel.discountPercentage > 0 && (
                                  <span className="text-xs bg-red-700/60 text-red-300 px-1.5 py-0.5 rounded">-{Math.round(hotel.discountPercentage)}%</span>
                                )}
                              </div>
                              <div className="flex gap-1.5 mt-1">
                                {hotel.freeWifi && <span className="text-xs text-gray-400 bg-gray-700 px-1.5 py-0.5 rounded">WiFi</span>}
                                {hotel.includeBreakfast && <span className="text-xs text-gray-400 bg-gray-700 px-1.5 py-0.5 rounded">조식</span>}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ── 오른쪽: 블로그 생성 ── */}
              <div className="space-y-4">
                <div className="bg-gray-800 rounded-xl p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-300">✍️ 블로그 글 생성</h3>

                  {agSelected.size === 0 ? (
                    <div className="text-center py-10 text-gray-500">
                      <div className="text-4xl mb-3">🏨</div>
                      <p className="text-sm">왼쪽에서 호텔을 검색하고<br/>블로그에 포함할 호텔을 선택해주세요.</p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <p className="text-xs text-gray-400 mb-2">선택된 호텔 ({agSelected.size}개)</p>
                        <div className="space-y-1">
                          {agHotels.filter(h => agSelected.has(h.hotelId)).map(h => (
                            <div key={h.hotelId} className="flex items-center gap-2 text-xs text-gray-300 bg-gray-700 rounded-lg px-3 py-2">
                              <span className="text-orange-400">✓</span>
                              <span className="flex-1 truncate">{h.hotelName}</span>
                              <span className="text-yellow-400">⭐{h.starRating}</span>
                              <span className="text-green-400">{h.reviewScore}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">여행 스타일</label>
                        <div className="flex gap-2 flex-wrap">
                          {['커플', '가족', '혼자', '친구', '비즈니스'].map(style => (
                            <button key={style} onClick={() => setAgTravelStyle(style)}
                              className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${agTravelStyle === style ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                              {style}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button onClick={generateAgodaPost} disabled={agGenerating}
                        className="w-full py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-colors">
                        {agGenerating ? '⏳ AI 글 생성 중...' : '🤖 AI 호텔 후기 블로그 생성'}
                      </button>
                    </>
                  )}
                </div>

                {/* 아고다 위젯 미리보기 */}
                <div className="bg-gray-800 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">🔗 아고다 제휴 위젯 (블로그 삽입용)</h3>
                  <p className="text-xs text-gray-500 mb-3">아래 코드를 블로그 포스트 하단에 추가하면 호텔 검색 위젯이 표시됩니다.</p>
                  {agCity && (
                    <div className="bg-gray-900 rounded-lg p-3 text-xs font-mono text-green-400 overflow-x-auto whitespace-pre-wrap break-all">
{`<div id="adgshp_${agCity.id}"></div>
<script src="//cdn0.agoda.net/images/sherpa/js/init-dynamic_v8.min.js"></script>
<script>
var stg=new Object();
stg.crt="95206069999";stg.version="1.05";
stg.id=stg.name="adgshp_${agCity.id}";
stg.Width="300px";stg.Height="300px";
stg.RefKey="JnczJ2ENKNu/pBK/YSDEJA==";
stg.AutoScrollSpeed=3000;stg.AutoScrollToggle=true;
stg.SearchboxShow=true;stg.DiscountedOnly=false;
stg.Layout="squaredynamic";stg.Language="ko-kr";
stg.ApiKey="8a74cef3-5ae2-4ad3-97af-b4628ce0795a";
stg.Cid="1945810";stg.City="${agCity.id}";
stg.Currency="KRW";stg.OverideConf=false;
new AgdDynamic("adgshp_${agCity.id}").initialize(stg);
</script>`}
                    </div>
                  )}
                  {!agCity && <p className="text-xs text-gray-600">도시를 선택하면 위젯 코드가 표시됩니다.</p>}
                </div>

                {/* 안내 */}
                <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-blue-300 mb-2">💡 수익화 팁</h3>
                  <ul className="text-xs text-blue-400/80 space-y-1">
                    <li>• AI 생성 글은 자동으로 글 작성 탭으로 이동합니다</li>
                    <li>• 각 호텔 예약 링크에 CID(1959217)가 포함되어 수익 추적됩니다</li>
                    <li>• 리뷰 점수 높은 호텔 위주로 선택하면 전환율이 높아집니다</li>
                    <li>• 계절/이벤트별 검색어로 SEO 효과를 높이세요</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════ 이력 탭 ══════ */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            {historyLoading ? <div className="text-center py-12 text-gray-500 text-sm">로딩 중...</div> :
              history.length === 0 ? <div className="text-center py-12 text-gray-500"><div className="text-3xl mb-3">📭</div><div className="text-sm">발행 이력이 없습니다.</div></div> :
              history.map(item => (
                <div key={item.id} className="bg-gray-800 rounded-xl p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.status === 'LIVE' ? 'bg-green-900/50 text-green-400 border border-green-700' : 'bg-yellow-900/50 text-yellow-400 border border-yellow-700'}`}>{item.status || 'DRAFT'}</span>
                      {item.content_type && <span className="text-xs text-gray-500">{item.content_type === 'product' ? '수익형' : '지식형'}</span>}
                    </div>
                    <div className="text-sm font-medium text-white truncate">{item.title || '(제목 없음)'}</div>
                    {item.keyword && <div className="text-xs text-gray-400 mt-0.5">키워드: {item.keyword}</div>}
                    <div className="text-xs text-gray-500 mt-1">{item.published_at ? new Date(item.published_at).toLocaleString('ko-KR') : new Date(item.created_at).toLocaleString('ko-KR')}</div>
                  </div>
                  {item.blogger_url && <a href={item.blogger_url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-xs bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg transition-colors">보기 →</a>}
                </div>
              ))
            }
          </div>
        )}

        {/* ══════ 현황 탭 ══════ */}
        {activeTab === 'status' && (
          <div className="space-y-5">
            <div className="bg-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">블로그 정보</h3>
              {blogStatus.blog ? (
                <div className="space-y-3">
                  <div className="flex justify-between"><span className="text-sm text-gray-400">블로그 이름</span><span className="text-sm text-white">{blogStatus.blog.name}</span></div>
                  <div className="flex justify-between"><span className="text-sm text-gray-400">URL</span><a href={blogStatus.blog.url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-400 underline">{blogStatus.blog.url}</a></div>
                  <div className="flex justify-between"><span className="text-sm text-gray-400">총 포스트</span><span className="text-sm text-white">{blogStatus.blog.postCount}개</span></div>
                  <div className="flex justify-between"><span className="text-sm text-gray-400">Blog ID</span><span className="text-xs text-gray-500 font-mono">{BLOG_ID}</span></div>
                </div>
              ) : <div className="text-sm text-gray-500">정보를 불러오지 못했습니다.</div>}
            </div>
            <div className="bg-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-300">최근 포스트</h3>
                <button onClick={fetchBlogPosts} disabled={postsLoading} className="text-xs text-indigo-400 hover:text-indigo-300">{postsLoading ? '로딩 중...' : '새로고침'}</button>
              </div>
              {postsLoading ? <div className="text-center py-6 text-gray-500 text-sm">로딩 중...</div> :
                blogPosts.length === 0 ? <div className="text-center py-6 text-gray-500 text-sm">포스트가 없습니다.</div> :
                <div className="space-y-2">
                  {blogPosts.map(post => (
                    <div key={post.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-700/50 last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-white truncate">{post.title}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${post.status === 'LIVE' ? 'bg-green-900/50 text-green-400' : 'bg-yellow-900/50 text-yellow-400'}`}>{post.status}</span>
                          {post.published && <span className="text-xs text-gray-500">{new Date(post.published).toLocaleDateString('ko-KR')}</span>}
                        </div>
                      </div>
                      {post.url && <a href={post.url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-xs text-indigo-400 hover:text-indigo-300">보기 →</a>}
                    </div>
                  ))}
                </div>
              }
            </div>
            <div className="bg-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">연결 관리</h3>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-green-400"/><span className="text-sm text-green-400">연결됨 · {blogStatus.email}</span>
              </div>
              <button onClick={async () => { if (!confirm('연결을 해제하시겠습니까?')) return; await fetch('/api/blogger/disconnect', { method: 'POST' }); setBlogStatus({ connected: false }); }}
                className="bg-red-900/40 hover:bg-red-900/70 border border-red-700 text-red-400 text-sm px-4 py-2 rounded-lg transition-colors">연결 해제</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
