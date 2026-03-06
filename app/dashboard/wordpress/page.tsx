'use client';

import { useState, useEffect, useCallback } from 'react';

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

// ── 헬퍼: 썸네일 생성 (클라이언트 Canvas) ─────────────────────────────────────

const THUMB_THEMES = [
  { bg: ['#0a0a0f', '#1a1a2e', '#0d0d1a'], accent: '#4ecdc4' },
  { bg: ['#0f0c1a', '#1a0533', '#0f0c1a'], accent: '#ce93d8' },
  { bg: ['#0a1628', '#1a2d4a', '#0a1628'], accent: '#4fc3f7' },
  { bg: ['#0f0a00', '#2d1500', '#1a0800'], accent: '#ffb74d' },
  { bg: ['#0a1a0a', '#0f2d0f', '#0a1a0a'], accent: '#a5d6a7' },
  { bg: ['#0a0a0a', '#1c1c1c', '#0a0a0a'], accent: '#ef9a9a' },
  { bg: ['#1a0a1a', '#2d0d2d', '#1a0a1a'], accent: '#b39ddb' },
  { bg: ['#00141a', '#002833', '#00141a'], accent: '#80deea' },
];

function generateThumbnailFile(title: string): Promise<File> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d')!;
    const W = 1080, H = 1080;

    const theme = THUMB_THEMES[Math.floor(Math.random() * THUMB_THEMES.length)];

    // 방사형 그라디언트 배경
    const grad = ctx.createRadialGradient(W / 2, H * 0.38, 60, W / 2, H / 2, W * 0.78);
    grad.addColorStop(0, theme.bg[1]);
    grad.addColorStop(0.55, theme.bg[0]);
    grad.addColorStop(1, theme.bg[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 비네트 오버레이
    const vignette = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, W * 0.72);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    // 중앙 액센트 글로우
    const glow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 420);
    glow.addColorStop(0, theme.accent + '22');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // 골드 상단 바
    const goldGrad = ctx.createLinearGradient(0, 0, W, 0);
    goldGrad.addColorStop(0, '#7d5800');
    goldGrad.addColorStop(0.25, '#ffd700');
    goldGrad.addColorStop(0.5, '#ffe44d');
    goldGrad.addColorStop(0.75, '#ffd700');
    goldGrad.addColorStop(1, '#7d5800');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, 0, W, 22);

    // 골드 하단 바
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, H - 22, W, 22);

    // 수평 장식선
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (const y of [220, 310, 750, 840]) {
      ctx.beginPath(); ctx.moveTo(80, y); ctx.lineTo(W - 80, y); ctx.stroke();
    }

    // 액센트 수직 사이드 라인
    ctx.strokeStyle = theme.accent + '55';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(60, 100); ctx.lineTo(60, H - 100); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W - 60, 100); ctx.lineTo(W - 60, H - 100); ctx.stroke();

    // 제목 텍스트 설정
    const fontSize = title.length > 14 ? 82 : 94;
    const lineH = fontSize * 1.28;
    ctx.font = `900 ${fontSize}px "Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    // 줄바꿈 처리
    const maxW = 900;
    const words = title.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);

    const totalH = lines.length * lineH;
    const startY = (H - totalH) / 2 + lineH / 2;

    // 액센트 컬러 외곽선 (글로우)
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 5;
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 24;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    lines.forEach((line, i) => ctx.strokeText(line, W / 2, startY + i * lineH));

    // 흰색 텍스트 채우기 (드롭 섀도)
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 32;
    ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;
    lines.forEach((line, i) => ctx.fillText(line, W / 2, startY + i * lineH));

    // 하단 사이트명 (골드)
    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.font = '500 28px "Apple SD Gothic Neo",sans-serif';
    ctx.fillStyle = 'rgba(255,215,0,0.8)';
    ctx.fillText('2days.kr', W / 2, H - 48);

    canvas.toBlob((blob) => {
      resolve(new File([blob!], `thumb_${Date.now()}.png`, { type: 'image/png' }));
    }, 'image/png');
  });
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
  const [autoStep, setAutoStep] = useState('');
  const [snsHook, setSnsHook] = useState('');
  const [snsResults, setSnsResults] = useState<{ platform: string; success: boolean; error?: string }[] | null>(null);

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

    setAutoStep('🖼️ 대표이미지 생성 중...');
    const thumbFile = await generateThumbnailFile(thumbTitle);

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

  // ── 버튼2: 🚀 자동화+SNS ─────────────────────────────────────────────────

  const handleAutoPublishSNS = async () => {
    if (!content.trim() || !title.trim()) { setPublishError('노션 아티클을 먼저 선택하세요'); return; }
    if (!selectedSiteIds.length) { setPublishError('발행할 사이트를 선택하세요'); return; }

    setAutoGenerating(true); setPublishResults(null); setPublishError(''); setSnsResults(null);

    try {
      // 1. AI 생성 + 썸네일
      const gen = await runAutoGenerate();
      if (!gen) throw new Error('자동 생성 실패');
      const { genData, thumbFile, newTitle } = gen;

      // 2. 이미지 업로드
      setAutoStep('📤 WP 미디어 업로드 중...');
      const allFiles = [thumbFile, ...imageFiles.slice(1)];
      const uploadFd = new FormData();
      uploadFd.append('meta', JSON.stringify({ siteIds: selectedSiteIds }));
      allFiles.forEach((f) => uploadFd.append('images', f));
      const uploadRes = await fetch('/api/wordpress/upload-images', { method: 'POST', body: uploadFd });
      if (!uploadRes.ok) throw new Error('이미지 업로드 실패');
      const uploadData = await uploadRes.json() as { results: UploadedSiteData[] };
      setUploadedData(uploadData.results);

      // 본문에 body 이미지 삽입
      let currentContent = content;
      const firstSite = uploadData.results.find((r) => r.images.some((img) => img.url));
      if (firstSite) {
        const bodyUrls = firstSite.images.filter((img) => !!img.url).map((img) => img.url!);
        if (bodyUrls.length > 0) { currentContent = injectBodyImages(currentContent, bodyUrls); setContent(currentContent); }
      }

      // 3. WordPress 발행
      setAutoStep('🚀 WordPress 발행 중...');
      const featuredMediaIds: Record<string, number> = {};
      for (const sd of uploadData.results) { if (sd.images?.[0]?.id) featuredMediaIds[sd.siteId] = sd.images[0].id!; }

      const publishRes = await fetch('/api/wordpress/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle, content: currentContent, status: publishStatus,
          categories: (genData.categories as string[] | undefined) || categories.split(',').map((c) => c.trim()).filter(Boolean),
          tags: (genData.tags as string[] | undefined) || tags.split(',').map((t) => t.trim()).filter(Boolean),
          siteIds: selectedSiteIds, notionPageId: selectedArticle?.id || '', featuredMediaIds,
        }),
      });
      const publishData = await publishRes.json() as { results: PublishResult[] };
      setPublishResults(publishData.results);
      loadHistory();

      // 4. SNS 포스팅 (투데이즈 URL 사용)
      setAutoStep('📲 SNS 포스팅 중...');
      const todaysSite = sites.find((s) => s.site_url.includes('2days.kr') || s.site_name.toLowerCase().includes('투데이즈') || s.site_name.toLowerCase().includes('today'));
      const todaysResult = publishData.results?.find((r) => r.siteId === todaysSite?.id && r.success) || publishData.results?.find((r) => r.success);
      const hook = (genData.snsHook as string) || snsHook;

      if (todaysResult?.postUrl && hook) {
        const thumbSite = uploadData.results.find((r) => r.siteId === todaysSite?.id) || uploadData.results[0];
        const thumbUrl = thumbSite?.images?.[0]?.url || '';
        const snsRes = await fetch('/api/wordpress/post-to-sns', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: `${hook}\n\n👉 ${todaysResult.postUrl}`, imageUrl: thumbUrl }),
        });
        const snsData = await snsRes.json() as { results?: typeof snsResults };
        setSnsResults(snsData.results || []);
      }

      setAutoStep('🎉 완전 자동화 완료!');
    } catch (e) { setPublishError(String(e)); setAutoStep(''); }
    finally { setAutoGenerating(false); }
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
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">
                      이미지 선택 <span className="font-normal text-gray-400 ml-1">① 대표이미지, ②③… 소제목 순서 자동 배치</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 hover:border-indigo-300 transition-colors">
                      <span className="text-sm">🖼️</span><span className="text-sm text-gray-400">이미지 파일 선택 (여러 개 가능)</span>
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
                    <button onClick={() => setSnsHook('')} className="text-[10px] text-indigo-400 hover:text-indigo-600">✕</button>
                  </div>
                  <textarea value={snsHook} onChange={(e) => setSnsHook(e.target.value)} rows={4} className="w-full text-xs text-indigo-800 bg-transparent focus:outline-none resize-none" />
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
                    {/* 자동화+SNS */}
                    <button onClick={handleAutoPublishSNS} disabled={autoGenerating||(!content.trim()&&!title.trim())||!selectedSiteIds.length} className="text-xs bg-rose-500 hover:bg-rose-400 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">
                      {autoGenerating ? '⏳...' : '🚀 자동화+SNS'}
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
                    <div key={s.id} className="flex items-center gap-4 px-5 py-4">
                      <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center text-sm flex-shrink-0">🌐</div>
                      <div className="flex-1 min-w-0"><p className="text-sm font-bold text-gray-800">{s.site_name}</p><p className="text-xs text-gray-400 truncate">{s.site_url}</p><p className="text-xs text-gray-400">@{s.wp_username}</p></div>
                      <button onClick={() => handleDeleteSite(s.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">삭제</button>
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
