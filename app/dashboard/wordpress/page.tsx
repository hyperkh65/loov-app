'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface WpSite { id: string; site_name: string; site_url: string; wp_username: string; is_active: boolean; }
interface NotionArticle { id: string; title: string; status: string; lastEdited: string; }
interface PublishResult { siteId: string; siteName: string; success: boolean; postId?: number; postUrl?: string; error?: string; }
interface HistoryItem { id: string; title: string; sites: string[]; results: PublishResult[]; notion_page_id: string; created_at: string; }
interface UploadedImage { id?: number; url?: string; error?: string; }
interface UploadedSiteData { siteId: string; siteName: string; images: UploadedImage[]; error?: string; }

type Tab = 'publish' | 'sites' | 'notion' | 'history';

// ── 상태 배지 ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  '완료': 'bg-emerald-100 text-emerald-700', '발행완료': 'bg-emerald-100 text-emerald-700',
  'Done': 'bg-emerald-100 text-emerald-700', '작성중': 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-blue-100 text-blue-700', '대기': 'bg-amber-100 text-amber-700',
  'Not Started': 'bg-gray-100 text-gray-600',
};
function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || 'bg-gray-100 text-gray-600';
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${color}`}>{status || '—'}</span>;
}

// ── 헬퍼: 본문에 이미지 삽입 ─────────────────────────────────────────────────

function injectBodyImages(html: string, urls: string[]): string {
  const remaining = [...urls];
  return html.replace(/<\/h[23]>/gi, (match) => {
    if (!remaining.length) return match;
    return `${match}\n<figure><img src="${remaining.shift()!}" alt="" /></figure>`;
  });
}

// ── 헬퍼: 텍스트 줄바꿈 ────────────────────────────────────────────────────────

function wrapTextWp(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    const test = cur + ch;
    if (ctx.measureText(test).width > maxWidth && cur.length > 0) { lines.push(cur); cur = ch; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ── 헬퍼: Blogger 스타일 대표이미지 생성 (배경이미지 + 오버레이) ────────────────

async function generateBloggerThumbFile(
  mainTitle: string,
  subTitle: string,
  bgSrc: string,
  colorScheme: 'dark' | 'blue' | 'green' = 'dark',
): Promise<File> {
  return new Promise(async (resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1080;
    const ctx = canvas.getContext('2d')!;

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = bgSrc.startsWith('http') ? `/api/proxy-image?url=${encodeURIComponent(bgSrc)}` : bgSrc;
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('배경 이미지 로드 실패'));
        setTimeout(() => rej(new Error('타임아웃')), 15000);
      });
      const scale = Math.max(1080 / img.naturalWidth, 1080 / img.naturalHeight);
      ctx.drawImage(img, (1080 - img.naturalWidth * scale) / 2, (1080 - img.naturalHeight * scale) / 2, img.naturalWidth * scale, img.naturalHeight * scale);
    } catch {
      // 배경 이미지 실패 시 진한 그라디언트
      const bg = ctx.createLinearGradient(0, 0, 0, 1080);
      bg.addColorStop(0, '#0d1b2a'); bg.addColorStop(1, '#0a0f1e');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, 1080, 1080);
    }

    // 오버레이
    const grad = ctx.createLinearGradient(0, 0, 0, 1080);
    if (colorScheme === 'blue') {
      grad.addColorStop(0, 'rgba(0,10,40,0.50)'); grad.addColorStop(0.5, 'rgba(0,15,50,0.65)'); grad.addColorStop(1, 'rgba(0,10,40,0.55)');
    } else if (colorScheme === 'green') {
      grad.addColorStop(0, 'rgba(0,20,10,0.50)'); grad.addColorStop(0.5, 'rgba(0,25,15,0.65)'); grad.addColorStop(1, 'rgba(0,20,10,0.55)');
    } else {
      grad.addColorStop(0, 'rgba(0,0,0,0.48)'); grad.addColorStop(0.5, 'rgba(0,0,0,0.62)'); grad.addColorStop(1, 'rgba(0,0,0,0.52)');
    }
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1080);

    // 비네팅
    const vig = ctx.createRadialGradient(540, 540, 300, 540, 540, 760);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, 1080, 1080);

    // 골드 바
    ctx.fillStyle = '#f0b429'; ctx.fillRect(0, 0, 1080, 10); ctx.fillRect(0, 1070, 1080, 10);

    // 텍스트 렌더 헬퍼
    const drawText = (text: string, x: number, y: number, size: number) => {
      ctx.font = `bold ${size}px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif`;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 45; ctx.fillStyle = 'rgba(0,0,0,0.7)';
      for (let i = 0; i < 6; i++) ctx.fillText(text, x, y); ctx.restore();
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,1)'; ctx.shadowBlur = 18; ctx.fillStyle = 'rgba(20,20,20,0.8)';
      for (let i = 0; i < 3; i++) ctx.fillText(text, x, y); ctx.restore();
      ctx.save(); ctx.shadowBlur = 0; ctx.fillStyle = '#ffffff'; ctx.fillText(text, x, y); ctx.restore();
    };

    // 메인 제목
    const fontSize = mainTitle.length <= 8 ? 120 : mainTitle.length <= 14 ? 100 : mainTitle.length <= 20 ? 86 : 72;
    ctx.font = `bold ${fontSize}px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = wrapTextWp(ctx, mainTitle, 960);
    const lh = fontSize * 1.3;
    const subH = subTitle ? 80 : 0;
    const totalH = lines.length * lh + subH + (subTitle ? 30 : 0);
    const startY = (1080 - totalH) / 2;
    lines.forEach((line, i) => drawText(line, 540, startY + i * lh + lh / 2, fontSize));

    // 서브 제목
    if (subTitle) {
      const subY = startY + lines.length * lh + 45;
      const subColor = colorScheme === 'green' ? '#86efac' : colorScheme === 'blue' ? '#93c5fd' : '#e2e8f0';
      ctx.font = `bold 54px "Apple SD Gothic Neo","Malgun Gothic",sans-serif`;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 30; ctx.fillStyle = 'rgba(0,0,0,0.6)';
      for (let i = 0; i < 5; i++) ctx.fillText(subTitle, 540, subY); ctx.restore();
      ctx.save(); ctx.shadowBlur = 0; ctx.fillStyle = subColor; ctx.fillText(subTitle, 540, subY); ctx.restore();
    }

    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('canvas blob 실패'));
      resolve(new File([blob], `thumb_${Date.now()}.png`, { type: 'image/png' }));
    }, 'image/png');
  });
}

