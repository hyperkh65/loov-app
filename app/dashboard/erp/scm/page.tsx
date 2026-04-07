'use client';

import React, { useState, useEffect } from 'react';
import { notionQuery, notionCreate, DB_PRODUCTS, DB_INVENTORY, DB_SALES, RT, num, dateISO, select, FILES } from '@/lib/notion-erp';
import ProductPicker from '@/components/erp/ProductPicker';
import Modal from '@/components/erp/Modal';

export default function SCMPage() {
    const [inventory, setInventory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [movementType, setMovementType] = useState<'입고' | '기타출고'>('입고');
    const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
    const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null);

    const [movement, setMovement] = useState({
        productId: '',
        productData: null as any,
        qty: 0,
        warehouse: '주요 창고 A',
        notes: '',
        date: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        fetchInventory();
    }, []);

    async function fetchInventory() {
        try {
            setLoading(true);
            const productRes = await notionQuery(DB_PRODUCTS, { sorts: [{ property: 'ProductName', direction: 'ascending' }] });
            const allProducts = productRes.results.map((r: any) => ({
                id: r.id,
                name: r.properties.ProductName?.rich_text?.[0]?.plain_text || r.properties.ProductName?.title?.[0]?.plain_text || '이름 없음',
                code: r.properties.ProductCode?.rich_text?.[0]?.plain_text || '-',
                category: r.properties.Category?.rich_text?.[0]?.plain_text || '미지정',
                image: r.properties.Image?.files?.[0]?.external?.url || r.properties.Image?.files?.[0]?.file?.url,
                detail: r.properties.Detail?.rich_text?.[0]?.plain_text || '-',
                maker: r.properties.Maker?.rich_text?.[0]?.plain_text || '-',
                supplier: r.properties.Supplier?.rich_text?.[0]?.plain_text || '-',
                cost: r.properties.Cost?.number || 0,
            }));

            const movementRes = await notionQuery(DB_INVENTORY);
            const salesRes = await notionQuery(DB_SALES);

            const inMap: Record<string, number> = {};
            const etcMap: Record<string, number> = {};
            const salesMap: Record<string, number> = {};

            movementRes.results.forEach((r: any) => {
                const p = r.properties;
                const name = p.ProductName?.rich_text?.[0]?.plain_text || p.이름?.title?.[0]?.plain_text;
                if (!name) return;
                inMap[name] = (inMap[name] || 0) + (p.Qty?.number || 0);
                etcMap[name] = (etcMap[name] || 0) + (p.etcqty?.number || 0);
            });

            salesRes.results.forEach((r: any) => {
                const p = r.properties;
                const name = p.Items?.rich_text?.[0]?.plain_text;
                if (!name) return;
                salesMap[name] = (salesMap[name] || 0) + (p.Quantity?.number || 0);
            });

            const data = allProducts
                .map((p: any) => {
                    const totalIn = inMap[p.name] || 0;
                    const totalEtc = etcMap[p.name] || 0;
                    const totalSales = salesMap[p.name] || 0;
                    return {
                        ...p,
                        totalIn,
                        totalEtc,
                        totalSales,
                        stock: totalIn - totalEtc - totalSales,
                        hasHistory: !!inMap[p.name]
                    };
                })
                .filter((p: any) => p.hasHistory);

            setInventory(data);
        } catch (e) {
            console.error('재고 로드 실패:', e);
        } finally {
            setLoading(false);
        }
    }

    const handleMovementSave = async () => {
        if (!movement.productId) return alert('제품을 선택하세요.');
        if (movement.qty <= 0) return alert('수량을 입력하세요.');

        try {
            const p = movement.productData;
            const props: any = {
                이름: { title: [{ text: { content: `${p.name}_${new Date().getTime()}` } }] },
                ProductCode: RT(p.code),
                ProductName: RT(p.name),
                Warehouse: RT(movement.warehouse),
                Date: dateISO(movement.date),
                notes: RT(movement.notes)
            };

            if (p.image) props.Image = FILES(p.image);

            if (movementType === '입고') props.Qty = num(movement.qty);
            else if (movementType === '기타출고') props.etcqty = num(movement.qty);

            await notionCreate(DB_INVENTORY, props);

            alert(`${movementType} 데이터가 저장되었습니다.`);
            setIsMovementModalOpen(false);
            setMovement({ productId: '', productData: null, qty: 0, warehouse: '주요 창고 A', notes: '', date: new Date().toISOString().split('T')[0] });
            fetchInventory();
        } catch (e: any) {
            alert('저장 실패: ' + e.message);
        }
    };

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.5rem' }}>물류 / 재고 관리</h2>
                    <p style={{ color: 'rgba(255, 255, 255, 0.5)' }}>영업 매출과 연동된 실시간 입출고 현황</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button onClick={() => { setMovementType('입고'); setIsMovementModalOpen(true); }} style={{ background: 'linear-gradient(135deg, #0070f3, #6c5ce7)', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '12px', color: 'white', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        + 입고 등록
                    </button>
                    <button onClick={() => { setMovementType('기타출고'); setIsMovementModalOpen(true); }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.75rem 1.5rem', borderRadius: '12px', color: 'white', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        🚚 기타 출고
                    </button>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem' }}>
                <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <th style={{ padding: '1rem 0.75rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>품명 / 코드</th>
                                <th style={{ padding: '1rem 0.75rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>현재 재고</th>
                                <th style={{ padding: '1rem 0.75rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', textAlign: 'center' }}>상세</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={3} style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>로딩 중...</td></tr>
                            ) : inventory.length === 0 ? (
                                <tr><td colSpan={3} style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>입고 이력이 있는 제품이 없습니다.</td></tr>
                            ) : inventory.map((item) => (
                                <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}>
                                    <td style={{ padding: '1.25rem 0.75rem' }}>
                                        <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '2px' }}>{item.name}</p>
                                        <p style={{ fontSize: '0.75rem', color: '#0070f3' }}>{item.code}</p>
                                    </td>
                                    <td style={{ padding: '1.25rem 0.75rem' }}>
                                        <span style={{ fontSize: '1.2rem', fontWeight: 800, color: item.stock < 5 ? '#ff4d4d' : '#00ff88' }}>
                                            {item.stock.toLocaleString()} 개
                                        </span>
                                    </td>
                                    <td style={{ padding: '1.25rem 0.75rem', textAlign: 'center' }}>
                                        <button
                                            onClick={() => setSelectedProduct(item)}
                                            style={{ padding: '6px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '0.75rem', cursor: 'pointer' }}
                                        >
                                            내역보기
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', color: '#00ff88' }}>재고 요약</h3>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>총 관리 품목</span>
                            <span style={{ fontSize: '1.5rem', fontWeight: 900 }}>{inventory.length} <span style={{ fontSize: '0.9rem', fontWeight: 400, opacity: 0.5 }}>SKU</span></span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Inbound/Etc Movement Modal */}
            <Modal isOpen={isMovementModalOpen} onClose={() => setIsMovementModalOpen(false)} title={`${movementType} 등록`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>제품 선택 *</label>
                        <button onClick={() => setIsProductPickerOpen(true)} style={{ width: '100%', textAlign: 'left', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white', cursor: 'pointer' }}>
                            {movement.productData?.name || '제품을 검색하여 선택하세요'}
                            {movement.productData?.code && <span style={{ marginLeft: '10px', color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>({movement.productData.code})</span>}
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>{movementType} 수량</label>
                            <input type="number" value={movement.qty} onChange={e => setMovement({ ...movement, qty: Number(e.target.value) })} style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>날짜</label>
                            <input type="date" value={movement.date} onChange={e => setMovement({ ...movement, date: e.target.value })} style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white', colorScheme: 'dark' }} />
                        </div>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>비고 (Notes)</label>
                        <textarea value={movement.notes} onChange={e => setMovement({ ...movement, notes: e.target.value })} style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white', minHeight: '80px' }} />
                    </div>
                    <button onClick={handleMovementSave} style={{ width: '100%', background: 'linear-gradient(135deg, #0070f3, #6c5ce7)', padding: '1rem', borderRadius: '12px', border: 'none', color: 'white', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', marginTop: '1rem' }}>저장하기</button>
                </div>
            </Modal>

            {/* Product Detail Modal */}
            <Modal isOpen={!!selectedProduct} onClose={() => setSelectedProduct(null)} title="제품 상세 및 재고 내역" size="lg">
                {selectedProduct && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '2.5rem' }}>
                        <div>
                            <div style={{ width: '100%', aspectRatio: '1/1', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '1.5rem', fontSize: '4rem' }}>
                                {selectedProduct.image ? (
                                    <img src={selectedProduct.image} alt={selectedProduct.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                ) : (
                                    '📦'
                                )}
                            </div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '4px' }}>{selectedProduct.name}</h3>
                            <p style={{ color: '#0070f3', fontWeight: 600 }}>{selectedProduct.code}</p>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                                <div style={{ background: 'rgba(0, 255, 136, 0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(0, 255, 136, 0.1)' }}>
                                    <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>총 입고</p>
                                    <p style={{ fontSize: '1.2rem', fontWeight: 800, color: '#00ff88' }}>+{selectedProduct.totalIn} 개</p>
                                </div>
                                <div style={{ background: 'rgba(255, 77, 73, 0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255, 77, 73, 0.1)' }}>
                                    <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>판매 출고</p>
                                    <p style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ff4d49' }}>-{selectedProduct.totalSales} 개</p>
                                </div>
                                <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                    <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>기타 출고</p>
                                    <p style={{ fontSize: '1.2rem', fontWeight: 800 }}>-{selectedProduct.totalEtc} 개</p>
                                </div>
                            </div>

                            <div style={{ background: 'linear-gradient(135deg, #0070f3, #6c5ce7)', padding: '1.25rem', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>현재 최종 가용 재고</span>
                                <span style={{ fontSize: '1.8rem', fontWeight: 900 }}>{selectedProduct.stock.toLocaleString()} <span style={{ fontSize: '1rem', fontWeight: 400 }}>PCS</span></span>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.25rem', borderRadius: '16px' }}>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '10px', color: 'rgba(255,255,255,0.5)' }}>제품 상세 사양</h4>
                                <p style={{ fontSize: '0.95rem', lineHeight: '1.6' }}>{selectedProduct.detail}</p>
                                <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)' }}>
                                    <span>카테고리: {selectedProduct.category}</span>
                                    <span>제조사: {selectedProduct.maker}</span>
                                    <span>가격: ₩{selectedProduct.cost.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            <ProductPicker isOpen={isProductPickerOpen} onClose={() => setIsProductPickerOpen(false)} onSelect={(p: any) => { setMovement({ ...movement, productId: p.id, productData: p }); setIsProductPickerOpen(false); }} />
        </div>
    );
}
