'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';

/* ─── 타입 ──────────────────────────────────────────────────────────────── */
interface Category { id: number; name: string; slug: string; icon?: string; sort_order: number; }
interface Product { id: number; name: string; price: number; sale_price: number | null; thumbnail_url: string | null; is_active: boolean; is_new: boolean; is_best: boolean; is_featured: boolean; stock: number; category_id: number | null; shop_categories?: { name: string }; }
interface Order { id: number; order_no: string; status: string; total_amount: number; created_at: string; shipping_name: string; shipping_phone: string; shop_order_items: { product_name: string; qty: number; price: number }[]; }
interface Banner { id: number; title: string; subtitle: string; image_url: string | null; link_url: string | null; bg_color: string; text_color: string; badge_text: string | null; cta_text: string | null; sort_order: number; is_active: boolean; }
interface SpecRow { key: string; value: string; }

type Tab = 'products' | 'banners' | 'orders' | 'categories';

const STATUS = { pending: { label: '입금대기', color: 'bg-yellow-100 text-yellow-700' }, paid: { label: '결제완료', color: 'bg-blue-100 text-blue-700' }, shipping: { label: '배송중', color: 'bg-purple-100 text-purple-700' }, done: { label: '배송완료', color: 'bg-green-100 text-green-700' }, cancel: { label: '취소', color: 'bg-red-100 text-red-700' } } as const;
const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white';
const LABEL = 'block text-xs font-semibold text-gray-600 mb-1.5';