// ── 수동 대표이미지 생성기 컴포넌트 ──────────────────────────────────────────────

interface WpThumbnailGeneratorProps {
  defaultTitle: string;
  onSetAsFeatured: (file: File, previewUrl: string) => void;
}

function WpThumbnailGenerator({ defaultTitle, onSetAsFeatured }: WpThumbnailGeneratorProps) {
  const [bgQuery, setBgQuery] = useState('');
  const [bgImages, setBgImages] = useState<{ id: number; url: string; thumb: string }[]>([]);
  const [bgLoading, setBgLoading] = useState(false);
  const [selectedBg, setSelectedBg] = useState('');
  const [mainTitle, setMainTitle] = useState('');
  const [subTitle, setSubTitle] = useState('');
  const [colorScheme, setColorScheme] = useState<'dark' | 'blue' | 'green'>('dark');
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (defaultTitle && !mainTitle) {
      if (defaultTitle.length > 20) {
        const mid = Math.ceil(defaultTitle.length * 0.6);
        setMainTitle(defaultTitle.slice(0, mid));
        setSubTitle(defaultTitle.slice(mid));
      } else {
        setMainTitle(defaultTitle);
      }
    }
  }, [defaultTitle]); // eslint-disable-line

  async function searchBg() {
    const q = bgQuery || defaultTitle;
    if (!q) return;
    setBgLoading(true);
    try {
      const res = await fetch(`/api/shorts/images?q=${encodeURIComponent(q)}&source=pixabay&per_page=9`);
      const data = await res.json();
      setBgImages((data.images || []).map((img: { id: number; url: string; thumb: string }) => ({ id: img.id, url: img.url, thumb: img.thumb })));
    } finally { setBgLoading(false); }
  }

  async function handleGenerate() {
    if (!selectedBg || !mainTitle) { alert('배경 이미지와 메인 제목을 입력하세요.'); return; }
    setGenerating(true);
    try {
      const file = await generateBloggerThumbFile(mainTitle, subTitle, selectedBg, colorScheme);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      // 숨김 canvas에 미리보기도 렌더 (canvasRef 활용)
      if (canvasRef.current) {
        const img = new Image(); img.src = url;
        img.onload = () => { const c = canvasRef.current!; const ctx = c.getContext('2d')!; c.width = 1080; c.height = 1080; ctx.drawImage(img, 0, 0); };
      }
    } catch (e) { alert('생성 오류: ' + String(e)); }
    finally { setGenerating(false); }
  }

  return (
    <div className="border border-orange-200 bg-orange-50 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-orange-700">🖼️ 대표이미지 생성기</span>
        <div className="flex gap-1.5">
          {(['dark', 'blue', 'green'] as const).map(c => (
            <button key={c} onClick={() => setColorScheme(c)}
              className={`w-5 h-5 rounded-full border-2 transition-all ${colorScheme === c ? 'border-orange-500 scale-125' : 'border-transparent'} ${c === 'dark' ? 'bg-gray-800' : c === 'blue' ? 'bg-blue-800' : 'bg-green-800'}`} />
          ))}
        </div>
      </div>

      {/* 배경 이미지 검색 */}
      <div>
        <div className="flex gap-2 mb-2">
          <input type="text" value={bgQuery} onChange={e => setBgQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchBg()}
            placeholder={defaultTitle || '배경 이미지 검색 (영어 권장)'}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400 bg-white" />
          <button onClick={searchBg} disabled={bgLoading}
            className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-sm px-3 py-2 rounded-xl">
            {bgLoading ? '...' : '검색'}
          </button>
          <button onClick={() => fileInputRef.current?.click()}
            className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm px-3 py-2 rounded-xl" title="직접 업로드">⬆️</button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) { const r = new FileReader(); r.onload = ev => { if (ev.target?.result) setSelectedBg(ev.target.result as string); }; r.readAsDataURL(f); }
          }} />
        {bgImages.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {bgImages.map(img => (
              <button key={img.id} onClick={() => setSelectedBg(img.url)}
                className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${selectedBg === img.url ? 'border-orange-500 ring-2 ring-orange-400' : 'border-transparent hover:border-gray-300'}`}>
                <img src={img.thumb} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
        {selectedBg && bgImages.length === 0 && <p className="text-xs text-green-600 mt-1">✅ 배경 이미지 선택됨</p>}
      </div>

      {/* 제목 입력 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">메인 제목 (크게)</label>
          <textarea value={mainTitle} onChange={e => setMainTitle(e.target.value)} rows={2}
            placeholder="예: 월급만으론&#10;부족하다면?" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400 resize-none bg-white" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">서브 제목 (작게, 선택)</label>
          <textarea value={subTitle} onChange={e => setSubTitle(e.target.value)} rows={2}
            placeholder="예: 월배당 ETF 전략" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400 resize-none bg-white" />
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <button onClick={handleGenerate} disabled={generating || !selectedBg || !mainTitle}
        className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
        {generating ? '생성 중...' : '✨ 대표이미지 생성'}
      </button>

      {previewUrl && (
        <div className="space-y-2">
          <img src={previewUrl} alt="preview" className="w-full max-w-[200px] mx-auto rounded-xl border border-orange-200 block" />
          <div className="flex gap-2">
            <a href={previewUrl} download={`wp_thumb_${Date.now()}.png`}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2 rounded-xl text-center transition-colors">
              ⬇️ 다운로드
            </a>
            <button onClick={async () => {
              const res = await fetch(previewUrl);
              const blob = await res.blob();
              const file = new File([blob], `wp_thumb_${Date.now()}.png`, { type: 'image/png' });
              onSetAsFeatured(file, previewUrl);
            }}
              className="flex-1 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold py-2 rounded-xl transition-colors">
              ★ 대표이미지로 설정
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function WordPressPage() {
  const [tab, setTab] = useState<Tab>('publish');

  // WP 사이트
  const [sites, setSites] = useState<WpSite[]>([]);
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [addingSite, setAddingSite] = useState(false);
  const [siteForm, setSiteForm] = useState({ site_name: '', site_url: '', wp_username: '', app_password: '' });
  const [siteMsg, setSiteMsg] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ site_name: '', site_url: '', wp_username: '', app_password: '' });
  const [editMsg, setEditMsg] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // 노션
  const [notionForm, setNotionForm] = useState({ integration_token: '', database_id: '', status_property: 'Status', openai_api_key: '', rewrite_prompt: '' });
  const [notionConnected, setNotionConnected] = useState(false);
  const [notionMsg, setNotionMsg] = useState('');
  const [articles, setArticles] = useState<NotionArticle[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<NotionArticle | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  // 편집기
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categories, setCategories] = useState('');
  const [tags, setTags] = useState('');
  const [publishStatus, setPublishStatus] = useState<'publish' | 'draft'>('publish');
  const [preview, setPreview] = useState(false);

  // SEO 리라이팅
  const [targetKeyword, setTargetKeyword] = useState('');
  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState('');

  // 자동화
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [snsPosting, setSnsPosting] = useState(false);
  const [autoStep, setAutoStep] = useState('');
  const [snsHook, setSnsHook] = useState('');
  const [snsResults, setSnsResults] = useState<{ platform: string; success: boolean; error?: string }[] | null>(null);

  // 대표이미지 생성기
  const [showThumbGen, setShowThumbGen] = useState(false);

  // 이미지
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadedData, setUploadedData] = useState<UploadedSiteData[] | null>(null);

  // 발행
  const [publishing, setPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState<PublishResult[] | null>(null);
  const [publishError, setPublishError] = useState('');

  // 히스토리
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const resetUpload = () => setUploadedData(null);

  // ── 이미지 핸들러 ─────────────────────────────────────────────────────────

  const handleImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setImageFiles((p) => [...p, ...files]);
    setImagePreviews((p) => [...p, ...files.map((f) => URL.createObjectURL(f))]);
    resetUpload();
  };
  const removeImage = (idx: number) => {
    URL.revokeObjectURL(imagePreviews[idx]);
    setImageFiles((p) => p.filter((_, i) => i !== idx));
    setImagePreviews((p) => p.filter((_, i) => i !== idx));
    resetUpload();
  };
  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= imageFiles.length) return;
    const nf = [...imageFiles]; const np = [...imagePreviews];
    [nf[from], nf[to]] = [nf[to], nf[from]]; [np[from], np[to]] = [np[to], np[from]];
    setImageFiles(nf); setImagePreviews(np); resetUpload();
  };

  // ── SEO 리라이팅 ──────────────────────────────────────────────────────────

  const handleRewrite = async () => {
    if (!content.trim()) return;
    setRewriting(true); setRewriteError('');
    try {
      const res = await fetch('/api/wordpress/rewrite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, targetKeyword: targetKeyword.trim() }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); setRewriteError((e as { error?: string }).error || `오류 (${res.status})`); return; }
      setContent((await res.json() as { content: string }).content);
    } catch (e) { setRewriteError('네트워크 오류: ' + String(e)); }
    finally { setRewriting(false); }
  };

  // ── WP 이미지 업로드 (수동) ───────────────────────────────────────────────

  const handleUploadImages = async (filesToUpload?: File[]) => {
    const files = filesToUpload ?? imageFiles;
    if (!files.length || !selectedSiteIds.length) return null;
    setUploading(true); setUploadError(''); setUploadedData(null);
    try {
      const fd = new FormData();
      fd.append('meta', JSON.stringify({ siteIds: selectedSiteIds }));
      files.forEach((f) => fd.append('images', f));
      const res = await fetch('/api/wordpress/upload-images', { method: 'POST', body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({})); setUploadError((e as { error?: string }).error || `업로드 실패 (${res.status})`); return null; }
      const data = await res.json() as { results: UploadedSiteData[] };
      setUploadedData(data.results);
      const firstSite = data.results.find((r) => r.images.some((img) => img.url));
      if (firstSite) {
        const bodyUrls = firstSite.images.filter((img) => !!img.url).map((img) => img.url!);
        if (bodyUrls.length > 0) setContent((prev) => injectBodyImages(prev, bodyUrls));
      }
      return data.results;
    } catch (e) { setUploadError('네트워크 오류: ' + String(e)); return null; }
    finally { setUploading(false); }
  };

  // ── 자동화 (공통 로직) ────────────────────────────────────────────────────

  async function runAutoGenerate(): Promise<{ genData: Record<string, unknown>; thumbFile: File; newTitle: string } | null> {
    setAutoStep('✨ AI 제목/태그/후킹 생성 중...');
    const genRes = await fetch('/api/wordpress/auto-generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content }),
    });
    const genData = await genRes.json() as Record<string, unknown>;
    if (!genRes.ok) throw new Error((genData as { error?: string }).error || '자동 생성 실패');

    const newTitle = (genData.seoTitle as string) || title;
    const thumbTitle = (genData.thumbnailTitle as string) || newTitle;
    setTitle(newTitle);
    setCategories((genData.categories as string[] | undefined)?.join(', ') || categories);
    setTags((genData.tags as string[] | undefined)?.join(', ') || tags);
    setSnsHook((genData.snsHook as string) || '');

    setAutoStep('🖼️ 배경 이미지 검색 중...');
    let bgUrl = '';
    try {
      const bgRes = await fetch(`/api/shorts/images?q=${encodeURIComponent(thumbTitle)}&source=pixabay&per_page=3`);
      const bgData = await bgRes.json();
      bgUrl = bgData.images?.[0]?.url || '';
    } catch { /* 실패 시 단색 배경 */ }

    setAutoStep('🖼️ 대표이미지 생성 중...');
    const thumbFile = await generateBloggerThumbFile(thumbTitle, '', bgUrl, 'dark');

    // 썸네일을 첫 번째 이미지로 설정
    setImageFiles((prev) => [thumbFile, ...prev.filter((_, i) => i !== 0)]);
    setImagePreviews((prev) => {
      const url = URL.createObjectURL(thumbFile);
      const rest = prev.filter((_, i) => i !== 0);
      return [url, ...rest];
    });
    resetUpload();
    return { genData, thumbFile, newTitle };
  }

  // ── 버튼1: 🔄 자동화 ─────────────────────────────────────────────────────

  const handleAutoGenerate = async () => {
    if (!content.trim() && !title.trim()) { setPublishError('먼저 노션 아티클을 선택하거나 제목/내용을 입력하세요'); return; }
    setAutoGenerating(true); setPublishError('');
    try {
      await runAutoGenerate();
      setAutoStep('✅ 자동화 완료! 이미지 업로드 후 발행하세요.');
    } catch (e) { setPublishError(String(e)); setAutoStep(''); }
    finally { setAutoGenerating(false); }
  };

  // ── SNS 발행 ─────────────────────────────────────────────────────────────

  const handlePostToSNS = async () => {
    if (!snsHook.trim()) return;
    setSnsPosting(true); setSnsResults(null);
    try {
      const todaysSite = sites.find((s) => s.site_url.includes('2days.kr') || s.site_name.toLowerCase().includes('투데이즈') || s.site_name.toLowerCase().includes('today'));
      const todaysResult = publishResults?.find((r) => r.siteId === todaysSite?.id && r.success) || publishResults?.find((r) => r.success);
      const imageUrl = uploadedData?.[0]?.images?.[0]?.url || '';
      const contentWithLink = todaysResult?.postUrl ? `${snsHook}\n\n👉 ${todaysResult.postUrl}` : snsHook;
      const res = await fetch('/api/wordpress/post-to-sns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: contentWithLink, imageUrl }),
      });
      const data = await res.json() as { results?: { platform: string; success: boolean; error?: string }[] };
      setSnsResults(data.results || []);
    } catch (e) { setSnsResults([{ platform: '오류', success: false, error: String(e) }]); }
    finally { setSnsPosting(false); }
  };

  // ── 수동 발행 ─────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!title.trim() || !content.trim() || !selectedSiteIds.length) return;
    setPublishing(true); setPublishResults(null); setPublishError('');
    try {
      const featuredMediaIds: Record<string, number> = {};
      if (uploadedData) { for (const sd of uploadedData) { if (sd.images?.[0]?.id) featuredMediaIds[sd.siteId] = sd.images[0].id!; } }
      const res = await fetch('/api/wordpress/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(), content, status: publishStatus,
          categories: categories.split(',').map((c) => c.trim()).filter(Boolean),
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
          siteIds: selectedSiteIds, notionPageId: selectedArticle?.id || '', featuredMediaIds,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); setPublishError((e as { error?: string }).error || `서버 오류 (${res.status})`); return; }
      setPublishResults((await res.json() as { results: PublishResult[] }).results);
      loadHistory();
    } catch (e) { setPublishError('네트워크 오류: ' + String(e)); }
    finally { setPublishing(false); }
  };

  const toggleSite = (id: string) => {
    setSelectedSiteIds((p) => p.includes(id) ? p.filter((s) => s !== id) : [...p, id]);
    resetUpload();
  };

  // ── 초기 로드 ─────────────────────────────────────────────────────────────

  const loadSites = useCallback(async () => { const r = await fetch('/api/wordpress/sites'); if (r.ok) setSites(await r.json()); }, []);
  const loadHistory = useCallback(async () => { const r = await fetch('/api/wordpress/history'); if (r.ok) setHistory(await r.json()); }, []);
  const loadNotionSettings = useCallback(async () => {
    const r = await fetch('/api/wordpress/notion?action=settings');
    if (r.ok) {
      const d = await r.json();
      if (d) { setNotionForm({ integration_token: d.integration_token || '', database_id: d.database_id || '', status_property: d.status_property || 'Status', openai_api_key: d.openai_api_key || '', rewrite_prompt: d.rewrite_prompt || '' }); setNotionConnected(true); }
    }
  }, []);

  useEffect(() => { loadSites(); loadHistory(); loadNotionSettings(); }, [loadSites, loadHistory, loadNotionSettings]);

  const loadArticles = async () => {
    setArticlesLoading(true);
    const r = await fetch('/api/wordpress/notion?action=articles');
    if (r.ok) setArticles(await r.json()); else { const e = await r.json(); setNotionMsg(e.error || '아티클 로드 실패'); }
    setArticlesLoading(false);
  };
  useEffect(() => { if (notionConnected) loadArticles(); }, [notionConnected]); // eslint-disable-line

  const selectArticle = async (article: NotionArticle) => {
    setSelectedArticle(article); setTitle(article.title); setContentLoading(true);
    setPublishResults(null); setPublishError(''); resetUpload(); setSnsResults(null); setAutoStep('');
    const r = await fetch(`/api/wordpress/notion?action=content&id=${article.id}`);
    if (r.ok) { const d = await r.json(); setTitle(d.title || article.title); setContent(d.html || ''); }
    setContentLoading(false);
  };

  const handleAddSite = async () => {
    setAddingSite(true); setSiteMsg('');
    const r = await fetch('/api/wordpress/sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(siteForm) });
    const d = await r.json();
    if (r.ok) { setSites((p) => [...p, d]); setSiteForm({ site_name: '', site_url: '', wp_username: '', app_password: '' }); setSiteMsg('✓ 사이트 추가 완료'); }
    else setSiteMsg(`⚠️ ${d.error}`);
    setAddingSite(false);
  };
  const handleDeleteSite = async (id: string) => { await fetch('/api/wordpress/sites', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); setSites((p) => p.filter((s) => s.id !== id)); };

  const handleEditSite = (s: WpSite) => {
    setEditingId(s.id);
    setEditForm({ site_name: s.site_name, site_url: s.site_url, wp_username: s.wp_username, app_password: '' });
    setEditMsg('');
  };
  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSavingEdit(true); setEditMsg('');
    const r = await fetch('/api/wordpress/sites', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, ...editForm }) });
    const d = await r.json();
    if (r.ok) { setSites((p) => p.map((s) => s.id === editingId ? { ...s, ...d } : s)); setEditingId(null); setEditMsg(''); }
    else setEditMsg(`⚠️ ${d.error}`);
    setSavingEdit(false);
  };

  const handleNotionConnect = async () => {
    setNotionMsg('');
    const r = await fetch('/api/wordpress/notion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'connect', ...notionForm }) });
    const d = await r.json();
    if (r.ok) { setNotionConnected(true); setNotionMsg('✓ 노션 연결 성공'); loadArticles(); } else setNotionMsg(`⚠️ ${d.error}`);
  };

  // ── 렌더 ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div>
            <h1 className="text-lg font-black text-gray-900">📝 WordPress 자동 발행</h1>
            <p className="text-xs text-gray-400 mt-0.5">노션 DB → 멀티 사이트 동시 발행</p>
          </div>
          <nav className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {([['publish','✍️','발행'],['sites','🌐','사이트'],['notion','📔','노션'],['history','📋','히스토리']] as [Tab,string,string][]).map(([key,icon,label]) => (
              <button key={key} onClick={() => setTab(key)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab===key?'bg-white text-gray-900 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>{icon} {label}</button>
            ))}
          </nav>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6">

        {/* ══ TAB: 발행 ══ */}
        {tab === 'publish' && (
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">

            {/* 좌측: 노션 목록 */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                  <h2 className="font-bold text-sm text-gray-800">📔 노션 아티클</h2>
                  <button onClick={loadArticles} disabled={articlesLoading || !notionConnected} className="text-xs text-indigo-500 hover:text-indigo-700 disabled:opacity-40">
                    {articlesLoading ? '로딩...' : '↻ 새로고침'}
                  </button>
                </div>
                {!notionConnected ? (
                  <div className="p-4 text-center"><p className="text-xs text-gray-400 mb-2">노션 연동이 필요합니다</p><button onClick={() => setTab('notion')} className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg font-medium">노션 설정하기 →</button></div>
                ) : articlesLoading ? <div className="p-6 text-center text-xs text-gray-400">불러오는 중...</div>
                : articles.length === 0 ? <div className="p-6 text-center text-xs text-gray-400">아티클이 없습니다</div>
                : (
                  <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-50">
                    {articles.map((a) => (
                      <button key={a.id} onClick={() => selectArticle(a)} className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selectedArticle?.id===a.id?'bg-indigo-50 border-l-2 border-indigo-400':''}`}>
                        <div className="flex items-start justify-between gap-2"><p className="text-xs font-medium text-gray-800 line-clamp-2 flex-1">{a.title}</p><StatusBadge status={a.status} /></div>
                        <p className="text-[10px] text-gray-400 mt-1">{new Date(a.lastEdited).toLocaleDateString('ko-KR')}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!selectedArticle && <div className="bg-white rounded-2xl border border-gray-100 p-4"><p className="text-xs text-gray-400 text-center">노션에서 아티클을 선택하거나<br />오른쪽에서 직접 내용을 입력하세요</p></div>}
            </div>

            {/* 우측: 에디터 */}
            <div className="space-y-4">
              {/* 제목 */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목을 입력하세요" className="w-full text-xl font-bold text-gray-900 placeholder-gray-300 focus:outline-none" />
              </div>

              {/* 메타 + 이미지 */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">카테고리</label>
                    <input value={categories} onChange={(e) => setCategories(e.target.value)} placeholder="여행, 음식 (쉼표 구분)" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">태그</label>
                    <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="맛집, 추천 (쉼표 구분)" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                  </div>
                  <div className="col-span-2">
                    {/* 대표이미지 생성기 토글 */}
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-gray-500">
                        이미지 선택 <span className="font-normal text-gray-400 ml-1">① 대표이미지, ②③… 소제목 순서 자동 배치</span>
                      </label>
                      <button onClick={() => setShowThumbGen(v => !v)}
                        className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${showThumbGen ? 'bg-orange-500 text-white' : 'bg-orange-100 text-orange-600 hover:bg-orange-200'}`}>
                        🖼️ 대표이미지 생성기
                      </button>
                    </div>
                    {showThumbGen && (
                      <div className="mb-3">
                        <WpThumbnailGenerator
                          defaultTitle={title}
                          onSetAsFeatured={(file, previewUrl) => {
                            setImageFiles(prev => [file, ...prev.filter((_, i) => i !== 0)]);
                            setImagePreviews(prev => {
                              const rest = prev.filter((_, i) => i !== 0);
                              return [previewUrl, ...rest];
                            });
                            resetUpload();
                            setShowThumbGen(false);
                          }}
                        />
                      </div>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 hover:border-indigo-300 transition-colors">
                      <span className="text-sm">🖼️</span><span className="text-sm text-gray-400">이미지 파일 직접 선택 (여러 개 가능)</span>
                      <input type="file" multiple accept="image/*" onChange={handleImagesChange} className="hidden" />
                    </label>
                    {imagePreviews.length > 0 && (
                      <div className="flex gap-2 mt-2.5 flex-wrap">
                        {imagePreviews.map((url, i) => (
                          <div key={i} className="relative group">
                            <img src={url} alt="" className="w-16 h-16 object-cover rounded-xl border border-gray-200" />
                            <span className={`absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shadow ${i===0?'bg-orange-500 text-white':'bg-gray-700 text-white'}`}>{i===0?'★':i}</span>
                            {uploadedData && <span className={`absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center shadow ${uploadedData.every((s)=>s.images[i]?.url)?'bg-emerald-500 text-white':'bg-red-400 text-white'}`}>{uploadedData.every((s)=>s.images[i]?.url)?'✓':'✗'}</span>}
                            <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                              {i>0 && <button type="button" onClick={() => moveImage(i,i-1)} className="text-white text-xs bg-black/50 rounded px-1">←</button>}
                              <button type="button" onClick={() => removeImage(i)} className="text-white text-xs bg-red-500 rounded px-1">✕</button>
                              {i<imagePreviews.length-1 && <button type="button" onClick={() => moveImage(i,i+1)} className="text-white text-xs bg-black/50 rounded px-1">→</button>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {imagePreviews.length > 0 && <p className="text-[10px] text-gray-400 mt-1">★ 대표이미지 | 숫자 = h2 소제목 순서 배치 | 호버 → 이동/삭제</p>}
                  </div>
                </div>
              </div>

              {/* SNS 후킹 문구 (자동화 후 표시) */}
              {snsHook && (
                <div className="bg-indigo-50 rounded-2xl border border-indigo-100 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-indigo-700">📲 SNS 후킹 요약본</span>
                    <div className="flex items-center gap-2">
                      <button onClick={handlePostToSNS} disabled={snsPosting} className="text-xs bg-rose-500 hover:bg-rose-400 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">
                        {snsPosting ? '⏳ 발행 중...' : '🚀 SNS 발행'}
                      </button>
                      <button onClick={() => setSnsHook('')} className="text-[10px] text-indigo-400 hover:text-indigo-600">✕</button>
                    </div>
                  </div>
                  <textarea value={snsHook} onChange={(e) => setSnsHook(e.target.value)} rows={4} className="w-full text-xs text-indigo-800 bg-transparent focus:outline-none resize-none" />
                  {!publishResults && <p className="text-[10px] text-indigo-400 mt-1">* 워드프레스 발행 후 SNS 발행 시 블로그 링크가 자동 추가됩니다</p>}
                </div>
              )}

              {/* 본문 에디터 */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50 flex-wrap gap-2">
                  <span className="text-sm font-semibold text-gray-700">본문</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {contentLoading && <span className="text-xs text-gray-400 animate-pulse">노션에서 불러오는 중...</span>}
                    <input value={targetKeyword} onChange={(e) => setTargetKeyword(e.target.value)} placeholder="대상 키워드 (선택)" className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 w-32 focus:outline-none focus:border-emerald-400" />
                    {/* SEO 리라이팅 */}
                    <button onClick={handleRewrite} disabled={rewriting||!content.trim()} className="text-xs bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">
                      {rewriting ? '⏳...' : '🤖 SEO 리라이팅'}
                    </button>
                    {/* 자동화 */}
                    <button onClick={handleAutoGenerate} disabled={autoGenerating||(!content.trim()&&!title.trim())} className="text-xs bg-violet-500 hover:bg-violet-400 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">
                      {autoGenerating ? '⏳...' : '🔄 자동화'}
                    </button>
                    <button onClick={() => setPreview((v) => !v)} className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${preview?'bg-gray-900 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {preview ? '편집' : '미리보기'}
                    </button>
                  </div>
                </div>
                {rewriteError && <div className="px-5 py-2 bg-red-50 text-xs text-red-600 border-b border-red-100">⚠️ {rewriteError}</div>}

                {/* 자동화 진행 상태 */}
                {autoGenerating && autoStep && (
                  <div className="px-5 py-2 bg-violet-50 text-xs text-violet-700 border-b border-violet-100 animate-pulse font-medium">
                    {autoStep}
                  </div>
                )}
                {!autoGenerating && autoStep && (
                  <div className="px-5 py-2 bg-emerald-50 text-xs text-emerald-700 border-b border-emerald-100 font-medium">
                    {autoStep}
                  </div>
                )}

                {preview ? (
                  <div className="p-5 prose prose-sm max-w-none min-h-[300px] text-gray-800" dangerouslySetInnerHTML={{ __html: content || '<p class="text-gray-400">내용을 입력하세요</p>' }} />
                ) : (
                  <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="HTML 본문을 입력하거나 노션에서 불러오세요" className="w-full px-5 py-4 text-sm font-mono text-gray-800 focus:outline-none resize-none min-h-[300px]" rows={16} />
                )}
              </div>

              {/* SNS 자동 포스팅 결과 */}
              {snsResults && snsResults.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <h3 className="font-bold text-sm text-gray-800 mb-3">📲 SNS 포스팅 결과</h3>
                  <div className="space-y-2">
                    {snsResults.map((r) => (
                      <div key={r.platform} className={`flex items-center gap-3 p-2.5 rounded-xl ${r.success?'bg-emerald-50':'bg-red-50'}`}>
                        <span className={`w-2 h-2 rounded-full ${r.success?'bg-emerald-400':'bg-red-400'}`} />
                        <span className="text-sm font-semibold text-gray-800">{r.platform}</span>
                        <span className={`text-xs ml-auto font-bold ${r.success?'text-emerald-600':'text-red-500'}`}>{r.success?'✓ 완료':'✗ 실패'}</span>
                        {!r.success && r.error && <p className="text-xs text-red-400 truncate max-w-48">{r.error}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 사이트 선택 + 이미지 업로드 + 발행 */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-sm text-gray-800">발행 사이트 선택</h3>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 font-medium">상태</label>
                    <select value={publishStatus} onChange={(e) => setPublishStatus(e.target.value as 'publish' | 'draft')} className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none">
                      <option value="publish">즉시 발행</option>
                      <option value="draft">임시저장</option>
                    </select>
                  </div>
                </div>

                {sites.length === 0 ? (
                  <p className="text-xs text-gray-400 mb-3">사이트를 먼저 등록하세요 → <button onClick={() => setTab('sites')} className="text-indigo-500 underline">사이트 관리</button></p>
                ) : (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {sites.map((site) => (
                      <button key={site.id} onClick={() => toggleSite(site.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${selectedSiteIds.includes(site.id)?'border-indigo-400 bg-indigo-50 text-indigo-700':'border-gray-200 text-gray-600 hover:border-indigo-300'}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{site.site_name}
                      </button>
                    ))}
                  </div>
                )}

                {/* 수동 이미지 업로드 */}
                {imageFiles.length > 0 && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-semibold text-gray-700">🖼️ WP 미디어 업로드 ({imageFiles.length}장)</span>
                      <button onClick={() => handleUploadImages()} disabled={uploading||!selectedSiteIds.length} className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">
                        {uploading?'⏳ 업로드 중...':uploadedData?'↻ 재업로드':'📤 이미지 업로드'}
                      </button>
                    </div>
                    {!selectedSiteIds.length && <p className="text-[10px] text-amber-500">사이트를 먼저 선택하세요</p>}
                    {uploadError && <p className="text-[10px] text-red-500 mt-1">⚠️ {uploadError}</p>}
                    {uploadedData && (
                      <div className="mt-2 space-y-1.5">
                        {uploadedData.map((sd) => {
                          const ok = sd.images.filter((img) => img.url).length;
                          const firstErr = sd.error || sd.images.find((img) => img.error)?.error;
                          return (
                            <div key={sd.siteId}>
                              <div className="flex items-center gap-2">
                                <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${ok===sd.images.length&&!sd.error?'bg-emerald-500 text-white':ok>0?'bg-amber-400 text-white':'bg-red-500 text-white'}`}>{ok===sd.images.length&&!sd.error?'✓':'!'}</span>
                                <span className="text-xs text-gray-700 font-medium">{sd.siteName}</span>
                                <span className="text-[10px] text-gray-500">{ok}/{sd.images.length}장 완료</span>
                              </div>
                              {firstErr && <p className="text-[10px] text-red-500 mt-0.5 ml-5 break-all">{firstErr.slice(0,150)}</p>}
                            </div>
                          );
                        })}
                        {uploadedData.some((s) => s.images.some((img) => img.url)) && <p className="text-[10px] text-indigo-500">✓ 본문 이미지 자동 삽입 완료</p>}
                      </div>
                    )}
                  </div>
                )}

                {publishError && <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3 text-xs text-red-600">⚠️ {publishError}</div>}

                <button onClick={handlePublish} disabled={publishing||autoGenerating||!title.trim()||!content.trim()||!selectedSiteIds.length} className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white py-3 rounded-xl font-bold text-sm transition-colors">
                  {publishing?'🚀 발행 중...':`🚀 ${selectedSiteIds.length}개 사이트에 발행`}
                </button>
                {!selectedSiteIds.length&&sites.length>0 && <p className="text-xs text-amber-500 text-center mt-2">발행할 사이트를 선택하세요</p>}
              </div>

              {/* 발행 결과 */}
              {publishResults && (
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <h3 className="font-bold text-sm text-gray-800 mb-3">발행 결과</h3>
                  <div className="space-y-2">
                    {publishResults.map((r) => (
                      <div key={r.siteId} className={`flex items-center gap-3 p-3 rounded-xl ${r.success?'bg-emerald-50':'bg-red-50'}`}>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.success?'bg-emerald-400':'bg-red-400'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{r.siteName}</p>
                          {r.success&&r.postUrl && <a href={r.postUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-500 underline truncate block">{r.postUrl}</a>}
                          {!r.success && <p className="text-xs text-red-500">{r.error}</p>}
                        </div>
                        <span className={`text-xs font-bold ${r.success?'text-emerald-600':'text-red-500'}`}>{r.success?'✓ 완료':'✗ 실패'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ TAB: 사이트 관리 ══ */}
        {tab === 'sites' && (
          <div className="max-w-2xl space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50"><h2 className="font-bold text-gray-800">등록된 WordPress 사이트</h2></div>
              {sites.length===0 ? <div className="p-6 text-center text-sm text-gray-400">등록된 사이트가 없습니다</div> : (
                <div className="divide-y divide-gray-50">
                  {sites.map((s) => (
                    <div key={s.id} className="px-5 py-4">
                      {editingId === s.id ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-bold text-gray-700">사이트 수정</span>
                            <button onClick={() => setEditingId(null)} className="ml-auto text-xs text-gray-400 hover:text-gray-600">취소</button>
                          </div>
                          {[['site_name','사이트 이름',''],['site_url','사이트 URL','font-mono text-xs'],['wp_username','WordPress 사용자명','']].map(([k,p,cls]) => (
                            <input key={k} value={editForm[k as keyof typeof editForm]} onChange={(e) => setEditForm((f) => ({...f,[k]:e.target.value}))} placeholder={p} className={`w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 ${cls}`} />
                          ))}
                          <input value={editForm.app_password} type="password" onChange={(e) => setEditForm((f) => ({...f,app_password:e.target.value}))} placeholder="새 Application Password (변경 시에만 입력)" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                          {editMsg && <p className="text-xs text-red-500">{editMsg}</p>}
                          <button onClick={handleSaveEdit} disabled={savingEdit} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white py-2 rounded-xl font-bold text-sm transition-colors">{savingEdit ? '저장 중...' : '저장'}</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-4">
                          <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center text-sm flex-shrink-0">🌐</div>
                          <div className="flex-1 min-w-0"><p className="text-sm font-bold text-gray-800">{s.site_name}</p><p className="text-xs text-gray-400 truncate">{s.site_url}</p><p className="text-xs text-gray-400">@{s.wp_username}</p></div>
                          <button onClick={() => handleEditSite(s)} className="text-xs text-indigo-500 hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors">수정</button>
                          <button onClick={() => handleDeleteSite(s.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">삭제</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h2 className="font-bold text-gray-800 mb-4">사이트 추가</h2>
              <div className="space-y-3">
                {[['site_name','사이트 이름 (예: 메인 블로그)',''],['site_url','사이트 URL (예: https://2days.kr)','font-mono text-xs'],['wp_username','WordPress 사용자명','']].map(([k,p,cls]) => (
                  <input key={k} value={siteForm[k as keyof typeof siteForm]} onChange={(e) => setSiteForm((f) => ({...f,[k]:e.target.value}))} placeholder={p} className={`w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 ${cls}`} />
                ))}
                <input value={siteForm.app_password} type="password" onChange={(e) => setSiteForm((f) => ({...f,app_password:e.target.value}))} placeholder="Application Password" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">💡 <strong>앱비밀번호:</strong> WordPress 관리자 → 사용자 → 프로필 → &quot;애플리케이션 비밀번호&quot;</div>
                {siteMsg && <p className={`text-xs ${siteMsg.startsWith('✓')?'text-emerald-600':'text-red-500'}`}>{siteMsg}</p>}
                <button onClick={handleAddSite} disabled={addingSite||!siteForm.site_name||!siteForm.site_url||!siteForm.wp_username||!siteForm.app_password} className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white py-2.5 rounded-xl font-bold text-sm transition-colors">{addingSite?'연결 테스트 중...':'+ 사이트 추가'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ TAB: 노션 설정 ══ */}
        {tab === 'notion' && (
          <div className="max-w-2xl space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center text-xl">📔</div>
                <div><h2 className="font-bold text-gray-800">Notion 연동</h2><p className="text-xs text-gray-400">Integration Token + Database ID 설정</p></div>
                {notionConnected && <span className="ml-auto text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded-full">✓ 연결됨</span>}
              </div>
              <div className="space-y-3">
                {[['integration_token','secret_xxxxxxxx...','password'],['database_id','xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx','text'],['status_property','Status 또는 상태','text']].map(([k,p,t]) => (
                  <div key={k}>
                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">{k==='integration_token'?'Integration Token':k==='database_id'?'Database ID':'상태 필드명'}</label>
                    <input value={notionForm[k as keyof typeof notionForm]} type={t} onChange={(e) => setNotionForm((f) => ({...f,[k]:e.target.value}))} placeholder={p} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-mono text-xs" />
                  </div>
                ))}
                <div className="bg-amber-50 rounded-xl p-3 text-xs text-amber-700 space-y-1">
                  <p><strong>Integration Token:</strong> notion.so/my-integrations → New integration</p>
                  <p><strong>Database ID:</strong> DB URL 마지막 32자리</p>
                </div>
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-sm font-bold text-gray-800 mb-3">🤖 SEO 리라이팅 + 자동화 설정</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1.5">OpenAI API 키 <span className="font-normal text-gray-400">(리라이팅 + 자동화에 사용)</span></label>
                      <input value={notionForm.openai_api_key} type="password" onChange={(e) => setNotionForm((f) => ({...f,openai_api_key:e.target.value.trim()}))} placeholder="sk-..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 font-mono text-xs" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1.5">커스텀 프롬프트 <span className="font-normal text-gray-400">(비워두면 기본 SEO)</span></label>
                      <textarea value={notionForm.rewrite_prompt} onChange={(e) => setNotionForm((f) => ({...f,rewrite_prompt:e.target.value}))} rows={5} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-emerald-400 resize-y font-mono" placeholder="ChatGPT Custom GPTs 시스템 프롬프트를 붙여넣으세요" />
                    </div>
                  </div>
                </div>
                {notionMsg && <p className={`text-xs ${notionMsg.startsWith('✓')?'text-emerald-600':'text-red-500'}`}>{notionMsg}</p>}
                <button onClick={handleNotionConnect} disabled={!notionForm.integration_token||!notionForm.database_id} className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white py-2.5 rounded-xl font-bold text-sm transition-colors">연결 테스트 + 저장</button>
              </div>
            </div>
            {notionConnected && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-3"><h3 className="font-semibold text-gray-800 text-sm">DB 아티클 미리보기</h3><button onClick={loadArticles} className="text-xs text-indigo-500 hover:text-indigo-700">↻ 새로고침</button></div>
                {articlesLoading ? <p className="text-xs text-gray-400 text-center py-4">불러오는 중...</p> : (
                  <div className="space-y-2">
                    {articles.slice(0,5).map((a) => (
                      <div key={a.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-xl"><p className="text-xs text-gray-700 flex-1 truncate">{a.title}</p><StatusBadge status={a.status} /></div>
                    ))}
                    {articles.length>5 && <p className="text-xs text-gray-400 text-center">+{articles.length-5}개 더...</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: 히스토리 ══ */}
        {tab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between"><h2 className="font-bold text-gray-800">발행 히스토리</h2><button onClick={loadHistory} className="text-xs text-gray-500 hover:text-gray-700">↻ 새로고침</button></div>
            {history.length===0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-400">발행 기록이 없습니다</div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="divide-y divide-gray-50">
                  {history.map((item) => {
                    const ok = item.results?.filter((r) => r.success).length || 0;
                    const total = item.results?.length || item.sites?.length || 0;
                    return (
                      <div key={item.id} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{item.title}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {item.sites?.map((s) => <span key={s} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s}</span>)}
                              <span className="text-[10px] text-gray-400">{new Date(item.created_at).toLocaleDateString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                            </div>
                          </div>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full flex-shrink-0 ${ok===total?'bg-emerald-100 text-emerald-700':ok>0?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'}`}>{ok}/{total} 완료</span>
                        </div>
                        {item.results?.length>0 && (
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {item.results.map((r) => r.success&&r.postUrl ? (
                              <a key={r.siteId} href={r.postUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-500 underline hover:text-indigo-700">{r.siteName} ↗</a>
                            ) : <span key={r.siteId} className="text-[10px] text-red-400">{r.siteName} ✗</span>)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
