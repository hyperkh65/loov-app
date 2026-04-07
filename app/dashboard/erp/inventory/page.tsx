'use client';

import React, { useState, useEffect } from 'react';
import Modal from '@/components/erp/Modal';
import { notionQuery, notionCreate, DB_INVENTORY, DB_PRODUCTS, RT, TITLE, num, dateISO } from '@/lib/notion-erp';

interface InventoryItem {
    pageId: string;
    productName: string;
    productCode: string;
    qty: number;
    location: string;
    lastUpdated: string;
    fullSpec?: any;
}

export default function InventoryPage() {
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

    const [form, setForm] = useState({
        productName: '',
        productCode: '',
        qty: 0,
        location: '본사 창고'
    });

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        try {
            setLoading(true);
            const [invRes, prodRes] = await Promise.all([
                notionQuery(DB_INVENTORY),
                notionQuery(DB_PRODUCTS)
            ]);

            setProducts(prodRes.results);

            const data = invRes.results.map((r: any) => {
                const prodName = r.properties.ProductName?.title?.[0]?.plain_text || 'Unknown';
                const prodDetail = prodRes.results.find((p: any) => p.properties.ProductName.title[0].plain_text === prodName);

                return {
                    pageId: r.id,
                    productName: prodName,
                    productCode: r.properties.ProductCode?.rich_text?.[0]?.plain_text || '-',
                    qty: r.properties.Qty?.number || 0,
                    location: r.properties.Location?.select?.name || '-',
                    lastUpdated: r.last_edited_time.split('T')[0],
                    fullSpec: prodDetail?.properties
                };
            });
            setInventory(data);
        } catch (e) {
            console.error('재고 데이터 로드 실패:', e);
        } finally {
            setLoading(false);
        }
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await notionCreate(DB_INVENTORY, {
                ProductName: TITLE(form.productName),
                ProductCode: RT(form.productCode),
                Qty: num(form.qty),
                Location: { select: { name: form.location } }
            });
            setIsModalOpen(false);
            fetchData();
            alert('재고가 등록되었습니다.');
        } catch (err: any) {
            alert('오류: ' + err.message);
        }
    };

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.5rem' }}>물류 재고 관리</h2>
                    <p style={{ color: 'rgba(255, 255, 255, 0.5)' }}>제품 관리 DB 연동 및 상세 스펙 모달 조회</p>
                </div>
                <button onClick={() => setIsModalOpen(true)} style={{ background: 'linear-gradient(135deg, #0070f3, #6c5ce7)', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '12px', color: 'white', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    + 신규 재고 등록
                </button>
            </header>

            <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>
                                <th style={{ padding: '1rem' }}>제품 코드</th>
                                <th style={{ padding: '1rem' }}>제품명</th>
                                <th style={{ padding: '1rem' }}>현재 재고</th>
                                <th style={{ padding: '1rem' }}>창고 위치</th>
                                <th style={{ padding: '1rem' }}>최종 업데이트</th>
                                <th style={{ padding: '1rem', width: '60px' }}>상세</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>로딩 중...</td></tr>
                            ) : inventory.map((inv) => (
                                <tr key={inv.pageId} onClick={() => setSelectedItem(inv)} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
                                    <td style={{ padding: '1.25rem 1rem', fontSize: '0.85rem', color: '#0070f3' }}>{inv.productCode}</td>
                                    <td style={{ padding: '1.25rem 1rem', fontWeight: 600 }}>{inv.productName}</td>
                                    <td style={{ padding: '1.25rem 1rem' }}>
                                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: inv.qty < 10 ? '#ff4d4d' : '#00ff88' }}>{inv.qty.toLocaleString()}</span>
                                    </td>
                                    <td style={{ padding: '1.25rem 1rem' }}>{inv.location}</td>
                                    <td style={{ padding: '1.25rem 1rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)' }}>{inv.lastUpdated}</td>
                                    <td style={{ padding: '1.25rem 1rem', opacity: 0.5 }}>ℹ️</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="신규 재고 등록">
                <form onSubmit={handleSave}>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.5rem' }}>등록된 제품 선택 *</label>
                        <select required value={form.productName} onChange={e => {
                            const p = products.find(prod => prod.properties.ProductName.title[0].plain_text === e.target.value);
                            setForm({
                                ...form,
                                productName: e.target.value,
                                productCode: p?.properties.ProductCode?.rich_text?.[0]?.plain_text || ''
                            });
                        }} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem', color: 'white' }}>
                            <option value="">-- 재고를 등록할 제품 선택 --</option>
                            {products.map(p => (
                                <option key={p.id} value={p.properties.ProductName.title[0].plain_text}>
                                    [{p.properties.ProductCode?.rich_text?.[0]?.plain_text}] {p.properties.ProductName.title[0].plain_text}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.5rem' }}>수량</label>
                            <input type="number" required value={form.qty} onChange={e => setForm({ ...form, qty: Number(e.target.value) })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem', color: 'white' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.5rem' }}>창고 위치</label>
                            <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem', color: 'white' }} />
                        </div>
                    </div>
                    <button type="submit" style={{ width: '100%', background: 'linear-gradient(135deg, #0070f3, #6c5ce7)', border: 'none', padding: '0.75rem', borderRadius: '12px', color: 'white', fontWeight: 600, cursor: 'pointer' }}>재고 확정</button>
                </form>
            </Modal>

            <Modal isOpen={!!selectedItem} onClose={() => setSelectedItem(null)} title="재고 제품 상세 정보">
                {selectedItem && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        <div>
                            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', overflow: 'hidden', fontSize: '4rem' }}>
                                {selectedItem.fullSpec?.Image?.files?.[0]?.external?.url ? <img src={selectedItem.fullSpec.Image.files[0].external.url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : '📦'}
                            </div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{selectedItem.productName}</h3>
                            <p style={{ color: '#0070f3' }}>{selectedItem.productCode}</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '12px' }}>
                                <p style={{ fontSize: '0.8rem', opacity: 0.5 }}>현재 재고량</p>
                                <p style={{ fontSize: '1.5rem', fontWeight: 900 }}>{selectedItem.qty} PCS</p>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '12px' }}>
                                <p style={{ fontSize: '0.8rem', opacity: 0.5 }}>제품 사양(Spec)</p>
                                <p style={{ fontSize: '0.9rem' }}>{selectedItem.fullSpec?.Spec?.rich_text?.[0]?.plain_text || '등록된 사양 없음'}</p>
                            </div>
                            <button onClick={() => setSelectedItem(null)} style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.1)', border: 'none', padding: '0.75rem', borderRadius: '10px', color: 'white', cursor: 'pointer' }}>닫기</button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
