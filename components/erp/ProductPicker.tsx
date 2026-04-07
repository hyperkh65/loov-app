'use client';

import React, { useState, useEffect } from 'react';
import { notionQuery, DB_PRODUCTS } from '@/lib/notion-erp';
import Modal from './Modal';

interface Product {
    id: string;
    code: string;
    name: string;
    category: string;
    maker: string;
    supplier: string;
    detail: string;
    cost: number;
    material: string;
    size: string;
    converter: string;
    image: string;
    voltage?: string;
    watts?: string;
    luminousEff?: string;
    lumenOutput?: string;
    cct?: string;
    specFiles?: { name: string; url: string }[];
    isInventory?: boolean;
}

interface ProductPickerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (product: Product) => void;
}

export default function ProductPicker({ isOpen, onClose, onSelect }: ProductPickerProps) {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    useEffect(() => {
        if (isOpen) fetchProducts();
    }, [isOpen]);

    async function fetchProducts() {
        try {
            setLoading(true);
            const res = await notionQuery(DB_PRODUCTS, {
                sorts: [{ property: 'ProductName', direction: 'ascending' }],
            });
            const data = res.results.map((r: any) => {
                const p = r.properties;
                const specFiles: { name: string; url: string }[] = [];
                ['FileSpec', 'FileEMI', 'FileEfficiency', 'FileKSKC', 'FileEtc'].forEach(key => {
                    const fileList = p[key]?.files || [];
                    fileList.forEach((f: any) => {
                        specFiles.push({ name: f.name || key, url: f.external?.url || f.file?.url });
                    });
                });
                return {
                    id: r.id,
                    code: p.ProductCode?.rich_text?.[0]?.plain_text || '-',
                    name: p.ProductName?.rich_text?.[0]?.plain_text || p['이름']?.title?.[0]?.plain_text || '이름 없음',
                    category: p.Category?.rich_text?.[0]?.plain_text || '',
                    maker: p.Maker?.rich_text?.[0]?.plain_text || '',
                    supplier: p.Supplier?.rich_text?.[0]?.plain_text || '',
                    detail: p.Detail?.rich_text?.[0]?.plain_text || '',
                    cost: p.Cost?.number || 0,
                    material: p.Material?.rich_text?.[0]?.plain_text || '',
                    size: p.Size?.rich_text?.[0]?.plain_text || '',
                    converter: p.Converter?.rich_text?.[0]?.plain_text || '',
                    image: p.Image?.files?.[0]?.external?.url || p.Image?.files?.[0]?.file?.url || '',
                    voltage: p.Voltage?.rich_text?.[0]?.plain_text || '-',
                    watts: p.Watts?.rich_text?.[0]?.plain_text || '-',
                    luminousEff: p.LuminousEff?.rich_text?.[0]?.plain_text || '-',
                    lumenOutput: p.LumenOutput?.rich_text?.[0]?.plain_text || '-',
                    cct: p.CCT?.rich_text?.[0]?.plain_text || '-',
                    specFiles,
                    isInventory: p.InventoryTarget?.checkbox === true
                };
            });
            setProducts(data);
        } catch (e) {
            console.error('제품 로드 실패:', e);
        } finally {
            setLoading(false);
        }
    }

    const filtered = products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.code.toLowerCase().includes(search.toLowerCase()) ||
        p.category.toLowerCase().includes(search.toLowerCase()) ||
        p.maker.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title="제품 선택" size="lg">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <input
                        placeholder="제품명 또는 코드 검색..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.6rem 1rem', borderRadius: '8px', color: 'white' }}
                    />
                    {loading ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>제품 정보를 불러오는 중...</div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', maxHeight: '500px', overflowY: 'auto' }}>
                            {filtered.map(p => (
                                <div
                                    key={p.id}
                                    onClick={() => { setSelectedProduct(p); setIsDetailModalOpen(true); }}
                                    style={{ padding: '12px', borderRadius: '12px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)', display: 'flex', gap: '12px', alignItems: 'center' }}
                                >
                                    <div style={{ width: '60px', height: '60px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {p.image ? <img src={p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1.5rem' }}>📦</span>}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                                        <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', margin: '2px 0 0 0' }}>{p.code}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>

            <Modal isOpen={isDetailModalOpen} onClose={() => setIsDetailModalOpen(false)} title="제품 상세 확인">
                {selectedProduct && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', gap: '1.5rem' }}>
                            <div style={{ width: '150px', height: '150px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {selectedProduct.image ? <img src={selectedProduct.image} alt={selectedProduct.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '3rem' }}>📦</span>}
                            </div>
                            <div style={{ flex: 1 }}>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', margin: '0 0 0.5rem' }}>{selectedProduct.name}</h3>
                                <p style={{ color: '#0070f3', fontWeight: 600, margin: '0 0 1rem' }}>{selectedProduct.code}</p>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>
                                    <span>제조사: <span style={{ color: '#fff' }}>{selectedProduct.maker || '-'}</span></span>
                                    <span>단가: <span style={{ color: '#fff' }}>₩{selectedProduct.cost.toLocaleString()}</span></span>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button onClick={() => setIsDetailModalOpen(false)} style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>닫기</button>
                            <button
                                onClick={() => { onSelect(selectedProduct); setIsDetailModalOpen(false); onClose(); }}
                                style={{ flex: 2, padding: '0.8rem', borderRadius: '12px', background: 'linear-gradient(135deg, #0070f3, #6c5ce7)', color: 'white', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                            >
                                이 제품으로 선택
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </>
    );
}
