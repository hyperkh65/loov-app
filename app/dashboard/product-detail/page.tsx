'use client';
import { useState, useEffect, useCallback } from 'react';

// ── 타입 ─────────────────────────────────────────────────────
interface ProductInfo {
  productName: string; productModel: string; productCategory: string;
  brand: string; keySpecs: string; targetUser: string;
  uniquePoints: string; priceRange: string;
}
interface Project {
  id: string; name: string; product_name: string; product_category: string;
  brand: string; template_id: string; status: string; created_at: string;
}
type Sections = Record<string, Record<string, unknown>>;

// ── 20개 템플릿 ──────────────────────────────────────────────
const TEMPLATES = [
  { id:'pure-white',       name:'Pure White',      bg:'#FFFFFF', primary:'#1A1A1A', accent:'#0066FF',  desc:'삼성 스타일 · 미니멀' },
  { id:'midnight-black',   name:'Midnight Black',   bg:'#0A0A0A', primary:'#FFFFFF', accent:'#00D4FF',  desc:'LG OLED · 다크 프리미엄' },
  { id:'space-gray',       name:'Space Gray',       bg:'#1C1C1E', primary:'#FFFFFF', accent:'#FF6B35',  desc:'Apple 스타일 · 스페이스그레이' },
  { id:'ocean-blue',       name:'Ocean Blue',       bg:'#003A6E', primary:'#FFFFFF', accent:'#00E5FF',  desc:'다이슨 스타일 · 딥블루' },
  { id:'forest-green',     name:'Forest Green',     bg:'#1B4332', primary:'#FFFFFF', accent:'#FFD700',  desc:'친환경 가전 · 에코' },
  { id:'rose-gold',        name:'Rose Gold',        bg:'#FDF6F0', primary:'#2D2D2D', accent:'#C9A96E',  desc:'프리미엄 여성 가전' },
  { id:'titanium',         name:'Titanium',         bg:'#2C2C2E', primary:'#FFFFFF', accent:'#E8D5B0',  desc:'다이슨/드롱기 · 산업적' },
  { id:'coral-energy',     name:'Coral Energy',     bg:'#FF6B35', primary:'#FFFFFF', accent:'#FF4757',  desc:'에너지 가전 · 활기' },
  { id:'pure-minimal',     name:'Pure Minimal',     bg:'#F5F5F5', primary:'#111111', accent:'#111111',  desc:'타이포 중심 · 초미니멀' },
  { id:'neon-tech',        name:'Neon Tech',        bg:'#0D0D0D', primary:'#FFFFFF', accent:'#39FF14',  desc:'게이밍/스마트홈 · 네온' },
  { id:'warm-ivory',       name:'Warm Ivory',       bg:'#FFFFF0', primary:'#2A2A2A', accent:'#B8860B',  desc:'클래식 · 아이보리 골드' },
  { id:'slate-pro',        name:'Slate Pro',        bg:'#2F3542', primary:'#FFFFFF', accent:'#6C63FF',  desc:'B2B 업무용 · 슬레이트' },
  { id:'sunrise-orange',   name:'Sunrise Orange',   bg:'#FF7043', primary:'#FFFFFF', accent:'#FFD700',  desc:'주방가전 · 바이브런트' },
  { id:'arctic-white',     name:'Arctic White',     bg:'#E8F4FD', primary:'#1A1A2E', accent:'#4CC9F0',  desc:'공조/공기청정 · 쿨블루' },
  { id:'carbon-fiber',     name:'Carbon Fiber',     bg:'#1A1A1A', primary:'#FFFFFF', accent:'#FF0000',  desc:'고성능 가전 · 레드포인트' },
  { id:'lavender-mist',    name:'Lavender Mist',    bg:'#F3F0FF', primary:'#2D2D2D', accent:'#7C3AED',  desc:'뷰티 가전 · 라벤더' },
  { id:'gold-prestige',    name:'Gold Prestige',    bg:'#FFF8E7', primary:'#1A1A1A', accent:'#CFB87C',  desc:'최상위 프리미엄 · 진금' },
  { id:'navy-classic',     name:'Navy Classic',     bg:'#0A1628', primary:'#FFFFFF', accent:'#E8A020',  desc:'국내 대기업 스타일' },
  { id:'fresh-mint',       name:'Fresh Mint',       bg:'#E8FFF5', primary:'#1A3A2A', accent:'#00B894',  desc:'정수기/건강 가전 · 민트' },
  { id:'deep-purple',      name:'Deep Purple',      bg:'#1A0533', primary:'#FFFFFF', accent:'#A855F7',  desc:'AI/스마트 가전 · 퍼플' },
];

