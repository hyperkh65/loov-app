'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

function modelEmoji(id: string): string {
  if (id.includes('qwen')) return '🔮';
  if (id.includes('llama')) return '🦙';
  if (id.includes('mistral') || id.includes('ministral')) return '🌪️';
  if (id.includes('gemma')) return '💎';
  if (id.includes('deepseek')) return '🧠';
  if (id.includes('phi')) return '🔵';
  if (id.includes('gemini')) return '✨';
  if (id.includes('command')) return '⚡';
  if (id.includes('granite')) return '🪨';
  if (id.includes('smol') || id.includes('mini')) return '🐣';
  if (id.includes('codellama') || id.includes('coder')) return '💻';
  if (id.includes('solar')) return '☀️';
  return '🤖';
}

function modelLabel(id: string): string {
  return id.replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const BLOG_PLATFORMS = [
  { id: 'naver', name: '네이버 블로그', icon: '🟢' },
  { id: 'blogger', name: 'Google 블로거', icon: '📝' },
  { id: 'wordpress', name: 'WordPress', icon: '🔵' },
];

const SNS_PLATFORMS = [
  { id: 'twitter', name: 'X (트위터)', icon: '🐦' },
  { id: 'instagram', name: '인스타그램', icon: '📸' },
  { id: 'threads', name: '스레드', icon: '🧵' },
  { id: 'facebook', name: '페이스북', icon: '📘' },
];

type Tab = 'auto' | 'drafts' | 'history';
type Status = 'draft' | 'approved' | 'published' | 'failed' | 'scheduled';

interface Article {
  id: string;
  keyword: string;
  title: string;
  meta_description: string;
  content: string;
  representative_image_url: string | null;
  ai_model: string;
  status: Status;
  blog_platforms: string[];
  sns_platforms: string[];
  published_urls: Record<string, string>;
  published_at: string | null;
  scheduled_at: string | null;
  scheduled_platforms: { blog_platforms: string[]; sns_platforms: string[]; wp_site_ids: string[] } | null;
  word_count: number;
  created_at: string;
  sources: { type: string; title: string; link: string; description?: string }[];
}

interface AutoSettings {
  enabled: boolean;
  ai_model: string;
  max_per_run: number;
  custom_keywords: string[];
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_count: number;
}

const STATUS_LABELS: Record<Status, { label: string; color: string }> = {
  draft: { label: '초안', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: '승인됨', color: 'bg-blue-100 text-blue-800' },
  published: { label: '발행완료', color: 'bg-green-100 text-green-800' },
  failed: { label: '실패', color: 'bg-red-100 text-red-800' },
  scheduled: { label: '예약됨', color: 'bg-purple-100 text-purple-800' },
};

export default function AutoServicePage() {
  const [tab, setTab] = useState<Tab>('auto');

  // 자동실행 설정
  const [autoSettings, setAutoSettings] = useState<AutoSettings>({
    enabled: false, ai_model: 'qwen3', max_per_run: 3,
    custom_keywords: [], last_run_at: null, last_run_status: null, last_run_count: 0,
  });
  const [ollamaModels, setOllamaModels] = useState<{ id: string; name: string; emoji: string; group: string }[]>([
    { id: 'qwen3', name: 'Qwen 3', emoji: '🔮', group: 'ollama' },
    { id: 'qwen3.5', name: 'Qwen 3.5', emoji: '🔮', group: 'ollama' },
    { id: 'llama3.3', name: 'Llama 3.3', emoji: '🦙', group: 'ollama' },
    { id: 'mistral', name: 'Mistral', emoji: '🌪️', group: 'ollama' },
    { id: 'gemma3', name: 'Gemma 3', emoji: '💎', group: 'ollama' },
    { id: 'deepseek-r1', name: 'DeepSeek R1', emoji: '🧠', group: 'ollama' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku', emoji: '🟣', group: 'claude' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet', emoji: '🟣', group: 'claude' },
    { id: 'claude-opus-4-7', name: 'Claude Opus', emoji: '🟣', group: 'claude' },
  ]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [customKwInput, setCustomKwInput] = useState('');
  const [runningNow, setRunningNow] = useState(false);
  const [runResult, setRunResult] = useState<{ generated: number; keywords: string[]; errors?: { keyword: string; reason: string }[] } | null>(null);
  const [runProgress, setRunProgress] = useState<{ keyword: string; status: 'generating' | 'done' | 'error'; reason?: string }[]>([]);

  // 수동 생성
  const [manualKeyword, setManualKeyword] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatingKw, setGeneratingKw] = useState('');

  // 초안/히스토리
  const [articles, setArticles] = useState<Article[]>([]);
  const [history, setHistory] = useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);

  // 미리보기/편집 모달
  const [previewArticle, setPreviewArticle] = useState<Article | null>(null);
  const [modalTab, setModalTab] = useState<'preview' | 'edit' | 'images' | 'watermark'>('preview');
  const [wmAnalysis, setWmAnalysis] = useState<{
    totalChars: number; watermarkCount: number; emojiCount: number; gptScore: number;
    unicodeWatermarks: number; htmlEntities: number; cleanedText: string;
  } | null>(null);
  const [wmLoading, setWmLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editModel, setEditModel] = useState('qwen3');
  const [savingEdit, setSavingEdit] = useState(false);
  // 이미지 편집
  const [imgSearchTab, setImgSearchTab] = useState<'naver' | 'google' | 'pixabay' | 'sns' | 'upload'>('naver');
  const [imgQuery, setImgQuery] = useState('');
  const [imgResults, setImgResults] = useState<{ url: string; thumb: string; author: string; caption?: string }[]>([]);
  const [imgError, setImgError] = useState<string>('');
  const [imgLoading, setImgLoading] = useState(false);
  const [replacingImgSrc, setReplacingImgSrc] = useState<string | null>(null);
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null); // 다운로드 중인 이미지 URL
  // 대표이미지 편집기 (Canvas 기반)
  const [thumbTitle, setThumbTitle] = useState('');
  const [thumbSubTitle, setThumbSubTitle] = useState('');
  const [thumbColor, setThumbColor] = useState<'dark' | 'blue' | 'green' | 'red' | 'orange' | 'violet' | 'teal' | 'golden'>('dark');
  const [thumbGenerating, setThumbGenerating] = useState(false);
  const [thumbRepUrl, setThumbRepUrl] = useState<string | null>(null);
  const [thumbBgQuery, setThumbBgQuery] = useState('');
  const [thumbBgImages, setThumbBgImages] = useState<{ id: number; url: string; thumb: string }[]>([]);
  const [thumbBgLoading, setThumbBgLoading] = useState(false);
  const [thumbSelectedBg, setThumbSelectedBg] = useState('');
  const [thumbPreviewUrl, setThumbPreviewUrl] = useState('');
  const thumbCanvasRef = useRef<HTMLCanvasElement>(null);
  const thumbFileInputRef = useRef<HTMLInputElement>(null);

  // 발행 모달
  const [publishArticle, setPublishArticle] = useState<Article | null>(null);
  const [selBlog, setSelBlog] = useState<string[]>([]);
  const [selSns, setSelSns] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<Record<string, { success: boolean; url?: string; error?: string }> | null>(null);
  // YouTube Shorts 자동 생성
  const [autoShorts, setAutoShorts] = useState(false);
  const [shortsJobs, setShortsJobs] = useState<{ id: string; title: string; status: string; progress: string; video_url?: string; yt_url?: string }[]>([]);
  const [shortsPolling, setShortsPolling] = useState(false);
  // WordPress 사이트 목록
  const [wpSites, setWpSites] = useState<{ id: string; site_name: string; site_url: string }[]>([]);
  const [selWpSiteIds, setSelWpSiteIds] = useState<string[]>([]);

  // 예약 발행 모달
  const [scheduleArticle, setScheduleArticle] = useState<Article | null>(null);
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [schedBlog, setSchedBlog] = useState<string[]>([]);
  const [schedSns, setSchedSns] = useState<string[]>([]);
  const [schedWpSiteIds, setSchedWpSiteIds] = useState<string[]>([]);
  const [scheduling, setScheduling] = useState(false);

  // localStorage에서 키 읽기 (서버로 전달용)
  const getAiKeys = () => {
    let clientGlobalAIKey: string | undefined;
    let clientGlobalAIModel: string | undefined;
    try {
      const stored = localStorage.getItem('bossai-v2');
      if (stored) {
        const { state } = JSON.parse(stored) as { state?: { companySettings?: { globalAIConfig?: { apiKey?: string; model?: string } } } };
        const cfg = state?.companySettings?.globalAIConfig;
        if (cfg?.apiKey) { clientGlobalAIKey = cfg.apiKey; clientGlobalAIModel = cfg.model; }
      }
    } catch { /* ignore */ }
    return {
      clientOllamaKey: localStorage.getItem('freeai_ollama_key') || undefined,
      clientOpenrouterKey: localStorage.getItem('freeai_openrouter_key') || undefined,
      clientGlobalAIKey,
      clientGlobalAIModel,
    };
  };

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const [ollamaRes, claudeRes] = await Promise.allSettled([
        fetch('/api/ollama/models').then(r => r.ok ? r.json() : null),
        fetch('/api/claude/models').then(r => r.ok ? r.json() : null),
      ]);
      const ollamaPopular: string[] = ollamaRes.status === 'fulfilled' && ollamaRes.value
        ? (ollamaRes.value.popular || ollamaRes.value.models || [])
        : [];
      const claudeList: string[] = claudeRes.status === 'fulfilled' && claudeRes.value
        ? (claudeRes.value.models || [])
        : ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7'];
      const combined = [
        ...ollamaPopular.map((id: string) => ({ id, name: modelLabel(id), emoji: modelEmoji(id), group: 'ollama' })),
        ...claudeList.map((id: string) => ({
          id,
          name: id.includes('haiku') ? 'Claude Haiku' : id.includes('sonnet') ? 'Claude Sonnet' : id.includes('opus') ? 'Claude Opus' : id,
          emoji: '🟣',
          group: 'claude',
        })),
      ];
      if (combined.length > 0) setOllamaModels(combined);
    } catch {
      // fallback 유지
    } finally {
      setModelsLoading(false);
    }
  }, []);

  // 설정 로드
  useEffect(() => {
    fetch('/api/auto-service/settings')
      .then(r => r.json())
      .then(d => { if (d && !d.error) setAutoSettings(d); });
    // WordPress 사이트 목록 로드
    fetch('/api/wordpress/sites')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setWpSites(d); });
    loadModels();
  }, [loadModels]);

  const loadArticles = useCallback(async (status?: string) => {
    setLoadingArticles(true);
    const params = status ? `?status=${status}` : '';
    const res = await fetch(`/api/auto-service/articles${params}`);
    const data = await res.json();
    if (status === 'published') {
      setHistory(data.items || []);
    } else {
      setArticles((data.items || []).filter((a: Article) => a.status !== 'published'));
    }
    setLoadingArticles(false);
  }, []);

  useEffect(() => {
    if (tab === 'drafts') loadArticles();
    if (tab === 'history') loadArticles('published');
  }, [tab, loadArticles]);

  // 설정 저장
  const saveSettings = async (newSettings: Partial<AutoSettings>) => {
    setSavingSettings(true);
    setSettingsError('');
    const merged = { ...autoSettings, ...newSettings };
    // 낙관적 업데이트 (즉시 UI 반영)
    setAutoSettings(merged);
    const res = await fetch('/api/auto-service/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(merged),
    });
    if (res.ok) {
      const saved = await res.json();
      setAutoSettings(saved);
    } else {
      const err = await res.json().catch(() => ({}));
      const msg = err.error || '설정 저장 실패';
      setSettingsError(msg.includes('does not exist') || msg.includes('relation')
        ? 'Supabase에 테이블이 없습니다. SQL Editor에서 bossai_auto_settings 테이블을 생성해주세요.'
        : msg);
      // 실패 시 원래 상태로 복원
      setAutoSettings(prev => ({ ...prev, ...autoSettings }));
    }
    setSavingSettings(false);
  };

  // 지금 바로 실행 (SSE 스트리밍)
  const runNow = async () => {
    setRunningNow(true);
    setRunResult(null);
    setRunProgress([]);
    try {
      const res = await fetch('/api/auto-service/auto-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: autoSettings.custom_keywords.length > 0 ? autoSettings.custom_keywords : [],
          ai_model: autoSettings.ai_model,
          max: autoSettings.max_per_run,
          ...getAiKeys(),
        }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `서버 오류 (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as {
              type: string; keyword?: string; status?: string;
              reason?: string; generated?: number;
              keywords?: string[]; errors?: { keyword: string; reason: string }[];
            };
            if (event.type === 'progress' && event.keyword) {
              setRunProgress(prev => {
                const next = prev.filter(p => p.keyword !== event.keyword);
                return [...next, { keyword: event.keyword!, status: event.status as 'generating' | 'done' | 'error', reason: event.reason }];
              });
            } else if (event.type === 'done') {
              setRunResult({ generated: event.generated || 0, keywords: event.keywords || [], errors: event.errors || [] });
              if ((event.generated ?? 0) > 0) {
                setTab('drafts');
                await loadArticles();
              }
              fetch('/api/auto-service/settings').then(r => r.json()).then(d => { if (d && !d.error) setAutoSettings(d); });
            } else if (event.type === 'error') {
              setRunResult({ generated: 0, keywords: [], errors: [{ keyword: '실행', reason: event.reason || '알 수 없는 오류' }] });
            }
          } catch { /* ignore parse error */ }
        }
      }
    } catch (err) {
      setRunResult({
        generated: 0, keywords: [],
        errors: [{ keyword: '실행', reason: String(err) }],
      });
    } finally {
      setRunningNow(false);
    }
  };

  // 수동 글 생성
  const generateManual = async (keyword: string) => {
    if (!keyword.trim()) return;
    setGenerating(true);
    setGeneratingKw(keyword);
    try {
      const res = await fetch('/api/auto-service/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, ai_model: autoSettings.ai_model, ...getAiKeys() }),
      });
      const rawText = await res.text();
      let data: { error?: string; thumbnail_error?: string };
      try { data = JSON.parse(rawText); } catch {
        throw new Error(`서버 응답 오류 (${res.status}) — AI 생성이 너무 오래 걸렸거나 서버 에러입니다. 잠시 후 다시 시도해주세요.`);
      }
      if (!res.ok) throw new Error(data.error || '생성 실패');
      setManualKeyword('');
      setTab('drafts');
      await loadArticles();
      if (data.thumbnail_error) {
        alert(`⚠️ 글은 생성됐지만 대표이미지 실패:\n${data.thumbnail_error}\n\n→ Vercel 환경변수에 R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL 을 설정해주세요.`);
      }
    } catch (err) {
      alert(`글 생성 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
    setGenerating(false);
    setGeneratingKw('');
  };

  const openPreview = (article: Article) => {
    setPreviewArticle(article);
    setModalTab('preview');
    setEditMode(false);
    setEditContent(article.content);
    setEditTitle(article.title);
    setEditModel(article.ai_model || 'qwen3');
    setPublishResult(null);
    setImgResults([]);
    setImgSearchTab('naver');
    setReplacingImgSrc(null);
    setImgQuery(article.keyword || '');
    setThumbTitle(article.title.length > 20 ? article.title.slice(0, Math.ceil(article.title.length * 0.6)) : article.title);
    setThumbSubTitle(article.title.length > 20 ? article.title.slice(Math.ceil(article.title.length * 0.6)) : (article.keyword || ''));
    setThumbColor('dark');
    setThumbRepUrl(article.representative_image_url);
    setThumbBgQuery(article.keyword || '');
    setThumbBgImages([]);
    setThumbSelectedBg('');
    setThumbPreviewUrl('');
  };

  // ── 캔버스 썸네일 함수들 ──
  const searchThumbBgImages = async () => {
    const q = thumbBgQuery;
    if (!q) return;
    setThumbBgLoading(true);
    try {
      const res = await fetch(`/api/shorts/images?q=${encodeURIComponent(q)}&source=pixabay&per_page=9`);
      const data = await res.json();
      setThumbBgImages((data.images || []).map((img: { id: number; url: string; thumb: string }) => ({ id: img.id, url: img.url, thumb: img.thumb })));
    } catch { /* ignore */ }
    finally { setThumbBgLoading(false); }
  };

  const wrapTextOnCanvas = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
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
  };

  const generateCanvasThumbnail = async () => {
    if (!thumbSelectedBg || !thumbTitle) { alert('배경 이미지와 메인 제목을 입력해주세요.'); return; }
    setThumbGenerating(true);
    try {
      const canvas = thumbCanvasRef.current!;
      canvas.width = 1080; canvas.height = 1080;
      const ctx = canvas.getContext('2d')!;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      const proxyUrl = thumbSelectedBg.startsWith('http') ? `/api/proxy-image?url=${encodeURIComponent(thumbSelectedBg)}` : thumbSelectedBg;
      await new Promise<void>((res, rej) => {
        const t = setTimeout(() => rej(new Error('이미지 로드 타임아웃')), 15000);
        img.onload = () => { clearTimeout(t); res(); };
        img.onerror = () => { clearTimeout(t); rej(new Error('이미지 로드 실패 - 다른 이미지를 선택해주세요')); };
        img.src = proxyUrl;
      });

      const scale = Math.max(1080 / img.naturalWidth, 1080 / img.naturalHeight);
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      ctx.drawImage(img, (1080 - w) / 2, (1080 - h) / 2, w, h);

      const grad = ctx.createLinearGradient(0, 0, 0, 1080);
      if (thumbColor === 'blue') {
        grad.addColorStop(0, 'rgba(0,10,40,0.50)'); grad.addColorStop(0.5, 'rgba(0,15,50,0.65)'); grad.addColorStop(1, 'rgba(0,10,40,0.55)');
      } else if (thumbColor === 'green') {
        grad.addColorStop(0, 'rgba(0,20,10,0.50)'); grad.addColorStop(0.5, 'rgba(0,25,15,0.65)'); grad.addColorStop(1, 'rgba(0,20,10,0.55)');
      } else {
        grad.addColorStop(0, 'rgba(0,0,0,0.48)'); grad.addColorStop(0.5, 'rgba(0,0,0,0.62)'); grad.addColorStop(1, 'rgba(0,0,0,0.52)');
      }
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1080);
      const vignette = ctx.createRadialGradient(540, 540, 300, 540, 540, 760);
      vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = vignette; ctx.fillRect(0, 0, 1080, 1080);
      ctx.fillStyle = '#f0b429'; ctx.fillRect(0, 0, 1080, 10);

      const fontSize = thumbTitle.length <= 8 ? 120 : thumbTitle.length <= 14 ? 100 : thumbTitle.length <= 20 ? 86 : 72;
      ctx.font = `bold ${fontSize}px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lines = wrapTextOnCanvas(ctx, thumbTitle, 960);
      const lineHeight = fontSize * 1.3;
      const totalTextH = lines.length * lineHeight;
      const subH = thumbSubTitle ? 80 : 0;
      const startY = (1080 - totalTextH - subH - (thumbSubTitle ? 30 : 0)) / 2;

      lines.forEach((line, i) => {
        const y = startY + i * lineHeight + lineHeight / 2;
        ctx.font = `bold ${fontSize}px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif`;
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 45; ctx.fillStyle = 'rgba(0,0,0,0.7)';
        for (let k = 0; k < 6; k++) ctx.fillText(line, 540, y); ctx.restore();
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,1)'; ctx.shadowBlur = 18; ctx.fillStyle = 'rgba(20,20,20,0.8)';
        for (let k = 0; k < 3; k++) ctx.fillText(line, 540, y); ctx.restore();
        ctx.save(); ctx.shadowBlur = 0; ctx.fillStyle = '#ffffff'; ctx.fillText(line, 540, y); ctx.restore();
      });

      if (thumbSubTitle) {
        const subFontSize = 54; const subY = startY + totalTextH + 45;
        ctx.font = `bold ${subFontSize}px "Apple SD Gothic Neo","Malgun Gothic",sans-serif`;
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 30; ctx.fillStyle = 'rgba(0,0,0,0.6)';
        for (let k = 0; k < 5; k++) ctx.fillText(thumbSubTitle, 540, subY); ctx.restore();
        ctx.save(); ctx.shadowBlur = 0;
        ctx.fillStyle = thumbColor === 'green' ? '#86efac' : thumbColor === 'blue' ? '#93c5fd' : '#e2e8f0';
        ctx.fillText(thumbSubTitle, 540, subY); ctx.restore();
      }

      ctx.fillStyle = '#f0b429'; ctx.fillRect(0, 1070, 1080, 10);
      setThumbPreviewUrl(canvas.toDataURL('image/png'));
    } catch (e) {
      alert('썸네일 생성 오류: ' + String(e));
    } finally {
      setThumbGenerating(false);
    }
  };

  // gen-thumbnail API로 새 디자인 썸네일 즉시 생성 + 저장
  const regenerateApiThumbnail = async () => {
    if (!previewArticle) return;
    setThumbGenerating(true);
    try {
      const res = await fetch('/api/auto-service/thumbnail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article_id: previewArticle.id,
          title: previewArticle.title,
          keyword: previewArticle.keyword || '',
          color_scheme: thumbColor,
          sub: thumbSubTitle || undefined,
        }),
      });
      const data = await res.json();
      if (data.url) {
        setThumbRepUrl(data.url);
        setPreviewArticle(prev => prev ? { ...prev, representative_image_url: data.url } : null);
        await loadArticles();
      } else {
        alert('재생성 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (e) {
      alert('재생성 오류: ' + String(e));
    } finally {
      setThumbGenerating(false);
    }
  };

  const uploadCanvasThumbnail = async () => {
    if (!thumbPreviewUrl || !previewArticle) return;
    setThumbGenerating(true);
    try {
      const res = await fetch(thumbPreviewUrl);
      const blob = await res.blob();
      const file = new File([blob], `thumbnail_${Date.now()}.png`, { type: 'image/png' });
      const form = new FormData();
      form.append('file', file);
      form.append('article_id', previewArticle.id);
      const uploadRes = await fetch('/api/auto-service/thumbnail', { method: 'PUT', body: form });
      const data = await uploadRes.json();
      if (data.url) {
        setThumbRepUrl(data.url);
        setPreviewArticle(prev => prev ? { ...prev, representative_image_url: data.url } : null);
        await loadArticles();
        alert('✅ 대표이미지가 저장됐습니다.');
      } else {
        alert('업로드 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (e) {
      alert('업로드 오류: ' + String(e));
    } finally {
      setThumbGenerating(false);
    }
  };

  // 콘텐츠에서 img src 목록 추출
  const extractImages = (html: string): string[] => {
    const matches = [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)];
    return [...new Set(matches.map(m => m[1]))];
  };

  // 이미지 검색 (Naver, Google, Pixabay, SNS)
  const searchImages = async (tab: 'naver' | 'google' | 'pixabay' | 'sns', q: string) => {
    setImgLoading(true);
    setImgResults([]);
    setImgError('');
    try {
      const res = await fetch(`/api/auto-service/images?action=${tab}&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setImgResults(data.images || []);
      if (data.error) setImgError(data.error);
    } catch(e) {
      setImgError(`검색 실패: ${e}`);
    }
    setImgLoading(false);
  };

  // 이미지 교체 (editContent 내 src URL 변경)
  const replaceImage = (oldSrc: string, newUrl: string) => {
    setEditContent(prev => prev.replaceAll(oldSrc, newUrl));
    setReplacingImgSrc(null);
    setImgResults([]);
  };

  // 이미지 삭제 (DOMParser로 정확하게 해당 figure/img만 제거)
  const deleteImage = (src: string) => {
    setEditContent(prev => {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(prev, 'text/html');
        const imgs = doc.querySelectorAll(`img[src="${CSS.escape(src)}"]`);
        imgs.forEach(img => {
          const figure = img.closest('figure');
          if (figure) figure.remove();
          else img.remove();
        });
        return doc.body.innerHTML;
      } catch {
        // DOMParser 실패 시 단순 img 태그만 제거
        const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return prev.replace(new RegExp(`<img[^>]+src="${escaped}"[^>]*\\/?>`, 'gi'), '');
      }
    });
    setReplacingImgSrc(null);
  };

  // 파일 업로드
  const uploadFile = async (file: File, oldSrc: string) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/auto-service/images', { method: 'POST', body: form });
    const data = await res.json();
    if (data.url) replaceImage(oldSrc, data.url);
  };

  // 외부 이미지 URL → Supabase 다운로드 후 URL 반환
  const downloadImage = async (url: string): Promise<string | null> => {
    setDownloadingUrl(url);
    try {
      const res = await fetch('/api/auto-service/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`❌ ${data.error || '다운로드 실패'}`);
        return null;
      }
      return data.url || null;
    } catch { return null; }
    finally { setDownloadingUrl(null); }
  };

  // 이미지를 본문 H2 소제목 다음 위치에 삽입 (이미지 없는 첫 번째 H2 뒤)
  const insertImageToContent = (imageUrl: string, altText: string) => {
    const alt = altText.replace(/"/g, '');
    const imgHtml = `\n<figure style="text-align:center;margin:25px 0;"><img src="${imageUrl}" alt="${alt}" title="${alt}" style="max-width:100%;border-radius:10px;box-shadow:0 4px 15px rgba(0,0,0,0.15);" loading="lazy"/><figcaption style="font-size:12px;color:#888;margin-top:6px;">${alt}</figcaption></figure>\n`;

    setEditContent(prev => {
      // H2 태그 목록과 위치 파악
      const h2Regex = /(<h2[^>]*>[\s\S]*?<\/h2>)/gi;
      const h2Matches = [...prev.matchAll(h2Regex)];

      for (const match of h2Matches) {
        const h2End = (match.index ?? 0) + match[0].length;
        // H2 다음 600자 내에 <figure 없으면 이 위치에 삽입
        const nextChunk = prev.substring(h2End, h2End + 600);
        if (!/<figure/i.test(nextChunk)) {
          return prev.substring(0, h2End) + imgHtml + prev.substring(h2End);
        }
      }
      // 모든 H2에 이미지 있으면 끝에 추가
      return prev + imgHtml;
    });
  };

  const saveEdit = async () => {
    if (!previewArticle) return;
    setSavingEdit(true);
    const res = await fetch('/api/auto-service/articles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: previewArticle.id, content: editContent, title: editTitle, ai_model: editModel }),
    });
    if (res.ok) {
      setEditMode(false);
      setPreviewArticle(prev => prev ? { ...prev, content: editContent, title: editTitle, ai_model: editModel } : null);
      await loadArticles();
    }
    setSavingEdit(false);
  };

  const deleteArticle = async (id: string) => {
    if (!confirm('이 초안을 삭제하시겠습니까?')) return;
    await fetch(`/api/auto-service/articles?id=${id}`, { method: 'DELETE' });
    setPreviewArticle(null);
    await loadArticles();
  };

  const openPublish = (article: Article) => {
    setPublishArticle(article);
    setSelBlog([]);
    setSelSns([]);
    setSelWpSiteIds([]);
    setPublishResult(null);
  };

  const openSchedule = (article: Article) => {
    setScheduleArticle(article);
    // 기존 예약이 있으면 불러오기
    if (article.scheduled_at) {
      const d = new Date(article.scheduled_at);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setScheduleDateTime(local);
    } else {
      // 기본값: 지금 + 1시간
      const def = new Date(Date.now() + 3600_000);
      const local = new Date(def.getTime() - def.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setScheduleDateTime(local);
    }
    setSchedBlog(article.scheduled_platforms?.blog_platforms || []);
    setSchedSns(article.scheduled_platforms?.sns_platforms || []);
    setSchedWpSiteIds(article.scheduled_platforms?.wp_site_ids || []);
  };

  const doSchedule = async () => {
    if (!scheduleArticle || !scheduleDateTime) return;
    setScheduling(true);
    try {
      const res = await fetch('/api/auto-service/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article_id: scheduleArticle.id,
          scheduled_at: new Date(scheduleDateTime).toISOString(),
          blog_platforms: schedBlog,
          sns_platforms: schedSns,
          wp_site_ids: schedWpSiteIds,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || '저장 실패'); }
      setScheduleArticle(null);
      await loadArticles();
    } catch (err) {
      alert(`예약 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setScheduling(false);
    }
  };

  const cancelSchedule = async (articleId: string) => {
    if (!confirm('예약을 취소하시겠습니까?')) return;
    await fetch('/api/auto-service/schedule', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article_id: articleId }),
    });
    await loadArticles();
  };

  const doPublish = async () => {
    if (!publishArticle) return;
    setPublishing(true);
    setPublishResult({});
    try {
      const res = await fetch('/api/auto-service/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article_id: publishArticle.id,
          blog_platforms: selBlog,
          sns_platforms: selSns,
          wp_site_ids: selWpSiteIds,
        }),
      });
      const data = await res.json();
      setPublishResult(data.results || {});
      if (data.error) alert(`발행 오류: ${data.error}`);
      await loadArticles();

      // YouTube Shorts 자동 생성 (백그라운드)
      if (autoShorts) {
        const r = await fetch('/api/shorts/auto-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            article_id: publishArticle.id,
            title: publishArticle.title,
            keyword: publishArticle.keyword || '',
            description: publishArticle.meta_description || '',
          }),
        });
        const d = await r.json();
        if (d.job_id) {
          setShortsJobs(prev => [{ id: d.job_id, title: publishArticle.title, status: 'pending', progress: '대기 중...' }, ...prev]);
          if (!shortsPolling) startShortsPolling();
        }
      }
    } catch (err) {
      alert(`발행 실패: ${String(err)}`);
    } finally {
      setPublishing(false);
    }
  };

  const startShortsPolling = () => {
    setShortsPolling(true);
    const poll = async () => {
      const res = await fetch('/api/shorts/queue');
      const data = await res.json();
      if (data.jobs) {
        setShortsJobs(data.jobs);
        const hasActive = data.jobs.some((j: { status: string }) => j.status === 'pending' || j.status === 'running');
        if (hasActive) setTimeout(poll, 8000);
        else setShortsPolling(false);
      } else { setShortsPolling(false); }
    };
    setTimeout(poll, 3000);
  };

  const togglePlatform = (arr: string[], setArr: (v: string[]) => void, id: string) => {
    setArr(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
  };

  const addCustomKeyword = () => {
    const kw = customKwInput.trim();
    if (!kw || autoSettings.custom_keywords.includes(kw)) return;
    const newKws = [...autoSettings.custom_keywords, kw];
    setAutoSettings(prev => ({ ...prev, custom_keywords: newKws }));
    setCustomKwInput('');
  };

  const removeCustomKeyword = (kw: string) => {
    setAutoSettings(prev => ({ ...prev, custom_keywords: prev.custom_keywords.filter(k => k !== kw) }));
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">

      {/* YouTube Shorts 진행 상태 배너 */}
      {shortsJobs.length > 0 && (
        <div className="mb-4 space-y-2">
          {shortsJobs.filter(j => j.status !== 'done' || j.yt_url).slice(0, 3).map(j => (
            <div key={j.id} className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm border ${
              j.status === 'done' ? 'bg-green-50 border-green-200' :
              j.status === 'error' ? 'bg-red-50 border-red-200' :
              'bg-red-50 border-red-100'
            }`}>
              <div className="flex items-center gap-2 min-w-0">
                {j.status === 'done' ? <span>✅</span> : j.status === 'error' ? <span>❌</span> :
                  <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate text-xs">📺 {j.title}</p>
                  <p className="text-xs text-gray-500">{j.progress}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                {j.yt_url && <a href={j.yt_url} target="_blank" rel="noopener noreferrer" className="text-xs text-red-600 underline">YouTube →</a>}
                {j.video_url && !j.yt_url && <a href={j.video_url} download className="text-xs text-blue-600 underline">영상 다운로드</a>}
                {(j.status === 'done' || j.status === 'error') && (
                  <button onClick={() => setShortsJobs(prev => prev.filter(x => x.id !== j.id))} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🤖 자동화서비스 — 블로그 자동화</h1>
        <p className="text-sm text-gray-500 mt-1">트렌딩 키워드 자동 감지 → AI 3000자+ SEO 글 생성 → 대표이미지 자동 제작 → 승인만 하면 발행</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {([['auto', '⚙️ 자동실행 설정'], ['drafts', '📝 초안 관리'], ['history', '📚 발행 히스토리']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {label}
            {t === 'drafts' && articles.length > 0 && (
              <span className="ml-1.5 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">{articles.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ===== 자동실행 설정 탭 ===== */}
      {tab === 'auto' && (
        <div className="space-y-5">
          {/* 자동실행 ON/OFF */}
          <div className="bg-white rounded-2xl border-2 border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">자동 실행</h2>
                <p className="text-sm text-gray-500 mt-0.5">매일 오전 9시마다 트렌딩 키워드를 수집하여 자동으로 블로그 초안을 생성합니다</p>
              </div>
              <button
                onClick={() => saveSettings({ enabled: !autoSettings.enabled })}
                disabled={savingSettings}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${autoSettings.enabled ? 'bg-blue-600' : 'bg-gray-300'} ${savingSettings ? 'opacity-50' : ''}`}>
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${autoSettings.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {settingsError && (
              <div className="mt-4 p-3 bg-red-50 rounded-xl text-sm text-red-700 border border-red-200">
                ⚠️ {settingsError}
              </div>
            )}

            {autoSettings.enabled && !settingsError && (
              <div className="mt-4 p-3 bg-blue-50 rounded-xl text-sm text-blue-700 flex items-center gap-2">
                <span className="text-lg">🟢</span>
                <div>
                  <strong>자동실행 활성화됨</strong> — 매일 오전 9시 최대 {autoSettings.max_per_run}개 글 자동 생성
                  {autoSettings.last_run_at && (
                    <span className="block text-xs text-blue-500 mt-0.5">
                      마지막 실행: {new Date(autoSettings.last_run_at).toLocaleString('ko-KR')}
                      {autoSettings.last_run_count !== undefined && ` · ${autoSettings.last_run_count}개 생성됨`}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 설정 옵션 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h2 className="font-semibold text-gray-800">상세 설정</h2>

            {/* AI 모델 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">AI 모델</label>
                <button
                  onClick={loadModels}
                  disabled={modelsLoading}
                  title="모델 목록 새로고침"
                  className="px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600 text-xs disabled:opacity-50"
                >
                  {modelsLoading ? '⟳' : '🔄 새로고침'}
                </button>
              </div>
              {/* Ollama 모델 */}
              <p className="text-xs text-gray-400 mb-1">Ollama</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {ollamaModels.filter(m => m.group === 'ollama').map(m => (
                  <button key={m.id}
                    onClick={() => setAutoSettings(prev => ({ ...prev, ai_model: m.id }))}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${autoSettings.ai_model === m.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    {m.emoji} {m.name}
                  </button>
                ))}
              </div>
              {/* Claude 모델 */}
              <p className="text-xs text-gray-400 mb-1">Claude</p>
              <div className="flex flex-wrap gap-2">
                {ollamaModels.filter(m => m.group === 'claude').map(m => (
                  <button key={m.id}
                    onClick={() => setAutoSettings(prev => ({ ...prev, ai_model: m.id }))}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${autoSettings.ai_model === m.id ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700 hover:bg-violet-100'}`}>
                    {m.emoji} {m.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 최대 생성 수 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">실행 당 최대 생성 수</label>
              <div className="flex gap-2">
                {[1, 2, 3, 5, 10].map(n => (
                  <button key={n}
                    onClick={() => setAutoSettings(prev => ({ ...prev, max_per_run: n }))}
                    className={`w-12 h-9 rounded-lg text-sm font-medium transition-colors ${autoSettings.max_per_run === n ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* 키워드 설정 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">고정 키워드 (비어있으면 트렌딩 자동사용)</label>
              <div className="flex gap-2 mb-2">
                <input value={customKwInput} onChange={e => setCustomKwInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomKeyword()}
                  placeholder="예: BTS 공연, 요즘 트렌드" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                <button onClick={addCustomKeyword} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">추가</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {autoSettings.custom_keywords.map(kw => (
                  <span key={kw} className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-sm">
                    {kw}
                    <button onClick={() => removeCustomKeyword(kw)} className="text-blue-400 hover:text-blue-600 ml-1">×</button>
                  </span>
                ))}
                {autoSettings.custom_keywords.length === 0 && (
                  <span className="text-xs text-gray-400">트렌딩 키워드 자동 사용 중</span>
                )}
              </div>
            </div>

            <button onClick={() => saveSettings(autoSettings)} disabled={savingSettings}
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {savingSettings ? '저장 중...' : '💾 설정 저장'}
            </button>
          </div>

          {/* 지금 바로 실행 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-3">지금 바로 실행</h2>
            <p className="text-sm text-gray-500 mb-4">스케줄을 기다리지 않고 지금 즉시 글을 생성합니다. 생성된 초안은 "초안 관리"에서 확인하고 승인 후 발행하세요.</p>

            {/* 실시간 진행 상황 */}
            {runningNow && runProgress.length > 0 && (
              <div className="mb-4 p-3 bg-blue-50 rounded-xl space-y-1.5">
                {runProgress.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {p.status === 'generating' && <span className="inline-block w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                    {p.status === 'done' && <span className="text-green-500 flex-shrink-0">✓</span>}
                    {p.status === 'error' && <span className="text-red-500 flex-shrink-0">✗</span>}
                    <span className={p.status === 'generating' ? 'text-blue-700 font-medium' : p.status === 'done' ? 'text-green-700' : 'text-red-600'}>
                      {p.keyword}
                      {p.status === 'generating' && ' — AI 글 생성 중...'}
                      {p.status === 'error' && p.reason && ` — ${p.reason.slice(0, 60)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {runResult && !runningNow && (
              <div className="mb-4 space-y-2">
                {runResult.generated > 0 ? (
                  <div className="p-3 rounded-xl text-sm bg-green-50 text-green-700">
                    <strong>✅ {runResult.generated}개 글 생성 완료!</strong>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {runResult.keywords.map((kw, i) => <span key={i} className="text-xs bg-green-100 px-2 py-0.5 rounded">{kw}</span>)}
                    </div>
                  </div>
                ) : runResult.errors && runResult.errors.length > 0 ? (
                  <div className="p-3 rounded-xl text-sm bg-yellow-50 text-yellow-700">
                    <strong>⚠️ 생성 실패</strong>
                    <div className="mt-2 space-y-1">
                      {runResult.errors.map((e, i) => (
                        <div key={i} className="text-xs bg-red-50 text-red-700 p-2 rounded border border-red-200">
                          <span className="font-medium">키워드 &quot;{e.keyword}&quot;:</span> {e.reason}
                        </div>
                      ))}
                      <p className="text-xs mt-2 text-gray-600">
                        💡 <strong>설정 페이지 → API 키 관리</strong>에서 Gemini, Claude, OpenAI 키 중 하나를 저장하면 서버 자동 실행됩니다.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <button onClick={runNow} disabled={runningNow}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-bold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {runningNow ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  <span>실행 중...</span>
                </>
              ) : '🚀 지금 바로 실행'}
            </button>
          </div>

          {/* 수동 키워드 글 생성 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-3">특정 키워드 직접 생성</h2>
            <div className="flex gap-2">
              <input value={manualKeyword} onChange={e => setManualKeyword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && generateManual(manualKeyword)}
                placeholder="예: BTS 광화문 공연 후기"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <button onClick={() => generateManual(manualKeyword)} disabled={generating || !manualKeyword.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {generating ? '⏳' : '✨ 생성'}
              </button>
            </div>
            {generating && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm text-blue-700 flex items-center gap-2">
                <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                <div>
                  <div>"{generatingKw}" 3000자+ SEO 글 생성 중...</div>
                  <div className="text-xs text-blue-400 mt-0.5">뉴스/블로그 수집 → AI 작성 → 대표이미지 제작</div>
                </div>
              </div>
            )}
          </div>

          {/* 작동 방식 안내 */}
          <div className="bg-gray-50 rounded-2xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-700 mb-3">🔄 자동화 흐름</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: '📡', title: '트렌딩 감지', desc: '6시간마다 네이버/구글 트렌딩 키워드 자동 수집' },
                { icon: '🤖', title: 'AI 글 작성', desc: '뉴스·블로그 참고 → 3000자+ SEO 최적화 HTML 자동 생성' },
                { icon: '🖼️', title: '대표이미지 제작', desc: 'Blogger 스타일 그라디언트 썸네일 자동 생성 (1080×1080)' },
                { icon: '✅', title: '승인 & 발행', desc: '초안 확인 후 클릭 한 번으로 네이버/블로거/WordPress + SNS 발행' },
              ].map((step, i) => (
                <div key={i} className="bg-white rounded-xl p-3 border border-gray-200">
                  <div className="text-2xl mb-1">{step.icon}</div>
                  <div className="text-sm font-semibold text-gray-800">{step.title}</div>
                  <div className="text-xs text-gray-500 mt-1">{step.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== 초안 관리 탭 ===== */}
      {tab === 'drafts' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">{articles.length}개의 초안</p>
            <button onClick={() => loadArticles()} disabled={loadingArticles}
              className="text-sm text-blue-600 hover:underline">{loadingArticles ? '로딩...' : '새로고침'}</button>
          </div>

          {!loadingArticles && articles.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-5xl mb-4">📝</div>
              <p className="font-medium">초안이 없습니다</p>
              <p className="text-sm mt-1">자동실행 설정 탭에서 글을 생성해보세요</p>
              <button onClick={() => setTab('auto')} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                설정으로 이동
              </button>
            </div>
          )}

          <div className="grid gap-4">
            {articles.map(article => (
              <div key={article.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-colors">
                <div className="flex items-start gap-3">
                  {article.representative_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={article.representative_image_url} alt="" className="w-20 h-20 object-cover rounded-xl flex-shrink-0 border border-gray-100" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_LABELS[article.status].color}`}>
                        {STATUS_LABELS[article.status].label}
                      </span>
                      <span className="text-xs text-gray-400">{article.word_count.toLocaleString()}자</span>
                      <span className="text-xs text-gray-400">• {ollamaModels.find(m => m.id === article.ai_model)?.emoji} {article.ai_model}</span>
                    </div>
                    <h3 className="font-semibold text-gray-900 line-clamp-1">{article.title}</h3>
                    <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">{article.meta_description}</p>
                    <div className="text-xs text-gray-400 mt-1">
                      🔑 {article.keyword} · {new Date(article.created_at).toLocaleString('ko-KR')}
                    </div>
                    {article.status === 'scheduled' && article.scheduled_at && (
                      <div className="text-xs text-purple-600 mt-1 font-medium">
                        ⏰ {new Date(article.scheduled_at).toLocaleString('ko-KR')} 예약됨
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button onClick={() => openPreview(article)}
                      className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                      미리보기/편집
                    </button>
                    {article.status === 'scheduled' ? (
                      <>
                        <button onClick={() => openSchedule(article)}
                          className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium">
                          ⏰ 예약 수정
                        </button>
                        <button onClick={() => cancelSchedule(article.id)}
                          className="px-3 py-1.5 text-xs bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300">
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => openPublish(article)}
                          className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                          ✅ 승인 & 발행
                        </button>
                        <button onClick={() => openSchedule(article)}
                          className="px-3 py-1.5 text-xs bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 font-medium">
                          ⏰ 예약 발행
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== 발행 히스토리 탭 ===== */}
      {tab === 'history' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">{history.length}개 발행됨</p>
            <button onClick={() => loadArticles('published')} className="text-sm text-blue-600 hover:underline">새로고침</button>
          </div>

          {history.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-5xl mb-4">📚</div>
              <p>아직 발행된 글이 없습니다</p>
            </div>
          )}

          <div className="grid gap-4">
            {history.map(article => (
              <div key={article.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start gap-3">
                  {article.representative_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={article.representative_image_url} alt="" className="w-20 h-20 object-cover rounded-xl flex-shrink-0 border border-gray-100" />
                  )}
                  <div className="flex-1">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-800">발행완료</span>
                    <h3 className="font-semibold text-gray-900 mt-1">{article.title}</h3>
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{article.meta_description}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {Object.entries(article.published_urls || {}).map(([platform, url]) =>
                        url ? (
                          <a key={platform} href={url} target="_blank" rel="noopener noreferrer"
                            className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:underline">
                            {platform} 보기 →
                          </a>
                        ) : null
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {article.published_at && new Date(article.published_at).toLocaleString('ko-KR')}
                    </div>
                  </div>
                  <button onClick={() => openPreview(article)}
                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex-shrink-0">
                    내용 보기
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== 미리보기/편집 모달 ===== */}
      {previewArticle && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) setPreviewArticle(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-4xl my-4 shadow-2xl">
            {/* 헤더 */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_LABELS[previewArticle.status].color}`}>
                  {STATUS_LABELS[previewArticle.status].label}
                </span>
                <span className="text-sm text-gray-500">{previewArticle.word_count.toLocaleString()}자</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {modalTab === 'edit' && (
                  <button onClick={saveEdit} disabled={savingEdit} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">
                    {savingEdit ? '저장 중...' : '💾 저장'}
                  </button>
                )}
                <button onClick={() => { openPublish(previewArticle); setPreviewArticle(null); }}
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">🚀 발행</button>
                <button onClick={() => deleteArticle(previewArticle.id)} className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200">🗑️</button>
                <button onClick={() => setPreviewArticle(null)} className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg">✕</button>
              </div>
            </div>

            {/* 탭 */}
            <div className="flex border-b border-gray-200 px-4">
              {([['preview', '👁️ 미리보기'], ['edit', '✏️ 편집'], ['images', '🖼️ 이미지'], ['watermark', '🔍 워터마크']] as ['preview'|'edit'|'images'|'watermark', string][]).map(([t, label]) => (
                <button key={t} onClick={() => setModalTab(t)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${modalTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* 미리보기 탭 */}
            {modalTab === 'preview' && (
              <div className="p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-2">{previewArticle.title}</h2>
                {previewArticle.meta_description && (
                  <p className="text-sm text-gray-500 mb-4 pb-4 border-b border-gray-100">{previewArticle.meta_description}</p>
                )}
                {previewArticle.representative_image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewArticle.representative_image_url} alt={previewArticle.keyword}
                    className="w-full max-h-80 object-cover rounded-xl mb-6" />
                )}
                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewArticle.content }} />
              </div>
            )}

            {/* 편집 탭 */}
            {modalTab === 'edit' && (
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">제목 (SEO)</label>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">AI 모델</label>
                  <div className="flex flex-wrap gap-2">
                    {ollamaModels.map(m => (
                      <button key={m.id} onClick={() => setEditModel(m.id)}
                        className={`px-2 py-1 rounded text-xs font-medium ${editModel === m.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                        {m.emoji} {m.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">HTML 내용 직접 수정</label>
                  <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                    rows={22} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
                </div>
              </div>
            )}

            {/* 워터마크 검사 탭 */}
            {modalTab === 'watermark' && (
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900">🔍 AI 워터마크 분석</h3>
                    <p className="text-xs text-gray-500 mt-0.5">유니코드 워터마크, HTML 엔티티, GPT 패턴을 감지합니다</p>
                  </div>
                  <button
                    onClick={async () => {
                      if (!previewArticle?.content) return;
                      setWmLoading(true);
                      try {
                        const r = await fetch('/api/ai/watermark', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ text: previewArticle.content }),
                        });
                        if (r.ok) setWmAnalysis(await r.json());
                      } finally { setWmLoading(false); }
                    }}
                    disabled={wmLoading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
                  >
                    {wmLoading ? '분석 중...' : '분석 시작'}
                  </button>
                </div>

                {wmAnalysis && (
                  <>
                    {/* 통계 카드 */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: '총 문자 수', value: wmAnalysis.totalChars.toLocaleString(), color: 'text-gray-800' },
                        { label: '워터마크 수', value: wmAnalysis.watermarkCount, color: wmAnalysis.watermarkCount > 0 ? 'text-red-600' : 'text-emerald-600' },
                        { label: '이모지 수', value: wmAnalysis.emojiCount, color: 'text-amber-600' },
                        { label: 'GPT 점수', value: `${wmAnalysis.gptScore}%`, color: wmAnalysis.gptScore > 50 ? 'text-red-600' : wmAnalysis.gptScore > 20 ? 'text-amber-600' : 'text-emerald-600' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                          <p className="text-xs text-gray-500 mb-1">{label}</p>
                          <p className={`text-2xl font-bold ${color}`}>{value}</p>
                        </div>
                      ))}
                    </div>

                    {/* 워터마크 유형 */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: '유니코드 워터마크', value: wmAnalysis.unicodeWatermarks },
                        { label: 'HTML 엔티티', value: wmAnalysis.htmlEntities },
                        { label: '특수 패턴', value: 0 },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                          <p className="text-xs text-gray-500 mb-1">{label}</p>
                          <p className={`text-lg font-bold ${value > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {value > 0 ? `${value}개` : '없음'}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* 결과 요약 */}
                    <div className={`p-3 rounded-xl text-sm font-medium ${
                      wmAnalysis.watermarkCount === 0 && wmAnalysis.gptScore < 30
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {wmAnalysis.watermarkCount === 0 && wmAnalysis.gptScore < 30
                        ? '✅ 워터마크 없음 — 자연스러운 글입니다'
                        : `⚠️ ${wmAnalysis.watermarkCount > 0 ? `워터마크 ${wmAnalysis.watermarkCount}개 발견. ` : ''}GPT 패턴 점수 ${wmAnalysis.gptScore}% — 정제 권장`}
                    </div>

                    {/* 워터마크 제거 버튼 */}
                    {wmAnalysis.watermarkCount > 0 && (
                      <button
                        onClick={() => {
                          if (!previewArticle) return;
                          setPreviewArticle({ ...previewArticle, content: wmAnalysis.cleanedText });
                          setWmAnalysis({ ...wmAnalysis, watermarkCount: 0, unicodeWatermarks: 0, htmlEntities: 0, cleanedText: wmAnalysis.cleanedText });
                        }}
                        className="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold"
                      >
                        🧹 워터마크 제거 적용
                      </button>
                    )}

                    {/* GPT 패턴 정제 버튼 */}
                    {wmAnalysis.gptScore >= 30 && (
                      <button
                        disabled={refining}
                        onClick={async () => {
                          if (!previewArticle) return;
                          setRefining(true);
                          try {
                            const res = await fetch('/api/auto-service/refine', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ content: previewArticle.content, title: previewArticle.title }),
                            });
                            const data = await res.json() as { refined?: string; error?: string };
                            if (!res.ok || !data.refined) {
                              alert(data.error || '정제 실패');
                              return;
                            }
                            // 정제된 텍스트를 단락별로 HTML p 태그로 감싸서 적용
                            const refinedHtml = data.refined
                              .split(/\n\n+/)
                              .map(p => p.trim())
                              .filter(Boolean)
                              .map(p => `<p data-ke-size="size16">${p.replace(/\n/g, '<br/>')}</p>`)
                              .join('\n');
                            setPreviewArticle({ ...previewArticle, content: refinedHtml });
                            setWmAnalysis({ ...wmAnalysis, gptScore: Math.max(0, wmAnalysis.gptScore - 25) });
                          } catch (e) {
                            alert('정제 오류: ' + String(e));
                          } finally {
                            setRefining(false);
                          }
                        }}
                        className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-gray-300 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                      >
                        {refining
                          ? <><span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> AI 문체 정제 중...</>
                          : `✨ GPT 패턴 정제 (현재 ${wmAnalysis.gptScore}%)`}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 이미지 탭 */}
            {modalTab === 'images' && (
              <div className="p-4">

                {/* ── 대표이미지 편집기 (Canvas 기반) ── */}
                <div className="mb-5 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-700">🖼️ 대표이미지 자동 생성</p>
                    <div className="flex gap-2 items-center">
                      {([
                        { id: 'dark',   bg: '#10042a', label: '다크' },
                        { id: 'blue',   bg: '#001858', label: '블루' },
                        { id: 'green',  bg: '#002a14', label: '그린' },
                        { id: 'red',    bg: '#320006', label: '레드' },
                        { id: 'orange', bg: '#2c1000', label: '오렌지' },
                        { id: 'violet', bg: '#140028', label: '바이올렛' },
                        { id: 'teal',   bg: '#002838', label: '틸' },
                        { id: 'golden', bg: '#281600', label: '골든' },
                      ] as const).map(c => (
                        <button key={c.id} onClick={() => setThumbColor(c.id)}
                          title={c.label}
                          className={`w-5 h-5 rounded-full border-2 transition-all ${thumbColor === c.id ? 'border-gray-800 scale-125 ring-2 ring-offset-1 ring-gray-400' : 'border-gray-300 hover:scale-110'}`}
                          style={{ background: c.bg }} />
                      ))}
                      {thumbRepUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbRepUrl} alt="현재 대표이미지" className="w-8 h-8 object-cover rounded border border-gray-300 ml-1" />
                      )}
                    </div>
                  </div>

                  {/* 배경 이미지 검색 */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1">배경 이미지 선택</p>
                    <div className="flex gap-2 mb-2">
                      <input type="text" value={thumbBgQuery} onChange={e => setThumbBgQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchThumbBgImages()}
                        placeholder="검색어 입력 (영어 권장)"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
                      <button onClick={searchThumbBgImages} disabled={thumbBgLoading}
                        className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-700 text-sm rounded-lg">
                        {thumbBgLoading ? '...' : '검색'}
                      </button>
                      <button onClick={() => thumbFileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm rounded-lg" title="파일 업로드">⬆️</button>
                    </div>
                    <input ref={thumbFileInputRef} type="file" accept="image/*" className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) { const reader = new FileReader(); reader.onload = ev => { if (ev.target?.result) setThumbSelectedBg(ev.target.result as string); }; reader.readAsDataURL(f); }
                      }} />
                    {thumbBgImages.length > 0 && (
                      <div className="grid grid-cols-3 gap-1.5">
                        {thumbBgImages.map(img => (
                          <button key={img.id} onClick={() => setThumbSelectedBg(img.thumb || img.url)}
                            className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${thumbSelectedBg === (img.thumb || img.url) ? 'border-blue-500 ring-2 ring-blue-400' : 'border-transparent hover:border-gray-400'}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img.thumb} alt="" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                    {thumbSelectedBg && thumbBgImages.length === 0 && (
                      <p className="text-xs text-green-600 mt-1">✅ 배경 이미지 선택됨</p>
                    )}
                  </div>

                  {/* 텍스트 입력 */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">메인 제목 (크게)</p>
                      <textarea value={thumbTitle} onChange={e => setThumbTitle(e.target.value)} rows={2}
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm resize-none focus:outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">서브 제목 (작게, 선택)</p>
                      <textarea value={thumbSubTitle} onChange={e => setThumbSubTitle(e.target.value)} rows={2}
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm resize-none focus:outline-none focus:border-blue-500" />
                    </div>
                  </div>

                  <canvas ref={thumbCanvasRef} className="hidden" />

                  {/* 새 디자인 자동 생성 버튼 */}
                  <button onClick={regenerateApiThumbnail} disabled={thumbGenerating}
                    className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-blue-600 text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 mb-2">
                    {thumbGenerating ? '생성 중...' : '🎨 새 디자인으로 재생성 (추천)'}
                  </button>

                  <div className="flex gap-2">
                    <button onClick={generateCanvasThumbnail} disabled={thumbGenerating || !thumbSelectedBg || !thumbTitle}
                      className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                      {thumbGenerating ? '생성 중...' : '✨ 배경사진 썸네일 생성'}
                    </button>
                    <label className="py-2 px-3 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 cursor-pointer text-center">
                      📁 직접 업로드
                      <input type="file" accept="image/*" className="hidden" onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file || !previewArticle) return;
                        setThumbGenerating(true);
                        const form = new FormData();
                        form.append('file', file);
                        form.append('article_id', previewArticle.id);
                        const res = await fetch('/api/auto-service/thumbnail', { method: 'PUT', body: form });
                        const data = await res.json();
                        if (data.url) {
                          setThumbRepUrl(data.url);
                          setPreviewArticle(prev => prev ? { ...prev, representative_image_url: data.url } : null);
                          await loadArticles();
                        }
                        setThumbGenerating(false);
                      }} />
                    </label>
                  </div>

                  {/* 미리보기 + 저장 */}
                  {thumbPreviewUrl && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">미리보기</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbPreviewUrl} alt="썸네일 미리보기" className="w-full max-w-xs mx-auto rounded-xl border border-gray-200 block" />
                      <div className="flex gap-2">
                        <a href={thumbPreviewUrl} download={`thumbnail_${Date.now()}.png`}
                          className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg text-center">
                          ⬇️ 다운로드
                        </a>
                        <button onClick={uploadCanvasThumbnail} disabled={thumbGenerating}
                          className="flex-1 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
                          {thumbGenerating ? '저장 중...' : '💾 대표이미지로 저장'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 수집된 소스 이미지 */}
                {(() => {
                  const collectedImages = (previewArticle.sources || []).filter(s => s.type === 'collected_image');
                  if (collectedImages.length === 0) return null;
                  return (
                    <div className="mb-5 p-4 bg-amber-50 rounded-xl border border-amber-200">
                      <p className="text-xs font-semibold text-amber-800 mb-2">
                        📰 수집된 소스 이미지 ({collectedImages.length}개) — 클릭하면 다운로드 후 사용
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {collectedImages.map((img, i) => (
                          <div key={i} className="relative group">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img.link}
                              alt={img.title}
                              className="w-28 h-20 object-cover rounded-lg border border-amber-200"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 flex flex-col items-center justify-center gap-1 transition-all rounded-lg opacity-0 group-hover:opacity-100">
                              <button
                                onClick={async () => {
                                  if (downloadingUrl) return;
                                  const stored = await downloadImage(img.link);
                                  if (!stored) { alert('다운로드 실패'); return; }
                                  if (replacingImgSrc) {
                                    replaceImage(replacingImgSrc, stored);
                                  } else {
                                    insertImageToContent(stored, img.title);
                                    alert('✅ 본문에 이미지가 추가되었습니다');
                                  }
                                }}
                                disabled={downloadingUrl === img.link}
                                className="text-white text-xs bg-blue-600 px-2 py-0.5 rounded hover:bg-blue-700 disabled:opacity-50"
                              >
                                {downloadingUrl === img.link ? '⏳' : replacingImgSrc ? '교체' : '본문 추가'}
                              </button>
                              <button
                                onClick={async () => {
                                  if (downloadingUrl) return;
                                  const stored = await downloadImage(img.link);
                                  if (stored) { setThumbSelectedBg(stored); setThumbBgImages([]); }
                                  else alert('다운로드 실패');
                                }}
                                disabled={downloadingUrl === img.link}
                                className="text-white text-xs bg-yellow-500 px-2 py-0.5 rounded hover:bg-yellow-600 disabled:opacity-50"
                              >
                                {downloadingUrl === img.link ? '⏳' : '배경 사용'}
                              </button>
                            </div>
                            {downloadingUrl === img.link && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-lg">
                                <span className="text-white text-xs">다운로드 중...</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-amber-600 mt-2">💡 이미지가 안 보이면 원본 사이트에서 차단된 것입니다</p>
                    </div>
                  );
                })()}

                {/* 현재 글 이미지 목록 */}
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-600 mb-2">📄 본문 이미지 ({extractImages(editContent).length}개) — 클릭: 교체 선택 | 🗑️: 삭제</p>
                  {extractImages(editContent).length === 0 ? (
                    <p className="text-sm text-gray-400">이미지 없음</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {extractImages(editContent).map((src, i) => (
                        <div key={i} className={`relative rounded-lg overflow-hidden border-2 transition-all ${replacingImgSrc === src ? 'border-blue-500 ring-2 ring-blue-300' : 'border-gray-200 hover:border-blue-300'}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`이미지 ${i+1}`} className="w-28 h-20 object-cover cursor-pointer"
                            onClick={() => setReplacingImgSrc(replacingImgSrc === src ? null : src)} />
                          {/* 삭제 버튼 */}
                          <button
                            onClick={() => { if (confirm('이 이미지를 삭제하시겠습니까?')) deleteImage(src); }}
                            className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600 shadow"
                            title="이미지 삭제"
                          >×</button>
                          {replacingImgSrc === src && (
                            <div className="absolute inset-0 bg-blue-500/30 flex items-end justify-center pb-1">
                              <span className="text-white text-xs font-bold bg-blue-500 px-2 py-0.5 rounded">교체 중</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {replacingImgSrc && (
                    <p className="text-xs text-blue-600 mt-2 font-medium">↓ 아래에서 교체할 이미지를 선택하세요</p>
                  )}
                </div>

                {/* 이미지 검색 탭 */}
                <div className="flex gap-1 mb-3 border-b border-gray-200 flex-wrap">
                  {([['naver', '🟢 네이버'], ['google', '🔍 구글'], ['pixabay', '📸 픽사베이'], ['sns', '🐦 SNS'], ['upload', '📁 업로드']] as ['naver'|'google'|'pixabay'|'sns'|'upload', string][]).map(([t, label]) => (
                    <button key={t} onClick={() => { setImgSearchTab(t); setImgResults([]); }}
                      className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${imgSearchTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
                      {label}
                    </button>
                  ))}
                </div>

                {imgSearchTab !== 'upload' && (
                  <div className="flex gap-2 mb-3">
                    <input value={imgQuery} onChange={e => setImgQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && searchImages(imgSearchTab as 'naver'|'google'|'pixabay'|'sns', imgQuery)}
                      placeholder={imgSearchTab === 'sns' ? '계정 이름 검색...' : `${previewArticle.keyword} 이미지 검색...`}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                    <button onClick={() => searchImages(imgSearchTab as 'naver'|'google'|'pixabay'|'sns', imgQuery || previewArticle.keyword)}
                      disabled={imgLoading}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
                      {imgLoading ? '...' : '검색'}
                    </button>
                  </div>
                )}

                {imgSearchTab === 'upload' && (
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
                    <p className="text-sm text-gray-500 mb-2">이미지를 드래그하거나 클릭하여 업로드</p>
                    <input type="file" accept="image/*" onChange={e => {
                      const file = e.target.files?.[0];
                      if (file && replacingImgSrc) uploadFile(file, replacingImgSrc);
                      else if (file) alert('먼저 위에서 교체할 이미지를 클릭하세요');
                    }} className="hidden" id="img-upload" />
                    <label htmlFor="img-upload" className="cursor-pointer px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 inline-block">
                      파일 선택
                    </label>
                    {!replacingImgSrc && <p className="text-xs text-orange-500 mt-2">⚠️ 먼저 위에서 교체할 이미지를 클릭하세요</p>}
                  </div>
                )}

                {imgError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 break-all">
                    ❌ {imgError}
                  </div>
                )}

                {imgResults.length > 0 && (
                  <>
                    {!replacingImgSrc && (
                      <p className="text-xs text-gray-500 mb-2">
                        이미지 클릭: <span className="text-blue-600 font-medium">대표이미지 배경으로 사용</span> | 본문 이미지 교체하려면 위에서 이미지 먼저 클릭
                      </p>
                    )}
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-2 max-h-80 overflow-y-auto">
                      {imgResults.map((img, i) => (
                        <div key={i} onClick={() => {
                          if (replacingImgSrc) {
                            replaceImage(replacingImgSrc, img.url);
                          } else {
                            setThumbSelectedBg(img.thumb || img.url);
                            setThumbBgImages([]);
                          }
                        }}
                          className={`relative cursor-pointer rounded-lg overflow-hidden border-2 hover:border-blue-400 group transition-all ${thumbSelectedBg === img.url ? 'border-yellow-400 ring-2 ring-yellow-200' : 'border-gray-200'}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.thumb || img.url} alt={img.author} className="w-full h-20 object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-all">
                            <span className="text-white text-xs font-bold opacity-0 group-hover:opacity-100">
                              {replacingImgSrc ? '교체' : '배경 사용'}
                            </span>
                          </div>
                          {thumbSelectedBg === img.url && (
                            <div className="absolute top-1 right-1 bg-yellow-400 text-xs px-1 rounded font-bold">배경</div>
                          )}
                          <p className="text-xs text-gray-400 truncate px-1 py-0.5">{img.caption || img.author}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* 저장 버튼 */}
                {editContent !== previewArticle.content && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <button onClick={saveEdit} disabled={savingEdit}
                      className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                      {savingEdit ? '저장 중...' : '💾 이미지 변경 저장'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== 발행 모달 ===== */}
      {publishArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={e => { if (e.target === e.currentTarget && !publishing) setPublishArticle(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">🚀 승인 & 발행</h2>
              <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{publishArticle.title}</p>
            </div>

            {!publishResult ? (
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">블로그 플랫폼</label>
                  <div className="space-y-2">
                    {BLOG_PLATFORMS.filter(p => p.id !== 'wordpress').map(p => (
                      <label key={p.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={selBlog.includes(p.id)} onChange={() => togglePlatform(selBlog, setSelBlog, p.id)} className="w-4 h-4" />
                        <span>{p.icon} {p.name}</span>
                      </label>
                    ))}
                    {/* WordPress 사이트 목록 */}
                    {wpSites.length > 0 ? (
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-1.5 mt-1">🔵 WordPress 사이트 선택</div>
                        {wpSites.map(site => (
                          <label key={site.id} className="flex items-center gap-3 p-3 border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-50 mb-1.5">
                            <input type="checkbox"
                              checked={selWpSiteIds.includes(site.id)}
                              onChange={() => {
                                const newIds = selWpSiteIds.includes(site.id)
                                  ? selWpSiteIds.filter(id => id !== site.id)
                                  : [...selWpSiteIds, site.id];
                                setSelWpSiteIds(newIds);
                                // wordpress를 blog_platforms에 포함 여부 자동 설정
                                if (newIds.length > 0 && !selBlog.includes('wordpress')) {
                                  setSelBlog(prev => [...prev, 'wordpress']);
                                } else if (newIds.length === 0) {
                                  setSelBlog(prev => prev.filter(b => b !== 'wordpress'));
                                }
                              }}
                              className="w-4 h-4" />
                            <div>
                              <div className="text-sm font-medium text-gray-800">{site.site_name}</div>
                              <div className="text-xs text-gray-400">{site.site_url}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-500 border border-gray-200">
                        🔵 WordPress 사이트가 없습니다.{' '}
                        <a href="/dashboard/wordpress" className="text-blue-600 hover:underline">WordPress 관리</a>에서 사이트를 추가하세요.
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">SNS 연동 (선택)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {SNS_PLATFORMS.map(p => (
                      <label key={p.id} className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={selSns.includes(p.id)} onChange={() => togglePlatform(selSns, setSelSns, p.id)} className="w-4 h-4" />
                        <span className="text-sm">{p.icon} {p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* YouTube Shorts 자동 생성 토글 */}
                <div className={`rounded-xl border p-3 transition-colors ${autoShorts ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <button type="button" onClick={() => setAutoShorts(!autoShorts)}
                      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${autoShorts ? 'bg-red-500' : 'bg-gray-300'}`}>
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoShorts ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                    <div>
                      <p className="text-sm font-medium text-gray-800">📺 YouTube Shorts 자동 생성</p>
                      <p className="text-xs text-gray-400">발행 후 백그라운드에서 AI 스크립트→TTS→영상→YouTube 자동 업로드</p>
                    </div>
                  </label>
                </div>

                <div className="flex gap-2 pt-2">
                  <button onClick={() => setPublishArticle(null)} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">취소</button>
                  <button onClick={doPublish} disabled={publishing || (selBlog.length === 0 && selSns.length === 0 && !autoShorts)}
                    className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                    {publishing ? '발행 중...' : '🚀 발행하기'}
                  </button>
                </div>
                {publishing && (
                  <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1">
                    <p className="font-medium text-gray-700">⏳ 발행 처리 중...</p>
                    {selSns.includes('instagram') && <p>📸 Instagram: 뉴스카드 생성 중 (~25초)</p>}
                    {selSns.includes('threads') && <p>🧵 Threads: 발행 후 링크 댓글 추가 (~30-60초)</p>}
                    {selBlog.includes('naver') && <p>🟢 네이버 블로그: 발행 중</p>}
                    <p className="text-gray-400 mt-1">창을 닫지 마세요 — 서버에서 처리 중입니다</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 space-y-3">
                <p className="font-medium text-gray-800">발행 결과</p>
                {Object.entries(publishResult).map(([platform, result]) => (
                  <div key={platform} className={`flex items-center justify-between p-3 rounded-lg ${result.success ? 'bg-green-50' : 'bg-red-50'}`}>
                    <span className="text-sm font-medium">{platform}</span>
                    {result.success ? (
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <span className="text-green-600 text-sm">✅ 성공</span>
                        {result.url && <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">보기</a>}
                        {result.error && <span className="text-orange-500 text-xs w-full text-right">⚠️ {result.error}</span>}
                      </div>
                    ) : (
                      <div className="text-right">
                        <span className="text-red-600 text-xs">❌ {result.error || '실패'}</span>
                      </div>
                    )}
                  </div>
                ))}
                <button onClick={() => setPublishArticle(null)} className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg text-sm mt-2">닫기</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== 예약 발행 모달 ===== */}
      {scheduleArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={e => { if (e.target === e.currentTarget && !scheduling) setScheduleArticle(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">⏰ 예약 발행 설정</h2>
              <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{scheduleArticle.title}</p>
            </div>
            <div className="p-4 space-y-4">
              {/* 예약 시간 */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">발행 예약 시간</label>
                <input
                  type="datetime-local"
                  value={scheduleDateTime}
                  onChange={e => setScheduleDateTime(e.target.value)}
                  min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
              {/* 블로그 플랫폼 */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">블로그 플랫폼</label>
                <div className="space-y-2">
                  {BLOG_PLATFORMS.filter(p => p.id !== 'wordpress').map(p => (
                    <label key={p.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" checked={schedBlog.includes(p.id)} onChange={() => togglePlatform(schedBlog, setSchedBlog, p.id)} className="w-4 h-4" />
                      <span>{p.icon} {p.name}</span>
                    </label>
                  ))}
                  {wpSites.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1.5 mt-1">🔵 WordPress 사이트 선택</div>
                      {wpSites.map(site => (
                        <label key={site.id} className="flex items-center gap-3 p-3 border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-50 mb-1.5">
                          <input type="checkbox"
                            checked={schedWpSiteIds.includes(site.id)}
                            onChange={() => {
                              const newIds = schedWpSiteIds.includes(site.id)
                                ? schedWpSiteIds.filter(id => id !== site.id)
                                : [...schedWpSiteIds, site.id];
                              setSchedWpSiteIds(newIds);
                              if (newIds.length > 0 && !schedBlog.includes('wordpress')) {
                                setSchedBlog(prev => [...prev, 'wordpress']);
                              } else if (newIds.length === 0) {
                                setSchedBlog(prev => prev.filter(b => b !== 'wordpress'));
                              }
                            }}
                            className="w-4 h-4" />
                          <div>
                            <div className="text-sm font-medium text-gray-800">{site.site_name}</div>
                            <div className="text-xs text-gray-400">{site.site_url}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {/* SNS */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">SNS 연동 (선택)</label>
                <div className="grid grid-cols-2 gap-2">
                  {SNS_PLATFORMS.map(p => (
                    <label key={p.id} className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" checked={schedSns.includes(p.id)} onChange={() => togglePlatform(schedSns, setSchedSns, p.id)} className="w-4 h-4" />
                      <span className="text-sm">{p.icon} {p.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setScheduleArticle(null)} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">취소</button>
                <button
                  onClick={doSchedule}
                  disabled={scheduling || !scheduleDateTime || (schedBlog.length === 0 && schedSns.length === 0)}
                  className="flex-1 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
                  {scheduling ? '저장 중...' : '⏰ 예약 저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
