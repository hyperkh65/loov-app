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
    style,
    onBlur: (e: React.FocusEvent<HTMLElement>) => onChange(e.currentTarget.textContent ?? ''),
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

// ── EditableSection component ──────────────────────────────────
function EditableSection({ sectionKey, data, tpl, sectionImage, onUpdate, onImageChange }: {
  sectionKey: string;
  data: Record<string, unknown>;
  tpl: Template;
  sectionImage?: string;
  onUpdate: (data: Record<string, unknown>) => void;
  onImageChange: (url: string, name: string) => void;
}) {
  const accent = tpl.accent;
  const s = { background: tpl.bg, color: tpl.primary };

  switch (sectionKey) {
    case 'hero': {
      const d = data as { headline?: string; subheadline?: string; tagline?: string; keyPoints?: string[] };
      const update = (field: string, val: unknown) => onUpdate({ ...d, [field]: val });
      return (
        <div className="relative rounded-2xl overflow-hidden min-h-[300px] flex" style={s}>
          <div className="flex-1 p-10 flex flex-col justify-center">
            <EditText tag="div" value={d.tagline ?? ''} onChange={v => update('tagline', v)}
              className="text-xs font-bold mb-3 opacity-60 tracking-widest uppercase" />
            <EditText tag="h2" value={d.headline ?? ''} onChange={v => update('headline', v)}
              className="text-4xl font-black mb-3 leading-tight" />
            <EditText tag="p" value={d.subheadline ?? ''} onChange={v => update('subheadline', v)}
              className="text-lg opacity-70 mb-6" />
            <div className="flex gap-3 flex-wrap items-center">
              {(d.keyPoints ?? []).map((p, i) => (
                <EditText key={i} tag="span" value={p} onChange={v => {
                  const pts = [...(d.keyPoints ?? [])]; pts[i] = v; update('keyPoints', pts);
                }} className="text-sm px-4 py-1.5 rounded-full font-semibold" style={{ background: accent, color: '#fff' }} />
              ))}
              <button onClick={() => update('keyPoints', [...(d.keyPoints ?? []), '새 포인트'])}
                className="text-sm px-3 py-1.5 rounded-full border border-dashed opacity-40 hover:opacity-80">+</button>
            </div>
          </div>
          <div className="w-64 flex-shrink-0 p-6">
            <ImageDropZone
              imageUrl={sectionImage}
              onImageDrop={onImageChange}
              className="w-full h-full min-h-[200px]"
              label="제품 이미지"
            />
          </div>
        </div>
      );
    }
    case 'features': {
      const d = data as { title?: string; items?: { icon: string; title: string; desc: string }[] };
      const update = (field: string, val: unknown) => onUpdate({ ...d, [field]: val });
      return (
        <div className="rounded-2xl overflow-hidden p-8" style={s}>
          <EditText tag="h2" value={d.title ?? ''} onChange={v => update('title', v)}
            className="text-2xl font-black mb-6" />
          <div className="grid grid-cols-3 gap-4">
            {(d.items ?? []).map((item, i) => (
              <div key={i} className="relative group p-4 rounded-xl" style={{ background: `${accent}15` }}>
                <button onClick={() => {
                  const items = [...(d.items ?? [])]; items.splice(i, 1); update('items', items);
                }} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-400 text-xs w-5 h-5 bg-red-500/20 rounded-full flex items-center justify-center hover:bg-red-500/40">✕</button>
                <EditText tag="div" value={item.icon} onChange={v => {
                  const items = [...(d.items ?? [])]; items[i] = { ...items[i], icon: v }; update('items', items);
                }} className="text-2xl mb-2" />
                <EditText tag="div" value={item.title} onChange={v => {
                  const items = [...(d.items ?? [])]; items[i] = { ...items[i], title: v }; update('items', items);
                }} className="font-bold text-sm mb-1" />
                <EditText tag="div" value={item.desc} onChange={v => {
                  const items = [...(d.items ?? [])]; items[i] = { ...items[i], desc: v }; update('items', items);
                }} className="text-xs opacity-60 leading-relaxed" />
              </div>
            ))}
            <button onClick={() => update('items', [...(d.items ?? []), { icon: '✨', title: '새 기능', desc: '기능 설명을 입력하세요' }])}
              className="flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-black/20 hover:border-black/40 opacity-40 hover:opacity-70 text-sm transition-all">
              + 기능 추가
            </button>
          </div>
        </div>
      );
    }
    case 'design': {
      const d = data as { title?: string; subtitle?: string; colorways?: { name: string; color: string; desc: string }[]; highlight?: string };
      const update = (field: string, val: unknown) => onUpdate({ ...d, [field]: val });
      return (
        <div className="rounded-2xl overflow-hidden p-8" style={s}>
          <EditText tag="h2" value={d.title ?? ''} onChange={v => update('title', v)} className="text-2xl font-black mb-2" />
          <EditText tag="p" value={d.subtitle ?? ''} onChange={v => update('subtitle', v)} className="opacity-60 mb-6" />
          <div className="flex gap-4 mb-6">
            {(d.colorways ?? []).map((c, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full border-2 border-white/20" style={{ background: c.color }} />
                <EditText tag="div" value={c.name} onChange={v => {
                  const cw = [...(d.colorways ?? [])]; cw[i] = { ...cw[i], name: v }; update('colorways', cw);
                }} className="text-xs font-semibold text-center" />
              </div>
            ))}
          </div>
          {sectionImage && (
            <div className="rounded-xl overflow-hidden mb-4 h-48">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sectionImage} className="w-full h-full object-cover" alt="" />
            </div>
          )}
          <EditText tag="p" value={d.highlight ?? ''} onChange={v => update('highlight', v)} className="text-sm opacity-70" />
        </div>
      );
    }
    case 'specs': {
      const d = data as { title?: string; groups?: { groupName: string; rows: { label: string; value: string }[] }[] };
      const update = (field: string, val: unknown) => onUpdate({ ...d, [field]: val });
      return (
        <div className="rounded-2xl overflow-hidden p-8" style={s}>
          <EditText tag="h2" value={d.title ?? ''} onChange={v => update('title', v)} className="text-2xl font-black mb-6" />
          {(d.groups ?? []).map((g, gi) => (
            <div key={gi} className="mb-4">
              <EditText tag="div" value={g.groupName} onChange={v => {
                const groups = [...(d.groups ?? [])]; groups[gi] = { ...groups[gi], groupName: v }; update('groups', groups);
              }} className="text-sm font-bold mb-2 opacity-60" />
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: `${accent}30` }}>
                {g.rows.map((row, ri) => (
                  <div key={ri} className="flex px-4 py-2.5 text-sm" style={{ background: ri % 2 === 0 ? `${accent}08` : 'transparent' }}>
                    <EditText tag="span" value={row.label} onChange={v => {
                      const groups = [...(d.groups ?? [])];
                      groups[gi] = { ...groups[gi], rows: groups[gi].rows.map((r, idx) => idx === ri ? { ...r, label: v } : r) };
                      update('groups', groups);
                    }} className="w-32 opacity-60" />
                    <EditText tag="span" value={row.value} onChange={v => {
                      const groups = [...(d.groups ?? [])];
                      groups[gi] = { ...groups[gi], rows: groups[gi].rows.map((r, idx) => idx === ri ? { ...r, value: v } : r) };
                      update('groups', groups);
                    }} className="font-semibold flex-1" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    case 'scenarios': {
      const d = data as { title?: string; items?: { icon: string; title: string; desc: string }[] };
      const update = (field: string, val: unknown) => onUpdate({ ...d, [field]: val });
      return (
        <div className="rounded-2xl overflow-hidden p-8" style={s}>
          <EditText tag="h2" value={d.title ?? ''} onChange={v => update('title', v)} className="text-2xl font-black mb-6" />
          <div className="space-y-4">
            {(d.items ?? []).map((item, i) => (
              <div key={i} className="relative group flex items-start gap-4 p-4 rounded-xl" style={{ background: `${accent}10` }}>
                <button onClick={() => {
                  const items = [...(d.items ?? [])]; items.splice(i, 1); update('items', items);
                }} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-400 text-xs w-5 h-5 bg-red-500/20 rounded-full flex items-center justify-center">✕</button>
                <EditText tag="div" value={item.icon} onChange={v => {
                  const items = [...(d.items ?? [])]; items[i] = { ...items[i], icon: v }; update('items', items);
                }} className="text-3xl flex-shrink-0" />
                <div className="flex-1">
                  <EditText tag="div" value={item.title} onChange={v => {
                    const items = [...(d.items ?? [])]; items[i] = { ...items[i], title: v }; update('items', items);
                  }} className="font-bold mb-1" />
                  <EditText tag="div" value={item.desc} onChange={v => {
                    const items = [...(d.items ?? [])]; items[i] = { ...items[i], desc: v }; update('items', items);
                  }} className="text-sm opacity-60" />
                </div>
              </div>
            ))}
            <button onClick={() => update('items', [...(d.items ?? []), { icon: '🏠', title: '새 시나리오', desc: '시나리오 설명을 입력하세요' }])}
              className="w-full p-3 rounded-xl border-2 border-dashed border-black/20 hover:border-black/40 opacity-40 hover:opacity-70 text-sm transition-all">
              + 시나리오 추가
            </button>
          </div>
        </div>
      );
    }
    case 'smart': {
      const d = data as { title?: string; subtitle?: string; features?: { icon: string; title: string; desc: string }[] };
      const update = (field: string, val: unknown) => onUpdate({ ...d, [field]: val });
      return (
        <div className="rounded-2xl overflow-hidden p-8" style={s}>
          <EditText tag="h2" value={d.title ?? ''} onChange={v => update('title', v)} className="text-2xl font-black mb-2" />
          <EditText tag="p" value={d.subtitle ?? ''} onChange={v => update('subtitle', v)} className="opacity-60 mb-6" />
          <div className="grid grid-cols-2 gap-4">
            {(d.features ?? []).map((f, i) => (
              <div key={i} className="relative group p-4 rounded-xl flex gap-3 items-start" style={{ background: `${accent}15` }}>
                <button onClick={() => {
                  const features = [...(d.features ?? [])]; features.splice(i, 1); update('features', features);
                }} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-400 text-xs w-5 h-5 bg-red-500/20 rounded-full flex items-center justify-center">✕</button>
                <EditText tag="div" value={f.icon} onChange={v => {
                  const features = [...(d.features ?? [])]; features[i] = { ...features[i], icon: v }; update('features', features);
                }} className="text-2xl flex-shrink-0" />
                <div>
                  <EditText tag="div" value={f.title} onChange={v => {
                    const features = [...(d.features ?? [])]; features[i] = { ...features[i], title: v }; update('features', features);
                  }} className="font-bold text-sm mb-1" />
                  <EditText tag="div" value={f.desc} onChange={v => {
                    const features = [...(d.features ?? [])]; features[i] = { ...features[i], desc: v }; update('features', features);
                  }} className="text-xs opacity-60" />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'energy': {
      const d = data as { title?: string; grade?: string; annualCost?: string; co2?: string; highlights?: string[] };
      const update = (field: string, val: unknown) => onUpdate({ ...d, [field]: val });
      return (
        <div className="rounded-2xl overflow-hidden p-8" style={s}>
          <EditText tag="h2" value={d.title ?? ''} onChange={v => update('title', v)} className="text-2xl font-black mb-6" />
          <div className="flex gap-6 items-center mb-6">
            <div className="text-center">
              <div className="text-xs opacity-50 mb-1">에너지 등급</div>
              <EditText tag="div" value={d.grade ?? ''} onChange={v => update('grade', v)}
                className="text-5xl font-black" style={{ color: accent }} />
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="opacity-60">연간 전기요금</span>
                <EditText tag="span" value={d.annualCost ?? ''} onChange={v => update('annualCost', v)} className="font-bold" />
              </div>
              <div className="flex justify-between text-sm">
                <span className="opacity-60">CO₂ 절감</span>
                <EditText tag="span" value={d.co2 ?? ''} onChange={v => update('co2', v)} className="font-bold" />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {(d.highlights ?? []).map((h, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span style={{ color: accent }}>✓</span>
                <EditText tag="span" value={h} onChange={v => {
                  const hl = [...(d.highlights ?? [])]; hl[i] = v; update('highlights', hl);
                }} className="flex-1" />
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'comparison': {
      const d = data as { title?: string; headers?: string[]; rows?: { feature: string; values: string[] }[] };
      const update = (field: string, val: unknown) => onUpdate({ ...d, [field]: val });
      return (
        <div className="rounded-2xl overflow-hidden p-8" style={s}>
          <EditText tag="h2" value={d.title ?? ''} onChange={v => update('title', v)} className="text-2xl font-black mb-6" />
          <div className="overflow-auto rounded-xl border" style={{ borderColor: `${accent}30` }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: accent }}>
                  {(d.headers ?? []).map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left font-bold text-white">
                      <EditText tag="span" value={h} onChange={v => {
                        const headers = [...(d.headers ?? [])]; headers[i] = v; update('headers', headers);
                      }} className="text-white" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(d.rows ?? []).slice(0, 5).map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? `${accent}08` : 'transparent' }}>
                    <td className="px-4 py-2.5 font-medium">
                      <EditText tag="span" value={row.feature} onChange={v => {
                        const rows = [...(d.rows ?? [])]; rows[i] = { ...rows[i], feature: v }; update('rows', rows);
                      }} />
                    </td>
                    {(row.values ?? []).map((v, j) => (
                      <td key={j} className={`px-4 py-2.5 ${j === 0 ? 'font-bold' : 'opacity-60'}`}>
                        <EditText tag="span" value={v} onChange={val => {
                          const rows = [...(d.rows ?? [])];
                          rows[i] = { ...rows[i], values: rows[i].values.map((rv, ri) => ri === j ? val : rv) };
                          update('rows', rows);
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
      const d = data as { title?: string; items?: { name: string; qty: string; icon: string }[] };
      const update = (field: string, val: unknown) => onUpdate({ ...d, [field]: val });
      return (
        <div className="rounded-2xl overflow-hidden p-8" style={s}>
          <EditText tag="h2" value={d.title ?? ''} onChange={v => update('title', v)} className="text-2xl font-black mb-6" />
          <div className="grid grid-cols-4 gap-4">
            {(d.items ?? []).map((item, i) => (
              <div key={i} className="relative group p-4 rounded-xl text-center" style={{ background: `${accent}10` }}>
                <button onClick={() => {
                  const items = [...(d.items ?? [])]; items.splice(i, 1); update('items', items);
                }} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-red-400 text-[10px] w-4 h-4 bg-red-500/20 rounded-full flex items-center justify-center">✕</button>
                <EditText tag="div" value={item.icon} onChange={v => {
                  const items = [...(d.items ?? [])]; items[i] = { ...items[i], icon: v }; update('items', items);
                }} className="text-3xl mb-2" />
                <EditText tag="div" value={item.name} onChange={v => {
                  const items = [...(d.items ?? [])]; items[i] = { ...items[i], name: v }; update('items', items);
                }} className="text-xs font-semibold mb-1" />
                <EditText tag="div" value={item.qty} onChange={v => {
                  const items = [...(d.items ?? [])]; items[i] = { ...items[i], qty: v }; update('items', items);
                }} className="text-xs opacity-50" />
              </div>
            ))}
            <button onClick={() => update('items', [...(d.items ?? []), { icon: '📦', name: '새 구성품', qty: '1개' }])}
              className="p-4 rounded-xl border-2 border-dashed border-black/20 hover:border-black/40 opacity-40 hover:opacity-70 text-sm transition-all flex items-center justify-center">
              +
            </button>
          </div>
        </div>
      );
    }
    case 'reviews': {
      const d = data as { title?: string; rating?: string; summary?: string; items?: { author: string; rating: number; body: string; tag?: string }[] };
      const update = (field: string, val: unknown) => onUpdate({ ...d, [field]: val });
      return (
        <div className="rounded-2xl overflow-hidden p-8" style={s}>
          <div className="flex items-center gap-4 mb-6">
            <div>
              <EditText tag="h2" value={d.title ?? ''} onChange={v => update('title', v)} className="text-2xl font-black" />
              <div className="flex items-center gap-2 mt-1">
                <span className="text-3xl font-black" style={{ color: accent }}>{d.rating}</span>
                <div className="flex">{[1,2,3,4,5].map(i => <span key={i} style={{ color: accent }}>★</span>)}</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(d.items ?? []).map((r, i) => (
              <div key={i} className="relative group p-4 rounded-xl" style={{ background: `${accent}10` }}>
                <button onClick={() => {
                  const items = [...(d.items ?? [])]; items.splice(i, 1); update('items', items);
                }} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-400 text-[10px] w-4 h-4 bg-red-500/20 rounded-full flex items-center justify-center">✕</button>
                <div className="flex items-center gap-2 mb-2">
                  <EditText tag="span" value={r.author} onChange={v => {
                    const items = [...(d.items ?? [])]; items[i] = { ...items[i], author: v }; update('items', items);
                  }} className="text-sm font-bold" />
                  {r.tag && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: accent, color: '#fff' }}>{r.tag}</span>}
                </div>
                <div className="flex mb-1">{Array.from({length: r.rating}).map((_,ri) => <span key={ri} style={{color:accent}}>★</span>)}</div>
                <EditText tag="p" value={r.body} onChange={v => {
                  const items = [...(d.items ?? [])]; items[i] = { ...items[i], body: v }; update('items', items);
                }} className="text-xs opacity-70 leading-relaxed" />
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'warranty': {
      const d = data as { title?: string; items?: { icon: string; title: string; desc: string }[]; note?: string };
      const update = (field: string, val: unknown) => onUpdate({ ...d, [field]: val });
      return (
        <div className="rounded-2xl overflow-hidden p-8" style={s}>
          <EditText tag="h2" value={d.title ?? ''} onChange={v => update('title', v)} className="text-2xl font-black mb-6" />
          <div className="grid grid-cols-3 gap-4 mb-4">
            {(d.items ?? []).map((item, i) => (
              <div key={i} className="relative group p-4 rounded-xl text-center" style={{ background: `${accent}10` }}>
                <button onClick={() => {
                  const items = [...(d.items ?? [])]; items.splice(i, 1); update('items', items);
                }} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-400 text-[10px] w-4 h-4 bg-red-500/20 rounded-full flex items-center justify-center">✕</button>
                <EditText tag="div" value={item.icon} onChange={v => {
                  const items = [...(d.items ?? [])]; items[i] = { ...items[i], icon: v }; update('items', items);
                }} className="text-3xl mb-2" />
                <EditText tag="div" value={item.title} onChange={v => {
                  const items = [...(d.items ?? [])]; items[i] = { ...items[i], title: v }; update('items', items);
                }} className="font-bold text-sm mb-1" />
                <EditText tag="div" value={item.desc} onChange={v => {
                  const items = [...(d.items ?? [])]; items[i] = { ...items[i], desc: v }; update('items', items);
                }} className="text-xs opacity-60" />
              </div>
            ))}
          </div>
          <EditText tag="p" value={d.note ?? ''} onChange={v => update('note', v)} className="text-xs opacity-50 text-center" />
        </div>
      );
    }
    case 'cta': {
      const d = data as { headline?: string; subtext?: string; price?: string; originalPrice?: string; badge?: string; btnText?: string; installNote?: string };
      const update = (field: string, val: unknown) => onUpdate({ ...d, [field]: val });
      return (
        <div className="rounded-2xl overflow-hidden p-12 text-center" style={{ background: accent, color: '#fff' }}>
          {d.badge && <div className="inline-block bg-white/20 px-3 py-1 rounded-full text-sm font-bold mb-4">{d.badge}</div>}
          <EditText tag="h2" value={d.headline ?? ''} onChange={v => update('headline', v)} className="text-3xl font-black mb-2 text-white" />
          <EditText tag="p" value={d.subtext ?? ''} onChange={v => update('subtext', v)} className="opacity-80 mb-6 text-white" />
          <div className="flex items-center justify-center gap-3 mb-6">
            {d.originalPrice && <EditText tag="span" value={d.originalPrice} onChange={v => update('originalPrice', v)} className="text-lg line-through opacity-50 text-white" />}
            <EditText tag="span" value={d.price ?? ''} onChange={v => update('price', v)} className="text-4xl font-black text-white" />
          </div>
          <button className="px-10 py-4 rounded-full font-black text-lg bg-white" style={{ color: accent }}>
            {d.btnText ?? '지금 구매하기'}
          </button>
          {d.installNote && <EditText tag="p" value={d.installNote} onChange={v => update('installNote', v)} className="mt-3 text-sm opacity-70 text-white" />}
        </div>
      );
    }
    default: {
      return (
        <div className="rounded-2xl overflow-hidden p-8" style={s}>
          <h3 className="text-xl font-black mb-4">
            {(data.title as string) ?? SECTION_META.find(m => m.key === sectionKey)?.label}
          </h3>
          <div className="space-y-2">
            {Object.entries(data).filter(([k]) => k !== 'title').slice(0, 6).map(([k, v]) => (
              <div key={k} className="flex gap-3 text-sm">
                <span className="opacity-50 w-28 flex-shrink-0">{k}</span>
                <span className="opacity-80 truncate">{typeof v === 'string' ? v : JSON.stringify(v).slice(0, 80)}</span>
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
                  <EditableSection
                    sectionKey={selectedSection}
                    data={sections[selectedSection]}
                    tpl={selectedTpl}
                    sectionImage={sectionImages[selectedSection]}
                    onUpdate={data => updateSection(selectedSection, data)}
                    onImageChange={addImageToSection}
                  />
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
    </div>
  );
}