/* ─── 토글 스위치 ────────────────────────────────────────────────────────── */
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)}
      className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${on ? 'bg-blue-500' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

/* ─── 상품 등록/수정 모달 ────────────────────────────────────────────────── */
function ProductModal({ cats, product, onClose, onSaved }: {
  cats: Category[]; product: Product | null; onClose: () => void; onSaved: () => void;
}) {
  const [tab, setTab] = useState<'basic' | 'media' | 'detail'>('basic');
  const [form, setForm] = useState({
    name: product?.name ?? '', price: String(product?.price ?? ''), sale_price: String(product?.sale_price ?? ''),
    stock: String(product?.stock ?? 999), category_id: String(product?.category_id ?? ''),
    thumbnail_url: product?.thumbnail_url ?? '', description: '',
    is_active: product?.is_active ?? true, is_new: product?.is_new ?? false,
    is_best: product?.is_best ?? false, is_featured: product?.is_featured ?? false,
    detail_html: '',
  });
  const [images, setImages] = useState<string[]>([]);
  const [specs, setSpecs] = useState<SpecRow[]>([{ key: '', value: '' }]);
  const [options, setOptions] = useState<string[]>(['']);
  const [newImg, setNewImg] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!product) return;
    fetch(`/api/shop/products/${product.id}`).then(r => r.json()).then(d => {
      const p = d.product; if (!p) return;
      setForm(f => ({ ...f, description: p.description ?? '', detail_html: p.detail_html ?? '' }));
      setImages(p.shop_product_images?.map((i: { url: string }) => i.url) ?? []);
      if (p.spec && Object.keys(p.spec).length) setSpecs(Object.entries(p.spec).map(([key, value]) => ({ key, value: value as string })));
      if (p.options?.length) setOptions(p.options);
    });
  }, [product]);

  const up = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const addSpec = () => setSpecs(s => [...s, { key: '', value: '' }]);
  const removeSpec = (i: number) => setSpecs(s => s.filter((_, j) => j !== i));
  const setSpec = (i: number, k: 'key' | 'value', v: string) => setSpecs(s => s.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const addOption = () => setOptions(o => [...o, '']);
  const removeOption = (i: number) => setOptions(o => o.filter((_, j) => j !== i));
  const setOption = (i: number, v: string) => setOptions(o => o.map((x, j) => j === i ? v : x));

  const addImage = () => { if (newImg.trim()) { setImages(i => [...i, newImg.trim()]); setNewImg(''); } };

  async function save() {
    if (!form.name || !form.price) { setError('상품명과 가격은 필수입니다'); return; }
    setSaving(true); setError('');
    try {
      const specObj = Object.fromEntries(specs.filter(s => s.key).map(s => [s.key, s.value]));
      const optsArr = options.filter(o => o.trim());
      const slug = form.name.toLowerCase().replace(/[^a-z0-9가-힣]/g, '-').replace(/-+/g, '-') + '-' + Date.now();
      const body = {
        ...form,
        price: Number(form.price),
        sale_price: form.sale_price ? Number(form.sale_price) : null,
        stock: Number(form.stock),
        category_id: form.category_id ? Number(form.category_id) : null,
        spec: specObj, options: optsArr, images,
        ...(product ? { id: product.id } : { slug }),
      };
      const res = await fetch('/api/shop/products', {
        method: product ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      onSaved();
    } catch (e) { setError(String(e)); } finally { setSaving(false); }
  }

  const TABS = [{ id: 'basic', label: '기본 정보' }, { id: 'media', label: '이미지·옵션·스펙' }, { id: 'detail', label: '상세 내용' }] as const;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl my-8 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{product ? '✏️ 상품 수정' : '➕ 새 상품 등록'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-full">×</button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-gray-100">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === t.id ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6 max-h-[65vh] overflow-y-auto space-y-4">

          {/* ── 기본 정보 ── */}
          {tab === 'basic' && <>
            <div>
              <label className={LABEL}>상품명 *</label>
              <input value={form.name} onChange={e => up('name', e.target.value)} placeholder="상품명을 입력하세요" className={INPUT} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={LABEL}>정가 (원) *</label>
                <input type="number" value={form.price} onChange={e => up('price', e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>판매가 (할인)</label>
                <input type="number" value={form.sale_price} onChange={e => up('sale_price', e.target.value)} placeholder="없으면 비워두기" className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>재고</label>
                <input type="number" value={form.stock} onChange={e => up('stock', e.target.value)} className={INPUT} />
              </div>
            </div>
            {form.price && form.sale_price && (
              <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg text-sm">
                <span className="text-red-500 font-bold">{Math.round((1 - Number(form.sale_price) / Number(form.price)) * 100)}% 할인</span>
                <span className="text-gray-500">({Number(form.price).toLocaleString()}원 → {Number(form.sale_price).toLocaleString()}원)</span>
              </div>
            )}
            <div>
              <label className={LABEL}>카테고리</label>
              <select value={form.category_id} onChange={e => up('category_id', e.target.value)} className={INPUT}>
                <option value="">카테고리 없음</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>간단 설명</label>
              <textarea value={form.description} onChange={e => up('description', e.target.value)} rows={3} placeholder="상품 목록에 표시되는 짧은 설명" className={INPUT + ' resize-none'} />
            </div>
            <div className="flex flex-wrap gap-4 p-3 bg-gray-50 rounded-xl">
              {([['is_active','판매중 ✅','blue'],['is_new','신상품 ✨','blue'],['is_best','베스트 🏆','amber'],['is_featured','추천 ⭐','purple']] as const).map(([k, label]) => (
                <div key={k} className="flex items-center gap-2">
                  <Toggle on={!!form[k]} onChange={v => up(k, v)} />
                  <span className="text-sm text-gray-700 font-medium">{label}</span>
                </div>
              ))}
            </div>
          </>}

          {/* ── 이미지·옵션·스펙 ── */}
          {tab === 'media' && <>
            <div>
              <label className={LABEL}>썸네일 URL</label>
              <div className="flex gap-2">
                <input value={form.thumbnail_url} onChange={e => up('thumbnail_url', e.target.value)} placeholder="https://..." className={INPUT} />
                {form.thumbnail_url && (
                  <div className="w-10 h-10 rounded-lg overflow-hidden border border-gray-200 shrink-0 relative">
                    <Image src={form.thumbnail_url} alt="" fill className="object-cover" onError={() => {}} />
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className={LABEL}>추가 이미지</label>
              <div className="flex gap-2 mb-2">
                <input value={newImg} onChange={e => setNewImg(e.target.value)} placeholder="https://..." className={INPUT} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addImage(); } }} />
                <button onClick={addImage} className="shrink-0 px-3 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition">추가</button>
              </div>
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map((url, i) => (
                    <div key={i} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                      <Image src={url} alt="" fill className="object-cover" />
                      <button onClick={() => setImages(imgs => imgs.filter((_, j) => j !== i))}
                        className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center text-xl transition">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={LABEL + ' mb-0'}>옵션 (색상, 사이즈 등)</label>
                <button onClick={addOption} className="text-xs text-blue-500 hover:text-blue-700 font-medium">+ 추가</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg pr-1">
                    <input value={opt} onChange={e => setOption(i, e.target.value)} placeholder={`옵션 ${i + 1}`}
                      className="px-2 py-1.5 text-sm bg-transparent outline-none w-24" />
                    <button onClick={() => removeOption(i)} className="text-gray-300 hover:text-red-500 text-sm">×</button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={LABEL + ' mb-0'}>제품 사양</label>
                <button onClick={addSpec} className="text-xs text-blue-500 hover:text-blue-700 font-medium">+ 행 추가</button>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="grid grid-cols-2 bg-gray-50 border-b border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500">
                  <span>항목</span><span>값</span>
                </div>
                {specs.map((row, i) => (
                  <div key={i} className="grid grid-cols-2 border-b border-gray-100 last:border-0 items-center">
                    <input value={row.key} onChange={e => setSpec(i, 'key', e.target.value)} placeholder="예: 전력" className="px-3 py-2 text-sm border-r border-gray-100 focus:outline-none focus:bg-blue-50 transition" />
                    <div className="flex items-center">
                      <input value={row.value} onChange={e => setSpec(i, 'value', e.target.value)} placeholder="예: 20W" className="flex-1 px-3 py-2 text-sm focus:outline-none focus:bg-blue-50 transition" />
                      <button onClick={() => removeSpec(i)} className="px-2 text-gray-200 hover:text-red-400 transition">×</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>}

          {/* ── 상세 내용 ── */}
          {tab === 'detail' && <>
            <div>
              <label className={LABEL}>상세 페이지 HTML</label>
              <textarea value={form.detail_html} onChange={e => up('detail_html', e.target.value)} rows={14}
                placeholder="<p>상세한 상품 설명을 HTML로 입력하세요...</p>"
                className={INPUT + ' resize-none font-mono text-xs'} />
            </div>
          </>}

          {error && <p className="text-red-500 text-sm p-3 bg-red-50 rounded-lg">{error}</p>}
        </div>

        <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition">취소</button>
          <button onClick={save} disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition">
            {saving ? '저장 중...' : product ? '수정 저장' : '상품 등록'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── 배너 모달 ──────────────────────────────────────────────────────────── */
function BannerModal({ banner, onClose, onSaved }: { banner: Banner | null; onClose: () => void; onSaved: () => void; }) {
  const [form, setForm] = useState({
    title: banner?.title ?? '', subtitle: banner?.subtitle ?? '',
    image_url: banner?.image_url ?? '', link_url: banner?.link_url ?? '',
    bg_color: banner?.bg_color ?? 'linear-gradient(135deg,#1a1a2e,#0f3460)',
    text_color: banner?.text_color ?? '#ffffff',
    badge_text: banner?.badge_text ?? '', cta_text: banner?.cta_text ?? '쇼핑하기',
    sort_order: banner?.sort_order ?? 0, is_active: banner?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const up = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const PRESETS = [
    { label: '다크 블루', value: 'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)' },
    { label: '그린', value: 'linear-gradient(135deg,#2d1b69,#11998e,#38ef7d)' },
    { label: '레드', value: 'linear-gradient(135deg,#c94b4b,#4b134f)' },
    { label: '오렌지', value: 'linear-gradient(135deg,#f7971e,#ffd200)' },
    { label: '퍼플', value: 'linear-gradient(135deg,#4776e6,#8e54e9)' },
  ];

  async function save() {
    setSaving(true);
    await fetch('/api/shop/banners', {
      method: banner ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, ...(banner ? { id: banner.id } : {}) }),
    });
    setSaving(false); onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{banner ? '배너 수정' : '배너 추가'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl">×</button>
        </div>

        {/* 미리보기 */}
        <div className="h-36 flex items-center justify-center text-center px-6 relative overflow-hidden mx-4 mt-4 rounded-xl"
          style={{ background: form.image_url ? undefined : form.bg_color, color: '#ffffff' }}>
          {form.image_url ? (
            <>
              <Image src={form.image_url} alt="" fill className="object-cover" unoptimized />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
            </>
          ) : null}
          <div className="relative z-10">
            {form.badge_text && <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold block mb-1">{form.badge_text}</span>}
            <p className="font-black text-xl leading-tight drop-shadow">{form.title || '배너 제목'}</p>
            <p className="text-xs opacity-80 mt-0.5">{form.subtitle || '부제목'}</p>
            <p className="text-[10px] mt-2 bg-white text-gray-800 font-bold px-3 py-1 rounded-full inline-block">{form.cta_text || '쇼핑하기'} →</p>
          </div>
        </div>

        <div className="p-5 space-y-3 max-h-[50vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className={LABEL}>제목</label><input value={form.title} onChange={e => up('title', e.target.value)} className={INPUT} /></div>
            <div className="col-span-2"><label className={LABEL}>부제목</label><input value={form.subtitle} onChange={e => up('subtitle', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>뱃지 텍스트</label><input value={form.badge_text} onChange={e => up('badge_text', e.target.value)} placeholder="🔥 SALE" className={INPUT} /></div>
            <div><label className={LABEL}>버튼 텍스트</label><input value={form.cta_text} onChange={e => up('cta_text', e.target.value)} placeholder="쇼핑하기" className={INPUT} /></div>
            <div className="col-span-2"><label className={LABEL}>이미지 URL</label><input value={form.image_url} onChange={e => up('image_url', e.target.value)} placeholder="https://..." className={INPUT} /></div>
            <div className="col-span-2"><label className={LABEL}>링크 URL</label><input value={form.link_url} onChange={e => up('link_url', e.target.value)} placeholder="/shops?category=lighting" className={INPUT} /></div>
          </div>
          <div>
            <label className={LABEL}>배경 그라디언트</label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(p => (
                <button key={p.value} onClick={() => up('bg_color', p.value)}
                  className={`w-8 h-8 rounded-full border-2 transition ${form.bg_color === p.value ? 'border-blue-500 scale-110' : 'border-white shadow'}`}
                  style={{ background: p.value }} title={p.label} />
              ))}
              <input type="text" value={form.bg_color} onChange={e => up('bg_color', e.target.value)}
                className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs font-mono" placeholder="커스텀" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className={LABEL + ' mb-0'}>표시</label>
            <Toggle on={form.is_active} onChange={v => up('is_active', v)} />
            <label className={LABEL + ' mb-0 ml-4'}>순서</label>
            <input type="number" value={form.sort_order} onChange={e => up('sort_order', +e.target.value)} className="w-16 border border-gray-200 rounded px-2 py-1 text-sm" />
          </div>
        </div>

        <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition">취소</button>
          <button onClick={save} disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition">{saving ? '저장 중...' : '저장'}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── 메인 어드민 페이지 ─────────────────────────────────────────────────── */
export default function ShopAdminPage() {
  const [tab, setTab] = useState<Tab>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [editProduct, setEditProduct] = useState<Product | null | undefined>(undefined);
  const [editBanner, setEditBanner] = useState<Banner | null | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [p, c, o, b] = await Promise.all([
      fetch('/api/shop/products?limit=200&admin=1').then(r => r.json()),
      fetch('/api/shop/categories').then(r => r.json()),
      fetch('/api/shop/orders?admin=1').then(r => r.json()),
      fetch('/api/shop/banners').then(r => r.json()),
    ]);
    if (p.products) setProducts(p.products);
    if (c.categories) setCategories(c.categories);
    if (o.orders) setOrders(o.orders);
    if (b.banners) setBanners(b.banners);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const deleteProduct = async (id: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    await fetch('/api/shop/products', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    loadAll();
  };

  const deleteBanner = async (id: number) => {
    if (!confirm('배너를 삭제하시겠습니까?')) return;
    await fetch('/api/shop/banners', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    loadAll();
  };

  const updateOrderStatus = async (id: number, status: string) => {
    await fetch('/api/shop/orders', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
  };

  const toggleProp = async (p: Product, k: 'is_active' | 'is_new' | 'is_best' | 'is_featured') => {
    const updated = { ...p, [k]: !p[k] };
    setProducts(prev => prev.map(x => x.id === p.id ? updated : x));
    await fetch('/api/shop/products', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, [k]: !p[k] }) });
  };

  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  /* 통계 */
  const stats = {
    total: products.length,
    active: products.filter(p => p.is_active).length,
    orders: orders.length,
    revenue: orders.filter(o => o.status !== 'cancel').reduce((a, o) => a + o.total_amount, 0),
  };

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'products', label: '🛍 상품 관리', count: stats.total },
    { id: 'banners', label: '🖼 배너 관리', count: banners.length },
    { id: 'orders', label: '📦 주문 관리', count: orders.length },
    { id: 'categories', label: '📂 카테고리' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-gray-900">🛒 쇼핑몰 관리</h1>
            <p className="text-sm text-gray-500 mt-0.5">상품·배너·주문·카테고리를 통합 관리합니다</p>
          </div>
          <a href="/shops" target="_blank" className="text-sm text-blue-500 hover:text-blue-700 font-medium border border-blue-200 px-4 py-2 rounded-lg hover:bg-blue-50 transition">
            🔗 쇼핑몰 보기
          </a>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: '전체 상품', value: stats.total, sub: `판매중 ${stats.active}`, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: '배너', value: banners.filter(b => b.is_active).length, sub: `전체 ${banners.length}개`, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: '주문', value: stats.orders, sub: `취소 ${orders.filter(o => o.status === 'cancel').length}건`, color: 'text-orange-600', bg: 'bg-orange-50' },
            { label: '총 매출', value: `${(stats.revenue / 10000).toFixed(0)}만원`, sub: '취소 제외', color: 'text-green-600', bg: 'bg-green-50' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-4 border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">{s.label}</p>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* 탭 */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex border-b border-gray-100">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 py-3.5 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${tab === t.id ? 'border-b-2 border-blue-500 text-blue-600 bg-blue-50/50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                {t.label}
                {t.count !== undefined && <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>{t.count}</span>}
              </button>
            ))}
          </div>

          <div className="p-5">

            {/* ── 상품 관리 ── */}
            {tab === 'products' && <>
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="상품명 검색..."
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                <button onClick={() => setEditProduct(null)}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition whitespace-nowrap">
                  + 상품 등록
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-gray-100 text-left text-xs text-gray-400 font-semibold">
                      <th className="pb-3 pr-4">상품</th>
                      <th className="pb-3 pr-4">가격</th>
                      <th className="pb-3 pr-4">재고</th>
                      <th className="pb-3 pr-4">카테고리</th>
                      <th className="pb-3 pr-4 text-center">판매</th>
                      <th className="pb-3 pr-4 text-center">신상</th>
                      <th className="pb-3 pr-4 text-center">베스트</th>
                      <th className="pb-3 pr-4 text-center">추천</th>
                      <th className="pb-3">관리</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {filtered.map(p => (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden relative shrink-0">
                                {p.thumbnail_url ? <Image src={p.thumbnail_url} alt="" fill className="object-cover" /> : <div className="w-full h-full flex items-center justify-center text-lg text-gray-300">📦</div>}
                              </div>
                              <span className="font-medium text-gray-900 line-clamp-1 max-w-[140px]">{p.name}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 whitespace-nowrap">
                            <span className={p.sale_price ? 'text-red-500 font-bold' : 'font-bold'}>{(p.sale_price ?? p.price).toLocaleString()}원</span>
                            {p.sale_price && <p className="text-xs text-gray-400 line-through">{p.price.toLocaleString()}원</p>}
                          </td>
                          <td className="py-3 pr-4"><span className={`text-xs font-bold ${p.stock > 0 ? 'text-green-600' : 'text-red-500'}`}>{p.stock}개</span></td>
                          <td className="py-3 pr-4"><span className="text-xs text-gray-500">{p.shop_categories?.name ?? '-'}</span></td>
                          {(['is_active','is_new','is_best','is_featured'] as const).map(k => (
                            <td key={k} className="py-3 pr-4 text-center">
                              <Toggle on={!!p[k]} onChange={() => toggleProp(p, k)} />
                            </td>
                          ))}
                          <td className="py-3">
                            <div className="flex items-center gap-1">
                              <button onClick={() => setEditProduct(p)} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition font-medium">수정</button>
                              <button onClick={() => deleteProduct(p.id)} className="px-2 py-1 text-xs bg-red-50 text-red-500 rounded hover:bg-red-100 transition font-medium">삭제</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length === 0 && <div className="text-center py-12 text-gray-400"><p className="text-3xl mb-2">📭</p><p>상품이 없습니다</p></div>}
                </div>
              )}
            </>}

            {/* ── 배너 관리 ── */}
            {tab === 'banners' && <>
              <div className="flex justify-end mb-4">
                <button onClick={() => setEditBanner(null)} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition">+ 배너 추가</button>
              </div>
              <div className="space-y-3">
                {banners.map(b => (
                  <div key={b.id} className="border border-gray-100 rounded-xl overflow-hidden flex flex-col sm:flex-row">
                    <div className="w-full sm:w-48 h-24 relative shrink-0" style={{ background: b.bg_color }}>
                      {b.image_url && <Image src={b.image_url} alt="" fill className="object-cover opacity-50" />}
                      <div className="relative z-10 h-full flex flex-col items-center justify-center text-center p-3" style={{ color: b.text_color }}>
                        {b.badge_text && <span className="text-[9px] bg-white/20 px-1.5 py-0.5 rounded-full font-bold mb-0.5">{b.badge_text}</span>}
                        <p className="text-sm font-black leading-tight">{b.title}</p>
                        <p className="text-[10px] opacity-70">{b.subtitle}</p>
                      </div>
                    </div>
                    <div className="flex-1 flex items-center justify-between p-4">
                      <div>
                        <p className="font-semibold text-gray-900">{b.title}</p>
                        {b.link_url && <p className="text-xs text-gray-400 mt-0.5">{b.link_url}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.is_active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{b.is_active ? '표시중' : '숨김'}</span>
                          <span className="text-xs text-gray-400">순서 {b.sort_order}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setEditBanner(b)} className="px-3 py-1.5 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition font-medium">수정</button>
                        <button onClick={() => deleteBanner(b.id)} className="px-3 py-1.5 text-xs bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition font-medium">삭제</button>
                      </div>
                    </div>
                  </div>
                ))}
                {banners.length === 0 && <div className="text-center py-16 text-gray-400"><p className="text-4xl mb-2">🖼</p><p>배너가 없습니다. 추가해보세요!</p></div>}
              </div>
            </>}

            {/* ── 주문 관리 ── */}
            {tab === 'orders' && <div className="space-y-3">
              {orders.map(o => {
                const s = STATUS[o.status as keyof typeof STATUS] ?? { label: o.status, color: 'bg-gray-100 text-gray-600' };
                return (
                  <div key={o.id} className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3 cursor-pointer hover:bg-gray-50 transition" onClick={() => setExpandedOrder(expandedOrder === o.id ? null : o.id)}>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${s.color}`}>{s.label}</span>
                        <div>
                          <p className="font-semibold text-sm text-gray-900">{o.order_no}</p>
                          <p className="text-xs text-gray-400">{o.shipping_name} · {o.shipping_phone} · {new Date(o.created_at).toLocaleDateString('ko-KR')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ml-auto">
                        <p className="font-black text-gray-900">{o.total_amount.toLocaleString()}원</p>
                        <select value={o.status} onChange={e => { e.stopPropagation(); updateOrderStatus(o.id, e.target.value); }}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none cursor-pointer">
                          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                        <span className="text-gray-300 text-lg">{expandedOrder === o.id ? '▲' : '▼'}</span>
                      </div>
                    </div>
                    {expandedOrder === o.id && (
                      <div className="border-t border-gray-100 bg-gray-50 p-4">
                        <div className="space-y-1">
                          {o.shop_order_items?.map((item, i) => (
                            <div key={i} className="flex justify-between text-sm">
                              <span className="text-gray-700">{item.product_name} × {item.qty}</span>
                              <span className="font-medium">{(item.price * item.qty).toLocaleString()}원</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {orders.length === 0 && <div className="text-center py-16 text-gray-400"><p className="text-4xl mb-2">📭</p><p>주문이 없습니다</p></div>}
            </div>}

            {/* ── 카테고리 관리 ── */}
            {tab === 'categories' && <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {categories.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{c.icon ?? '📂'}</span>
                      <div>
                        <p className="font-semibold text-gray-900">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.slug}</p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">#{c.sort_order}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-4 text-center">카테고리 추가/수정은 Supabase에서 직접 관리하세요</p>
            </>}
          </div>
        </div>
      </div>

      {/* 모달 */}
      {editProduct !== undefined && (
        <ProductModal cats={categories} product={editProduct} onClose={() => setEditProduct(undefined)} onSaved={() => { setEditProduct(undefined); loadAll(); }} />
      )}
      {editBanner !== undefined && (
        <BannerModal banner={editBanner} onClose={() => setEditBanner(undefined)} onSaved={() => { setEditBanner(undefined); loadAll(); }} />
      )}
    </div>
  );
}
