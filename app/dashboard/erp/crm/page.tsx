'use client';

import React, { useState, useEffect } from 'react';
import Modal from '@/components/erp/Modal';
import ProductPicker from '@/components/erp/ProductPicker';
import QuotePicker from '@/components/erp/QuotePicker';
import {
    notionQuery, notionCreate, notionUpdate, notionDelete,
    isWithinCurrentMonth, validatePeriod,
    DB_SALES, DB_CLIENTS, DB_PRODUCTS,
    RT, TITLE, num, dateISO, select
} from '@/lib/notion-erp';
import { getSettings } from '@/lib/erp-settings';

interface SalesItem {
    id: string | number;
    product: string;
    specification: string;
    qty: number;
    unitPrice: number;
    amount: number;
}

interface SalesRecord {
    code: string;
    date: string;
    customer: string;
    saleType: string;
    salesperson: string;
    poNo: string;
    items: SalesItem[];
    netAmount: number;
    vat: number;
    totalAmount: number;
}

export default function SalesManagementPage() {
    const [sales, setSales] = useState<SalesRecord[]>([]);
    const [clients, setClients] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'list' | 'create' | 'print'>('list');

    const [searchTerm, setSearchTerm] = useState('');
    const [filterCustomer, setFilterCustomer] = useState('');
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');

    const [form, setForm] = useState<{
        code: string;
        date: string;
        customer: string;
        saleType: string;
        salesperson: string;
        poNo: string;
        vatEnabled: boolean;
        items: SalesItem[];
    }>({
        code: 'S' + new Date().toISOString().substring(0, 10).replace(/-/g, '') + '-001',
        date: new Date().toISOString().substring(0, 10),
        customer: '',
        saleType: '내자',
        salesperson: '',
        poNo: '',
        vatEnabled: true,
        items: [{
            id: Date.now() + Math.random(),
            product: '',
            specification: '',
            qty: 1,
            unitPrice: 0,
            amount: 0
        }]
    });

    const [printData, setPrintData] = useState<SalesRecord | null>(null);
    const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
    const [isQuotePickerOpen, setIsQuotePickerOpen] = useState(false);
    const [activeItemIdx, setActiveItemIdx] = useState<number | null>(null);
    const [company, setCompany] = useState(getSettings());

    useEffect(() => {
        fetchInitialData();
        setCompany(getSettings());
    }, []);

    async function fetchInitialData() {
        try {
            setLoading(true);
            const [sRes, cRes] = await Promise.all([
                notionQuery(DB_SALES(), { sorts: [{ property: 'Date', direction: 'descending' }] }),
                notionQuery(DB_CLIENTS())
            ]);

            const grouped: { [key: string]: SalesRecord } = {};
            sRes.results.forEach((r: any) => {
                const p = r.properties;
                const code = p.code?.rich_text?.[0]?.plain_text || p.Name?.title?.[0]?.plain_text || 'Unknown';

                if (!grouped[code]) {
                    grouped[code] = {
                        code,
                        date: p.Date?.date?.start || '-',
                        customer: p.Customer?.rich_text?.[0]?.plain_text || '-',
                        saleType: p.SaleType?.select?.name || '내자',
                        salesperson: p.Salesperson?.rich_text?.[0]?.plain_text || '-',
                        poNo: p.PoNo?.rich_text?.[0]?.plain_text || '-',
                        items: [],
                        netAmount: 0,
                        vat: 0,
                        totalAmount: 0
                    };
                }

                const qty = p.Quantity?.number || 0;
                const unitPrice = p.UnitPrice?.number || 0;
                const amount = p.Total?.number || (qty * unitPrice);

                grouped[code].items.push({
                    id: r.id,
                    product: p.Items?.rich_text?.[0]?.plain_text || '-',
                    specification: p.Specification?.rich_text?.[0]?.plain_text || '-',
                    qty,
                    unitPrice,
                    amount
                });

                grouped[code].netAmount += amount;
            });

            Object.values(grouped).forEach(record => {
                if (record.saleType === '내자') {
                    record.vat = Math.floor(record.netAmount * 0.1);
                    record.totalAmount = record.netAmount + record.vat;
                } else {
                    record.vat = 0;
                    record.totalAmount = record.netAmount;
                }
            });

            setSales(Object.values(grouped));
            setClients(cRes.results);

            const todayStr = new Date().toISOString().substring(0, 10).replace(/-/g, '');
            const todayPrefix = 'S' + todayStr;
            const existingCodes = Object.keys(grouped).filter(k => k.startsWith(todayPrefix));

            let nextSeq = 1;
            if (existingCodes.length > 0) {
                const seqs = existingCodes.map(c => parseInt(c.split('-')[1] || '0'));
                nextSeq = Math.max(...seqs) + 1;
            }

            setForm(prev => ({
                ...prev,
                code: `${todayPrefix}-${String(nextSeq).padStart(3, '0')}`
            }));
        } catch (e) {
            console.error('초기 데이터 로드 실패:', e);
        } finally {
            setLoading(false);
        }
    }

    const onQuoteSelect = (quote: any) => {
        const newItems: SalesItem[] = quote.items.map((it: any) => {
            const specParts = [
                it.description,
                it.voltage !== '-' ? it.voltage : '',
                it.watts !== '-' ? it.watts : '',
                it.luminousEff !== '-' ? it.luminousEff : '',
                it.lumenOutput !== '-' ? it.lumenOutput : '',
                it.cct !== '-' ? it.cct : ''
            ].filter(Boolean);
            return {
                id: Date.now() + Math.random(),
                product: it.product,
                specification: specParts.join(' / '),
                qty: it.qty,
                unitPrice: 0,
                amount: 0
            };
        });
        setForm(prev => ({ ...prev, customer: quote.client, items: newItems }));
        setIsQuotePickerOpen(false);
        setView('create');
        alert(`${quote.no} 견적 내용이 불러와졌습니다. (가격은 0으로 설정되었습니다)`);
    };

    const addItem = () => {
        setForm({
            ...form,
            items: [...form.items, {
                id: Date.now() + Math.random(),
                product: '',
                specification: '',
                qty: 1,
                unitPrice: 0,
                amount: 0
            }]
        });
    };

    const removeItem = (idx: number) => {
        if (form.items.length <= 1) return;
        setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
    };

    const updateItem = (idx: number, updates: Partial<SalesItem>) => {
        const newItems = [...form.items];
        newItems[idx] = { ...newItems[idx], ...updates };
        if (updates.qty !== undefined || updates.unitPrice !== undefined) {
            newItems[idx].amount = newItems[idx].qty * newItems[idx].unitPrice;
        }
        setForm({ ...form, items: newItems });
    };

    const calculateTotals = () => {
        const net = form.items.reduce((acc, it) => acc + it.amount, 0);
        const vat = form.vatEnabled && form.saleType === '내자' ? Math.floor(net * 0.1) : 0;
        return { net, vat, total: net + vat };
    };

    const handleCreateSales = async () => {
        if (!form.customer || form.items.some(it => !it.product)) {
            return alert('거래처와 품목 정보를 모두 입력하세요.');
        }
        try {
            setLoading(true);
            const { net, vat, total } = calculateTotals();
            const existingSale = sales.find(s => s.code === form.code);
            if (existingSale) {
                if (!confirm('해당 관리번호(' + form.code + ')로 이미 등록된 매출이 있습니다.\n기존 내용을 삭제하고 현재 내용으로 덮어쓰시겠습니까?')) {
                    setLoading(false);
                    return;
                }
                for (const oldItem of existingSale.items) {
                    await notionDelete(oldItem.id as string);
                }
            }
            for (let i = 0; i < form.items.length; i++) {
                const item = form.items[i];
                await notionCreate(DB_SALES(), {
                    Name: TITLE(form.code + '_' + (i + 1)),
                    code: RT(form.code),
                    Date: dateISO(form.date),
                    Customer: RT(form.customer),
                    Items: RT(item.product),
                    Specification: RT(item.specification),
                    SaleType: select(form.saleType),
                    ExchangeRate: num(1),
                    Quantity: num(item.qty),
                    UnitPrice: num(item.unitPrice),
                    Total: num(item.amount),
                    Salesperson: RT(form.salesperson),
                    PoNo: RT(form.poNo)
                });
            }
            alert('매출 ' + form.items.length + '건이 등록되었습니다.');
            setView('list');
            fetchInitialData();
            setForm(prev => ({
                ...prev,
                customer: '',
                poNo: '',
                items: [{ id: Date.now() + Math.random(), product: '', specification: '', qty: 1, unitPrice: 0, amount: 0 }]
            }));
        } catch (e: any) {
            alert('저장 실패: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = (s: SalesRecord) => {
        setPrintData(s);
        setCompany(getSettings());
        setView('print');
        setTimeout(() => window.print(), 500);
    };

    const filteredSales = sales.filter(s => {
        const matchesSearch = s.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.code.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCustomer = filterCustomer === '' || s.customer === filterCustomer;
        const matchesDate = (!filterStartDate || s.date >= filterStartDate) &&
            (!filterEndDate || s.date <= filterEndDate);
        return matchesSearch && matchesCustomer && matchesDate;
    });

    const totals = calculateTotals();

    if (view === 'print' && printData) {
        return (
            <div id="print-area" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', background: 'white', color: '#171717', fontFamily: '"Noto Sans KR", sans-serif', boxSizing: 'border-box', padding: '10mm', position: 'relative' }}>
                <style>{`
                    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;900&display=swap');
                    @media print {
                        body * { visibility: hidden !important; }
                        #print-area, #print-area * { visibility: visible !important; }
                        #print-area { position: absolute !important; left: 0 !important; top: 0 !important; width: 210mm !important; min-height: 297mm !important; margin: 0 !important; padding: 10mm !important; background: white !important; box-sizing: border-box !important; }
                        .no-print { display: none !important; }
                        @page { size: A4 portrait; margin: 0; }
                    }
                    .modern-table { width: 100%; border-collapse: collapse; margin-top: 30px; }
                    .modern-table th { text-align: center; border-top: 2px solid #171717; border-bottom: 1px solid #171717; padding: 12px 4px; font-size: 13px; font-weight: 700; color: #171717; background: #f9f9f9; }
                    .modern-table td { border-bottom: 1px solid #e5e5e5; padding: 12px 6px; font-size: 12px; color: #333; vertical-align: middle; }
                    .modern-table tr:last-child td { border-bottom: 1px solid #171717; }
                    .info-row { display: flex; justify-content: space-between; gap: 40px; margin-bottom: 30px; border-top: 1px solid #171717; border-bottom: 1px solid #171717; padding: 20px 0; }
                    .info-col { flex: 1; }
                    .info-header { margin-bottom: 15px; font-size: 14px; font-weight: 800; color: #171717; display: flex; align-items: center; gap: 8px; }
                    .info-body { font-size: 13px; line-height: 1.8; color: #444; }
                    .info-line { display: flex; margin-bottom: 4px; }
                    .info-label { width: 80px; color: #888; font-weight: 500; }
                    .info-value { flex: 1; font-weight: 600; color: #171717; }
                `}</style>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
                    <div style={{ width: '30%' }}>
                        {company.logoUrl && <img src={company.logoUrl} alt="Logo" style={{ height: '40px', objectFit: 'contain', display: 'block' }} />}
                    </div>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                        <h1 style={{ fontSize: '36px', fontWeight: 900, letterSpacing: '-1px', margin: '0 0 5px 0', color: '#171717' }}>거래명세표</h1>
                        <p style={{ fontSize: '12px', color: '#888', letterSpacing: '2px', textTransform: 'uppercase', margin: 0, fontWeight: 500 }}>Transaction Statement</p>
                    </div>
                    <div style={{ width: '30%', textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Document No.</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#171717' }}>{printData.code}</div>
                        <div style={{ fontSize: '13px', color: '#555', marginTop: '4px', fontWeight: 500 }}>{printData.date}</div>
                    </div>
                </div>
                <div className="info-row">
                    <div className="info-col">
                        <div className="info-header">
                            <span style={{ width: '8px', height: '8px', background: '#171717', borderRadius: '50%', display: 'inline-block' }}></span>
                            공급받는자 (Buyer)
                        </div>
                        <div className="info-body">
                            <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: '15px', color: '#171717' }}>{printData.customer} <span style={{ fontSize: '14px', fontWeight: 400 }}>귀하</span></div>
                            <div className="info-line"><span className="info-label">P.O No</span><span className="info-value">{printData.poNo || '-'}</span></div>
                            <div className="info-line"><span className="info-label">담당자</span><span className="info-value">{printData.salesperson || '-'}</span></div>
                        </div>
                    </div>
                    <div style={{ width: '1px', background: '#e5e5e5' }}></div>
                    <div className="info-col" style={{ paddingLeft: '20px' }}>
                        <div className="info-header">
                            <span style={{ width: '8px', height: '8px', background: '#171717', borderRadius: '50%', display: 'inline-block' }}></span>
                            공급자 (Seller)
                        </div>
                        <div className="info-body">
                            <div className="info-line"><span className="info-label">상호</span><span className="info-value">{company.name}</span></div>
                            <div className="info-line"><span className="info-label">대표자</span><span className="info-value">{company.ceo}</span></div>
                            <div className="info-line"><span className="info-label">등록번호</span><span className="info-value">{company.bizNo}</span></div>
                            <div className="info-line"><span className="info-label">주소</span><span className="info-value">{company.address}</span></div>
                            <div className="info-line"><span className="info-label">연락처</span><span className="info-value">{company.tel} / {company.fax}</span></div>
                        </div>
                    </div>
                </div>
                <table className="modern-table">
                    <thead>
                        <tr>
                            <th style={{ width: '5%' }}>No</th>
                            <th style={{ textAlign: 'left', paddingLeft: '15px' }}>품목 및 규격 (Description)</th>
                            <th style={{ width: '10%' }}>수량</th>
                            <th style={{ width: '13%', textAlign: 'right' }}>단가</th>
                            <th style={{ width: '15%', textAlign: 'right' }}>공급가액</th>
                            <th style={{ width: '12%', textAlign: 'center' }}>비고</th>
                        </tr>
                    </thead>
                    <tbody>
                        {printData.items.map((item, idx) => (
                            <tr key={idx}>
                                <td style={{ textAlign: 'center', color: '#888' }}>{idx + 1}</td>
                                <td style={{ paddingLeft: '15px' }}>
                                    <div style={{ fontWeight: 600, color: '#171717' }}>{item.product}</div>
                                    <div style={{ fontSize: '11px', color: '#888', marginTop: '3px' }}>{item.specification}</div>
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.qty.toLocaleString()}</td>
                                <td style={{ textAlign: 'right', color: '#555' }}>{item.unitPrice.toLocaleString()}</td>
                                <td style={{ textAlign: 'right', fontWeight: 700, color: '#171717' }}>{item.amount.toLocaleString()}</td>
                                <td style={{ textAlign: 'center', color: '#888', fontSize: '11px' }}>{printData.saleType}</td>
                            </tr>
                        ))}
                        {Array.from({ length: Math.max(0, 10 - printData.items.length) }).map((_, i) => (
                            <tr key={`empty-${i}`}><td style={{ padding: '15px' }}></td><td></td><td></td><td></td><td></td><td></td></tr>
                        ))}
                    </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                    <div style={{ width: '40%', background: '#f9f9f9', padding: '20px', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#555' }}>
                            <span>공급가액 (Net Amount)</span>
                            <span>₩{printData.netAmount.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', fontSize: '13px', color: '#555' }}>
                            <span>부가가치세 (VAT)</span>
                            <span>₩{printData.vat.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #171717', paddingTop: '15px', fontSize: '18px', fontWeight: 800, color: '#171717' }}>
                            <span>합계금액 (Total)</span>
                            <span>₩{printData.totalAmount.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                <div className="no-print" style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '15px', background: 'rgba(255,255,255,0.9)', padding: '10px 20px', borderRadius: '30px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', border: '1px solid rgba(0,0,0,0.1)' }}>
                    <button onClick={() => setView('list')} style={{ background: 'transparent', color: '#171717', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                        ◀ 목록으로
                    </button>
                    <div style={{ width: '1px', height: '20px', background: '#e5e5e5' }}></div>
                    <button onClick={() => window.print()} style={{ background: '#171717', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, padding: '8px 20px', borderRadius: '20px' }}>
                        🖨️ 인쇄하기
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1rem' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '0.5rem' }}>
                        <div style={{ padding: '8px', background: 'rgba(0, 255, 136, 0.1)', borderRadius: '10px' }}>
                            <span style={{ fontSize: '1.5rem' }}>📈</span>
                        </div>
                        <h2 style={{ fontSize: '2rem', fontWeight: 900, margin: 0 }}>매출 등록 시스템</h2>
                    </div>
                    <p style={{ color: 'rgba(255, 255, 255, 0.5)' }}>복수 품목 등록 및 부가세 자동 계산 지원</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button onClick={() => setIsQuotePickerOpen(true)} style={{ background: 'rgba(0,112,243,0.1)', border: '1px solid rgba(0,112,243,0.3)', padding: '0.8rem 1.5rem', borderRadius: '14px', color: '#0070f3', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        🛒 견적 불러오기 (자동입력)
                    </button>
                    {view === 'list' && (
                        <button
                            onClick={() => {
                                const todayStr = new Date().toISOString().substring(0, 10).replace(/-/g, '');
                                const todayPrefix = 'S' + todayStr;
                                const existingCodes = sales.map(s => s.code).filter(k => k.startsWith(todayPrefix));
                                let nextSeq = 1;
                                if (existingCodes.length > 0) {
                                    const seqs = existingCodes.map(c => parseInt(c.split('-')[1] || '0'));
                                    nextSeq = Math.max(...seqs) + 1;
                                }
                                const newCode = `${todayPrefix}-${String(nextSeq).padStart(3, '0')}`;
                                setForm({
                                    code: newCode,
                                    date: new Date().toISOString().substring(0, 10),
                                    customer: '',
                                    saleType: '내자',
                                    salesperson: '',
                                    poNo: '',
                                    vatEnabled: true,
                                    items: [{ id: Date.now() + Math.random(), product: '', specification: '', qty: 1, unitPrice: 0, amount: 0 }]
                                });
                                setView('create');
                            }}
                            style={{ background: 'linear-gradient(135deg, #00ff88 0%, #00bd68 100%)', border: 'none', padding: '0.8rem 2rem', borderRadius: '14px', color: 'black', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(0, 255, 136, 0.2)', cursor: 'pointer' }}
                        >
                            + 신규 매출 등록
                        </button>
                    )}
                </div>
            </header>

            {view === 'create' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            📄 기본 정보
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>매출 코드 (등록번호)</label>
                                <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} style={{ width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', fontWeight: 700 }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>매출 일자</label>
                                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', colorScheme: 'dark' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>거래처</label>
                                <select value={form.customer} onChange={e => setForm({ ...form, customer: e.target.value })} style={{ width: '100%', padding: '0.8rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white' }}>
                                    <option value="">-- 거래처 선택 --</option>
                                    {clients.map(c => <option key={c.id} value={c.properties.ClientName?.title?.[0]?.plain_text}>{c.properties.ClientName?.title?.[0]?.plain_text}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>P.O No. / 담당자</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input value={form.poNo} onChange={e => setForm({ ...form, poNo: e.target.value })} placeholder="PO#" style={{ flex: 1, padding: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white' }} />
                                    <input value={form.salesperson} onChange={e => setForm({ ...form, salesperson: e.target.value })} placeholder="담당자" style={{ width: '80px', padding: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white' }} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                📦 매출 품목 상세
                            </h3>
                            <button onClick={addItem} style={{ background: 'rgba(0, 112, 243, 0.1)', border: '1px solid #0070f3', padding: '6px 15px', borderRadius: '8px', color: '#0070f3', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                                + 품목 추가
                            </button>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', textAlign: 'left' }}>
                                    <th style={{ padding: '10px' }}>제품명</th>
                                    <th style={{ padding: '10px' }}>규격 (Specification)</th>
                                    <th style={{ padding: '10px', width: '100px' }}>수량</th>
                                    <th style={{ padding: '10px', width: '150px' }}>단가</th>
                                    <th style={{ padding: '10px', width: '150px', textAlign: 'right' }}>금액</th>
                                    <th style={{ padding: '10px', width: '50px' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {form.items.map((item, idx) => (
                                    <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '12px 10px' }}>
                                            <button onClick={() => { setActiveItemIdx(idx); setIsProductPickerOpen(true); }} style={{ width: '100%', textAlign: 'left', padding: '0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: item.product ? 'white' : 'rgba(255,255,255,0.3)', fontSize: '0.9rem', cursor: 'pointer' }}>
                                                {item.product || '제품 선택...'}
                                            </button>
                                        </td>
                                        <td style={{ padding: '12px 10px' }}>
                                            <input value={item.specification} onChange={e => updateItem(idx, { specification: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }} />
                                        </td>
                                        <td style={{ padding: '12px 10px' }}>
                                            <input type="number" value={item.qty} onChange={e => updateItem(idx, { qty: Number(e.target.value) })} style={{ width: '100%', padding: '0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', textAlign: 'right' }} />
                                        </td>
                                        <td style={{ padding: '12px 10px' }}>
                                            <input type="number" value={item.unitPrice} onChange={e => updateItem(idx, { unitPrice: Number(e.target.value) })} style={{ width: '100%', padding: '0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', textAlign: 'right' }} />
                                        </td>
                                        <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 700, fontSize: '0.95rem' }}>
                                            ₩{item.amount.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '12px 10px' }}>
                                            <button onClick={() => removeItem(idx)} style={{ color: 'rgba(255,77,79,0.5)', border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', gap: '2rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>거래 구분</label>
                                    <select value={form.saleType} onChange={e => setForm({ ...form, saleType: e.target.value })} style={{ padding: '0.6rem 1.2rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white' }}>
                                        <option value="내자">내자 (VAT 10%)</option>
                                        <option value="외자">외자 (VAT 0%)</option>
                                    </select>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '25px' }}>
                                    <input type="checkbox" checked={form.vatEnabled} onChange={e => setForm({ ...form, vatEnabled: e.target.checked })} id="vat-toggle" />
                                    <label htmlFor="vat-toggle" style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>부가세 포함 계산</label>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', width: '300px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>공급가액 (Net)</span>
                                    <span style={{ fontWeight: 600 }}>₩{totals.net.toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>부가가치세 (VAT)</span>
                                    <span style={{ fontWeight: 600 }}>₩{totals.vat.toLocaleString()}</span>
                                </div>
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 800, color: '#00ff88' }}>총 합계 (GRAND TOTAL)</span>
                                    <span style={{ fontSize: '1.8rem', fontWeight: 900, color: '#00ff88' }}>₩{totals.total.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginBottom: '3rem' }}>
                        <button onClick={() => setView('list')} style={{ padding: '0.8rem 3rem', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontWeight: 600, background: 'transparent', cursor: 'pointer' }}>취소</button>
                        <button onClick={handleCreateSales} disabled={loading} style={{ background: 'linear-gradient(135deg, #00ff88 0%, #00bd68 100%)', padding: '0.8rem 5rem', borderRadius: '14px', color: 'black', fontWeight: 900, boxShadow: '0 4px 20px rgba(0, 255, 136, 0.3)', opacity: loading ? 0.6 : 1, border: 'none', cursor: 'pointer' }}>
                            {loading ? '등록 중...' : '매출 확정 및 등록'}
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'flex-end' }}>
                        <div style={{ flex: 1, minWidth: '250px' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>검색</label>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }}>🔍</span>
                                <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="등록번호 또는 거래처명 검색..." style={{ width: '100%', padding: '0.65rem 0.65rem 0.65rem 2.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white' }} />
                            </div>
                        </div>
                        <div style={{ width: '200px' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>거래처별</label>
                            <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} style={{ width: '100%', padding: '0.65rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white' }}>
                                <option value="">전체 거래처</option>
                                {clients.map(c => <option key={c.id} value={c.properties.ClientName?.title?.[0]?.plain_text}>{c.properties.ClientName?.title?.[0]?.plain_text}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>날짜 범위</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} style={{ padding: '0.65rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white', colorScheme: 'dark' }} />
                                <span style={{ color: 'rgba(255,255,255,0.3)' }}>~</span>
                                <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} style={{ padding: '0.65rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white', colorScheme: 'dark' }} />
                            </div>
                        </div>
                        <button onClick={() => { setSearchTerm(''); setFilterCustomer(''); setFilterStartDate(''); setFilterEndDate(''); }} style={{ padding: '0.65rem 1.2rem', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>초기화</button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem', borderLeft: '4px solid #00ff88' }}>
                            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>총 매출액 (조회기간)</p>
                            <h4 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#00ff88' }}>₩{filteredSales.reduce((a, b) => a + b.totalAmount, 0).toLocaleString()}</h4>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem', borderLeft: '4px solid #0070f3' }}>
                            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>총 매출 건수</p>
                            <h4 style={{ fontSize: '1.4rem', fontWeight: 900 }}>{filteredSales.length}건</h4>
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1rem', overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1100px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                                        <th style={{ padding: '1rem' }}>등록번호</th>
                                        <th style={{ padding: '1rem' }}>매출일자</th>
                                        <th style={{ padding: '1rem' }}>거래처</th>
                                        <th style={{ padding: '1rem' }}>품목수</th>
                                        <th style={{ padding: '1rem', textAlign: 'right' }}>총 공급가액</th>
                                        <th style={{ padding: '1rem', textAlign: 'right' }}>합계 (VAT포함)</th>
                                        <th style={{ padding: '1rem', textAlign: 'center' }}>관리</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={7} style={{ padding: '5rem', textAlign: 'center', opacity: 0.5 }}>데이터를 불러오는 중...</td></tr>
                                    ) : filteredSales.length === 0 ? (
                                        <tr><td colSpan={7} style={{ padding: '5rem', textAlign: 'center', color: 'rgba(255,255,255,0.2)' }}>조회된 매출 데이터가 없습니다.</td></tr>
                                    ) : filteredSales.map((s) => (
                                        <tr key={s.code} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <td style={{ padding: '1rem', fontWeight: 700, fontSize: '0.85rem' }}>{s.code}</td>
                                            <td style={{ padding: '1rem', color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>{s.date}</td>
                                            <td style={{ padding: '1rem', fontWeight: 600 }}>{s.customer}</td>
                                            <td style={{ padding: '1rem' }}>{s.items.length}개 품목</td>
                                            <td style={{ padding: '1rem', textAlign: 'right', color: 'rgba(255,255,255,0.7)' }}>₩{s.netAmount.toLocaleString()}</td>
                                            <td style={{ padding: '1rem', textAlign: 'right' }}>
                                                <div style={{ color: '#00ff88', fontWeight: 900, fontSize: '1rem' }}>₩{s.totalAmount.toLocaleString()}</div>
                                                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>VAT: ₩{s.vat.toLocaleString()}</div>
                                            </td>
                                            <td style={{ padding: '1rem' }}>
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                    <button onClick={() => handlePrint(s)} title="명세서 인쇄" style={{ padding: '8px', background: 'rgba(0,112,243,0.1)', border: 'none', borderRadius: '8px', color: '#0070f3', cursor: 'pointer' }}>🖨️</button>
                                                    <button
                                                        onClick={() => {
                                                            if (!validatePeriod(s.date)) return;
                                                            setForm({
                                                                code: s.code,
                                                                date: s.date,
                                                                customer: s.customer,
                                                                saleType: s.saleType,
                                                                salesperson: s.salesperson,
                                                                poNo: s.poNo,
                                                                vatEnabled: true,
                                                                items: s.items.map(i => ({ ...i, id: Date.now() + Math.random() }))
                                                            });
                                                            setView('create');
                                                        }}
                                                        title="수정" style={{ padding: '8px', background: 'rgba(255,193,7,0.1)', border: 'none', borderRadius: '8px', color: '#ffc107', cursor: 'pointer' }}
                                                    >✏️</button>
                                                    <button
                                                        onClick={async () => {
                                                            if (!validatePeriod(s.date)) return;
                                                            if (confirm('정말로 이 매출 데이터를 삭제하시겠습니까?')) {
                                                                for (const item of s.items) await notionDelete(item.id as string);
                                                                fetchInitialData();
                                                            }
                                                        }}
                                                        title="전체 삭제" style={{ padding: '8px', background: 'rgba(255,77,79,0.1)', border: 'none', borderRadius: '8px', color: '#ff4d4f', cursor: 'pointer' }}
                                                    >🗑️</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            <ProductPicker
                isOpen={isProductPickerOpen}
                onClose={() => { setIsProductPickerOpen(false); setActiveItemIdx(null); }}
                onSelect={(p) => {
                    if (activeItemIdx !== null) {
                        updateItem(activeItemIdx, {
                            product: p.name,
                            specification: p.detail || '-',
                            unitPrice: p.cost || 0
                        });
                    }
                    setIsProductPickerOpen(false);
                    setActiveItemIdx(null);
                }}
            />
            <QuotePicker isOpen={isQuotePickerOpen} onClose={() => setIsQuotePickerOpen(false)} onSelect={onQuoteSelect} />
        </div>
    );
}