const CATEGORIES = ['에어컨','냉장고','세탁기','건조기','공기청정기','로봇청소기','식기세척기','오븐/레인지','정수기','TV','노트북','스마트폰','블루투스스피커','헤드폰','기타'];

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

// ── 섹션 프리뷰 렌더러 ────────────────────────────────────────
function SectionPreview({ sectionKey, data, tpl }: { sectionKey: string; data: Record<string, unknown>; tpl: typeof TEMPLATES[0] }) {
  const s = { background: tpl.bg, color: tpl.primary };
  const accent = tpl.accent;

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="flex items-center justify-center h-64 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 text-sm">
        AI 생성 전입니다. 우측 상단의 생성 버튼을 누르세요.
      </div>
    );
  }

  switch (sectionKey) {
    case 'hero': {
      const d = data as { headline?: string; subheadline?: string; tagline?: string; keyPoints?: string[] };
      return (
        <div className="rounded-2xl overflow-hidden p-10 min-h-[260px] flex flex-col justify-center" style={s}>
          <div className="text-xs font-bold mb-3 opacity-60 tracking-widest uppercase">{d.tagline}</div>
          <h2 className="text-4xl font-black mb-3 leading-tight">{d.headline}</h2>
          <p className="text-lg opacity-70 mb-6">{d.subheadline}</p>
          <div className="flex gap-3 flex-wrap">
            {(d.keyPoints ?? []).map((p, i) => (
              <span key={i} className="text-sm px-4 py-1.5 rounded-full font-semibold" style={{ background: accent, color: '#fff' }}>{p}</span>
            ))}
          </div>
        </div>
      );
    }
    case 'features': {
      const d = data as { title?: string; items?: { icon: string; title: string; desc: string }[] };
      return (
        <div className="rounded-2xl overflow-hidden p-8" style={s}>
          <h3 className="text-2xl font-black mb-6">{d.title}</h3>
          <div className="grid grid-cols-3 gap-4">
            {(d.items ?? []).slice(0, 6).map((item, i) => (
              <div key={i} className="p-4 rounded-xl" style={{ background: `${accent}15` }}>
                <div className="text-2xl mb-2">{item.icon}</div>
                <div className="font-bold text-sm mb-1">{item.title}</div>
                <div className="text-xs opacity-60 leading-relaxed">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'specs': {
      const d = data as { title?: string; groups?: { groupName: string; rows: { label: string; value: string }[] }[] };
      return (
        <div className="rounded-2xl overflow-hidden p-8" style={s}>
          <h3 className="text-2xl font-black mb-6">{d.title}</h3>
          {(d.groups ?? []).slice(0, 2).map((g, i) => (
            <div key={i} className="mb-4">
              <div className="text-sm font-bold mb-2 opacity-60">{g.groupName}</div>
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: `${accent}30` }}>
                {g.rows.slice(0, 4).map((row, j) => (
                  <div key={j} className="flex px-4 py-2.5 text-sm" style={{ background: j % 2 === 0 ? `${accent}08` : 'transparent' }}>
                    <span className="w-32 opacity-60">{row.label}</span>
                    <span className="font-semibold">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    case 'comparison': {
      const d = data as { title?: string; headers?: string[]; rows?: { feature: string; values: string[] }[] };
      return (
        <div className="rounded-2xl overflow-hidden p-8" style={s}>
          <h3 className="text-2xl font-black mb-6">{d.title}</h3>
          <div className="overflow-auto rounded-xl border" style={{ borderColor: `${accent}30` }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: accent }}>
                  {(d.headers ?? []).map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left font-bold text-white">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(d.rows ?? []).slice(0, 5).map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? `${accent}08` : 'transparent' }}>
                    <td className="px-4 py-2.5 font-medium">{row.feature}</td>
                    {(row.values ?? []).map((v, j) => (
                      <td key={j} className={`px-4 py-2.5 ${j === 0 ? 'font-bold' : 'opacity-60'}`}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    case 'reviews': {
      const d = data as { title?: string; rating?: string; summary?: string; items?: { author: string; rating: number; body: string; tag?: string }[] };
      return (
        <div className="rounded-2xl overflow-hidden p-8" style={s}>
          <div className="flex items-center gap-4 mb-6">
            <div>
              <h3 className="text-2xl font-black">{d.title}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-3xl font-black" style={{ color: accent }}>{d.rating}</span>
                <div className="flex">{[1,2,3,4,5].map(i => <span key={i} style={{ color: accent }}>★</span>)}</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(d.items ?? []).slice(0, 4).map((r, i) => (
              <div key={i} className="p-4 rounded-xl" style={{ background: `${accent}10` }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-bold">{r.author}</span>
                  {r.tag && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: accent, color: '#fff' }}>{r.tag}</span>}
                </div>
                <div className="flex mb-1">{Array.from({length: r.rating}).map((_,i) => <span key={i} style={{color:accent}}>★</span>)}</div>
                <p className="text-xs opacity-70 leading-relaxed">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'cta': {
      const d = data as { headline?: string; subtext?: string; price?: string; originalPrice?: string; badge?: string; btnText?: string; installNote?: string };
      return (
        <div className="rounded-2xl overflow-hidden p-12 text-center" style={{ background: accent, color: '#fff' }}>
          {d.badge && <div className="inline-block bg-white/20 px-3 py-1 rounded-full text-sm font-bold mb-4">{d.badge}</div>}
          <h2 className="text-3xl font-black mb-2">{d.headline}</h2>
          <p className="opacity-80 mb-6">{d.subtext}</p>
          <div className="flex items-center justify-center gap-3 mb-6">
            {d.originalPrice && <span className="text-lg line-through opacity-50">{d.originalPrice}</span>}
            <span className="text-4xl font-black">{d.price}</span>
          </div>
          <button className="px-10 py-4 rounded-full font-black text-lg bg-white" style={{ color: accent }}>{d.btnText}</button>
          {d.installNote && <p className="mt-3 text-sm opacity-70">{d.installNote}</p>}
        </div>
      );
    }
    default: {
      // Generic fallback renderer
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

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export default function ProductDetailPage() {
  const [step, setStep] = useState<1|2|3>(1);
  const [selectedTpl, setSelectedTpl] = useState(TEMPLATES[0]);
  const [productInfo, setProductInfo] = useState<ProductInfo>({
    productName:'', productModel:'', productCategory:'에어컨', brand:'',
    keySpecs:'', targetUser:'', uniquePoints:'', priceRange:'',
  });
  const [sections, setSections] = useState<Sections>({});
  const [activeSection, setActiveSection] = useState('hero');
  const [generating, setGenerating] = useState(false);
  const [generatingKey, setGeneratingKey] = useState<string|null>(null);
  const [projectId, setProjectId] = useState<string|null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showProjects, setShowProjects] = useState(false);
  const [figmaConnected, setFigmaConnected] = useState(false);
  const [figmaToken, setFigmaToken] = useState('');
  const [figmaUser, setFigmaUser] = useState('');
  const [figmaFileKey, setFigmaFileKey] = useState('');
  const [figmaFrames, setFigmaFrames] = useState<{id:string;name:string}[]>([]);
  const [provider, setProvider] = useState('gemini');
  const [apiKey, setApiKey] = useState('');
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => {
    fetch('/api/figma/connect').then(r => r.json()).then(d => {
      if (d.connected) { setFigmaConnected(true); setFigmaUser(d.figma_name ?? ''); }
    });
    fetch('/api/product-detail/projects').then(r => r.json()).then(d => setProjects(d.projects ?? []));
  }, []);

  const connectFigma = async () => {
    if (!figmaToken.trim()) return;
    const res = await fetch('/api/figma/connect', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ accessToken: figmaToken }) });
    const d = await res.json();
    if (d.connected) { setFigmaConnected(true); setFigmaUser(d.handle); showToast('Figma 연동 완료!'); }
    else showToast(d.error ?? '연동 실패');
  };

  const loadFigmaFrames = async () => {
    if (!figmaFileKey.trim()) return;
    const res = await fetch(`/api/figma/files?action=file&fileKey=${figmaFileKey}`);
    const d = await res.json();
    if (d.frames) setFigmaFrames(d.frames);
    else showToast(d.error ?? '파일 로드 실패');
  };

  const saveProject = useCallback(async () => {
    if (!productInfo.productName.trim()) { showToast('제품명을 입력하세요'); return; }
    if (projectId) {
      await fetch('/api/product-detail/projects', {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ id: projectId, product_name: productInfo.productName, product_category: productInfo.productCategory, brand: productInfo.brand, template_id: selectedTpl.id, sections, product_info: productInfo }),
      });
      showToast('저장 완료');
    } else {
      const res = await fetch('/api/product-detail/projects', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name: `${productInfo.brand} ${productInfo.productName}`.trim() || '새 프로젝트', product_name: productInfo.productName, product_category: productInfo.productCategory, brand: productInfo.brand, template_id: selectedTpl.id }),
      });
      const d = await res.json();
      if (d.project) { setProjectId(d.project.id); showToast('프로젝트 저장 완료'); }
    }
  }, [productInfo, projectId, selectedTpl, sections]);

  const generateAll = async () => {
    if (!productInfo.productName.trim()) { showToast('제품명을 먼저 입력하세요'); return; }
    setGenerating(true);
    setGeneratingKey('all');
    try {
      const res = await fetch('/api/product-detail/generate', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ projectId, productInfo, provider, apiKey }),
      });
      const d = await res.json();
      if (d.sections) { setSections(d.sections); setStep(3); showToast('12개 섹션 생성 완료!'); }
      else showToast(d.error ?? '생성 실패');
    } finally { setGenerating(false); setGeneratingKey(null); }
  };

  const regenerateSection = async (key: string) => {
    setGeneratingKey(key);
    try {
      const res = await fetch('/api/product-detail/generate', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ projectId, sectionKey: key, productInfo, provider, apiKey }),
      });
      const d = await res.json();
      if (d.sections) { setSections(prev => ({ ...prev, ...d.sections })); showToast(`${SECTION_META.find(m=>m.key===key)?.label} 재생성 완료`); }
    } finally { setGeneratingKey(null); }
  };

  const exportHTML = () => {
    const tpl = selectedTpl;
    const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${productInfo.productName} 상세페이지</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:${tpl.bg};color:${tpl.primary}}
:root{--primary:${tpl.primary};--accent:${tpl.accent};--bg:${tpl.bg}}</style></head><body>
${SECTION_META.map(m => {
  const d = sections[m.key];
  if (!d) return '';
  return `<section id="${m.key}" style="padding:80px 5%;max-width:1200px;margin:0 auto"><h2>${m.label}</h2><pre style="font-size:12px;opacity:0.7;white-space:pre-wrap">${JSON.stringify(d,null,2)}</pre></section>`;
}).join('\n')}
</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${productInfo.productName || 'product'}-detail.html`; a.click();
    URL.revokeObjectURL(url);
    showToast('HTML 내보내기 완료');
  };

  const loadProject = (proj: Project) => {
    setProductInfo(prev => ({ ...prev, productName: proj.product_name, productCategory: proj.product_category, brand: proj.brand }));
    setSelectedTpl(TEMPLATES.find(t => t.id === proj.template_id) ?? TEMPLATES[0]);
    setProjectId(proj.id);
    setShowProjects(false);
    // Load full project with sections
    fetch(`/api/product-detail/projects?id=${proj.id}`).then(r => r.json()).then(d => {
      if (d.project?.sections) setSections(d.project.sections);
    });
  };

  const tpl = selectedTpl;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm shadow-xl animate-pulse">
          {toast}
        </div>
      )}

      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900">상품 상세페이지 빌더</h1>
          <p className="text-xs text-gray-400 mt-0.5">20개 템플릿 × 12섹션 · AI 자동 생성 · Figma 연동</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowProjects(true)} className="text-sm px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600">
            📂 프로젝트 목록 ({projects.length})
          </button>
          <button onClick={saveProject} className="text-sm px-4 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-700 font-semibold">
            💾 저장
          </button>
          {step === 3 && Object.keys(sections).length > 0 && (
            <button onClick={exportHTML} className="text-sm px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 font-semibold">
              ⬇ HTML 내보내기
            </button>
          )}
        </div>
      </div>

      {/* 스텝 탭 */}
      <div className="bg-white border-b border-gray-100 px-6">
        <div className="flex gap-0">
          {[{n:1,l:'템플릿 선택'},{n:2,l:'제품 정보'},{n:3,l:'섹션 미리보기'}].map(s => (
            <button key={s.n} onClick={() => setStep(s.n as 1|2|3)}
              className={`px-6 py-3.5 text-sm font-semibold border-b-2 transition-all ${step === s.n ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              {s.n}. {s.l}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">

        {/* ── STEP 1: 템플릿 선택 ── */}
        {step === 1 && (
          <div>
            <div className="mb-6">
              <h2 className="text-lg font-black text-gray-900 mb-1">20개 템플릿 중 하나를 선택하세요</h2>
              <p className="text-sm text-gray-500">가전제품 카테고리에 맞는 색상 테마를 선택하면 AI가 해당 스타일로 상세페이지를 생성합니다.</p>
            </div>
            <div className="grid grid-cols-4 xl:grid-cols-5 gap-4">
              {TEMPLATES.map(t => (
                <div key={t.id} onClick={() => { setSelectedTpl(t); }}
                  className={`cursor-pointer rounded-2xl overflow-hidden border-2 transition-all hover:scale-[1.02] ${selectedTpl.id === t.id ? 'border-indigo-500 shadow-lg shadow-indigo-100' : 'border-gray-100 hover:border-gray-300'}`}>
                  {/* 컬러 프리뷰 */}
                  <div className="h-28 relative" style={{ background: t.bg }}>
                    <div className="absolute inset-0 flex flex-col justify-end p-3 gap-1.5">
                      <div className="h-2 rounded-full w-3/4" style={{ background: t.primary, opacity: 0.8 }} />
                      <div className="h-1.5 rounded-full w-1/2" style={{ background: t.primary, opacity: 0.4 }} />
                      <div className="h-6 rounded-lg w-24 mt-1" style={{ background: t.accent }} />
                    </div>
                    {selectedTpl.id === t.id && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-[10px]">✓</span>
                      </div>
                    )}
                  </div>
                  <div className="bg-white p-3">
                    <div className="text-xs font-bold text-gray-900">{t.name}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{t.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={() => setStep(2)} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 transition-colors">
                다음: 제품 정보 입력 →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: 제품 정보 ── */}
        {step === 2 && (
          <div className="max-w-3xl">
            <h2 className="text-lg font-black text-gray-900 mb-6">제품 정보 입력</h2>
            <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
              <h3 className="text-sm font-bold text-gray-700 mb-4">기본 정보</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key:'productName',    label:'제품명 *',       ph:'예: 그랜드 워시 18kg 드럼세탁기' },
                  { key:'productModel',   label:'모델번호',        ph:'예: GW-D18X2' },
                  { key:'brand',          label:'브랜드',          ph:'예: 삼성전자' },
                  { key:'priceRange',     label:'판매가격',        ph:'예: 1,299,000원' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">{f.label}</label>
                    <input
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
                      placeholder={f.ph}
                      value={productInfo[f.key as keyof ProductInfo]}
                      onChange={e => setProductInfo(prev => ({ ...prev, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">카테고리</label>
                  <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-white"
                    value={productInfo.productCategory}
                    onChange={e => setProductInfo(prev => ({ ...prev, productCategory: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
              <h3 className="text-sm font-bold text-gray-700 mb-4">AI 콘텐츠 생성용 정보 (선택사항 · 입력할수록 정확해집니다)</h3>
              <div className="space-y-4">
                {[
                  { key:'keySpecs',      label:'주요 사양',          ph:'예: 용량 18kg, 인버터 모터, 버블워시, 스팀 세탁, Wi-Fi 연결', rows:2 },
                  { key:'targetUser',    label:'타겟 고객',          ph:'예: 4인 이상 대가족, 세탁 빈도가 높은 맞벌이 부부', rows:1 },
                  { key:'uniquePoints',  label:'차별화 포인트',       ph:'예: 동급 대비 세탁 용량 20% 증가, AI 자동 세제 투입, 에너지 1등급', rows:2 },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">{f.label}</label>
                    <textarea
                      rows={f.rows}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"
                      placeholder={f.ph}
                      value={productInfo[f.key as keyof ProductInfo]}
                      onChange={e => setProductInfo(prev => ({ ...prev, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* AI 설정 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
              <h3 className="text-sm font-bold text-gray-700 mb-4">AI 설정</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">AI 모델</label>
                  <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-white"
                    value={provider} onChange={e => setProvider(e.target.value)}>
                    <option value="gemini">Gemini (Google)</option>
                    <option value="claude">Claude (Anthropic)</option>
                    <option value="gpt4o">GPT-4o (OpenAI)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">API 키 (설정에 저장된 키 자동 사용)</label>
                  <input
                    type="password"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
                    placeholder="비워두면 대시보드 설정 키 사용"
                    value={apiKey} onChange={e => setApiKey(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Figma 연동 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-700">Figma 연동 (선택사항)</h3>
                {figmaConnected && <span className="text-xs text-green-600 font-semibold bg-green-50 px-2 py-1 rounded-full">✓ 연결됨 · {figmaUser}</span>}
              </div>
              {!figmaConnected ? (
                <div className="flex gap-2">
                  <input
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
                    placeholder="Figma Personal Access Token"
                    value={figmaToken} onChange={e => setFigmaToken(e.target.value)}
                  />
                  <button onClick={connectFigma} className="px-4 py-2.5 bg-black text-white text-sm rounded-xl font-semibold hover:bg-gray-800">연동</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
                      placeholder="Figma 파일 키 (URL의 /file/XXX 부분)"
                      value={figmaFileKey} onChange={e => setFigmaFileKey(e.target.value)}
                    />
                    <button onClick={loadFigmaFrames} className="px-4 py-2.5 bg-black text-white text-sm rounded-xl font-semibold hover:bg-gray-800">프레임 불러오기</button>
                  </div>
                  {figmaFrames.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {figmaFrames.map(f => (
                        <span key={f.id} className="text-xs bg-gray-100 px-3 py-1.5 rounded-full text-gray-600">{f.name}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-2">Figma 디자인 파일의 프레임을 이미지로 가져와 상세페이지에 활용합니다.</p>
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => setStep(1)} className="px-6 py-3 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50">← 템플릿 다시 선택</button>
              <button onClick={generateAll} disabled={generating || !productInfo.productName.trim()}
                className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                {generating ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> AI 생성 중...</> : '🚀 12개 섹션 AI 자동 생성 →'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: 섹션 프리뷰 ── */}
        {step === 3 && (
          <div className="flex gap-6 h-[calc(100vh-200px)]">
            {/* 좌측 섹션 리스트 */}
            <div className="w-56 flex-shrink-0 flex flex-col gap-1 overflow-y-auto">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-2">12개 섹션</div>
              {SECTION_META.map(m => {
                const hasData = !!(sections[m.key] && Object.keys(sections[m.key]).length > 0);
                const isLoading = generatingKey === m.key;
                return (
                  <div key={m.key}
                    className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${activeSection === m.key ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-100 text-gray-600'}`}
                    onClick={() => setActiveSection(m.key)}>
                    <span className="text-base flex-shrink-0">{m.icon}</span>
                    <span className="text-sm font-medium flex-1 truncate">{m.label}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isLoading
                        ? <div className="w-3 h-3 border border-gray-400 border-t-indigo-500 rounded-full animate-spin" />
                        : <button onClick={e => { e.stopPropagation(); regenerateSection(m.key); }} className="text-[10px] text-gray-400 hover:text-indigo-600">↺</button>
                      }
                    </div>
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasData ? 'bg-green-400' : 'bg-gray-200'}`} />
                  </div>
                );
              })}
              <div className="mt-4 pt-4 border-t border-gray-100 px-2 space-y-2">
                <button onClick={generateAll} disabled={generating}
                  className="w-full text-xs py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-500 disabled:opacity-50">
                  {generating ? '생성 중...' : '🔄 전체 재생성'}
                </button>
                <button onClick={exportHTML} className="w-full text-xs py-2 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-700">
                  ⬇ HTML 내보내기
                </button>
              </div>
            </div>

            {/* 우측 프리뷰 */}
            <div className="flex-1 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{SECTION_META.find(m => m.key === activeSection)?.icon}</span>
                  <h3 className="font-bold text-gray-900">{SECTION_META.find(m => m.key === activeSection)?.label}</h3>
                </div>
                <div className="flex items-center gap-2">
                  {/* 템플릿 미니 스위처 */}
                  <div className="flex gap-1">
                    {TEMPLATES.slice(0, 8).map(t => (
                      <button key={t.id} title={t.name}
                        onClick={() => setSelectedTpl(t)}
                        className={`w-5 h-5 rounded-full border-2 transition-all ${tpl.id === t.id ? 'scale-125 border-indigo-500' : 'border-white'}`}
                        style={{ background: t.accent }} />
                    ))}
                  </div>
                  <button onClick={() => regenerateSection(activeSection)} disabled={generatingKey === activeSection}
                    className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 disabled:opacity-50">
                    {generatingKey === activeSection ? '생성 중...' : '↺ 재생성'}
                  </button>
                </div>
              </div>
              <SectionPreview sectionKey={activeSection} data={sections[activeSection] ?? {}} tpl={tpl} />

              {/* 데이터 확인 (개발자용) */}
              {sections[activeSection] && (
                <details className="mt-4">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Raw JSON 보기</summary>
                  <pre className="mt-2 bg-gray-50 rounded-xl p-4 text-[11px] text-gray-500 overflow-auto max-h-48">
                    {JSON.stringify(sections[activeSection], null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 프로젝트 목록 모달 */}
      {showProjects && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[70vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-black text-gray-900">저장된 프로젝트</h2>
              <button onClick={() => setShowProjects(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {projects.length === 0 && <p className="text-center text-gray-400 py-8 text-sm">저장된 프로젝트가 없습니다</p>}
              {projects.map(p => (
                <div key={p.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 cursor-pointer" onClick={() => loadProject(p)}>
                  <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ background: TEMPLATES.find(t=>t.id===p.template_id)?.accent ?? '#6366f1' }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-gray-900 truncate">{p.product_name || p.name}</div>
                    <div className="text-xs text-gray-400">{p.product_category} · {p.brand} · {new Date(p.created_at).toLocaleDateString('ko-KR')}</div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${p.status === 'done' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{p.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
