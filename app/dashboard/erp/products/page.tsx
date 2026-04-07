'use client';

import React, { useState, useEffect } from 'react';
import Modal from '@/components/erp/Modal';
import { notionQuery, notionCreate, notionUpdate, notionDelete, DB_PRODUCTS, DB_QUOTES, DB_PURCHASE_ORDERS, RT, TITLE, FILES, uploadFile, num, select } from '@/lib/notion-erp';
import AIAssistant from '@/components/erp/AIAssistant';
import AIResultModal from '@/components/erp/AIResultModal';
import { AIAnalysisResult, ProductData } from '@/lib/aiService';
import AreaChart from '@/components/erp/AreaChart';

interface FileData {
    url: string;
    name: string;
}

export default function ProductsPage() {
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
    const [uploading, setUploading] = useState<string | null>(null);
    const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
    const [isNameDuplicate, setIsNameDuplicate] = useState(false);

    const [aiResults, setAiResults] = useState<AIAnalysisResult | null>(null);
    const [showAiModal, setShowAiModal] = useState(false);

    const [form, setForm] = useState<any>({
        code: '', name: '', category: '', cost: 0, currency: 'KRW',
        maker: '', supplier: '', detail: '',
        inputA: '', outputV: '', outputA: '', material: '', size: '', converter: '',
        image: null, fileSpec: null, fileEMI: null, fileEfficiency: null, fileKSKC: null, fileEtc: null
    });

    const [exchangeRates, setExchangeRates] = useState<any>({ USD: 1450, CNY: 200 });
    const [exchangeHistory, setExchangeHistory] = useState<any>(null);

    useEffect(() => {
        fetchProducts();
        fetchExchangeRates();
    }, []);

    const fetchExchangeRates = async () => {
        try {
            const res = await fetch('/api/exchange-rates');
            const data = await res.json();
            if (data.rates) setExchangeRates(data.rates);
            if (data.history) setExchangeHistory(data.history);
        } catch (e) {
            console.error('Exchange rates load failed', e);
        }
    };

    async function fetchProducts() {
        try {
            setLoading(true);
            const res = await notionQuery(DB_PRODUCTS, { sorts: [{ property: 'ProductCode', direction: 'ascending' }] });
            setProducts(res.results);
        } catch (e) {
            console.error('제품 로드 실패:', e);
        } finally {
            setLoading(false);
        }
    }

    const generateNextProductCode = () => {
        const year = new Date().getFullYear().toString().slice(-2);
        const prefix = `P${year}-`;
        const relevantCodes = products
            .map(p => p.properties.ProductCode?.rich_text?.[0]?.plain_text || '')
            .filter(code => code.startsWith(prefix));
        if (relevantCodes.length === 0) return `${prefix}001`;
        const indices = relevantCodes
            .map(code => parseInt(code.replace(prefix, '')))
            .filter(idx => !isNaN(idx));
        const nextIdx = indices.length > 0 ? Math.max(...indices) + 1 : 1;
        return `${prefix}${String(nextIdx).padStart(3, '0')}`;
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setUploading(field);
            const data = await uploadFile(file);
            setForm({ ...form, [field]: data });
        } catch (err) {
            alert('업로드 실패');
        } finally {
            setUploading(null);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = form.name.trim();
        const isDuplicateName = products.some(p => {
            const existingName = (p.properties.ProductName?.rich_text?.[0]?.plain_text || '').trim();
            if (selectedProduct && p.id === selectedProduct.id) return false;
            return existingName === trimmedName;
        });
        if (isDuplicateName) {
            alert(`'${trimmedName}'은(는) 이미 등록된 제품 명칭입니다. 중복된 이름은 사용할 수 없습니다.`);
            return;
        }
        try {
            await saveProductToNotion(form, selectedProduct?.id);
            setIsModalOpen(false);
            fetchProducts();
            alert('제품 정보가 노션에 저장되었습니다.');
        } catch (err: any) {
            alert('오류: ' + err.message);
        }
    };

    const saveProductToNotion = async (data: any, id?: string) => {
        const getF = (val: any) => {
            if (!val) return FILES('');
            if (typeof val === 'string') return FILES(val);
            return FILES(val.url, val.name);
        };
        const props = {
            '이름': TITLE(data.code || data.name),
            'ProductCode': RT(data.code),
            'ProductName': RT(data.name),
            'ProductCategory': RT(data.category),
            'Cost': num(data.cost),
            'Currency': RT(data.currency || 'KRW'),
            'Maker': RT(data.maker),
            'Supplier': RT(data.supplier),
            'Detail': RT(data.detail),
            'InputA': RT(data.inputA),
            'OutputV': RT(data.outputV),
            'OutputA': RT(data.outputA),
            'Material': RT(data.material),
            'Size': RT(data.size),
            'Converter': RT(data.converter),
            'Image': getF(data.image),
            'FileSpec': getF(data.fileSpec),
            'FileEMI': getF(data.fileEMI),
            'FileEfficiency': getF(data.fileEfficiency),
            'FileKSKC': getF(data.fileKSKC),
            'FileEtc': getF(data.fileEtc)
        };
        if (id) await notionUpdate(id, props);
        else await notionCreate(DB_PRODUCTS, props);
    };

    const [priceHistory, setPriceHistory] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    const fetchPriceHistory = async (productName: string) => {
        try {
            setLoadingHistory(true);
            const [poRes, qRes] = await Promise.all([
                notionQuery(DB_PURCHASE_ORDERS),
                notionQuery(DB_QUOTES)
            ]);
            const history: any[] = [];
            poRes.results.forEach((r: any) => {
                const p = r.properties;
                if (p.Product?.rich_text?.[0]?.plain_text === productName) {
                    history.push({
                        date: p.Date?.date?.start || '-',
                        type: 'INBOUND',
                        partner: p.Supplier?.rich_text?.[0]?.plain_text || '-',
                        price: p.UnitPrice?.number || 0,
                        currency: p.Unit?.select?.name || 'KRW',
                        remarks: p.Remarks?.rich_text?.[0]?.plain_text || ''
                    });
                }
            });
            qRes.results.forEach((r: any) => {
                const p = r.properties;
                if (p.Product?.rich_text?.[0]?.plain_text === productName) {
                    history.push({
                        date: p.Date?.date?.start || '-',
                        type: 'OUTBOUND',
                        partner: p.Client?.rich_text?.[0]?.plain_text || '-',
                        price: p.UnitPrice?.number || 0,
                        currency: p.Currency?.select?.name || 'KRW',
                        remarks: p.Remarks?.rich_text?.[0]?.plain_text || ''
                    });
                }
            });
            history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setPriceHistory(history);
        } catch (e) {
            console.error('History load failed:', e);
        } finally {
            setLoadingHistory(false);
        }
    };

    const openModal = (p?: any) => {
        if (p) {
            setSelectedProduct(p);
            const props = p.properties;
            const pName = props.ProductName?.rich_text?.[0]?.plain_text || '';
            setForm({
                code: props.ProductCode?.rich_text?.[0]?.plain_text || '',
                name: pName,
                category: props.ProductCategory?.rich_text?.[0]?.plain_text || '',
                cost: props.Cost?.number || 0,
                currency: props.Currency?.rich_text?.[0]?.plain_text || 'KRW',
                maker: props.Maker?.rich_text?.[0]?.plain_text || '',
                supplier: props.Supplier?.rich_text?.[0]?.plain_text || '',
                detail: props.Detail?.rich_text?.[0]?.plain_text || '',
                inputA: props.InputA?.rich_text?.[0]?.plain_text || '',
                outputV: props.OutputV?.rich_text?.[0]?.plain_text || '',
                outputA: props.OutputA?.rich_text?.[0]?.plain_text || '',
                material: props.Material?.rich_text?.[0]?.plain_text || '',
                size: props.Size?.rich_text?.[0]?.plain_text || '',
                converter: props.Converter?.rich_text?.[0]?.plain_text || '',
                image: props.Image?.files?.[0]?.external?.url || props.Image?.files?.[0]?.file?.url || '',
                fileSpec: props.FileSpec?.files?.[0]?.external?.url || props.FileSpec?.files?.[0]?.file?.url || '',
                fileEMI: props.FileEMI?.files?.[0]?.external?.url || props.FileEMI?.files?.[0]?.file?.url || '',
                fileEfficiency: props.FileEfficiency?.files?.[0]?.external?.url || props.FileEfficiency?.files?.[0]?.file?.url || '',
                fileKSKC: props.FileKSKC?.files?.[0]?.external?.url || props.FileKSKC?.files?.[0]?.file?.url || '',
                fileEtc: props.FileEtc?.files?.[0]?.external?.url || props.FileEtc?.files?.[0]?.file?.url || ''
            });
            fetchPriceHistory(pName);
        } else {
            setSelectedProduct(null);
            setPriceHistory([]);
            setIsNameDuplicate(false);
            setNameSuggestions([]);
            setForm({
                code: generateNextProductCode(),
                name: '', category: '', cost: 0, currency: 'KRW',
                maker: '', supplier: '', detail: '',
                inputA: '', outputV: '', outputA: '', material: '', size: '', converter: '',
                image: null, fileSpec: null, fileEMI: null, fileEfficiency: null, fileKSKC: null, fileEtc: null
            });
        }
        setIsModalOpen(true);
    };

    const getUrl = (val: any) => (typeof val === 'string' ? val : val?.url);

    const handleAIComplete = (result: AIAnalysisResult) => {
        setAiResults(result);
        setShowAiModal(true);
    };

    const handleBatchRegister = async (selectedProducts: ProductData[]) => {
        try {
            if (!confirm(`${selectedProducts.length}개의 제품을 등록하시겠습니까?`)) return;
            const year = new Date().getFullYear().toString().slice(-2);
            const prefix = `P${year}-`;
            const relevantCodes = products
                .map(p => p.properties.ProductCode?.rich_text?.[0]?.plain_text || '')
                .filter(code => code.startsWith(prefix));
            let nextIndex = 1;
            if (relevantCodes.length > 0) {
                const indices = relevantCodes
                    .map(code => parseInt(code.replace(prefix, '')))
                    .filter(idx => !isNaN(idx));
                nextIndex = indices.length > 0 ? Math.max(...indices) + 1 : 1;
            }
            let successCount = 0;
            for (const prod of selectedProducts) {
                const generatedCode = `${prefix}${String(nextIndex).padStart(3, '0')}`;
                nextIndex++;
                const formData = {
                    code: generatedCode,
                    name: prod.name || 'AI 추출 제품',
                    category: prod.category || '',
                    cost: prod.price || 0,
                    maker: prod.manufacturer || '',
                    supplier: '',
                    detail: (prod.model ? `추출 모델명/사양: ${prod.model}\n` : '') + (prod.specs || '') + (prod.notes ? `\n\n${prod.notes}` : ''),
                    inputA: '', outputV: '', outputA: '', material: '', size: '', converter: '',
                    image: null, fileSpec: null, fileEMI: null, fileEfficiency: null, fileKSKC: null, fileEtc: null
                };
                await saveProductToNotion(formData);
                successCount++;
            }
            alert(`${successCount}개 제품 등록 완료!`);
            setShowAiModal(false);
            fetchProducts();
        } catch (e) {
            console.error(e);
            alert('일괄 등록 중 오류가 발생했습니다.');
        }
    };

    return (
        <div style={{ paddingLeft: '280px', minHeight: '100vh', position: 'relative' }}>
            <AIAssistant onAnalyzeComplete={handleAIComplete} />
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 2rem' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.5rem' }}>제품 관리</h2>
                        <p style={{ color: 'rgba(255, 255, 255, 0.5)' }}>노션 DB 연동 스펙 및 인증서 통합 관리</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ position: 'relative', width: '300px' }}>
                            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }}>🔍</span>
                            <input
                                placeholder="제품명, 코드, 제조사, 사양 검색..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{ width: '100%', padding: '0.75rem 0.75rem 0.75rem 2.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', fontSize: '0.9rem' }}
                            />
                        </div>
                        <button onClick={() => openModal()} style={{ background: 'linear-gradient(135deg, #0070f3, #6c5ce7)', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '12px', color: 'white', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            + 제품 등록
                        </button>
                    </div>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                    {loading ? (
                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '5rem', opacity: 0.5 }}>로딩 중...</div>
                    ) : products.filter(p => {
                        const props = p.properties;
                        const name = (props.ProductName?.rich_text?.[0]?.plain_text || props.이름?.title?.[0]?.plain_text || '').toLowerCase();
                        const code = (props.ProductCode?.rich_text?.[0]?.plain_text || '').toLowerCase();
                        const category = (props.ProductCategory?.rich_text?.[0]?.plain_text || '').toLowerCase();
                        const maker = (props.Maker?.rich_text?.[0]?.plain_text || '').toLowerCase();
                        const converter = (props.Converter?.rich_text?.[0]?.plain_text || '').toLowerCase();
                        const s = search.toLowerCase();
                        return name.includes(s) || code.includes(s) || category.includes(s) || maker.includes(s) || converter.includes(s);
                    }).sort((a, b) => {
                        const propsA = a.properties;
                        const propsB = b.properties;
                        const nameA = (propsA.ProductName?.rich_text?.[0]?.plain_text || propsA.이름?.title?.[0]?.plain_text || '').toLowerCase();
                        const nameB = (propsB.ProductName?.rich_text?.[0]?.plain_text || propsB.이름?.title?.[0]?.plain_text || '').toLowerCase();
                        const s = search.toLowerCase();
                        if (nameA === s && nameB !== s) return -1;
                        if (nameB === s && nameA !== s) return 1;
                        if (nameA.startsWith(s) && !nameB.startsWith(s)) return -1;
                        if (nameB.startsWith(s) && !nameA.startsWith(s)) return 1;
                        return 0;
                    }).map(p => {
                        const props = p.properties;
                        const img = props.Image?.files?.[0]?.external?.url || props.Image?.files?.[0]?.file?.url;
                        return (
                            <div key={p.id} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem', cursor: 'pointer', overflow: 'hidden' }} onClick={() => openModal(p)}>
                                <div style={{ height: '200px', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {img ? <img src={img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '3rem', opacity: 0.1 }}>📦</span>}
                                </div>
                                <div style={{ padding: '1.25rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#0070f3', fontWeight: 700 }}>{props.ProductCode?.rich_text?.[0]?.plain_text || 'NO-CODE'}</span>
                                        <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>{props.Maker?.rich_text?.[0]?.plain_text}</span>
                                    </div>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '4px' }}>{props.ProductName?.rich_text?.[0]?.plain_text || '이름 없음'}</h3>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)' }}>{props.ProductCategory?.rich_text?.[0]?.plain_text || '분류 미정'}</p>
                                        <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#00ff88' }}>{props.Cost?.number?.toLocaleString()}원</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedProduct ? "제품 상세 정보" : "신규 제품 등록"} size="xl">
                    <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '2.5rem', maxHeight: '85vh', overflowY: 'auto', paddingRight: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ height: '240px', background: 'rgba(0,0,0,0.2)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                                {getUrl(form.image) ? <img src={getUrl(form.image)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: '4rem', opacity: 0.1 }}>🖼️</span>}
                                <label style={{ position: 'absolute', right: '12px', bottom: '12px', background: '#0070f3', padding: '8px', borderRadius: '50%', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
                                    📤<input type="file" hidden onChange={e => handleFileUpload(e, 'image')} />
                                </label>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px' }}>
                                <div style={{ fontSize: '0.8rem', opacity: 0.5, display: 'flex', alignItems: 'center' }}>제품 코드</div>
                                <input readOnly placeholder="자동 발급" value={form.code} style={{ width: '100%', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', padding: '0.6rem', color: 'rgba(255,255,255,0.5)', cursor: 'not-allowed' }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', position: 'relative' }}>
                                <div style={{ fontSize: '0.8rem', opacity: 0.5, display: 'flex', alignItems: 'center' }}>제품 명칭</div>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        placeholder="LED 조명..."
                                        required
                                        value={form.name}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setForm({ ...form, name: val });
                                            if (val.trim()) {
                                                const matches = products
                                                    .map(p => p.properties.ProductName?.rich_text?.[0]?.plain_text || '')
                                                    .filter(name => {
                                                        if (selectedProduct && name === selectedProduct.properties.ProductName?.rich_text?.[0]?.plain_text) return false;
                                                        return name.toLowerCase().includes(val.toLowerCase());
                                                    })
                                                    .slice(0, 5);
                                                setNameSuggestions(matches);
                                                setIsNameDuplicate(matches.some(m => m.trim() === val.trim()));
                                            } else {
                                                setNameSuggestions([]);
                                                setIsNameDuplicate(false);
                                            }
                                        }}
                                        style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${isNameDuplicate ? '#ff4d4d' : 'rgba(255,255,255,0.1)'}`, borderRadius: '10px', padding: '0.6rem', color: 'white', outline: 'none', transition: 'border-color 0.2s' }}
                                    />
                                    {isNameDuplicate && <div style={{ color: '#ff4d4d', fontSize: '0.7rem', marginTop: '4px', paddingLeft: '4px', fontWeight: 600 }}>⚠️ 이미 존재하는 제품 명칭입니다.</div>}
                                    {!isNameDuplicate && nameSuggestions.length > 0 && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', marginTop: '5px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
                                            <div style={{ padding: '8px 12px', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>유사한 이름을 가진 기존 제품:</div>
                                            {nameSuggestions.map((name, idx) => (
                                                <div key={idx} style={{ padding: '8px 12px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', borderBottom: idx === nameSuggestions.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.03)' }}>
                                                    <span>{name}</span>
                                                    <span style={{ fontSize: '0.7rem', opacity: 0.4 }}>이미 등록됨</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px' }}>
                                <div style={{ fontSize: '0.8rem', opacity: 0.5, display: 'flex', alignItems: 'center' }}>카테고리</div>
                                <input placeholder="LED" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.6rem', color: 'white' }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px' }}>
                                <div style={{ fontSize: '0.8rem', opacity: 0.5, display: 'flex', alignItems: 'center' }}>제조원/공급원</div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input placeholder="제조사" value={form.maker} onChange={e => setForm({ ...form, maker: e.target.value })} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.6rem', color: 'white' }} />
                                    <input placeholder="공급사" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.6rem', color: 'white' }} />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px' }}>
                                <div style={{ fontSize: '0.8rem', opacity: 0.5, display: 'flex', alignItems: 'center' }}>단가 관리</div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} style={{ width: '80px', background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.6rem', color: 'white' }}>
                                        <option value="KRW">KRW</option>
                                        <option value="USD">USD</option>
                                        <option value="CNY">CNY</option>
                                        <option value="RMB">RMB</option>
                                    </select>
                                    <input type="number" value={form.cost} onChange={e => setForm({ ...form, cost: Number(e.target.value) })} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.6rem', color: 'white' }} />
                                </div>
                            </div>
                            {form.currency !== 'KRW' && (
                                <div style={{ marginLeft: '130px', background: 'rgba(0,112,243,0.1)', padding: '10px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#0070f3', fontWeight: 700 }}>원화 환산 (예상)</span>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 800 }}>₩{(form.cost * (exchangeRates[form.currency === 'RMB' ? 'CNY' : form.currency] || 1)).toLocaleString()}</span>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>상세 기술 사양</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <input placeholder="입력전류" value={form.inputA} onChange={e => setForm({ ...form, inputA: e.target.value })} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.5rem', fontSize: '0.8rem', color: 'white' }} />
                                    <input placeholder="출력전압" value={form.outputV} onChange={e => setForm({ ...form, outputV: e.target.value })} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.5rem', fontSize: '0.8rem', color: 'white' }} />
                                    <input placeholder="출력전류" value={form.outputA} onChange={e => setForm({ ...form, outputA: e.target.value })} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.5rem', fontSize: '0.8rem', color: 'white' }} />
                                    <input placeholder="재질" value={form.material} onChange={e => setForm({ ...form, material: e.target.value })} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.5rem', fontSize: '0.8rem', color: 'white' }} />
                                    <input placeholder="치수" value={form.size} onChange={e => setForm({ ...form, size: e.target.value })} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.5rem', fontSize: '0.8rem', color: 'white' }} />
                                    <input placeholder="컨버터유무" value={form.converter} onChange={e => setForm({ ...form, converter: e.target.value })} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.5rem', fontSize: '0.8rem', color: 'white' }} />
                                </div>
                                <textarea placeholder="기타 상세 설명" value={form.detail} onChange={e => setForm({ ...form, detail: e.target.value })} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.5rem', color: 'white', height: '60px', fontSize: '0.8rem' }} />
                            </div>

                            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, paddingLeft: '4px' }}>인증서 및 문서</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                {[
                                    { id: 'fileSpec', label: '성적서/스펙' },
                                    { id: 'fileEMI', label: 'EMI/EMC' },
                                    { id: 'fileEfficiency', label: '효율시험' },
                                    { id: 'fileKSKC', label: 'KS/KC인증' },
                                    { id: 'fileEtc', label: '기타문서' }
                                ].map(f => (
                                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>{f.label}</div>
                                            <div style={{ fontSize: '0.65rem', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form[f.id]?.name || (form[f.id] ? '파일 있음' : '미등록')}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            {getUrl(form[f.id]) && <button type="button" onClick={() => window.open(getUrl(form[f.id]), '_blank')} style={{ color: '#0070f3', background: 'none', border: 'none', cursor: 'pointer' }}>👁️</button>}
                                            <label style={{ cursor: 'pointer', background: uploading === f.id ? '#444' : 'rgba(255,255,255,0.1)', padding: '5px', borderRadius: '6px' }}>
                                                📤<input type="file" hidden onChange={e => handleFileUpload(e, f.id)} />
                                            </label>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                                <button type="button" onClick={() => setIsModalOpen(false)} style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer' }}>취소</button>
                                <button type="submit" disabled={!!uploading} style={{ flex: 2, padding: '0.8rem', borderRadius: '12px', background: 'linear-gradient(135deg, #0070f3, #6c5ce7)', border: 'none', color: 'white', fontWeight: 700, boxShadow: '0 4px 15px rgba(0,112,243,0.3)', cursor: 'pointer' }}>제품 정보 저장</button>
                            </div>
                        </div>

                        <div style={{ gridColumn: '1 / -1', marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                            <div>
                                <h4 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    📈 최근 1년 원가 추이 (환율 반영)
                                </h4>
                                {exchangeHistory && (form.currency === 'USD' || form.currency === 'CNY' || form.currency === 'RMB') ? (
                                    <div style={{ height: '200px', background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '16px' }}>
                                        <AreaChart
                                            data={exchangeHistory[form.currency === 'RMB' ? 'CNY' : form.currency].map((h: any) => ({ name: h.date, value: h.value * form.cost }))}
                                            color="#00dfd8"
                                            height={150}
                                        />
                                        <p style={{ textAlign: 'center', fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginTop: '8px' }}>
                                            기준 단가 {form.cost} {form.currency} 적용 일자별 환산 원가 (KRW)
                                        </p>
                                    </div>
                                ) : (
                                    <div style={{ height: '200px', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)' }}>
                                        KRW 기준이거나 환율 데이터가 없습니다.
                                    </div>
                                )}
                            </div>
                            <div>
                                <h4 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    ⚡ 단가 변동 및 견적 추적 (Price Trace)
                                </h4>
                                {loadingHistory ? (
                                    <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>히스토리 로딩 중...</div>
                                ) : priceHistory.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '2rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', color: 'rgba(255,255,255,0.3)', fontSize: '0.9rem' }}>
                                        등록된 매입/매출 견적 히스토리가 없습니다.
                                    </div>
                                ) : (
                                    <div style={{ overflow: 'hidden', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                            <thead>
                                                <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left', color: 'rgba(255,255,255,0.5)' }}>
                                                    <th style={{ padding: '10px' }}>일자</th>
                                                    <th style={{ padding: '10px' }}>구분</th>
                                                    <th style={{ padding: '10px' }}>업체/고객명</th>
                                                    <th style={{ padding: '10px', textAlign: 'right' }}>단가</th>
                                                    <th style={{ padding: '10px' }}>비고</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {priceHistory.map((h, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                        <td style={{ padding: '10px' }}>{h.date}</td>
                                                        <td style={{ padding: '10px' }}>
                                                            <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, background: h.type === 'INBOUND' ? 'rgba(0,112,243,0.1)' : 'rgba(0,255,136,0.1)', color: h.type === 'INBOUND' ? '#0070f3' : '#00ff88' }}>
                                                                {h.type === 'INBOUND' ? '매입(중국)' : '매출(고객)'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '10px', fontWeight: 600 }}>{h.partner}</td>
                                                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800 }}>
                                                            {h.currency === 'RMB' ? '¥' : h.currency === 'USD' ? '$' : '₩'}{h.price.toLocaleString()}
                                                        </td>
                                                        <td style={{ padding: '10px', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>{h.remarks}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    </form>
                </Modal>

                {aiResults && (
                    <AIResultModal
                        isOpen={showAiModal}
                        onClose={() => setShowAiModal(false)}
                        results={aiResults.products}
                        onConfirm={handleBatchRegister}
                        confidence={aiResults.confidence}
                        source={aiResults.source}
                    />
                )}
            </div>
        </div>
    );
}
