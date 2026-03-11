'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ──────────────────────────────────────────────────────
interface ProductInfo {
  productName: string; productModel: string; productCategory: string;
  brand: string; keySpecs: string; targetUser: string;
  uniquePoints: string; priceRange: string;
}
interface Project {
  id: string; name: string; product_name: string; product_category: string;
  brand: string; template_id: string; status: string; created_at: string;
}
interface ImageAsset {
  id: string; name: string; url: string; source: 'upload' | 'figma' | 'url';
}
interface FigmaFrame {
  id: string; name: string; imgUrl?: string; loading?: boolean;
}
type Sections = Record<string, Record<string, unknown>>;
type Template = typeof TEMPLATES[0];

// ── 20 Templates ───────────────────────────────────────────────
const TEMPLATES = [
  { id:'pure-white',     name:'Pure White',     bg:'#FFFFFF', primary:'#1A1A1A', accent:'#0066FF',  desc:'삼성 스타일 · 미니멀' },
  { id:'midnight-black', name:'Midnight Black',  bg:'#0A0A0A', primary:'#FFFFFF', accent:'#00D4FF',  desc:'LG OLED · 다크 프리미엄' },
  { id:'space-gray',     name:'Space Gray',      bg:'#1C1C1E', primary:'#FFFFFF', accent:'#FF6B35',  desc:'Apple 스타일 · 스페이스그레이' },
  { id:'ocean-blue',     name:'Ocean Blue',      bg:'#003A6E', primary:'#FFFFFF', accent:'#00E5FF',  desc:'다이슨 스타일 · 딥블루' },
  { id:'forest-green',   name:'Forest Green',    bg:'#1B4332', primary:'#FFFFFF', accent:'#FFD700',  desc:'친환경 가전 · 에코' },
  { id:'rose-gold',      name:'Rose Gold',       bg:'#FDF6F0', primary:'#2D2D2D', accent:'#C9A96E',  desc:'프리미엄 여성 가전' },
  { id:'titanium',       name:'Titanium',        bg:'#2C2C2E', primary:'#FFFFFF', accent:'#E8D5B0',  desc:'다이슨/드롱기 · 산업적' },
  { id:'coral-energy',   name:'Coral Energy',    bg:'#FF6B35', primary:'#FFFFFF', accent:'#FF4757',  desc:'에너지 가전 · 활기' },
  { id:'pure-minimal',   name:'Pure Minimal',    bg:'#F5F5F5', primary:'#111111', accent:'#111111',  desc:'타이포 중심 · 초미니멀' },
  { id:'neon-tech',      name:'Neon Tech',        bg:'#0D0D0D', primary:'#FFFFFF', accent:'#39FF14',  desc:'게이밍/스마트홈 · 네온' },
  { id:'warm-ivory',     name:'Warm Ivory',      bg:'#FFFFF0', primary:'#2A2A2A', accent:'#B8860B',  desc:'클래식 · 아이보리 골드' },
  { id:'slate-pro',      name:'Slate Pro',       bg:'#2F3542', primary:'#FFFFFF', accent:'#6C63FF',  desc:'B2B 업무용 · 슬레이트' },
  { id:'sunrise-orange', name:'Sunrise Orange',  bg:'#FF7043', primary:'#FFFFFF', accent:'#FFD700',  desc:'주방가전 · 바이브런트' },
  { id:'arctic-white',   name:'Arctic White',    bg:'#E8F4FD', primary:'#1A1A2E', accent:'#4CC9F0',  desc:'공조/공기청정 · 쿨블루' },
  { id:'carbon-fiber',   name:'Carbon Fiber',    bg:'#1A1A1A', primary:'#FFFFFF', accent:'#FF0000',  desc:'고성능 가전 · 레드포인트' },
  { id:'lavender-mist',  name:'Lavender Mist',   bg:'#F3F0FF', primary:'#2D2D2D', accent:'#7C3AED',  desc:'뷰티 가전 · 라벤더' },
  { id:'gold-prestige',  name:'Gold Prestige',   bg:'#FFF8E7', primary:'#1A1A1A', accent:'#CFB87C',  desc:'최상위 프리미엄 · 진금' },
  { id:'navy-classic',   name:'Navy Classic',    bg:'#0A1628', primary:'#FFFFFF', accent:'#E8A020',  desc:'국내 대기업 스타일' },
  { id:'fresh-mint',     name:'Fresh Mint',      bg:'#E8FFF5', primary:'#1A3A2A', accent:'#00B894',  desc:'정수기/건강 가전 · 민트' },
  { id:'deep-purple',    name:'Deep Purple',     bg:'#1A0533', primary:'#FFFFFF', accent:'#A855F7',  desc:'AI/스마트 가전 · 퍼플' },
];

const CATEGORIES = ['에어컨','냉장고','세탁기','건조기','공기청정기','로봇청소기','식기세척기','오븐/레인지','정수기','TV','노트북','스마트폰','블루투스스피커','헤드폰','LED조명','기타'];

const SECTION_META = [
  { key:'hero',       icon:'🎯', label:'히어로' },
  { key:'features',   icon:'✨', label:'핵심 기능' },
  { key:'design',     icon:'🎨', label:'디자인' },
  { key:'specs',      icon:'📋', label:'기술 사양' },
  { key:'scenarios',  icon:'🏠', label:'사용 시나리오' },
  { key:'smart',      icon:'🤖', label:'스마트 기능' },
  { key:'energy',     icon:'⚡', label:'에너지 효율' },
  { key:'comparison', icon:'📊', label:'비교표' },
  { key:'inbox',      icon:'📦', label:'구성품' },
  { key:'reviews',    icon:'⭐', label:'고객 리뷰' },
  { key:'warranty',   icon:'🛡️', label:'AS/보증' },
  { key:'cta',        icon:'🛒', label:'구매 CTA' },
];

// ── EditText component ─────────────────────────────────────────
function EditText({ value, onChange, tag = 'div', className = '', style = {} }: {
  value: string; onChange: (v: string) => void;
  tag?: 'div' | 'span' | 'h1' | 'h2' | 'h3' | 'p';
  className?: string; style?: React.CSSProperties;
}) {
  const sharedClassName = `outline-none ring-1 ring-transparent hover:ring-blue-400/50 focus:ring-blue-400 rounded transition-all cursor-text ${className}`;
  const sharedProps = {
    contentEditable: true as const,
    suppressContentEditableWarning: true,
    className: sharedClassName,
    style: { wordBreak: 'keep-all' as const, overflowWrap: 'break-word' as const, minWidth: 0, ...style },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      const text = e.currentTarget.textContent ?? '';
      onChange(text || value);
    },
    dangerouslySetInnerHTML: { __html: value },
  };
  switch (tag) {
    case 'h1': return <h1 {...sharedProps} />;
    case 'h2': return <h2 {...sharedProps} />;
    case 'h3': return <h3 {...sharedProps} />;
    case 'p': return <p {...sharedProps} />;
    case 'span': return <span {...sharedProps} />;
    default: return <div {...sharedProps} />;
  }
}

// ── ImageDropZone component ────────────────────────────────────
function ImageDropZone({ imageUrl, onImageDrop, label = '이미지 추가', className = '' }: {
  imageUrl?: string; onImageDrop: (url: string, name: string) => void;
  label?: string; className?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => onImageDrop(e.target?.result as string, file.name);
    reader.readAsDataURL(file);
  };

  if (imageUrl) {
    return (
      <div className={`relative group ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} className="w-full h-full object-cover rounded-xl" alt="" />
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-2">
          <button onClick={() => inputRef.current?.click()} className="text-white text-xs bg-white/20 px-3 py-1.5 rounded-lg hover:bg-white/30">교체</button>
          <button onClick={() => onImageDrop('', '')} className="text-white text-xs bg-red-500/60 px-3 py-1.5 rounded-lg hover:bg-red-500/80">삭제</button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </div>
    );
  }

  return (
    <div
      className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${dragging ? 'border-blue-400 bg-blue-400/10' : 'border-gray-600 hover:border-gray-400 bg-white/5'} ${className}`}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      onClick={() => inputRef.current?.click()}
    >
      <div className="text-2xl opacity-40">🖼</div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-[10px] text-gray-600">클릭 또는 드래그</div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
    </div>
  );
}

// ── HeroGallery component ──────────────────────────────────────
function HeroGallery({ images, onAddImage, onRemoveImage, accent }: {
  images: string[]; onAddImage: (url: string) => void; onRemoveImage: (i: number) => void; accent: string;
}) {
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => { onAddImage(e.target?.result as string); setActive(images.length); };
    reader.readAsDataURL(file);
  };
  return (
    <div className="flex flex-col gap-3">
      {/* Main image */}
      <div className="relative aspect-square rounded-3xl overflow-hidden bg-black/5 group cursor-pointer"
        onClick={() => !images[active] && inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if(f) handleFile(f); }}>
        {images[active] ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[active]} className="w-full h-full object-cover" alt="" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button onClick={e => { e.stopPropagation(); onRemoveImage(active); setActive(Math.max(0, active-1)); }}
                className="text-white text-xs bg-red-500/80 px-3 py-1.5 rounded-full hover:bg-red-500">삭제</button>
              <button onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
                className="text-white text-xs bg-white/20 px-3 py-1.5 rounded-full hover:bg-white/30">교체</button>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{background:`${accent}20`}}>
              <svg className="w-7 h-7 opacity-40" style={{color:accent}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="text-sm opacity-40 font-medium">제품 이미지 추가</div>
            <div className="text-xs opacity-25">클릭 또는 드래그</div>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </div>
      {/* Thumbnail strip */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{scrollbarWidth:'none'}}>
        {images.map((img, i) => (
          <button key={i} onClick={() => setActive(i)}
            className="flex-shrink-0 w-16 h-16 rounded-2xl overflow-hidden border-2 transition-all"
            style={{ borderColor: i === active ? accent : 'transparent', opacity: i === active ? 1 : 0.5 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} className="w-full h-full object-cover" alt="" />
          </button>
        ))}
        {/* Add more button */}
        <button onClick={() => inputRef.current?.click()}
          className="flex-shrink-0 w-16 h-16 rounded-2xl border-2 border-dashed flex items-center justify-center text-xl transition-all hover:scale-105"
          style={{ borderColor: `${accent}40`, color: accent, opacity: 0.6 }}>
          +
        </button>
      </div>
    </div>
  );
}

