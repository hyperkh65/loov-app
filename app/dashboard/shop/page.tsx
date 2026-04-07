'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Category { id: number; name: string; slug: string; parent_id: number | null; sort_order: number; }
interface Product {
  id: number; name: string; price: number; sale_price: number | null;
  thumbnail_url: string | null; is_active: boolean; is_new: boolean; is_best: boolean; is_featured: boolean;
  stock: number; category_id: number | null;
  shop_categories?: { name: string };
}
interface Order { id: number; order_no: string; status: string; total_amount: number; created_at: string; shipping_name: string; shipping_phone: string; shop_order_items: { product_name: string; qty: number; price: number }[]; }

type Tab = 'products' | 'categories' | 'orders';
const STATUS_OPTIONS = ['pending','paid','shipping','done','cancel'];
const STATUS_LABELS: Record<string, string> = { pending:'입금대기', paid:'결제완료', shipping:'배송중', done:'배송완료', cancel:'취소' };

// ── 상품 모달 ──────────────────────────────────────────────────────
function ProductModal({ cats, product, onClose, onSaved }: {
  cats: Category[];
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: product?.name ?? '',
    price: product?.price ?? 0,
    sale_price: product?.sale_price ?? '',
    stock: product?.stock ?? 0,
    category_id: product?.category_id ?? '',
    thumbnail_url: product?.thumbnail_url ?? '',
    description: '',
    is_active: product?.is_active ?? true,
    is_new: product?.is_new ?? false,
    is_best: product?.is_best ?? false,
    is_featured: product?.is_featured ?? false,
    options: '',
    specs: '',
  });
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 상품 상세 로드
  useEffect(() => {
    if (!product) return;
    fetch(`/api/shop/products/${product.id}`).then(r => r.json()).then(d => {
      const p = d.product;
      if (!p) return;
      setForm(f => ({
        ...f,
        description: p.description ?? '',
        options: p.options?.length ? JSON.stringify(p.options, null, 2) : '',
        specs: Object.keys(p.specs ?? {}).length ? JSON.stringify(p.specs, null, 2) : '',
      }));
      setImages(p.shop_product_images?.map((i: { url: string }) => i.url) ?? []);
    });
  }, [product]);

  const up = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name || !form.price) { setError('상품명과 가격은 필수입니다'); return; }
    setSaving(true); setError('');
    try {
      let parsedOptions = [];
      let parsedSpecs = {};
      try { if (form.options) parsedOptions = JSON.parse(form.options); } catch { setError('옵션 JSON 형식 오류'); setSaving(false); return; }
      try { if (form.specs) parsedSpecs = JSON.parse(form.specs); } catch { setError('스펙 JSON 형식 오류'); setSaving(false); return; }

      const slug = form.name.toLowerCase().replace(/[^a-z0-9가-힣]/g, '-').replace(/-+/g, '-') + '-' + Date.now();
      const body = {
        ...form,
        price: Number(form.price),
        sale_price: form.sale_price !== '' ? Number(form.sale_price) : null,
        stock: Number(form.stock),
        category_id: form.category_id !== '' ? Number(form.category_id) : null,
        options: parsedOptions,
        specs: parsedSpecs,
        images,
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
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl my-8 shadow-2xl">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold">{product ? '상품 수정' : '상품 등록'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl">×</button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">상품명 *</label>
              <input value={form.name} onChange={e => up('name', e.target.value)} placeholder="상품명" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">정가 *</label>
              <input type="number" value={form.price} onChange={e => up('price', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">판매가 (할인)</label>
              <input type="number" value={form.sale_price} onChange={e => up('sale_price', e.target.value)} placeholder="할인 없으면 비워두세요" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">재고</label>
              <input type="number" value={form.stock} onChange={e => up('stock', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">카테고리</label>
              <select value={form.category_id} onChange={e => up('category_id', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white">
                <option value="">카테고리 없음</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">썸네일 URL</label>
              <input value={form.thumbnail_url} onChange={e => up('thumbnail_url', e.target.value)} placeholder="https://..." className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">추가 이미지 URL (한 줄에 하나씩)</label>
              <textarea value={images.join('\n')} onChange={e => setImages(e.target.value.split('\n').filter(Boolean))} rows={3} placeholder="https://..." className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">상품 설명</label>
              <textarea value={form.description} onChange={e => up('description', e.target.value)} rows={4} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">옵션 (JSON)</label>
              <textarea value={form.options} onChange={e => up('options', e.target.value)} rows={3} placeholder={`[{"name":"색상","values":["화이트","블랙"]}]`} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-blue-500 resize-none" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">스펙 (JSON)</label>
              <textarea value={form.specs} onChange={e => up('specs', e.target.value)} rows={3} placeholder={`{"와트":"20W","색온도":"3000K"}`} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-blue-500 resize-none" />
            </div>
            <div className="col-span-2 flex flex-wrap gap-4">
              {(['is_active','is_new','is_best','is_featured'] as const).map(k => (
                <label key={k} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form[k]} onChange={e => up(k, e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-600" />
                  <span className="text-sm text-gray-700">{{ is_active:'판매중', is_new:'신상품', is_best:'베스트', is_featured:'추천' }[k]}</span>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-red-500 text-sm p-2 bg-red-50 rounded-lg">{error}</p>}
        </div>
        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-5 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors">취소</button>
          <button onClick={save} disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 카테고리 모달 ──────────────────────────────────────────────────
function CatModal({ cats, cat, onClose, onSaved }: { cats: Category[]; cat: Category | null; onClose: () => void; onSaved: () => void; }) {
  const [form, setForm] = useState({ name: cat?.name ?? '', slug: cat?.slug ?? '', parent_id: cat?.parent_id ?? '', sort_order: cat?.sort_order ?? 0 });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const slug = form.slug || form.name.toLowerCase().replace(/[^a-z0-9가-힣]/g, '-').replace(/-+/g, '-');
    await fetch('/api/shop/categories', {
      method: cat ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, slug, parent_id: form.parent_id || null, ...(cat ? { id: cat.id } : {}) }),
    });
    setSaving(false); onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold">{cat ? '카테고리 수정' : '카테고리 추가'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl">×</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">이름 *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">슬러그 (URL)</label>
            <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="자동 생성 (비워두면 이름으로 생성)" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">상위 카테고리</label>
            <select value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value ? Number(e.target.value) : '' })) } className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500">
              <option value="">최상위 (없음)</option>
              {cats.filter(c => !cat || c.id !== cat.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">정렬 순서</label>
            <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
        </div>
        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-5 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">취소</button>
          <button onClick={save} disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────
export default function ShopAdminPage() {
  const [tab, setTab] = useState<Tab>('products');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // 모달 상태
  const [productModal, setProductModal] = useState<{ open: boolean; product: Product | null }>({ open: false, product: null });
  const [catModal, setCatModal] = useState<{ open: boolean; cat: Category | null }>({ open: false, cat: null });

  const loadCategories = useCallback(async () => {
    const d = await fetch('/api/shop/categories').then(r => r.json());
    setCategories(d.categories ?? []);
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ admin: '1', limit: '100' });
    if (search) params.set('q', search);
    const d = await fetch(`/api/shop/products?${params}`).then(r => r.json());
    setProducts(d.products ?? []);
    setLoading(false);
  }, [search]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const d = await fetch('/api/shop/orders?admin=1').then(r => r.json());
    setOrders(d.orders ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => {
    if (tab === 'products') loadProducts();
    if (tab === 'orders') loadOrders();
  }, [tab, loadProducts, loadOrders]);

  async function deleteProduct(id: number) {
    if (!confirm('상품을 삭제할까요?')) return;
    await fetch('/api/shop/products', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    loadProducts();
  }

  async function deleteCat(id: number) {
    if (!confirm('카테고리를 삭제할까요?')) return;
    await fetch('/api/shop/categories', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    loadCategories();
  }

  async function updateOrderStatus(id: number, status: string) {
    await fetch('/api/shop/orders', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
    loadOrders();
  }

  const stats = {
    total: products.length,
    active: products.filter(p => p.is_active).length,
    pendingOrders: orders.filter(o => o.status === 'pending').length,
    revenue: orders.filter(o => o.status !== 'cancel').reduce((a, o) => a + o.total_amount, 0),
  };

  return (
    <div className="p-4 md:p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-slate-900">🛍️ 쇼핑몰 관리</h1>
        <Link href="/shop" target="_blank" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
          쇼핑몰 보기 ↗
        </Link>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: '전체 상품', value: stats.total, icon: '📦', color: 'bg-blue-50 text-blue-700' },
          { label: '판매 중', value: stats.active, icon: '✅', color: 'bg-green-50 text-green-700' },
          { label: '입금 대기', value: stats.pendingOrders, icon: '⏳', color: 'bg-orange-50 text-orange-700' },
          { label: '총 매출', value: stats.revenue.toLocaleString() + '원', icon: '💰', color: 'bg-violet-50 text-violet-700' },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl p-4 ${s.color}`}>
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="text-xl font-black">{s.value}</div>
            <div className="text-xs opacity-70 font-medium mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {([['products','📦 상품'],['categories','🗂 카테고리'],['orders','📋 주문']] as const).map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── 상품 탭 ── */}
      {tab === 'products' && (
        <>
          <div className="flex gap-3 mb-4">
            <input value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadProducts()}
              placeholder="상품 검색..."
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500" />
            <button onClick={loadProducts} className="px-4 py-2 bg-gray-100 rounded-xl text-sm hover:bg-gray-200 transition-colors">검색</button>
            <button onClick={() => setProductModal({ open: true, product: null })}
              className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
              + 상품 추가
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({length:5}).map((_,i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">상품</th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">카테고리</th>
                    <th className="text-right px-4 py-3">가격</th>
                    <th className="text-center px-4 py-3 hidden md:table-cell">재고</th>
                    <th className="text-center px-4 py-3 hidden md:table-cell">상태</th>
                    <th className="text-center px-4 py-3">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {products.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                            {p.thumbnail_url ? <img src={p.thumbnail_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-lg text-gray-300">💡</div>}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 truncate max-w-[180px]">{p.name}</p>
                            <div className="flex gap-1 mt-0.5">
                              {p.is_new && <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded">NEW</span>}
                              {p.is_best && <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded">BEST</span>}
                              {p.is_featured && <span className="text-[10px] bg-purple-100 text-purple-600 px-1 rounded">추천</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-gray-500 text-xs">{p.shop_categories?.name ?? '-'}</td>
                      <td className="px-4 py-3 text-right">
                        {p.sale_price ? (
                          <div>
                            <p className="font-bold text-gray-900">{p.sale_price.toLocaleString()}원</p>
                            <p className="text-xs text-gray-400 line-through">{p.price.toLocaleString()}원</p>
                          </div>
                        ) : <p className="font-bold text-gray-900">{p.price.toLocaleString()}원</p>}
                      </td>
                      <td className="px-4 py-3 text-center hidden md:table-cell">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{p.stock}</span>
                      </td>
                      <td className="px-4 py-3 text-center hidden md:table-cell">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {p.is_active ? '판매중' : '비활성'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => setProductModal({ open: true, product: p })} className="text-xs text-blue-600 hover:underline">수정</button>
                          <button onClick={() => deleteProduct(p.id)} className="text-xs text-red-500 hover:underline">삭제</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {products.length === 0 && <div className="text-center py-12 text-gray-400 text-sm">상품이 없습니다</div>}
            </div>
          )}
        </>
      )}

      {/* ── 카테고리 탭 ── */}
      {tab === 'categories' && (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={() => setCatModal({ open: true, cat: null })}
              className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
              + 카테고리 추가
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-3">이름</th>
                  <th className="text-left px-4 py-3">슬러그</th>
                  <th className="text-left px-4 py-3">상위</th>
                  <th className="text-center px-4 py-3">정렬</th>
                  <th className="text-center px-4 py-3">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {categories.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">{c.slug}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{c.parent_id ? categories.find(x => x.id === c.parent_id)?.name ?? '-' : '-'}</td>
                    <td className="px-4 py-3 text-center text-gray-500">{c.sort_order}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => setCatModal({ open: true, cat: c })} className="text-xs text-blue-600 hover:underline">수정</button>
                        <button onClick={() => deleteCat(c.id)} className="text-xs text-red-500 hover:underline">삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {categories.length === 0 && <div className="text-center py-12 text-gray-400 text-sm">카테고리가 없습니다</div>}
          </div>
        </>
      )}

      {/* ── 주문 탭 ── */}
      {tab === 'orders' && (
        loading ? <div className="space-y-2">{Array.from({length:5}).map((_,i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div> : (
          <div className="space-y-4">
            {orders.length === 0 && <div className="text-center py-16 text-gray-400 text-sm">주문이 없습니다</div>}
            {orders.map(order => (
              <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start justify-between mb-3 gap-3">
                  <div>
                    <p className="font-bold text-gray-900">{order.order_no}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{order.created_at.slice(0, 16).replace('T', ' ')}</p>
                    <p className="text-sm text-gray-600 mt-1">{order.shipping_name} · {order.shipping_phone}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={order.status}
                      onChange={e => updateOrderStatus(order.id, e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-blue-500">
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </div>
                </div>
                <div className="text-xs text-gray-600 space-y-0.5 mb-3">
                  {order.shop_order_items?.map((item, i) => (
                    <p key={i}>{item.product_name} x{item.qty} — {(item.price * item.qty).toLocaleString()}원</p>
                  ))}
                </div>
                <div className="border-t border-gray-100 pt-2 text-right">
                  <span className="font-black text-blue-600">{order.total_amount.toLocaleString()}원</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* 모달 */}
      {productModal.open && (
        <ProductModal
          cats={categories}
          product={productModal.product}
          onClose={() => setProductModal({ open: false, product: null })}
          onSaved={() => { setProductModal({ open: false, product: null }); loadProducts(); }}
        />
      )}
      {catModal.open && (
        <CatModal
          cats={categories}
          cat={catModal.cat}
          onClose={() => setCatModal({ open: false, cat: null })}
          onSaved={() => { setCatModal({ open: false, cat: null }); loadCategories(); }}
        />
      )}
    </div>
  );
}