// ── Icon system ────────────────────────────────────────────────
const LUCIDE_ICONS: { name: string; path: string }[] = [
  { name: '별', path: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
  { name: '번개', path: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
  { name: '방패', path: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
  { name: '하트', path: 'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z' },
  { name: '체크', path: 'M20 6L9 17l-5-5' },
  { name: '설정', path: 'M12 8a4 4 0 100 8 4 4 0 000-8zM3 12h1m8-9v1m8 8h1m-9 8v1M5.6 5.6l.7.7m12.1-.7l-.7.7m0 11.4l.7.7m-12.8 0l-.7.7' },
  { name: '박스', path: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z' },
  { name: '엄지', path: 'M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3' },
  { name: '지구', path: 'M2 12a10 10 0 1020 0A10 10 0 002 12z' },
  { name: '화살표', path: 'M5 12h14M12 5l7 7-7 7' },
  { name: '트로피', path: 'M6 9H4.5a2.5 2.5 0 010-5H6m12 5h1.5a2.5 2.5 0 000-5H18M9 21h6m-3-3v3M7 4h10l-1 9H8L7 4z' },
  { name: '잠금', path: 'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4' },
  { name: '클라우드', path: 'M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z' },
  { name: '스마트폰', path: 'M17 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V4a2 2 0 00-2-2zM12 18h.01' },
  { name: '와이파이', path: 'M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01' },
  { name: '배터리', path: 'M23 7h-1a2 2 0 00-2 2v6a2 2 0 002 2h1m-4-10H4a2 2 0 00-2 2v6a2 2 0 002 2h14M7 12h4' },
  { name: '온도계', path: 'M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z' },
  { name: '스피커', path: 'M11 5L6 9H2v6h4l5 4V5zm7.07-2.07A10 10 0 0121 12a10 10 0 01-2.93 7.07m-2.83-2.83A6 6 0 0017 12a6 6 0 00-1.76-4.24' },
  { name: '카메라', path: 'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2v11zM12 17a4 4 0 100-8 4 4 0 000 8z' },
  { name: '필터', path: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z' },
  { name: '연결', path: 'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71m-3.06 7.47l-1.72 1.71a5 5 0 01-7.07-7.07l3-3A5 5 0 019.46 7' },
  { name: '재활용', path: 'M7 19H4.5A2.5 2.5 0 012 16.5V13M7 5H4.5A2.5 2.5 0 002 7.5V11m10-9l-4 4 4 4m4-8l4 4-4 4M2 11v2m20-8v2' },
  { name: '그래프', path: 'M18 20V10m-6 10V4M6 20v-6' },
  { name: '다운로드', path: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4m4-5l5 5 5-5m-5 5V3' },
  { name: '홈', path: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9zm6 11V12h6v8' },
  { name: '로켓', path: 'M6.5 14.5s-1.5 1-1.5 3.5c2.5 0 3.5-1.5 3.5-1.5m8-9s1.5-1 1.5-3.5c-2.5 0-3.5 1.5-3.5 1.5M3 21l4-4m4.5-10.5L16 11l-4.5 10.5L8 17l-5-1.5L7 11z' },
  { name: '다이아몬드', path: 'M2.7 10.3a2.4 2.4 0 000 3.4l7.6 7.6a2.4 2.4 0 003.4 0l7.6-7.6a2.4 2.4 0 000-3.4L13.7 2.7a2.4 2.4 0 00-3.4 0L2.7 10.3z' },
  { name: '전구', path: 'M9 18h6m-5 4h4M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 01-1 1H9a1 1 0 01-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z' },
  { name: '태양', path: 'M12 17a5 5 0 100-10 5 5 0 000 10zm0-15v2m0 16v2M5.22 5.22l1.42 1.42m10.72 10.72l1.42 1.42M2 12h2m16 0h2M5.22 18.78l1.42-1.42M17.36 6.64l1.42-1.42' },
  { name: '눈', path: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zm11 3a3 3 0 100-6 3 3 0 000 6z' },
];

// Renders icon value: emoji string / SVG string / image URL
function IconRenderer({ value, size = 24, color = 'currentColor' }: { value: string; size?: number; color?: string }) {
  if (!value) return null;
  if (value.startsWith('<svg') || value.startsWith('<SVG')) {
    const colored = value.replace(/stroke="[^"]*"/g, `stroke="${color}"`).replace(/fill="[^"]*"(?![^>]*stroke)/g, `fill="none"`);
    return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size }} dangerouslySetInnerHTML={{ __html: colored }} />;
  }
  if (value.startsWith('data:') || value.startsWith('http') || value.startsWith('/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={value} style={{ width: size, height: size, objectFit: 'cover', borderRadius: 8 }} alt="" />;
  }
  return <span style={{ fontSize: size * 0.75, lineHeight: 1 }}>{value}</span>;
}

// Icon picker: emoji / SVG icons / image
function IconPickerButton({ value, onChange, accent, bg, size = 'md' }: {
  value: string; onChange: (v: string) => void;
  accent: string; bg: string; size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'emoji' | 'icon' | 'image'>('emoji');
  const [emojiInput, setEmojiInput] = useState('');
  const [imgUrl, setImgUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isDarkFn = (hex: string) => { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return (r*299+g*587+b*114)/1000<128; };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => { onChange(e.target?.result as string); setOpen(false); };
    reader.readAsDataURL(file);
  };

  const btnSize = size === 'sm' ? 'w-10 h-10' : 'w-14 h-14';
  const iconSize = size === 'sm' ? 18 : 24;

  return (
    <div className="relative" ref={wrapRef}>
      <button onClick={() => setOpen(!open)}
        className={`${btnSize} rounded-2xl flex items-center justify-center relative border-2 border-dashed transition-all hover:border-white/40`}
        style={{ background: `${accent}18`, borderColor: open ? accent : `${accent}30` }}
        title="아이콘 변경 (클릭)">
        <IconRenderer value={value} size={iconSize} color={isDarkFn(bg) ? '#fff' : '#333'} />
        <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-gray-700 rounded-full text-[8px] flex items-center justify-center text-white shadow">✏</span>
      </button>

      {open && (
        <div className="absolute z-50 top-16 left-0 w-72 bg-[#1a1a1a] border border-[#3a3a3a] rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex border-b border-[#333]">
            {[{id:'emoji',l:'이모지'},{id:'icon',l:'SVG 아이콘'},{id:'image',l:'이미지'}].map(t => (
              <button key={t.id} onClick={() => setTab(t.id as typeof tab)}
                className={`flex-1 text-[11px] py-2.5 font-medium transition-colors ${tab === t.id ? 'text-white border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'}`}>
                {t.l}
              </button>
            ))}
          </div>

          {tab === 'emoji' && (
            <div className="p-3">
              <input value={emojiInput} onChange={e => setEmojiInput(e.target.value)}
                placeholder="이모지 입력..."
                className="w-full bg-black/40 border border-[#444] rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 mb-2" />
              <div className="grid grid-cols-8 gap-0.5 mb-2">
                {['✨','⚡','🔧','🎯','💡','🚀','🔬','🎨','🛡️','📊','🌿','♻️','🏆','❤️','🔐','📱','🌐','💎','⭐','🎵','🔊','📷','🌡️','🔋','📡','🖥️','🎮','🏠','🔑','💫','🌟','🎁','🔖','📌','🔗','⚙️','🔩','🪄','🦾','🧠','⚗️','🧬','🏅','🎖️','🥇'].map(e => (
                  <button key={e} onClick={() => { onChange(e); setOpen(false); }}
                    className="text-lg p-1 hover:bg-white/10 rounded-lg transition-all aspect-square flex items-center justify-center">
                    {e}
                  </button>
                ))}
              </div>
              {emojiInput && (
                <button onClick={() => { onChange(emojiInput); setOpen(false); }}
                  className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs text-white">
                  적용: {emojiInput}
                </button>
              )}
            </div>
          )}

          {tab === 'icon' && (
            <div className="p-3 max-h-64 overflow-y-auto">
              <div className="text-[10px] text-gray-500 mb-2">클릭해서 SVG 아이콘 적용</div>
              <div className="grid grid-cols-7 gap-1">
                {LUCIDE_ICONS.map(icon => {
                  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${icon.path}"/></svg>`;
                  return (
                    <button key={icon.name} onClick={() => { onChange(svgStr); setOpen(false); }}
                      title={icon.name}
                      className="p-2 hover:bg-white/10 rounded-xl transition-all flex items-center justify-center text-gray-300 hover:text-white">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d={icon.path} />
                      </svg>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'image' && (
            <div className="p-3 space-y-2">
              <button onClick={() => fileRef.current?.click()}
                className="w-full py-3 border-2 border-dashed border-[#444] hover:border-indigo-500 rounded-xl text-sm text-gray-400 hover:text-white transition-all">
                📁 이미지 파일 업로드
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              <div className="flex gap-2">
                <input value={imgUrl} onChange={e => setImgUrl(e.target.value)}
                  placeholder="이미지 URL 붙여넣기..."
                  className="flex-1 bg-black/40 border border-[#444] rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600" />
                <button onClick={() => { if(imgUrl.trim()) { onChange(imgUrl.trim()); setOpen(false); } }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs text-white whitespace-nowrap">
                  적용
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Commercial-grade EditableSection ──────────────────────────
const FONT = "'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', -apple-system, sans-serif";

function EditableSection({ sectionKey, data, tpl, sectionImage, onUpdate, onImageChange }: {
  sectionKey: string; data: Record<string, unknown>; tpl: Template;
  sectionImage?: string; onUpdate: (data: Record<string, unknown>) => void;
  onImageChange: (url: string, name: string) => void;
}) {
  // Section-level color overrides
  const oc = (data._sectionColors ?? {}) as Record<string, string>;
  const accent = oc.accent ?? tpl.accent;
  const bg = oc.bg ?? tpl.bg;
  const primary = oc.primary ?? tpl.primary;
  const isDark = (hex: string) => { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return (r*299+g*587+b*114)/1000<128; };
  const bgIsDark = isDark(bg);

  // Multi-image helper
  const getImages = () => {
    const stored = (data._images ?? []) as string[];
    if (stored.length === 0 && sectionImage) return [sectionImage];
    return stored;
  };
  const addImage = (url: string) => {
    const imgs = getImages();
    onUpdate({ ...data, _images: [...imgs, url] });
    if (imgs.length === 0) onImageChange(url, 'image');
  };
  const removeImage = (i: number) => {
    const imgs = [...getImages()]; imgs.splice(i, 1);
    onUpdate({ ...data, _images: imgs });
  };

  const containerStyle: React.CSSProperties = { background: bg, color: primary, fontFamily: FONT };

  // Shared: Section label + title block
  const SectionLabel = ({ text }: { text: string }) => (
    <div className="text-xs font-bold tracking-[0.2em] uppercase mb-4" style={{ color: accent }}>{text}</div>
  );

  switch (sectionKey) {

    case 'hero': {
      const d = data as { headline?: string; subheadline?: string; tagline?: string; keyPoints?: string[] };
      const u = (f: string, v: unknown) => onUpdate({ ...d, [f]: v });
      const images = getImages();
      return (
        <div style={containerStyle}>
          {/* Top padding band */}
          <div className="px-12 pt-16 pb-0">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 48, alignItems: 'start' }}>
              {/* Left: copy */}
              <div className="pt-4" style={{ minWidth: 0 }}>
                <EditText tag="div" value={d.tagline ?? ''} onChange={v => u('tagline', v)}
                  className="text-xs font-bold tracking-[0.25em] uppercase mb-6"
                  style={{ color: accent }} />
                <EditText tag="h1" value={d.headline ?? ''}  onChange={v => u('headline', v)}
                  className="font-black leading-[1.05] tracking-tight mb-6"
                  style={{ fontSize: 'clamp(40px,5vw,72px)', letterSpacing: '-0.03em', wordBreak: 'keep-all', overflowWrap: 'break-word' }} />
                <EditText tag="p" value={d.subheadline ?? ''} onChange={v => u('subheadline', v)}
                  className="text-lg leading-relaxed mb-10"
                  style={{ opacity: 0.65, maxWidth: 480, lineHeight: 1.7 }} />
                {/* Key points */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 40 }}>
                  {(d.keyPoints ?? []).map((p, i) => (
                    <EditText key={i} tag="span" value={p} onChange={v => {
                      const pts = [...(d.keyPoints ?? [])]; pts[i] = v; u('keyPoints', pts);
                    }} className="text-sm px-5 py-2 rounded-full font-semibold"
                      style={{ background: accent, color: isDark(accent) ? '#fff' : '#000', letterSpacing: '-0.01em', whiteSpace: 'nowrap', flexShrink: 0 }} />
                  ))}
                  <button onClick={() => u('keyPoints', [...(d.keyPoints ?? []), '새 포인트'])}
                    className="text-sm px-4 py-2 rounded-full border-2 border-dashed transition-all hover:opacity-70"
                    style={{ borderColor: `${accent}50`, color: accent, opacity: 0.4 }}>+</button>
                </div>
                {/* CTA row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div className="px-8 py-4 rounded-2xl font-bold text-base cursor-default select-none"
                    style={{ background: accent, color: isDark(accent) ? '#fff' : '#000', letterSpacing: '-0.01em', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    지금 구매하기 →
                  </div>
                  <div className="text-sm font-medium opacity-40 cursor-default">자세히 보기 ↓</div>
                </div>
              </div>
              {/* Right: image gallery */}
              <div style={{ minWidth: 0 }}>
                <HeroGallery images={images} onAddImage={addImage} onRemoveImage={removeImage} accent={accent} />
              </div>
            </div>
          </div>
          {/* Bottom accent bar */}
          <div className="mt-14 px-12 pb-12 grid grid-cols-3 gap-0 border-t"
            style={{ borderColor: `${primary}10` }}>
            {[['무료 배송', '5만원 이상'],['전국 A/S','2,000개 센터'],['30일 환불','무조건 보장']].map(([t,s]) => (
              <div key={t} className="pt-8 pr-8">
                <div className="text-sm font-bold mb-0.5">{t}</div>
                <div className="text-xs" style={{ opacity: 0.4 }}>{s}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'features': {
      const d = data as { title?: string; items?: { icon: string; title: string; desc: string; image?: string }[] };
      const u = (f: string, v: unknown) => onUpdate({ ...d, [f]: v });
      const addFeatureImage = (i: number, url: string) => {
        const items=[...(d.items??[])]; items[i]={...items[i],image:url}; u('items',items);
      };
      return (
        <div className="px-12 py-16" style={containerStyle}>
          <SectionLabel text="핵심 기능" />
          <EditText tag="h2" value={d.title ?? ''} onChange={v => u('title', v)}
            className="font-black mb-14 leading-tight"
            style={{ fontSize: 'clamp(32px,4vw,52px)', letterSpacing: '-0.03em' }} />
          <div className="grid grid-cols-3 gap-6">
            {(d.items ?? []).map((item, i) => (
              <div key={i} className="relative group">
                <button onClick={() => { const items=[...(d.items??[])]; items.splice(i,1); u('items',items); }}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 z-10 transition-opacity">✕</button>
                {/* Optional inline image */}
                {item.image ? (
                  <div className="relative group/img w-full h-36 rounded-2xl overflow-hidden mb-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.image} className="w-full h-full object-cover" alt="" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button onClick={() => addFeatureImage(i, '')} className="text-white text-xs bg-red-500/80 px-2 py-1 rounded-full">삭제</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Number */}
                    <div className="text-6xl font-black mb-4 leading-none select-none"
                      style={{ color: `${accent}20`, fontVariantNumeric: 'tabular-nums' }}>
                      {String(i+1).padStart(2,'0')}
                    </div>
                    {/* Icon with picker */}
                    <div className="mb-4">
                      <IconPickerButton value={item.icon} onChange={v => { const items=[...(d.items??[])]; items[i]={...items[i],icon:v}; u('items',items); }} accent={accent} bg={bg} />
                    </div>
                  </>
                )}
                {/* Add image button (shown on hover when no image) */}
                {!item.image && (
                  <label className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <span className="text-[9px] bg-black/60 text-gray-300 px-1.5 py-0.5 rounded-full hover:bg-indigo-600/70">+ 사진</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => {
                      const f = e.target.files?.[0]; if(!f) return;
                      const r = new FileReader(); r.onload = ev => addFeatureImage(i, ev.target?.result as string); r.readAsDataURL(f);
                    }} />
                  </label>
                )}
                <EditText tag="div" value={item.title} onChange={v => {
                  const items=[...(d.items??[])]; items[i]={...items[i],title:v}; u('items',items);
                }} className="font-bold text-lg mb-2" style={{ letterSpacing: '-0.02em' }} />
                <EditText tag="div" value={item.desc} onChange={v => {
                  const items=[...(d.items??[])]; items[i]={...items[i],desc:v}; u('items',items);
                }} className="text-sm leading-relaxed" style={{ opacity: 0.55, lineHeight: 1.7 }} />
              </div>
            ))}
            <button onClick={() => u('items', [...(d.items??[]),{icon:'✨',title:'새 기능',desc:'기능 설명'}])}
              className="flex items-center justify-center rounded-3xl border-2 border-dashed min-h-[160px] text-sm font-medium transition-all hover:opacity-60"
              style={{ borderColor: `${accent}30`, color: accent, opacity: 0.3 }}>+ 기능 추가</button>
          </div>
        </div>
      );
    }

    case 'design': {
      const d = data as { title?: string; designStory?: string; colorways?: { name: string; hex: string; desc: string }[]; materials?: string[] };
      const u = (f: string, v: unknown) => onUpdate({ ...d, [f]: v });
      const images = getImages();
      return (
        <div style={containerStyle}>
          {/* Full-width image banner */}
          <div className="relative w-full h-80 overflow-hidden group cursor-pointer"
            onClick={() => { if(!images[0]) { const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.onchange=e=>{ const f=(e.target as HTMLInputElement).files?.[0]; if(f){const r=new FileReader();r.onload=ev=>addImage(ev.target?.result as string);r.readAsDataURL(f);} }; inp.click(); } }}>
            {images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={images[0]} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ background: `${accent}10` }}>
                <div className="text-center opacity-30">
                  <div className="text-4xl mb-2">🖼</div>
                  <div className="text-sm">디자인 이미지 추가 (클릭)</div>
                </div>
              </div>
            )}
            {images[0] && (
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button onClick={e => { e.stopPropagation(); removeImage(0); }} className="text-white text-sm bg-red-500/80 px-4 py-2 rounded-full">이미지 삭제</button>
              </div>
            )}
          </div>
          <div className="px-12 py-14">
            <SectionLabel text="디자인" />
            <div className="grid grid-cols-[1fr_1fr] gap-16">
              <div>
                <EditText tag="h2" value={d.title ?? ''} onChange={v => u('title', v)}
                  className="font-black mb-6 leading-tight"
                  style={{ fontSize: 'clamp(28px,3.5vw,44px)', letterSpacing: '-0.03em' }} />
                <EditText tag="p" value={d.designStory ?? ''} onChange={v => u('designStory', v)}
                  className="text-base leading-relaxed" style={{ opacity: 0.6, lineHeight: 1.8 }} />
              </div>
              <div>
                {/* Color palette */}
                <div className="mb-8">
                  <div className="text-xs font-bold tracking-widest uppercase mb-4" style={{ opacity: 0.4 }}>컬러웨이</div>
                  <div className="flex gap-4">
                    {(d.colorways ?? []).map((c, i) => (
                      <div key={i} className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-full shadow-lg border-2 border-white/20" style={{ background: c.hex }} />
                        <EditText tag="div" value={c.name} onChange={v => {
                          const cw=[...(d.colorways??[])]; cw[i]={...cw[i],name:v}; u('colorways',cw);
                        }} className="text-xs font-medium text-center" />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Materials */}
                {(d.materials ?? []).length > 0 && (
                  <div>
                    <div className="text-xs font-bold tracking-widest uppercase mb-4" style={{ opacity: 0.4 }}>소재</div>
                    <div className="flex flex-wrap gap-2">
                      {(d.materials ?? []).map((m, i) => (
                        <EditText key={i} tag="span" value={m} onChange={v => {
                          const mats=[...(d.materials??[])]; mats[i]=v; u('materials',mats);
                        }} className="text-xs px-3 py-1.5 rounded-full font-medium"
                          style={{ background: `${primary}10`, border: `1px solid ${primary}20` }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    case 'specs': {
      const d = data as { title?: string; groups?: { groupName: string; rows: { label: string; value: string }[] }[] };
      const u = (f: string, v: unknown) => onUpdate({ ...d, [f]: v });
      return (
        <div className="px-12 py-16" style={containerStyle}>
          <SectionLabel text="기술 사양" />
          <EditText tag="h2" value={d.title ?? ''} onChange={v => u('title', v)}
            className="font-black mb-12 leading-tight"
            style={{ fontSize: 'clamp(28px,3.5vw,44px)', letterSpacing: '-0.03em' }} />
          <div className="space-y-8">
            {(d.groups ?? []).map((g, gi) => (
              <div key={gi}>
                {/* Group header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: accent }} />
                  <EditText tag="div" value={g.groupName} onChange={v => {
                    const groups=[...(d.groups??[])]; groups[gi]={...groups[gi],groupName:v}; u('groups',groups);
                  }} className="text-sm font-bold tracking-wider uppercase" style={{ opacity: 0.5 }} />
                </div>
                <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${primary}10` }}>
                  {g.rows.map((row, ri) => (
                    <div key={ri} className="flex items-center px-6 py-4 text-sm"
                      style={{ background: ri%2===0 ? `${primary}04` : 'transparent', borderBottom: ri<g.rows.length-1 ? `1px solid ${primary}06` : 'none' }}>
                      <EditText tag="span" value={row.label} onChange={v => {
                        const groups=[...(d.groups??[])];
                        groups[gi]={...groups[gi],rows:groups[gi].rows.map((r,i)=>i===ri?{...r,label:v}:r)};
                        u('groups',groups);
                      }} className="w-40 flex-shrink-0 font-medium" style={{ opacity: 0.45 }} />
                      <EditText tag="span" value={row.value} onChange={v => {
                        const groups=[...(d.groups??[])];
                        groups[gi]={...groups[gi],rows:groups[gi].rows.map((r,i)=>i===ri?{...r,value:v}:r)};
                        u('groups',groups);
                      }} className="font-semibold flex-1" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'scenarios': {
      const d = data as { title?: string; items?: { situation: string; desc: string; emoji: string }[] };
      const u = (f: string, v: unknown) => onUpdate({ ...d, [f]: v });
      return (
        <div className="px-12 py-16" style={containerStyle}>
          <SectionLabel text="사용 시나리오" />
          <EditText tag="h2" value={d.title ?? ''} onChange={v => u('title', v)}
            className="font-black mb-14 leading-tight"
            style={{ fontSize: 'clamp(28px,3.5vw,44px)', letterSpacing: '-0.03em' }} />
          <div className="space-y-6">
            {(d.items ?? []).map((item, i) => (
              <div key={i} className="relative group flex gap-8 items-start p-8 rounded-3xl transition-all"
                style={{ background: i%2===0 ? `${accent}08` : `${primary}04`, border: `1px solid ${primary}06` }}>
                <button onClick={() => { const items=[...(d.items??[])]; items.splice(i,1); u('items',items); }}
                  className="absolute top-3 right-3 w-6 h-6 bg-red-500 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100">✕</button>
                {/* Icon with picker */}
                <div className="flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: accent }}>
                  <IconPickerButton value={item.emoji} onChange={v => {
                    const items=[...(d.items??[])]; items[i]={...items[i],emoji:v}; u('items',items);
                  }} accent={accent} bg={accent} size="sm" />
                </div>
                <div className="flex-1">
                  <EditText tag="div" value={item.situation} onChange={v => {
                    const items=[...(d.items??[])]; items[i]={...items[i],situation:v}; u('items',items);
                  }} className="font-bold text-lg mb-2" style={{ letterSpacing: '-0.02em' }} />
                  <EditText tag="div" value={item.desc} onChange={v => {
                    const items=[...(d.items??[])]; items[i]={...items[i],desc:v}; u('items',items);
                  }} className="text-sm leading-relaxed" style={{ opacity: 0.55 }} />
                </div>
              </div>
            ))}
            <button onClick={() => u('items', [...(d.items??[]),{situation:'새 시나리오',desc:'설명을 입력하세요',emoji:'🏠'}])}
              className="w-full py-5 rounded-3xl border-2 border-dashed text-sm font-medium transition-all hover:opacity-60"
              style={{ borderColor: `${accent}30`, color: accent, opacity: 0.3 }}>+ 시나리오 추가</button>
          </div>
        </div>
      );
    }

    case 'smart': {
      const d = data as { title?: string; subtitle?: string; features?: { icon: string; name: string; desc: string }[] };
      const u = (f: string, v: unknown) => onUpdate({ ...d, [f]: v });
      return (
        <div style={containerStyle}>
          <div className="px-12 py-16">
            <SectionLabel text="스마트 기능" />
            <div className="grid grid-cols-[1fr_1fr] gap-16 mb-12">
              <div>
                <EditText tag="h2" value={d.title ?? ''} onChange={v => u('title', v)}
                  className="font-black leading-tight"
                  style={{ fontSize: 'clamp(28px,3.5vw,44px)', letterSpacing: '-0.03em' }} />
              </div>
              <div className="flex items-end">
                <EditText tag="p" value={d.subtitle ?? ''} onChange={v => u('subtitle', v)}
                  className="text-base leading-relaxed" style={{ opacity: 0.55 }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {(d.features ?? []).map((f, i) => (
                <div key={i} className="relative group flex gap-5 items-start p-6 rounded-3xl"
                  style={{ background: bgIsDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', border: `1px solid ${primary}08` }}>
                  <button onClick={() => { const features=[...(d.features??[])]; features.splice(i,1); u('features',features); }}
                    className="absolute top-3 right-3 w-5 h-5 bg-red-500 rounded-full text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100">✕</button>
                  <div className="flex-shrink-0">
                    <IconPickerButton value={f.icon} onChange={v => {
                      const features=[...(d.features??[])]; features[i]={...features[i],icon:v}; u('features',features);
                    }} accent={accent} bg={bg} size="sm" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <EditText tag="div" value={f.name} onChange={v => {
                      const features=[...(d.features??[])]; features[i]={...features[i],name:v}; u('features',features);
                    }} className="font-bold mb-1.5" style={{ letterSpacing: '-0.02em' }} />
                    <EditText tag="div" value={f.desc} onChange={v => {
                      const features=[...(d.features??[])]; features[i]={...features[i],desc:v}; u('features',features);
                    }} className="text-sm leading-relaxed" style={{ opacity: 0.5 }} />
                  </div>
                </div>
              ))}
              <button onClick={() => u('features', [...(d.features??[]),{icon:'⚡',name:'새 기능',desc:'설명'}])}
                className="flex items-center justify-center rounded-3xl border-2 border-dashed min-h-[100px] text-sm font-medium transition-all hover:opacity-60"
                style={{ borderColor: `${accent}30`, color: accent, opacity: 0.3 }}>+</button>
            </div>
          </div>
        </div>
      );
    }

    case 'energy': {
      const d = data as { title?: string; grade?: string; annualCost?: string; comparisonNote?: string; badges?: { label: string; icon: string }[] };
      const u = (f: string, v: unknown) => onUpdate({ ...d, [f]: v });
      return (
        <div className="px-12 py-16" style={containerStyle}>
          <SectionLabel text="에너지 효율" />
          <div className="grid grid-cols-[1fr_auto] gap-12 items-start">
            <div>
              <EditText tag="h2" value={d.title ?? ''} onChange={v => u('title', v)}
                className="font-black mb-10 leading-tight"
                style={{ fontSize: 'clamp(28px,3.5vw,44px)', letterSpacing: '-0.03em' }} />
              {/* Badges */}
              <div className="flex flex-wrap gap-3 mb-8">
                {(d.badges ?? []).map((b, i) => (
                  <div key={i} className="flex items-center gap-2 px-5 py-3 rounded-2xl"
                    style={{ background: `${accent}15`, border: `1px solid ${accent}30` }}>
                    <EditText tag="span" value={b.icon} onChange={v => {
                      const badges=[...(d.badges??[])]; badges[i]={...badges[i],icon:v}; u('badges',badges);
                    }} className="text-xl" />
                    <EditText tag="span" value={b.label} onChange={v => {
                      const badges=[...(d.badges??[])]; badges[i]={...badges[i],label:v}; u('badges',badges);
                    }} className="text-sm font-semibold" />
                  </div>
                ))}
              </div>
              <div className="flex gap-8">
                <div>
                  <div className="text-xs font-bold tracking-widest uppercase mb-1" style={{ opacity: 0.4 }}>연간 전기요금</div>
                  <EditText tag="div" value={d.annualCost ?? ''} onChange={v => u('annualCost', v)}
                    className="text-2xl font-black" style={{ color: accent }} />
                </div>
                <div>
                  <div className="text-xs font-bold tracking-widest uppercase mb-1" style={{ opacity: 0.4 }}>절감 비교</div>
                  <EditText tag="div" value={d.comparisonNote ?? ''} onChange={v => u('comparisonNote', v)}
                    className="text-2xl font-black" />
                </div>
              </div>
            </div>
            {/* Grade badge */}
            <div className="flex flex-col items-center justify-center w-40 h-40 rounded-3xl"
              style={{ background: accent }}>
              <div className="text-xs font-bold tracking-widest text-white/70 uppercase mb-1">에너지</div>
              <EditText tag="div" value={d.grade ?? ''} onChange={v => u('grade', v)}
                className="font-black text-white leading-none"
                style={{ fontSize: 56 }} />
              <div className="text-xs text-white/70 mt-1">등급</div>
            </div>
          </div>
        </div>
      );
    }

    case 'comparison': {
      const d = data as { title?: string; headers?: string[]; rows?: { feature: string; values: string[] }[] };
      const u = (f: string, v: unknown) => onUpdate({ ...d, [f]: v });
      return (
        <div className="px-12 py-16" style={containerStyle}>
          <SectionLabel text="비교" />
          <EditText tag="h2" value={d.title ?? ''} onChange={v => u('title', v)}
            className="font-black mb-10 leading-tight"
            style={{ fontSize: 'clamp(28px,3.5vw,44px)', letterSpacing: '-0.03em' }} />
          <div className="rounded-3xl overflow-hidden" style={{ border: `1px solid ${primary}10` }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: accent }}>
                  {(d.headers ?? []).map((h, i) => (
                    <th key={i} className={`px-6 py-5 text-left font-bold ${i===0 ? 'w-44' : ''}`}
                      style={{ color: isDark(accent) ? '#fff' : '#000' }}>
                      <EditText tag="span" value={h} onChange={v => {
                        const headers=[...(d.headers??[])]; headers[i]=v; u('headers',headers);
                      }} style={{ color: isDark(accent) ? '#fff' : '#000' }} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(d.rows ?? []).map((row, i) => (
                  <tr key={i} style={{ background: i%2===0 ? `${primary}03` : 'transparent', borderBottom: `1px solid ${primary}06` }}>
                    <td className="px-6 py-4 font-medium" style={{ opacity: 0.6 }}>
                      <EditText tag="span" value={row.feature} onChange={v => {
                        const rows=[...(d.rows??[])]; rows[i]={...rows[i],feature:v}; u('rows',rows);
                      }} />
                    </td>
                    {(row.values ?? []).map((v, j) => (
                      <td key={j} className={`px-6 py-4 ${j===0 ? 'font-bold' : ''}`}
                        style={{ color: j===0 ? accent : undefined, opacity: j>0 ? 0.45 : 1 }}>
                        <EditText tag="span" value={v} onChange={val => {
                          const rows=[...(d.rows??[])];
                          rows[i]={...rows[i],values:rows[i].values.map((rv,ri)=>ri===j?val:rv)};
                          u('rows',rows);
                        }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    case 'inbox': {
      const d = data as { title?: string; items?: { name: string; qty: string; icon?: string }[] };
      const u = (f: string, v: unknown) => onUpdate({ ...d, [f]: v });
      return (
        <div className="px-12 py-16" style={containerStyle}>
          <SectionLabel text="구성품" />
          <EditText tag="h2" value={d.title ?? ''} onChange={v => u('title', v)}
            className="font-black mb-10"
            style={{ fontSize: 'clamp(28px,3.5vw,44px)', letterSpacing: '-0.03em' }} />
          <div className="grid grid-cols-5 gap-4">
            {(d.items ?? []).map((item, i) => (
              <div key={i} className="relative group flex flex-col items-center gap-3 p-5 rounded-3xl text-center"
                style={{ background: `${primary}05`, border: `1px solid ${primary}08` }}>
                <button onClick={() => { const items=[...(d.items??[])]; items.splice(i,1); u('items',items); }}
                  className="absolute top-2 right-2 w-5 h-5 bg-red-500 rounded-full text-white text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100">✕</button>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                  style={{ background: `${accent}15` }}>
                  <EditText tag="span" value={item.icon ?? '📦'} onChange={v => {
                    const items=[...(d.items??[])]; items[i]={...items[i],icon:v}; u('items',items);
                  }} />
                </div>
                <EditText tag="div" value={item.name} onChange={v => {
                  const items=[...(d.items??[])]; items[i]={...items[i],name:v}; u('items',items);
                }} className="text-sm font-semibold leading-tight" />
                <EditText tag="div" value={item.qty} onChange={v => {
                  const items=[...(d.items??[])]; items[i]={...items[i],qty:v}; u('items',items);
                }} className="text-xs rounded-full px-2 py-0.5 font-medium"
                  style={{ background: `${accent}20`, color: accent }} />
              </div>
            ))}
            <button onClick={() => u('items', [...(d.items??[]),{icon:'📦',name:'새 구성품',qty:'1개'}])}
              className="flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed min-h-[120px] text-sm font-medium transition-all hover:opacity-60"
              style={{ borderColor: `${accent}30`, color: accent, opacity: 0.3 }}>+</button>
          </div>
        </div>
      );
    }

    case 'reviews': {
      const d = data as { title?: string; rating?: string; summary?: string; items?: { author: string; rating: number; body: string; tag?: string }[] };
      const u = (f: string, v: unknown) => onUpdate({ ...d, [f]: v });
      const stars = (n: number, color: string) => Array.from({length:5}).map((_,i) => (
        <span key={i} style={{ color: i<n ? color : `${color}30`, fontSize: 14 }}>★</span>
      ));
      return (
        <div className="px-12 py-16" style={containerStyle}>
          <SectionLabel text="고객 리뷰" />
          <div className="flex items-end gap-6 mb-12">
            <div>
              <EditText tag="h2" value={d.title ?? ''} onChange={v => u('title', v)}
                className="font-black leading-tight"
                style={{ fontSize: 'clamp(28px,3.5vw,44px)', letterSpacing: '-0.03em' }} />
            </div>
            <div className="flex items-center gap-3 pb-1">
              <div className="text-5xl font-black" style={{ color: accent }}>{d.rating}</div>
              <div>
                <div className="flex">{stars(Math.round(parseFloat(d.rating??'5')), accent)}</div>
                <div className="text-xs mt-0.5" style={{ opacity: 0.4 }}>/ 5.0</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {(d.items ?? []).map((r, i) => (
              <div key={i} className="relative group p-6 rounded-3xl"
                style={{ background: `${primary}04`, border: `1px solid ${primary}08` }}>
                <button onClick={() => { const items=[...(d.items??[])]; items.splice(i,1); u('items',items); }}
                  className="absolute top-3 right-3 w-5 h-5 bg-red-500 rounded-full text-white text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100">✕</button>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black"
                    style={{ background: accent, color: isDark(accent) ? '#fff' : '#000' }}>
                    {r.author.charAt(0)}
                  </div>
                  <div>
                    <EditText tag="div" value={r.author} onChange={v => {
                      const items=[...(d.items??[])]; items[i]={...items[i],author:v}; u('items',items);
                    }} className="text-sm font-bold" />
                    <div className="flex mt-0.5">{stars(r.rating, accent)}</div>
                  </div>
                  {r.tag && (
                    <span className="ml-auto text-xs px-2.5 py-1 rounded-full font-semibold"
                      style={{ background: `${accent}20`, color: accent }}>{r.tag}</span>
                  )}
                </div>
                <EditText tag="p" value={r.body} onChange={v => {
                  const items=[...(d.items??[])]; items[i]={...items[i],body:v}; u('items',items);
                }} className="text-sm leading-relaxed" style={{ opacity: 0.6, lineHeight: 1.7 }} />
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'warranty': {
      const d = data as { title?: string; warrantyPeriod?: string; coverageItems?: string[]; serviceCenters?: string; note?: string };
      const u = (f: string, v: unknown) => onUpdate({ ...d, [f]: v });
      return (
        <div className="px-12 py-16" style={containerStyle}>
          <SectionLabel text="A/S 보증" />
          <div className="grid grid-cols-[1fr_1fr] gap-16 items-start">
            <div>
              <EditText tag="h2" value={d.title ?? ''} onChange={v => u('title', v)}
                className="font-black mb-8 leading-tight"
                style={{ fontSize: 'clamp(28px,3.5vw,44px)', letterSpacing: '-0.03em' }} />
              <div className="space-y-3">
                {(d.coverageItems ?? []).map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: accent }}>
                      <span style={{ color: isDark(accent)?'#fff':'#000', fontSize: 10 }}>✓</span>
                    </div>
                    <EditText tag="span" value={item} onChange={v => {
                      const items=[...(d.coverageItems??[])]; items[i]=v; u('coverageItems',items);
                    }} className="text-sm font-medium" />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-5">
              <div className="p-6 rounded-3xl" style={{ background: `${accent}10`, border: `1px solid ${accent}20` }}>
                <div className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: accent }}>보증기간</div>
                <EditText tag="div" value={d.warrantyPeriod ?? ''} onChange={v => u('warrantyPeriod', v)}
                  className="text-xl font-black" />
              </div>
              <div className="p-6 rounded-3xl" style={{ background: `${primary}05` }}>
                <div className="text-xs font-bold tracking-widest uppercase mb-2" style={{ opacity: 0.4 }}>서비스센터</div>
                <EditText tag="div" value={d.serviceCenters ?? ''} onChange={v => u('serviceCenters', v)}
                  className="text-xl font-black" />
              </div>
              {d.note && (
                <EditText tag="p" value={d.note} onChange={v => u('note', v)}
                  className="text-xs leading-relaxed" style={{ opacity: 0.4 }} />
              )}
            </div>
          </div>
        </div>
      );
    }

    case 'cta': {
      const d = data as { headline?: string; subtext?: string; price?: string; originalPrice?: string; badge?: string; btnText?: string; installNote?: string };
      const u = (f: string, v: unknown) => onUpdate({ ...d, [f]: v });
      const ctaBg = bgIsDark ? `linear-gradient(135deg, ${accent}22 0%, ${bg} 100%)` : `linear-gradient(135deg, ${bg} 0%, ${accent}15 100%)`;
      return (
        <div style={{ ...containerStyle, background: ctaBg }}>
          <div className="px-12 py-20 text-center">
            {d.badge && (
              <div className="inline-flex items-center gap-2 mb-8 px-5 py-2.5 rounded-full text-sm font-bold"
                style={{ background: accent, color: isDark(accent)?'#fff':'#000' }}>
                <EditText tag="span" value={d.badge} onChange={v => u('badge', v)} />
              </div>
            )}
            <EditText tag="h2" value={d.headline ?? ''} onChange={v => u('headline', v)}
              className="font-black mb-4 leading-tight mx-auto"
              style={{ fontSize: 'clamp(36px,5vw,64px)', letterSpacing: '-0.04em', maxWidth: 700 }} />
            <EditText tag="p" value={d.subtext ?? ''} onChange={v => u('subtext', v)}
              className="text-lg mb-10 mx-auto" style={{ opacity: 0.55, maxWidth: 500, lineHeight: 1.7 }} />
            {/* Price */}
            <div className="flex items-center justify-center gap-4 mb-10">
              {d.originalPrice && (
                <EditText tag="span" value={d.originalPrice} onChange={v => u('originalPrice', v)}
                  className="text-xl line-through" style={{ opacity: 0.35 }} />
              )}
              <EditText tag="span" value={d.price ?? ''} onChange={v => u('price', v)}
                className="font-black" style={{ fontSize: 56, color: accent, letterSpacing: '-0.04em' }} />
            </div>
            {/* Button */}
            <div className="inline-flex items-center gap-3 px-12 py-5 rounded-2xl font-black text-lg cursor-default"
              style={{ background: accent, color: isDark(accent)?'#fff':'#000', letterSpacing: '-0.02em', fontSize: 18 }}>
              <EditText tag="span" value={d.btnText ?? '지금 구매하기'} onChange={v => u('btnText', v)}
                style={{ color: isDark(accent)?'#fff':'#000' }} />
              <span style={{ color: isDark(accent)?'#fff':'#000' }}>→</span>
            </div>
            {d.installNote && (
              <EditText tag="p" value={d.installNote} onChange={v => u('installNote', v)}
                className="text-sm mt-5" style={{ opacity: 0.35 }} />
            )}
          </div>
        </div>
      );
    }

    default: {
      return (
        <div className="px-12 py-16" style={containerStyle}>
          <h3 className="font-black mb-6" style={{ fontSize: 32, letterSpacing: '-0.03em', fontFamily: FONT }}>
            {(data.title as string) ?? SECTION_META.find(m => m.key === sectionKey)?.label}
          </h3>
          <div className="space-y-2">
            {Object.entries(data).filter(([k]) => k !== 'title' && !k.startsWith('_')).slice(0,8).map(([k,v]) => (
              <div key={k} className="flex gap-4 text-sm py-2 border-b" style={{ borderColor: `${primary}08`, opacity: 0.7 }}>
                <span className="w-32 flex-shrink-0" style={{ opacity: 0.4 }}>{k}</span>
                <span className="truncate">{typeof v==='string' ? v : JSON.stringify(v).slice(0,80)}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
  }
}

// ── renderLayers helper ────────────────────────────────────────
function renderLayers(sectionKey: string, data: Record<string, unknown>): React.ReactNode {
  const layers: React.ReactNode[] = [];
  const processValue = (key: string, value: unknown, depth = 0) => {
    if (typeof value === 'string' && value.length > 0) {
      layers.push(
        <div key={`${key}-${depth}-${layers.length}`}
          className="flex items-center gap-2 py-1.5 hover:bg-white/5 cursor-pointer rounded-lg mx-1"
          style={{ paddingLeft: `${12 + depth * 12}px` }}>
          <span className="text-[10px] opacity-40">𝐓</span>
          <span className="text-[11px] text-gray-400 truncate flex-1">{key}</span>
          <span className="text-[10px] text-gray-600 ml-auto truncate max-w-[80px]">{String(value).slice(0, 20)}</span>
        </div>
      );
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'object' && item !== null) {
          processValue(`${key}[${i}]`, item, depth + 1);
        }
      });
    } else if (typeof value === 'object' && value !== null) {
      Object.entries(value as Record<string, unknown>).forEach(([k, v]) => processValue(k, v, depth + 1));
    }
  };
  Object.entries(data).forEach(([k, v]) => processValue(k, v));
  // suppress unused sectionKey warning
  void sectionKey;
  return layers;
}

// ── Main Component ─────────────────────────────────────────────
export default function ProductDetailPage() {
  const [appMode, setAppMode] = useState<'setup' | 'editor'>('setup');
  const [setupStep, setSetupStep] = useState<1 | 2>(1);

  const [selectedSection, setSelectedSection] = useState('hero');
  const [selectedTpl, setSelectedTpl] = useState(TEMPLATES[0]);
  const [productInfo, setProductInfo] = useState<ProductInfo>({
    productName: '', productModel: '', productCategory: '에어컨',
    brand: '', keySpecs: '', targetUser: '', uniquePoints: '', priceRange: '',
  });
  const [sections, setSections] = useState<Sections>({});
  const [sectionImages, setSectionImages] = useState<Record<string, string>>({});
  const [imageAssets, setImageAssets] = useState<ImageAsset[]>([]);

  // Figma
  const [figmaConnected, setFigmaConnected] = useState(false);
  const [figmaUser, setFigmaUser] = useState('');
  const [figmaToken, setFigmaToken] = useState('');
  const [figmaFileKey, setFigmaFileKey] = useState('');
  const [figmaFileName, setFigmaFileName] = useState('');
  const [figmaFrames, setFigmaFrames] = useState<FigmaFrame[]>([]);
  const [figmaLoading, setFigmaLoading] = useState(false);
  const [recentFigmaKeys, setRecentFigmaKeys] = useState<{key:string;name:string}[]>([]);

  // Figma 확장 상태
  type FigmaColorToken = { name: string; hex: string; alpha: number; nodeId: string };
  type FigmaTypography = { name: string; fontFamily: string; fontSize: number; fontWeight: number; nodeId: string };
  type FigmaComponent = { key: string; name: string; description: string; nodeId: string; group: string; thumbnail: string | null };
  type FigmaVersion = { id: string; createdAt: string; label: string | null; description: string | null; user: string };
  const [figmaTab, setFigmaTab] = useState<'frames'|'components'|'colors'|'typography'|'versions'>('frames');
  const [figmaColors, setFigmaColors] = useState<FigmaColorToken[]>([]);
  const [figmaTypography, setFigmaTypography] = useState<FigmaTypography[]>([]);
  const [figmaComponents, setFigmaComponents] = useState<FigmaComponent[]>([]);
  const [figmaVersions, setFigmaVersions] = useState<FigmaVersion[]>([]);
  const [figmaLoadingTab, setFigmaLoadingTab] = useState(false);

  // History
  const historyRef = useRef<Sections[]>([{}]);
  const historyIdxRef = useRef(0);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [historyLen, setHistoryLen] = useState(1);

  // UI
  const [rightTab, setRightTab] = useState<'props' | 'images' | 'figma'>('figma');
  const [leftTab, setLeftTab] = useState<'sections' | 'layers'>('sections');
  const [devicePreview, setDevicePreview] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [zoom, setZoom] = useState(100);
  const [generating, setGenerating] = useState(false);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [provider, setProvider] = useState('gemini');
  const [apiKey, setApiKey] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [showProjects, setShowProjects] = useState(false);

  // Section Presets
  type SectionPreset = { id: string; name: string; sectionKey: string; data: Record<string, unknown>; savedAt: string };
  const [sectionPresets, setSectionPresets] = useState<SectionPreset[]>(() => {
    try { return JSON.parse(localStorage.getItem('loov-section-presets') ?? '[]'); } catch { return []; }
  });
  const [showPresets, setShowPresets] = useState(false);

  // Typography / element style
  const [selectedElStyle] = useState<{
    fontSize: number; fontWeight: number; textAlign: 'left'|'center'|'right'; color: string;
  } | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg); setTimeout(() => setToast(''), 3000);
  }, []);

  // ── History ──
  const pushHistory = useCallback((newSections: Sections) => {
    const hist = historyRef.current;
    const idx = historyIdxRef.current;
    const trimmed = hist.slice(0, idx + 1);
    trimmed.push(JSON.parse(JSON.stringify(newSections)));
    if (trimmed.length > 50) trimmed.shift();
    historyRef.current = trimmed;
    historyIdxRef.current = trimmed.length - 1;
    setHistoryIdx(trimmed.length - 1);
    setHistoryLen(trimmed.length);
  }, []);

  const undo = useCallback(() => {
    const idx = historyIdxRef.current;
    if (idx > 0) {
      historyIdxRef.current = idx - 1;
      setHistoryIdx(idx - 1);
      setSections(JSON.parse(JSON.stringify(historyRef.current[idx - 1])));
    }
  }, []);

  const redo = useCallback(() => {
    const idx = historyIdxRef.current;
    const hist = historyRef.current;
    if (idx < hist.length - 1) {
      historyIdxRef.current = idx + 1;
      setHistoryIdx(idx + 1);
      setSections(JSON.parse(JSON.stringify(hist[idx + 1])));
    }
  }, []);

  // ── Update section ──
  const updateSection = useCallback((sectionKey: string, data: Record<string, unknown>) => {
    setSections(prev => {
      const next = { ...prev, [sectionKey]: data };
      pushHistory(next);
      return next;
    });
  }, [pushHistory]);

  // ── Figma ──
  const loadFigmaThumbnails = useCallback(async (fileKey: string, frameIds: string[]) => {
    const batches: string[][] = [];
    for (let i = 0; i < frameIds.length; i += 5) batches.push(frameIds.slice(i, i + 5));
    for (const batch of batches) {
      const ids = batch.join(',');
      try {
        const res = await fetch(`/api/figma/files?action=export&fileKey=${fileKey}&frameIds=${encodeURIComponent(ids)}`);
        const d = await res.json();
        if (d.images) {
          setFigmaFrames(prev => prev.map(f =>
            d.images[f.id] ? { ...f, imgUrl: d.images[f.id], loading: false } : { ...f, loading: false }
          ));
        }
      } catch { /* ignore */ }
    }
  }, []);

  const loadFigmaFile = useCallback(async (fileKey?: string) => {
    const rawKey = fileKey ?? figmaFileKey.trim();
    if (!rawKey) return;
    const parsed = rawKey.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/)?.[1] ?? rawKey;
    setFigmaLoading(true);
    try {
      const res = await fetch(`/api/figma/files?action=file&fileKey=${parsed}`);
      const d = await res.json();
      if (d.frames) {
        setFigmaFrames(d.frames.map((f: {id:string;name:string}) => ({ ...f, loading: true })));
        setFigmaFileName(d.name ?? parsed);
        setFigmaFileKey(parsed);
        setRecentFigmaKeys(prev => {
          const filtered = prev.filter(r => r.key !== parsed);
          return [{ key: parsed, name: d.name ?? parsed }, ...filtered].slice(0, 5);
        });
        loadFigmaThumbnails(parsed, d.frames.map((f: {id:string}) => f.id));
      } else {
        showToast(d.error ?? '파일 로드 실패');
      }
    } finally {
      setFigmaLoading(false);
    }
  }, [figmaFileKey, loadFigmaThumbnails, showToast]);

  const importFigmaFrame = useCallback((frame: FigmaFrame) => {
    if (!frame.imgUrl) return;
    const asset: ImageAsset = { id: `figma-${frame.id}`, name: frame.name, url: frame.imgUrl, source: 'figma' };
    setImageAssets(prev => [...prev.filter(a => a.id !== asset.id), asset]);
    showToast(`"${frame.name}" 가져오기 완료`);
  }, [showToast]);

  // ── Figma 스타일 (색상 + 타이포) ──────────────────────────
  const loadFigmaStyles = useCallback(async () => {
    if (!figmaFileKey) return;
    setFigmaLoadingTab(true);
    try {
      const res = await fetch(`/api/figma/files?action=styles&fileKey=${figmaFileKey}`);
      const d = await res.json();
      if (d.colorPalette) {
        setFigmaColors(d.colorPalette);
        setFigmaTypography(d.typography ?? []);
        showToast(`색상 ${d.colorPalette.length}개, 타이포 ${d.typography?.length ?? 0}개 로드 완료`);
      } else showToast(d.error ?? '스타일 로드 실패');
    } finally { setFigmaLoadingTab(false); }
  }, [figmaFileKey, showToast]);

  // ── Figma 컴포넌트 ─────────────────────────────────────────
  const loadFigmaComponents = useCallback(async () => {
    if (!figmaFileKey) return;
    setFigmaLoadingTab(true);
    try {
      const res = await fetch(`/api/figma/files?action=components&fileKey=${figmaFileKey}`);
      const d = await res.json();
      if (d.components) {
        setFigmaComponents(d.components);
        showToast(`컴포넌트 ${d.components.length}개 로드 완료 (전체 ${d.total}개)`);
      } else showToast(d.error ?? '컴포넌트 로드 실패');
    } finally { setFigmaLoadingTab(false); }
  }, [figmaFileKey, showToast]);

  // ── Figma 버전 히스토리 ────────────────────────────────────
  const loadFigmaVersions = useCallback(async () => {
    if (!figmaFileKey) return;
    setFigmaLoadingTab(true);
    try {
      const res = await fetch(`/api/figma/files?action=versions&fileKey=${figmaFileKey}`);
      const d = await res.json();
      if (d.versions) {
        setFigmaVersions(d.versions);
        showToast(`버전 ${d.versions.length}개 로드 완료`);
      } else showToast(d.error ?? '버전 로드 실패');
    } finally { setFigmaLoadingTab(false); }
  }, [figmaFileKey, showToast]);

  // ── Figma 색상으로 커스텀 템플릿 생성 ────────────────────
  const applyFigmaColorToTemplate = useCallback((colors: {name:string;hex:string}[]) => {
    if (colors.length < 1) return;
    const sorted = [...colors];
    const bg = sorted.find(c => ['background','bg','surface','base'].some(k => c.name.toLowerCase().includes(k)))?.hex ?? sorted[0].hex;
    const accent = sorted.find(c => ['primary','brand','accent','cta','button'].some(k => c.name.toLowerCase().includes(k)))?.hex ?? sorted[1]?.hex ?? '#6366f1';
    const isDark = (hex: string) => {
      const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
      return (r*299 + g*587 + b*114) / 1000 < 128;
    };
    const customTpl = {
      id: 'figma-custom', name: 'Figma Custom', bg, primary: isDark(bg) ? '#FFFFFF' : '#1A1A1A', accent,
      desc: 'Figma에서 가져온 색상 팔레트',
    };
    setSelectedTpl(customTpl);
    showToast('Figma 색상으로 테마 적용 완료!');
  }, [showToast]);

  const addImageToSection = useCallback((url: string, name: string) => {
    setSectionImages(prev => ({ ...prev, [selectedSection]: url }));
    if (url) {
      const asset: ImageAsset = { id: `upload-${Date.now()}`, name: name || '업로드 이미지', url, source: 'upload' };
      setImageAssets(prev => [...prev, asset]);
    }
    showToast(url ? '이미지 설정 완료' : '이미지 제거');
  }, [selectedSection, showToast]);

  const connectFigma = useCallback(async () => {
    if (!figmaToken.trim()) return;
    const res = await fetch('/api/figma/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: figmaToken }),
    });
    const d = await res.json();
    if (d.connected) { setFigmaConnected(true); setFigmaUser(d.handle); showToast('Figma 연동 완료!'); }
    else showToast(d.error ?? '연동 실패');
  }, [figmaToken, showToast]);

  const saveProject = useCallback(async () => {
    if (!productInfo.productName.trim()) { showToast('제품명을 입력하세요'); return; }
    if (projectId) {
      await fetch('/api/product-detail/projects', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, product_name: productInfo.productName, product_category: productInfo.productCategory, brand: productInfo.brand, template_id: selectedTpl.id, sections, product_info: productInfo }),
      });
      showToast('저장 완료');
    } else {
      const res = await fetch('/api/product-detail/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${productInfo.brand} ${productInfo.productName}`.trim() || '새 프로젝트', product_name: productInfo.productName, product_category: productInfo.productCategory, brand: productInfo.brand, template_id: selectedTpl.id }),
      });
      const d = await res.json();
      if (d.project) { setProjectId(d.project.id); showToast('프로젝트 저장 완료'); }
    }
  }, [productInfo, projectId, selectedTpl, sections, showToast]);

  const generateAll = useCallback(async () => {
    if (!productInfo.productName.trim()) { showToast('제품명을 먼저 입력하세요'); return; }
    setGenerating(true); setGeneratingKey('all');
    try {
      const res = await fetch('/api/product-detail/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, productInfo, provider, apiKey }),
      });
      const d = await res.json();
      if (d.sections) {
        setSections(d.sections);
        pushHistory(d.sections);
        setAppMode('editor');
        showToast('12개 섹션 생성 완료!');
      } else showToast(d.error ?? '생성 실패');
    } finally { setGenerating(false); setGeneratingKey(null); }
  }, [productInfo, projectId, provider, apiKey, pushHistory, showToast]);

  const regenerateSection = useCallback(async (key: string) => {
    setGeneratingKey(key);
    try {
      const res = await fetch('/api/product-detail/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, sectionKey: key, productInfo, provider, apiKey }),
      });
      const d = await res.json();
      if (d.sections) {
        setSections(prev => { const next = { ...prev, ...d.sections }; pushHistory(next); return next; });
        showToast(`${SECTION_META.find(m => m.key === key)?.label} 재생성 완료`);
      }
    } finally { setGeneratingKey(null); }
  }, [projectId, productInfo, provider, apiKey, pushHistory, showToast]);

  const exportHTML = useCallback(() => {
    const t = selectedTpl;
    const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${productInfo.productName} 상세페이지</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:${t.bg};color:${t.primary}}:root{--primary:${t.primary};--accent:${t.accent};--bg:${t.bg}}</style></head><body>
${SECTION_META.map(m => {
  const d = sections[m.key];
  if (!d) return '';
  return `<section id="${m.key}" style="padding:80px 5%;max-width:1200px;margin:0 auto"><h2 style="margin-bottom:24px">${m.label}</h2><pre style="font-size:12px;opacity:0.7;white-space:pre-wrap">${JSON.stringify(d, null, 2)}</pre></section>`;
}).join('\n')}
</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${productInfo.productName || 'product'}-detail.html`; a.click();
    URL.revokeObjectURL(url);
    showToast('HTML 내보내기 완료');
  }, [selectedTpl, productInfo, sections, showToast]);

  const exportSectionPNG = useCallback(async (sectionKey?: string) => {
    const html2canvas = (await import('html2canvas')).default;
    const key = sectionKey ?? selectedSection;
    const el = document.getElementById(`section-preview-${key}`);
    if (!el) { showToast('섹션을 찾을 수 없습니다'); return; }
    showToast('이미지 생성 중...');
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false });
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${productInfo.productName || 'product'}-${key}.png`;
    a.click();
    showToast('PNG 다운로드 완료');
  }, [selectedSection, productInfo.productName, showToast]);

  const exportAllSectionsPNG = useCallback(async () => {
    const html2canvas = (await import('html2canvas')).default;
    showToast('전체 섹션 이미지 합성 중...');
    const canvases: HTMLCanvasElement[] = [];
    for (const meta of SECTION_META) {
      if (!sections[meta.key] || Object.keys(sections[meta.key]).length === 0) continue;
      const el = document.getElementById(`section-preview-${meta.key}`);
      if (!el) continue;
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false });
      canvases.push(canvas);
    }
    if (canvases.length === 0) { showToast('생성된 섹션이 없습니다'); return; }
    const totalHeight = canvases.reduce((sum, c) => sum + c.height, 0);
    const maxWidth = Math.max(...canvases.map(c => c.width));
    const merged = document.createElement('canvas');
    merged.width = maxWidth;
    merged.height = totalHeight;
    const ctx = merged.getContext('2d')!;
    let y = 0;
    for (const c of canvases) {
      ctx.drawImage(c, 0, y);
      y += c.height;
    }
    const a = document.createElement('a');
    a.href = merged.toDataURL('image/png');
    a.download = `${productInfo.productName || 'product'}-full-page.png`;
    a.click();
    showToast('전체 페이지 PNG 다운로드 완료!');
  }, [sections, productInfo.productName, showToast]);

  const exportAllSectionsIndividual = useCallback(async () => {
    const html2canvas = (await import('html2canvas')).default;
    showToast('개별 PNG 생성 중...');
    let count = 0;
    for (const meta of SECTION_META) {
      if (!sections[meta.key] || Object.keys(sections[meta.key]).length === 0) continue;
      const el = document.getElementById(`section-preview-${meta.key}`);
      if (!el) continue;
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${productInfo.productName || 'product'}-${String(count + 1).padStart(2, '0')}-${meta.key}.png`;
      a.click();
      count++;
      await new Promise(r => setTimeout(r, 300)); // small delay between downloads
    }
    showToast(`${count}개 섹션 PNG 다운로드 완료!`);
  }, [sections, productInfo.productName, showToast]);

  const saveSectionPreset = useCallback(() => {
    const data = sections[selectedSection];
    if (!data || Object.keys(data).length === 0) { showToast('저장할 섹션 데이터가 없습니다'); return; }
    const name = prompt(`"${SECTION_META.find(m=>m.key===selectedSection)?.label}" 프리셋 이름:`, `${productInfo.brand} ${productInfo.productName}`);
    if (!name) return;
    type SectionPreset = { id: string; name: string; sectionKey: string; data: Record<string, unknown>; savedAt: string };
    const preset: SectionPreset = {
      id: `preset-${Date.now()}`,
      name,
      sectionKey: selectedSection,
      data: JSON.parse(JSON.stringify(data)),
      savedAt: new Date().toISOString(),
    };
    setSectionPresets(prev => {
      const next = [preset, ...prev].slice(0, 50);
      localStorage.setItem('loov-section-presets', JSON.stringify(next));
      return next;
    });
    showToast(`"${name}" 프리셋 저장 완료`);
  }, [selectedSection, sections, productInfo, showToast]);

  const loadSectionPreset = useCallback((preset: { id: string; name: string; sectionKey: string; data: Record<string, unknown>; savedAt: string }) => {
    updateSection(preset.sectionKey, preset.data);
    setSelectedSection(preset.sectionKey);
    setShowPresets(false);
    showToast(`"${preset.name}" 불러오기 완료`);
  }, [updateSection, showToast]);

  const deleteSectionPreset = useCallback((id: string) => {
    setSectionPresets(prev => {
      const next = prev.filter(p => p.id !== id);
      localStorage.setItem('loov-section-presets', JSON.stringify(next));
      return next;
    });
  }, []);

  const loadProject = useCallback((proj: Project) => {
    setProductInfo(prev => ({ ...prev, productName: proj.product_name, productCategory: proj.product_category, brand: proj.brand }));
    setSelectedTpl(TEMPLATES.find(t => t.id === proj.template_id) ?? TEMPLATES[0]);
    setProjectId(proj.id); setShowProjects(false);
    fetch(`/api/product-detail/projects?id=${proj.id}`).then(r => r.json()).then(d => {
      if (d.project?.sections) { setSections(d.project.sections); setAppMode('editor'); }
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') { e.preventDefault(); redo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveProject(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, saveProject]);

  useEffect(() => {
    fetch('/api/figma/connect').then(r => r.json()).then(d => {
      if (d.connected) { setFigmaConnected(true); setFigmaUser(d.figma_name ?? ''); }
    }).catch(() => {});
    fetch('/api/product-detail/projects').then(r => r.json()).then(d => setProjects(d.projects ?? [])).catch(() => {});
  }, []);

  // Load Pretendard font
  useEffect(() => {
    if (document.getElementById('pretendard-font')) return;
    const link = document.createElement('link');
    link.id = 'pretendard-font';
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css';
    document.head.appendChild(link);
  }, []);

  // ── SETUP MODE ─────────────────────────────────────────────
  if (appMode === 'setup') {
    return (
      <div className="min-h-screen bg-[#1a1a1a] text-white flex flex-col">
        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm shadow-xl">{toast}</div>
        )}

        {/* Header */}
        <div className="h-12 bg-[#2a2a2a] border-b border-[#333] flex items-center px-6 gap-3 flex-shrink-0">
          <div className="w-6 h-6 bg-indigo-500 rounded flex items-center justify-center text-[11px] font-black">L</div>
          <span className="text-sm font-semibold text-gray-200">상품 빌더</span>
          <div className="flex-1" />
          <button onClick={() => setShowProjects(true)} className="text-[11px] text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10">
            📂 프로젝트 ({projects.length})
          </button>
        </div>

        {/* Steps */}
        <div className="flex items-center justify-center gap-2 py-8">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${setupStep === 1 ? 'bg-indigo-600 text-white' : 'bg-white/10 text-gray-400'}`}>
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">1</span>
            템플릿 선택
          </div>
          <div className="w-8 h-px bg-[#444]" />
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${setupStep === 2 ? 'bg-indigo-600 text-white' : 'bg-white/10 text-gray-400'}`}>
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">2</span>
            제품 정보 & AI 생성
          </div>
        </div>

        {/* Step 1: Template selection */}
        {setupStep === 1 && (
          <div className="flex-1 overflow-y-auto px-8 pb-8">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-black mb-2">20개 템플릿 중 하나를 선택하세요</h2>
                <p className="text-gray-500 text-sm">가전제품 카테고리에 맞는 색상 테마를 선택하면 AI가 해당 스타일로 생성합니다</p>
              </div>
              <div className="grid grid-cols-4 xl:grid-cols-5 gap-3">
                {TEMPLATES.map(t => (
                  <div key={t.id} onClick={() => setSelectedTpl(t)}
                    className={`cursor-pointer rounded-2xl overflow-hidden border-2 transition-all hover:scale-[1.02] ${selectedTpl.id === t.id ? 'border-indigo-400 shadow-lg shadow-indigo-500/20' : 'border-[#333] hover:border-[#555]'}`}>
                    <div className="h-24 relative" style={{ background: t.bg }}>
                      <div className="absolute inset-0 flex flex-col justify-end p-3 gap-1.5">
                        <div className="h-2 rounded-full w-3/4" style={{ background: t.primary, opacity: 0.8 }} />
                        <div className="h-1.5 rounded-full w-1/2" style={{ background: t.primary, opacity: 0.4 }} />
                        <div className="h-5 rounded-lg w-20 mt-1" style={{ background: t.accent }} />
                      </div>
                      {selectedTpl.id === t.id && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-[10px]">✓</span>
                        </div>
                      )}
                    </div>
                    <div className="bg-[#2a2a2a] p-2.5">
                      <div className="text-[11px] font-bold text-gray-200">{t.name}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">{t.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-center">
                <button onClick={() => setSetupStep(2)}
                  className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-colors">
                  다음: 제품 정보 입력 →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Product info */}
        {setupStep === 2 && (
          <div className="flex-1 overflow-y-auto px-8 pb-8">
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-black mb-2">제품 정보 입력</h2>
                <p className="text-gray-500 text-sm">입력할수록 AI가 더 정확하게 상세페이지를 생성합니다</p>
              </div>

              <div className="bg-[#222] rounded-2xl border border-[#333] p-6 mb-4">
                <h3 className="text-sm font-bold text-gray-300 mb-4">기본 정보</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key:'productName', label:'제품명 *', ph:'예: 그랜드 워시 18kg 드럼세탁기' },
                    { key:'productModel', label:'모델번호', ph:'예: GW-D18X2' },
                    { key:'brand', label:'브랜드', ph:'예: 삼성전자' },
                    { key:'priceRange', label:'판매가격', ph:'예: 1,299,000원' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">{f.label}</label>
                      <input
                        className="w-full bg-black/40 border border-[#444] rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                        placeholder={f.ph}
                        value={productInfo[f.key as keyof ProductInfo]}
                        onChange={e => setProductInfo(prev => ({ ...prev, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">카테고리</label>
                    <select
                      className="w-full bg-black/40 border border-[#444] rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
                      value={productInfo.productCategory}
                      onChange={e => setProductInfo(prev => ({ ...prev, productCategory: e.target.value }))}>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-[#222] rounded-2xl border border-[#333] p-6 mb-4">
                <h3 className="text-sm font-bold text-gray-300 mb-4">AI 콘텐츠 정보 (선택)</h3>
                <div className="space-y-3">
                  {[
                    { key:'keySpecs', label:'주요 사양', ph:'예: 용량 18kg, 인버터 모터, 버블워시, 스팀세탁, Wi-Fi', rows:2 },
                    { key:'targetUser', label:'타겟 고객', ph:'예: 4인 이상 대가족, 맞벌이 부부', rows:1 },
                    { key:'uniquePoints', label:'차별화 포인트', ph:'예: 동급 대비 용량 20% 증가, AI 자동 세제 투입', rows:2 },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">{f.label}</label>
                      <textarea rows={f.rows}
                        className="w-full bg-black/40 border border-[#444] rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
                        placeholder={f.ph}
                        value={productInfo[f.key as keyof ProductInfo]}
                        onChange={e => setProductInfo(prev => ({ ...prev, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#222] rounded-2xl border border-[#333] p-6 mb-6">
                <h3 className="text-sm font-bold text-gray-300 mb-4">AI 설정</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">AI 모델</label>
                    <select className="w-full bg-black/40 border border-[#444] rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
                      value={provider} onChange={e => setProvider(e.target.value)}>
                      <option value="gemini">Gemini (Google)</option>
                      <option value="claude">Claude (Anthropic)</option>
                      <option value="gpt4o">GPT-4o (OpenAI)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">API 키 (선택)</label>
                    <input type="password"
                      className="w-full bg-black/40 border border-[#444] rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                      placeholder="비워두면 저장된 키 사용"
                      value={apiKey} onChange={e => setApiKey(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Figma 연동 */}
              <div className="bg-[#222] rounded-2xl border border-[#333] p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-300">🎨 Figma 연동 <span className="text-gray-600 font-normal">(선택사항)</span></h3>
                  {figmaConnected && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                      <span className="text-xs text-green-400 font-semibold">{figmaUser} 연결됨</span>
                      <button onClick={() => { setFigmaConnected(false); setFigmaUser(''); }} className="text-[10px] text-gray-600 hover:text-red-400 ml-2">해제</button>
                    </div>
                  )}
                </div>
                {!figmaConnected ? (
                  <div className="flex gap-2">
                    <input type="password"
                      className="flex-1 bg-black/40 border border-[#444] rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500"
                      placeholder="Figma Personal Access Token"
                      value={figmaToken} onChange={e => setFigmaToken(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && connectFigma()}
                    />
                    <button onClick={connectFigma}
                      className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-xl font-semibold whitespace-nowrap transition-colors">
                      연결
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      className="flex-1 bg-black/40 border border-[#444] rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500"
                      placeholder="Figma 파일 URL 또는 키 (선택)"
                      value={figmaFileKey} onChange={e => setFigmaFileKey(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && loadFigmaFile()}
                    />
                    <button onClick={() => loadFigmaFile()} disabled={figmaLoading}
                      className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm rounded-xl font-semibold whitespace-nowrap transition-colors">
                      {figmaLoading ? '...' : '파일 로드'}
                    </button>
                  </div>
                )}
                <p className="text-[11px] text-gray-600 mt-2">Figma Settings → Account → Personal Access Tokens에서 토큰 발급</p>
              </div>

              <div className="flex items-center justify-between">
                <button onClick={() => setSetupStep(1)} className="px-5 py-3 border border-[#444] text-gray-400 hover:text-white rounded-xl text-sm hover:bg-white/5 transition-colors">
                  ← 템플릿 다시 선택
                </button>
                <button onClick={generateAll} disabled={generating || !productInfo.productName.trim()}
                  className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm flex items-center gap-2 transition-colors">
                  {generating
                    ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />AI 생성 중...</>
                    : '✨ AI 생성 시작 →'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Projects modal */}
        {showProjects && (
          <div className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-6">
            <div className="bg-[#222] border border-[#333] rounded-2xl w-full max-w-2xl max-h-[70vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#333]">
                <h2 className="font-black text-white">저장된 프로젝트</h2>
                <button onClick={() => setShowProjects(false)} className="text-gray-500 hover:text-white text-xl">✕</button>
              </div>
              <div className="overflow-y-auto flex-1 p-4 space-y-2">
                {projects.length === 0 && <p className="text-center text-gray-600 py-8 text-sm">저장된 프로젝트가 없습니다</p>}
                {projects.map(p => (
                  <div key={p.id} className="flex items-center gap-4 p-4 bg-black/20 hover:bg-white/5 rounded-xl cursor-pointer transition-colors" onClick={() => loadProject(p)}>
                    <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ background: TEMPLATES.find(t => t.id === p.template_id)?.accent ?? '#6366f1' }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-white truncate">{p.product_name || p.name}</div>
                      <div className="text-xs text-gray-500">{p.product_category} · {p.brand} · {new Date(p.created_at).toLocaleDateString('ko-KR')}</div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${p.status === 'done' ? 'bg-green-900/50 text-green-400' : 'bg-white/5 text-gray-500'}`}>{p.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── EDITOR MODE ─────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-[#1a1a1a] text-white overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm shadow-xl animate-pulse">{toast}</div>
      )}

      {/* Top Toolbar */}
      <div className="h-10 bg-[#2a2a2a] border-b border-[#333] flex items-center px-3 gap-1 flex-shrink-0">
        <div className="flex items-center gap-2 mr-3">
          <div className="w-5 h-5 bg-indigo-500 rounded flex items-center justify-center text-[10px] font-black">L</div>
          <span className="text-xs font-semibold text-gray-300">상품 빌더</span>
        </div>
        <button onClick={() => setAppMode('setup')} className="text-[11px] text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-white/10">← 설정</button>
        <button onClick={() => setShowProjects(true)} className="text-[11px] text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-white/10">프로젝트</button>
        <button onClick={saveProject} className="text-[11px] text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-white/10">저장 ⌘S</button>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <button onClick={undo} disabled={historyIdx <= 0} className="text-[11px] text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-white/10 disabled:opacity-30">↩</button>
        <button onClick={redo} disabled={historyIdx >= historyLen - 1} className="text-[11px] text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-white/10 disabled:opacity-30">↪</button>
        <div className="flex-1" />
        {/* Template mini-switcher */}
        <div className="flex items-center gap-1.5 mr-3">
          <span className="text-[10px] text-gray-500">테마</span>
          <div className="flex gap-0.5">
            {TEMPLATES.slice(0, 10).map(t => (
              <button key={t.id} title={t.name} onClick={() => setSelectedTpl(t)}
                className={`w-4 h-4 rounded-full border transition-all ${selectedTpl.id === t.id ? 'scale-125 border-blue-400' : 'border-transparent'}`}
                style={{ background: t.accent }} />
            ))}
          </div>
        </div>
        {/* Device */}
        <div className="flex items-center bg-black/30 rounded-lg p-0.5 mr-3">
          {[{d:'mobile',i:'📱'},{d:'tablet',i:'⊞'},{d:'desktop',i:'🖥'}].map(({d, i}) => (
            <button key={d} onClick={() => setDevicePreview(d as 'mobile'|'tablet'|'desktop')}
              className={`text-[11px] px-2 py-0.5 rounded-md transition-all ${devicePreview === d ? 'bg-white/15 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
              {i}
            </button>
          ))}
        </div>
        <button onClick={generateAll} disabled={generating}
          className="text-[11px] px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold disabled:opacity-50 flex items-center gap-1">
          {generating ? <><span className="w-2.5 h-2.5 border border-white/30 border-t-white rounded-full animate-spin" />생성 중</> : '✨ AI 재생성'}
        </button>
        <button onClick={exportHTML} className="text-[11px] px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg ml-1">⬇ 내보내기</button>
        <button onClick={() => exportSectionPNG()} className="text-[11px] px-2.5 py-1.5 bg-white/10 hover:bg-white/15 rounded-lg text-gray-300 ml-1">📸 섹션 PNG</button>
        <button onClick={exportAllSectionsPNG} className="text-[11px] px-2.5 py-1.5 bg-white/10 hover:bg-white/15 rounded-lg text-gray-300 ml-1">🖼 전체 PNG</button>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left Panel */}
        <div className="w-60 flex-shrink-0 bg-[#222] border-r border-[#333] flex flex-col">
          <div className="flex border-b border-[#333] flex-shrink-0">
            {[{id:'sections',l:'섹션'},{id:'layers',l:'레이어'}].map(t => (
              <button key={t.id} onClick={() => setLeftTab(t.id as 'sections'|'layers')}
                className={`flex-1 text-[11px] py-2 font-medium transition-colors ${leftTab === t.id ? 'text-white border-b border-indigo-500' : 'text-gray-500 hover:text-gray-300'}`}>
                {t.l}
              </button>
            ))}
          </div>

          {leftTab === 'sections' && (
            <div className="flex-1 overflow-y-auto py-2">
              {SECTION_META.map(m => {
                const hasData = !!(sections[m.key] && Object.keys(sections[m.key]).length > 0);
                const isActive = selectedSection === m.key;
                return (
                  <div key={m.key} onClick={() => setSelectedSection(m.key)}
                    className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-all ${isActive ? 'bg-indigo-600/20 border-l-2 border-indigo-500' : 'border-l-2 border-transparent hover:bg-white/5'}`}>
                    <span className="text-sm flex-shrink-0">{m.icon}</span>
                    <span className={`text-[12px] font-medium flex-1 ${isActive ? 'text-white' : 'text-gray-400'}`}>{m.label}</span>
                    {sectionImages[m.key] && <span className="text-[9px] text-indigo-400">🖼</span>}
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasData ? 'bg-green-400' : 'bg-gray-600'}`} />
                    {hasData && <button onClick={e => { e.stopPropagation(); exportSectionPNG(m.key); }}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-500 hover:text-green-400 transition-all" title="PNG 다운로드">📸</button>}
                    <button onClick={e => { e.stopPropagation(); regenerateSection(m.key); }}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-500 hover:text-indigo-400 transition-all" title="재생성">↺</button>
                  </div>
                );
              })}
              <div className="px-3 pt-4 mt-2 border-t border-[#333] space-y-2">
                <button onClick={generateAll} disabled={generating}
                  className="w-full text-[11px] py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold disabled:opacity-50 text-white">
                  {generating ? '🔄 생성 중...' : '🚀 전체 AI 생성'}
                </button>
                <button onClick={exportHTML} className="w-full text-[11px] py-2 bg-white/10 hover:bg-white/15 rounded-lg text-gray-300">
                  ⬇ HTML 내보내기
                </button>
                <button onClick={() => setShowPresets(true)} className="w-full text-[11px] py-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400">
                  💾 섹션 프리셋
                </button>
                <button onClick={saveSectionPreset} className="w-full text-[11px] py-2 bg-indigo-600/30 hover:bg-indigo-600/50 rounded-lg text-indigo-300">
                  + 현재 섹션 저장
                </button>
              </div>
            </div>
          )}

          {leftTab === 'layers' && sections[selectedSection] && (
            <div className="flex-1 overflow-y-auto py-2">
              <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-widest">
                {SECTION_META.find(m => m.key === selectedSection)?.label} 레이어
              </div>
              {renderLayers(selectedSection, sections[selectedSection])}
            </div>
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1 bg-[#141414] overflow-auto flex flex-col">
          <div className="h-6 bg-[#1e1e1e] border-b border-[#333] flex items-center px-4 gap-4 flex-shrink-0">
            <span className="text-[10px] text-gray-600">
              {productInfo.brand} {productInfo.productName} — {SECTION_META.find(m => m.key === selectedSection)?.label}
            </span>
            <div className="flex-1" />
            <span className="text-[10px] text-gray-600">{devicePreview} · {zoom}%</span>
          </div>

          <div className="flex-1 flex items-start justify-center p-8 overflow-auto">
            <div
              className="bg-white rounded-lg overflow-hidden shadow-2xl transition-all duration-300"
              style={{
                width: devicePreview === 'mobile' ? 375 : devicePreview === 'tablet' ? 768 : '100%',
                maxWidth: devicePreview === 'desktop' ? 1200 : undefined,
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'top center',
              }}
            >
              {/* Browser chrome */}
              <div className="flex items-center gap-1.5 px-3 py-2 bg-[#f5f5f5] border-b border-gray-200">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
                <div className="flex-1 mx-2 h-5 bg-white rounded text-[9px] text-gray-400 flex items-center px-2 border border-gray-200">
                  상품 상세페이지 미리보기
                </div>
              </div>

              <div className="min-h-64">
                {sections[selectedSection] && Object.keys(sections[selectedSection]).length > 0 ? (
                  <div id={`section-preview-${selectedSection}`}>
                    <EditableSection
                      sectionKey={selectedSection}
                      data={sections[selectedSection]}
                      tpl={selectedTpl}
                      sectionImage={sectionImages[selectedSection]}
                      onUpdate={data => updateSection(selectedSection, data)}
                      onImageChange={addImageToSection}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 gap-4 bg-gray-50">
                    <div className="text-4xl opacity-20">✨</div>
                    <p className="text-gray-400 text-sm">이 섹션을 AI로 생성하세요</p>
                    <button onClick={() => regenerateSection(selectedSection)}
                      className="px-5 py-2.5 bg-indigo-600 text-white text-sm rounded-xl font-semibold hover:bg-indigo-500">
                      {generatingKey === selectedSection ? '생성 중...' : 'AI 생성'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Navigation arrows */}
          <div className="flex items-center justify-center gap-2 py-3 border-t border-[#333] flex-shrink-0">
            <button onClick={() => {
              const keys = SECTION_META.map(m => m.key);
              const idx = keys.indexOf(selectedSection);
              if (idx > 0) setSelectedSection(keys[idx - 1]);
            }} className="text-[11px] px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all">← 이전</button>
            <span className="text-[11px] text-gray-600">{SECTION_META.findIndex(m => m.key === selectedSection) + 1} / {SECTION_META.length}</span>
            <button onClick={() => {
              const keys = SECTION_META.map(m => m.key);
              const idx = keys.indexOf(selectedSection);
              if (idx < keys.length - 1) setSelectedSection(keys[idx + 1]);
            }} className="text-[11px] px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all">다음 →</button>
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-72 flex-shrink-0 bg-[#222] border-l border-[#333] flex flex-col">
          <div className="flex border-b border-[#333] flex-shrink-0">
            {[{id:'props',l:'속성'},{id:'images',l:'이미지'},{id:'figma',l:'Figma'}].map(t => (
              <button key={t.id} onClick={() => setRightTab(t.id as 'props'|'images'|'figma')}
                className={`flex-1 text-[11px] py-2 font-medium transition-colors ${rightTab === t.id ? 'text-white border-b border-indigo-500' : 'text-gray-500 hover:text-gray-300'}`}>
                {t.l}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Properties Tab */}
            {rightTab === 'props' && (
              <div className="p-4 space-y-4">
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">템플릿 테마</div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {TEMPLATES.map(t => (
                      <button key={t.id} title={`${t.name}\n${t.desc}`} onClick={() => setSelectedTpl(t)}
                        className={`relative h-8 rounded-lg overflow-hidden border-2 transition-all ${selectedTpl.id === t.id ? 'border-indigo-400 scale-105' : 'border-transparent'}`}
                        style={{ background: t.bg }}>
                        <div className="absolute bottom-1 left-1 right-1 h-1.5 rounded-sm" style={{ background: t.accent }} />
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 p-2 rounded-lg bg-black/30">
                    <div className="text-[11px] text-white font-semibold">{selectedTpl.name}</div>
                    <div className="text-[10px] text-gray-500">{selectedTpl.desc}</div>
                    <div className="flex gap-2 mt-2">
                      {[{l:'배경',c:selectedTpl.bg},{l:'텍스트',c:selectedTpl.primary},{l:'포인트',c:selectedTpl.accent}].map(item => (
                        <div key={item.l} className="flex items-center gap-1">
                          <div className="w-4 h-4 rounded border border-white/20" style={{background:item.c}} />
                          <span className="text-[9px] text-gray-500">{item.l}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">섹션 이미지</div>
                  <ImageDropZone
                    imageUrl={sectionImages[selectedSection]}
                    onImageDrop={addImageToSection}
                    className="w-full h-32"
                    label="제품/섹션 이미지 추가"
                  />
                </div>
                {/* Color controls */}
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">색상</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-[9px] text-gray-600 mb-1">배경</div>
                      <div className="relative">
                        <div className="w-full h-7 rounded-lg cursor-pointer overflow-hidden border border-[#444]"
                          style={{ background: selectedTpl.bg }}
                          onClick={() => document.getElementById('color-bg')?.click()} />
                        <input id="color-bg" type="color" className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                          value={selectedTpl.bg}
                          onChange={e => setSelectedTpl(prev => ({ ...prev, bg: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-gray-600 mb-1">텍스트</div>
                      <div className="relative">
                        <div className="w-full h-7 rounded-lg cursor-pointer overflow-hidden border border-[#444]"
                          style={{ background: selectedTpl.primary }}
                          onClick={() => document.getElementById('color-primary')?.click()} />
                        <input id="color-primary" type="color" className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                          value={selectedTpl.primary}
                          onChange={e => setSelectedTpl(prev => ({ ...prev, primary: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-gray-600 mb-1">포인트</div>
                      <div className="relative">
                        <div className="w-full h-7 rounded-lg cursor-pointer overflow-hidden border border-[#444]"
                          style={{ background: selectedTpl.accent }}
                          onClick={() => document.getElementById('color-accent')?.click()} />
                        <input id="color-accent" type="color" className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                          value={selectedTpl.accent}
                          onChange={e => setSelectedTpl(prev => ({ ...prev, accent: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                </div>
                {/* Typography controls */}
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">요소 스타일</div>
                  <div className="text-[10px] text-gray-500 mb-1">* 텍스트 더블클릭 후 조정</div>
                  <div className="space-y-2">
                    <div>
                      <div className="text-[10px] text-gray-600 mb-1">글자 크기</div>
                      <input type="range" min="10" max="96" value={selectedElStyle?.fontSize ?? 16}
                        className="w-full accent-indigo-500"
                        onChange={e => {
                          const el = document.activeElement as HTMLElement;
                          if (el?.contentEditable === 'true') {
                            el.style.fontSize = e.target.value + 'px';
                          }
                        }} />
                    </div>
                    <div className="flex gap-1">
                      {(['left','center','right'] as const).map(align => (
                        <button key={align} onClick={() => {
                          const el = document.activeElement as HTMLElement;
                          if (el?.contentEditable === 'true') el.style.textAlign = align;
                        }} className="flex-1 py-1.5 text-[10px] bg-white/5 hover:bg-white/10 rounded-lg text-gray-400">
                          {align === 'left' ? '⬅' : align === 'center' ? '⬛' : '➡'}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      {([400,600,700,900] as const).map(w => (
                        <button key={w} onClick={() => {
                          const el = document.activeElement as HTMLElement;
                          if (el?.contentEditable === 'true') el.style.fontWeight = String(w);
                        }} className="flex-1 py-1.5 text-[10px] bg-white/5 hover:bg-white/10 rounded-lg text-gray-400"
                          style={{fontWeight: w}}>
                          {w === 400 ? '보통' : w === 600 ? '중' : w === 700 ? '굵' : '흑'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Section-level color overrides */}
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">이 섹션 색상 오버라이드</div>
                  <div className="text-[9px] text-gray-600 mb-2">섹션별로 독립적인 색상 설정 (템플릿과 별도)</div>
                  {(() => {
                    const sData = sections[selectedSection] ?? {};
                    const oc = (sData._sectionColors ?? {}) as Record<string, string>;
                    const setOc = (key: string, val: string) => {
                      updateSection(selectedSection, { ...sData, _sectionColors: { ...oc, [key]: val } });
                    };
                    const resetOc = () => {
                      const next = { ...sData }; delete next._sectionColors;
                      updateSection(selectedSection, next);
                    };
                    return (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          {[{k:'bg',l:'배경'},{k:'primary',l:'텍스트'},{k:'accent',l:'포인트'}].map(({k,l}) => (
                            <div key={k}>
                              <div className="text-[9px] text-gray-600 mb-1">{l}</div>
                              <div className="relative">
                                <div className="w-full h-7 rounded-lg cursor-pointer overflow-hidden border border-[#444] flex items-center justify-center"
                                  style={{ background: oc[k] ?? (k==='bg'?selectedTpl.bg:k==='primary'?selectedTpl.primary:selectedTpl.accent) }}
                                  onClick={() => document.getElementById(`color-sec-${k}`)?.click()}>
                                  {!oc[k] && <span className="text-[8px] text-gray-500">기본</span>}
                                </div>
                                <input id={`color-sec-${k}`} type="color" className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                                  value={oc[k] ?? (k==='bg'?selectedTpl.bg:k==='primary'?selectedTpl.primary:selectedTpl.accent)}
                                  onChange={e => setOc(k, e.target.value)} />
                              </div>
                            </div>
                          ))}
                        </div>
                        {Object.keys(oc).length > 0 && (
                          <button onClick={resetOc} className="w-full text-[10px] py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg">
                            이 섹션 색상 초기화
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">내보내기</div>
                  <div className="space-y-1.5">
                    <button onClick={() => exportSectionPNG()}
                      className="w-full text-[11px] py-2 bg-white/10 hover:bg-white/15 rounded-lg text-gray-300">
                      📸 현재 섹션 PNG
                    </button>
                    <button onClick={exportAllSectionsPNG}
                      className="w-full text-[11px] py-2 bg-white/10 hover:bg-white/15 rounded-lg text-gray-300">
                      🖼 전체 페이지 (긴 이미지)
                    </button>
                    <button onClick={exportAllSectionsIndividual}
                      className="w-full text-[11px] py-2 bg-white/10 hover:bg-white/15 rounded-lg text-gray-300">
                      📦 섹션별 개별 PNG
                    </button>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">AI 재생성</div>
                  <div className="space-y-2">
                    <select value={provider} onChange={e => setProvider(e.target.value)}
                      className="w-full bg-black/30 border border-[#444] rounded-lg px-2 py-1.5 text-[11px] text-gray-300">
                      <option value="gemini">Gemini (Google)</option>
                      <option value="claude">Claude (Anthropic)</option>
                      <option value="gpt4o">GPT-4o (OpenAI)</option>
                    </select>
                    <button onClick={() => regenerateSection(selectedSection)} disabled={generatingKey === selectedSection}
                      className="w-full text-[11px] py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold disabled:opacity-50 text-white">
                      {generatingKey === selectedSection ? '↺ 재생성 중...' : `↺ "${SECTION_META.find(m=>m.key===selectedSection)?.label}" 재생성`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Images Tab */}
            {rightTab === 'images' && (
              <div className="p-4">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-3">이미지 라이브러리 ({imageAssets.length})</div>
                <ImageDropZone
                  onImageDrop={(url, name) => {
                    if (url) {
                      const asset: ImageAsset = { id: `upload-${Date.now()}`, name, url, source: 'upload' };
                      setImageAssets(prev => [...prev, asset]);
                      showToast('이미지 추가됨');
                    }
                  }}
                  className="w-full h-20 mb-4"
                  label="이미지 업로드"
                />
                <div className="flex gap-2 mb-4">
                  <input
                    className="flex-1 bg-black/30 border border-[#444] rounded-lg px-2 py-1.5 text-[11px] text-gray-300 placeholder-gray-600"
                    placeholder="이미지 URL 입력..."
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const url = (e.target as HTMLInputElement).value;
                        if (url) {
                          setImageAssets(prev => [...prev, { id: `url-${Date.now()}`, name: 'URL 이미지', url, source: 'url' }]);
                          (e.target as HTMLInputElement).value = '';
                          showToast('이미지 추가됨');
                        }
                      }
                    }}
                  />
                  <button className="text-[10px] px-2 py-1.5 bg-white/10 rounded-lg text-gray-400 hover:text-white">추가</button>
                </div>
                {imageAssets.length === 0 ? (
                  <div className="text-center py-8 text-gray-600 text-[11px]">
                    이미지를 업로드하거나<br />Figma에서 가져오세요
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {imageAssets.map(asset => (
                      <div key={asset.id} className="relative group aspect-square rounded-lg overflow-hidden bg-black/30 border border-[#333] hover:border-indigo-400 transition-all cursor-pointer"
                        onClick={() => { setSectionImages(prev => ({ ...prev, [selectedSection]: asset.url })); showToast('이미지 적용됨'); }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={asset.url} className="w-full h-full object-cover" alt={asset.name} />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                          <span className="text-white text-[9px] font-semibold">적용</span>
                          <div className={`text-[8px] px-1.5 py-0.5 rounded-full ${asset.source === 'figma' ? 'bg-purple-600/80' : 'bg-blue-600/80'} text-white`}>
                            {asset.source === 'figma' ? 'Figma' : asset.source === 'upload' ? '업로드' : 'URL'}
                          </div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); setImageAssets(prev => prev.filter(a => a.id !== asset.id)); }}
                          className="absolute top-1 right-1 w-4 h-4 bg-red-500/80 rounded-full text-[8px] text-white opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-red-500">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Figma Tab */}
            {rightTab === 'figma' && (
              <div className="flex flex-col h-full">
                {!figmaConnected ? (
                  <div className="p-4">
                    <div className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-5 mb-4 text-center">
                      <div className="text-4xl mb-3">🎨</div>
                      <div className="text-[13px] text-purple-300 font-bold mb-1">Figma 완전 연동</div>
                      <div className="text-[10px] text-gray-500 leading-relaxed">프레임·컴포넌트·색상 팔레트·<br />타이포그래피·버전 히스토리</div>
                    </div>
                    <input type="password"
                      className="w-full bg-black/30 border border-[#444] rounded-lg px-3 py-2.5 text-[11px] text-gray-300 placeholder-gray-600 mb-2"
                      placeholder="Figma Personal Access Token"
                      value={figmaToken} onChange={e => setFigmaToken(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && connectFigma()}
                    />
                    <button onClick={connectFigma} className="w-full text-[12px] py-2.5 bg-purple-600 hover:bg-purple-500 rounded-lg font-bold text-white transition-colors">
                      🔗 Figma 연결하기
                    </button>
                    <p className="text-[10px] text-gray-600 mt-3 leading-relaxed">Figma Settings → Account →<br />Personal Access Tokens에서 생성</p>
                  </div>
                ) : (
                  <div className="flex flex-col h-full">
                    {/* 연결 상태 + 파일 입력 */}
                    <div className="p-3 border-b border-[#333]">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                          <span className="text-[11px] text-green-400 font-semibold">{figmaUser}</span>
                        </div>
                        <button onClick={() => { setFigmaConnected(false); setFigmaUser(''); setFigmaFrames([]); setFigmaColors([]); setFigmaComponents([]); }} className="text-[10px] text-gray-600 hover:text-red-400">해제</button>
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          className="flex-1 bg-black/30 border border-[#444] rounded-lg px-2 py-1.5 text-[10px] text-gray-300 placeholder-gray-600 min-w-0"
                          placeholder="Figma URL / 파일 키"
                          value={figmaFileKey} onChange={e => setFigmaFileKey(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && loadFigmaFile()}
                        />
                        <button onClick={() => loadFigmaFile()} disabled={figmaLoading}
                          className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-[10px] font-bold disabled:opacity-50 text-white whitespace-nowrap flex-shrink-0">
                          {figmaLoading ? <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin inline-block" /> : '불러오기'}
                        </button>
                      </div>
                      {/* 최근 파일 */}
                      {recentFigmaKeys.length > 0 && !figmaFrames.length && (
                        <div className="mt-2 space-y-0.5">
                          {recentFigmaKeys.map(r => (
                            <button key={r.key} onClick={() => loadFigmaFile(r.key)}
                              className="w-full text-left text-[10px] text-gray-500 hover:text-white px-1.5 py-1 rounded hover:bg-white/5 flex items-center gap-1.5 truncate">
                              <span>📄</span><span className="truncate">{r.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {figmaFileName && (
                        <div className="mt-1.5 text-[10px] text-purple-400 truncate">📁 {figmaFileName}</div>
                      )}
                    </div>

                    {/* Figma 서브탭 */}
                    {figmaFileKey && (
                      <>
                        <div className="flex border-b border-[#333] flex-shrink-0 overflow-x-auto">
                          {([
                            { id:'frames', l:'프레임', count: figmaFrames.length },
                            { id:'components', l:'컴포넌트', count: figmaComponents.length },
                            { id:'colors', l:'색상', count: figmaColors.length },
                            { id:'typography', l:'타이포', count: figmaTypography.length },
                            { id:'versions', l:'버전', count: figmaVersions.length },
                          ] as const).map(t => (
                            <button key={t.id}
                              onClick={() => {
                                setFigmaTab(t.id);
                                if (t.id === 'colors' && figmaColors.length === 0) loadFigmaStyles();
                                if (t.id === 'typography' && figmaTypography.length === 0) loadFigmaStyles();
                                if (t.id === 'components' && figmaComponents.length === 0) loadFigmaComponents();
                                if (t.id === 'versions' && figmaVersions.length === 0) loadFigmaVersions();
                              }}
                              className={`flex-shrink-0 text-[10px] px-2.5 py-2 font-medium transition-colors whitespace-nowrap ${figmaTab === t.id ? 'text-purple-300 border-b border-purple-500' : 'text-gray-600 hover:text-gray-300'}`}>
                              {t.l}{t.count > 0 && <span className="ml-1 text-[9px] opacity-60">{t.count}</span>}
                            </button>
                          ))}
                        </div>

                        <div className="flex-1 overflow-y-auto">
                          {figmaLoadingTab && (
                            <div className="flex items-center justify-center py-12">
                              <div className="w-5 h-5 border border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                            </div>
                          )}

                          {/* 프레임 탭 */}
                          {figmaTab === 'frames' && !figmaLoadingTab && (
                            <div className="p-3">
                              {figmaFrames.length > 0 && (
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[10px] text-gray-600">{figmaFrames.length}개 프레임</span>
                                  <button onClick={() => { figmaFrames.filter(f => f.imgUrl).forEach(f => importFigmaFrame(f)); showToast('전체 가져오기 완료'); }}
                                    className="text-[10px] text-purple-400 hover:text-purple-300">전체 가져오기</button>
                                </div>
                              )}
                              {figmaFrames.length === 0 && (
                                <div className="text-center py-8 text-gray-600 text-[11px]">파일을 불러오면 프레임이 표시됩니다</div>
                              )}
                              <div className="grid grid-cols-2 gap-2">
                                {figmaFrames.map(frame => (
                                  <div key={frame.id} className="relative group rounded-xl overflow-hidden bg-black/30 border border-[#333] hover:border-purple-400 transition-all cursor-pointer aspect-video"
                                    onClick={() => importFigmaFrame(frame)}>
                                    {frame.loading ? (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <div className="w-3 h-3 border border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                                      </div>
                                    ) : frame.imgUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={frame.imgUrl} className="w-full h-full object-cover" alt={frame.name} />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-gray-700 text-[9px]">No preview</div>
                                    )}
                                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                      <span className="text-white text-[9px] font-bold">📥 가져오기</span>
                                    </div>
                                    <div className="absolute bottom-0 inset-x-0 bg-black/70 px-1.5 py-0.5">
                                      <div className="text-[8px] text-gray-300 truncate">{frame.name}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 컴포넌트 탭 */}
                          {figmaTab === 'components' && !figmaLoadingTab && (
                            <div className="p-3">
                              {figmaComponents.length === 0 ? (
                                <button onClick={loadFigmaComponents}
                                  className="w-full py-3 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-600/30 rounded-xl text-[11px] text-purple-300 font-semibold transition-colors">
                                  컴포넌트 불러오기
                                </button>
                              ) : (
                                <>
                                  <div className="text-[10px] text-gray-600 mb-2">{figmaComponents.length}개 컴포넌트</div>
                                  {/* 그룹별 정리 */}
                                  {Array.from(new Set(figmaComponents.map(c => c.group))).map(group => (
                                    <div key={group} className="mb-3">
                                      <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-1.5 px-1">{group}</div>
                                      <div className="grid grid-cols-2 gap-1.5">
                                        {figmaComponents.filter(c => c.group === group).map(comp => (
                                          <div key={comp.key}
                                            className="relative group rounded-lg overflow-hidden bg-black/30 border border-[#333] hover:border-purple-400 transition-all cursor-pointer"
                                            onClick={async () => {
                                              if (comp.thumbnail) {
                                                const asset: ImageAsset = { id: `comp-${comp.key}`, name: comp.name, url: comp.thumbnail, source: 'figma' };
                                                setImageAssets(prev => [...prev.filter(a => a.id !== asset.id), asset]);
                                                showToast(`"${comp.name}" 추가됨`);
                                              } else {
                                                // 노드 내보내기
                                                const res = await fetch(`/api/figma/files?action=export&fileKey=${figmaFileKey}&nodeIds=${encodeURIComponent(comp.nodeId)}&format=png&scale=1`);
                                                const d = await res.json();
                                                const url = d.images?.[comp.nodeId];
                                                if (url) {
                                                  const asset: ImageAsset = { id: `comp-${comp.key}`, name: comp.name, url, source: 'figma' };
                                                  setImageAssets(prev => [...prev.filter(a => a.id !== asset.id), asset]);
                                                  showToast(`"${comp.name}" 추가됨`);
                                                }
                                              }
                                            }}>
                                            <div className="aspect-square bg-white/5 flex items-center justify-center">
                                              {comp.thumbnail ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={comp.thumbnail} className="w-full h-full object-contain p-1" alt={comp.name} />
                                              ) : (
                                                <span className="text-2xl opacity-20">⬚</span>
                                              )}
                                            </div>
                                            <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                              <span className="text-white text-[9px] font-bold">📥 추가</span>
                                            </div>
                                            <div className="px-1.5 py-1 bg-black/40">
                                              <div className="text-[8px] text-gray-400 truncate">{comp.name.split('/').pop()}</div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </>
                              )}
                            </div>
                          )}

                          {/* 색상 탭 */}
                          {figmaTab === 'colors' && !figmaLoadingTab && (
                            <div className="p-3">
                              {figmaColors.length === 0 ? (
                                <button onClick={loadFigmaStyles}
                                  className="w-full py-3 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-600/30 rounded-xl text-[11px] text-purple-300 font-semibold transition-colors">
                                  색상 팔레트 불러오기
                                </button>
                              ) : (
                                <>
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="text-[10px] text-gray-600">{figmaColors.length}개 색상</div>
                                    <button
                                      onClick={() => applyFigmaColorToTemplate(figmaColors)}
                                      className="text-[10px] px-2.5 py-1 bg-purple-600 hover:bg-purple-500 rounded-lg text-white font-bold">
                                      ✨ 테마로 적용
                                    </button>
                                  </div>
                                  <div className="space-y-1">
                                    {figmaColors.map((c, i) => (
                                      <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/5 group cursor-pointer"
                                        onClick={() => { setSelectedTpl(prev => ({ ...prev, accent: c.hex })); showToast(`"${c.name}" → 포인트 색상 적용`); }}>
                                        <div className="w-7 h-7 rounded-lg border border-white/10 flex-shrink-0 shadow-inner"
                                          style={{ background: c.hex }} />
                                        <div className="flex-1 min-w-0">
                                          <div className="text-[10px] text-gray-300 truncate">{c.name}</div>
                                          <div className="text-[9px] text-gray-600 font-mono">{c.hex}</div>
                                        </div>
                                        <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                                          <button onClick={e => { e.stopPropagation(); setSelectedTpl(prev => ({ ...prev, bg: c.hex })); showToast('배경색 적용'); }}
                                            className="text-[8px] px-1.5 py-0.5 bg-white/10 rounded text-gray-400 hover:text-white">배경</button>
                                          <button onClick={e => { e.stopPropagation(); setSelectedTpl(prev => ({ ...prev, accent: c.hex })); showToast('포인트색 적용'); }}
                                            className="text-[8px] px-1.5 py-0.5 bg-purple-600/50 rounded text-purple-300 hover:text-white">포인트</button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          )}

                          {/* 타이포그래피 탭 */}
                          {figmaTab === 'typography' && !figmaLoadingTab && (
                            <div className="p-3">
                              {figmaTypography.length === 0 ? (
                                <button onClick={loadFigmaStyles}
                                  className="w-full py-3 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-600/30 rounded-xl text-[11px] text-purple-300 font-semibold transition-colors">
                                  타이포그래피 불러오기
                                </button>
                              ) : (
                                <div className="space-y-2">
                                  {figmaTypography.map((t, i) => (
                                    <div key={i} className="p-2.5 rounded-xl bg-black/30 border border-[#333] hover:border-purple-400/50 transition-all">
                                      <div className="text-[10px] text-gray-500 mb-1">{t.name}</div>
                                      <div className="text-gray-200 leading-tight"
                                        style={{ fontFamily: `"${t.fontFamily}", sans-serif`, fontSize: Math.min(t.fontSize, 20), fontWeight: t.fontWeight }}>
                                        {t.fontFamily}
                                      </div>
                                      <div className="flex gap-2 mt-1">
                                        <span className="text-[9px] text-gray-600">{t.fontSize}px</span>
                                        <span className="text-[9px] text-gray-600">w{t.fontWeight}</span>
                                        <span className="text-[9px] text-purple-500 font-mono">{t.fontFamily}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* 버전 히스토리 탭 */}
                          {figmaTab === 'versions' && !figmaLoadingTab && (
                            <div className="p-3">
                              {figmaVersions.length === 0 ? (
                                <button onClick={loadFigmaVersions}
                                  className="w-full py-3 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-600/30 rounded-xl text-[11px] text-purple-300 font-semibold transition-colors">
                                  버전 히스토리 불러오기
                                </button>
                              ) : (
                                <div className="space-y-2">
                                  {figmaVersions.map((v, i) => (
                                    <div key={v.id} className={`p-2.5 rounded-xl border transition-all ${i === 0 ? 'bg-purple-900/20 border-purple-700/40' : 'bg-black/20 border-[#333]'}`}>
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                          {v.label && <div className="text-[11px] text-white font-semibold mb-0.5">{v.label}</div>}
                                          {v.description && <div className="text-[10px] text-gray-400 mb-1 leading-relaxed">{v.description}</div>}
                                          <div className="text-[9px] text-gray-600">
                                            {new Date(v.createdAt).toLocaleDateString('ko-KR', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })} · {v.user}
                                          </div>
                                        </div>
                                        {i === 0 && <span className="text-[9px] bg-purple-600/50 text-purple-300 px-1.5 py-0.5 rounded-full flex-shrink-0">최신</span>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="h-6 bg-[#2a2a2a] border-t border-[#333] flex items-center px-4 gap-4 flex-shrink-0">
        <span className="text-[10px] text-gray-600">
          {productInfo.brand} {productInfo.productName} — {SECTION_META.find(m => m.key === selectedSection)?.label}
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom(z => Math.max(50, z - 10))} className="text-gray-500 hover:text-white text-[11px] w-5 h-5 flex items-center justify-center rounded hover:bg-white/10">−</button>
          <span className="text-[10px] text-gray-500 w-8 text-center">{zoom}%</span>
          <button onClick={() => setZoom(z => Math.min(150, z + 10))} className="text-gray-500 hover:text-white text-[11px] w-5 h-5 flex items-center justify-center rounded hover:bg-white/10">+</button>
          <button onClick={() => setZoom(100)} className="text-[10px] text-gray-500 hover:text-white px-1">100%</button>
        </div>
      </div>

      {/* Projects modal */}
      {showProjects && (
        <div className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-6">
          <div className="bg-[#222] border border-[#333] rounded-2xl w-full max-w-2xl max-h-[70vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#333]">
              <h2 className="font-black text-white">저장된 프로젝트</h2>
              <button onClick={() => setShowProjects(false)} className="text-gray-500 hover:text-white text-xl">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {projects.length === 0 && <p className="text-center text-gray-600 py-8 text-sm">저장된 프로젝트가 없습니다</p>}
              {projects.map(p => (
                <div key={p.id} className="flex items-center gap-4 p-4 bg-black/20 hover:bg-white/5 rounded-xl cursor-pointer transition-colors" onClick={() => loadProject(p)}>
                  <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ background: TEMPLATES.find(t => t.id === p.template_id)?.accent ?? '#6366f1' }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-white truncate">{p.product_name || p.name}</div>
                    <div className="text-xs text-gray-500">{p.product_category} · {p.brand} · {new Date(p.created_at).toLocaleDateString('ko-KR')}</div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${p.status === 'done' ? 'bg-green-900/50 text-green-400' : 'bg-white/5 text-gray-500'}`}>{p.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Section Presets modal */}
      {showPresets && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6">
          <div className="bg-[#222] border border-[#333] rounded-2xl w-full max-w-2xl max-h-[70vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#333]">
              <h2 className="font-black text-white">섹션 프리셋</h2>
              <button onClick={() => setShowPresets(false)} className="text-gray-500 hover:text-white text-xl">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {sectionPresets.length === 0 && (
                <p className="text-center text-gray-600 py-8 text-sm">저장된 프리셋이 없습니다<br /><span className="text-xs">좌측 패널에서 &quot;현재 섹션 저장&quot;을 눌러 저장하세요</span></p>
              )}
              {sectionPresets.map(p => (
                <div key={p.id} className="flex items-center gap-3 p-4 bg-black/20 hover:bg-white/5 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-white">{p.name}</div>
                    <div className="text-xs text-gray-500">
                      {SECTION_META.find(m=>m.key===p.sectionKey)?.icon} {SECTION_META.find(m=>m.key===p.sectionKey)?.label} · {new Date(p.savedAt).toLocaleDateString('ko-KR')}
                    </div>
                  </div>
                  <button onClick={() => loadSectionPreset(p)} className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg">불러오기</button>
                  <button onClick={() => deleteSectionPreset(p.id)} className="text-xs px-2 py-1.5 bg-red-900/40 hover:bg-red-900/60 text-red-400 rounded-lg">삭제</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
