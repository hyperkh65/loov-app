'use client';

import React, { useState, useEffect } from 'react';
import {
    notionQuery, notionCreate, notionUpdate, notionDelete,
    isWithinCurrentMonth, validatePeriod,
    DB_INVOICES, DB_INVOICE_DETAIL, DB_CLIENTS, DB_PRODUCTS,
    RT, TITLE, num, dateISO, select, FILES, uploadFile
} from '@/lib/notion-erp';
import Modal from '@/components/erp/Modal';
import ProductPicker from '@/components/erp/ProductPicker';
import QuotePicker from '@/components/erp/QuotePicker';
import { getSettings, CompanySettings, fetchCompanySettings } from '@/lib/erp-settings';

interface InvoiceItem {
    id: string | number;
    product: string;
    productCode: string;
    description: string;
    qty: number;
    unitPrice: number;
    amount: number;
}

interface Invoice {
    id: string;
    invoiceNo: string;
    client: string;
    currency: string;
    totalAmount: number;
    issueDate: string;
    dueDate: string;
    status: string;
    category: string;
    billingReason: string;
    description: string;
    attachment?: { name: string; url: string };
    items?: InvoiceItem[];
    clientInfo?: {
        address: string;
        bizNo: string;
        ceo: string;
    };
}

export default function AccountingPage() {
    const [view, setView] = useState<'dashboard' | 'all' | 'print'>('dashboard');
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [clients, setClients] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
    const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
    const [isQuotePickerOpen, setIsQuotePickerOpen] = useState(false);
    const [printData, setPrintData] = useState<Invoice | null>(null);
    const [company, setCompany] = useState<CompanySettings>(getSettings());

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [sortBy, setSortBy] = useState<'issueDate' | 'dueDate' | 'amount'>('issueDate');

    const [form, setForm] = useState<{
        invoiceNo: string;
        client: string;
        currency: string;
        issueDate: string;
        dueDate: string;
        status: string;
        category: string;
        billingReason: string;
        description: string;
        attachment: any;
        showItems: boolean;
        items: InvoiceItem[];
    }>({
        invoiceNo: 'INV-' + new Date().getFullYear() + '-' + Math.floor(Math.random() * 1000).toString().padStart(3, '0'),
        client: '',
        currency: 'KRW',
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: '',
        status: '대기',
        category: '매출',
        billingReason: '',
        description: '',
        attachment: null,
        showItems: true,
        items: []
    });

    useEffect(() => {
        fetchCompanySettings().then(setCompany);
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [invRes, clientRes] = await Promise.all([
                notionQuery(DB_INVOICES(), { sorts: [{ property: 'IssueDate', direction: 'descending' }] }),
                notionQuery(DB_CLIENTS())
            ]);
            const sortedClients = clientRes.results.sort((a: any, b: any) => {
                const nameA = a.properties.ClientName?.title?.[0]?.plain_text || '';
                const nameB = b.properties.ClientName?.title?.[0]?.plain_text || '';
                return nameA.localeCompare(nameB);
            });
            setClients(sortedClients);
            const mapped = invRes.results.map((r: any) => {
                const p = r.properties;
                return {
                    id: r.id,
                    invoiceNo: p.InvoiceNo?.rich_text?.[0]?.plain_text || '-',
                    client: p.Client?.rich_text?.[0]?.plain_text || '-',
                    currency: p.Currency?.select?.name || 'KRW',
                    totalAmount: p.Amount?.number || 0,
                    issueDate: p.IssueDate?.date?.start || '-',
                    dueDate: p.DueDate?.date?.start || '-',
                    status: p.Status?.select?.name || '대기',
                    category: p.Category?.select?.name || '매출',
                    billingReason: p.BillingReason?.rich_text?.[0]?.plain_text || '',
                    description: p.Description?.rich_text?.[0]?.plain_text || '',
                    attachment: p.Attachment?.files?.[0]?.external || p.Attachment?.files?.[0]?.file
                };
            });
            setInvoices(mapped);
        } catch (e) {
            console.error('데이터 로드 실패:', e);
        } finally {
            setLoading(false);
        }
    };

    const onProductSelect = (p: any) => {
        const newItem: InvoiceItem = {
            id: Date.now(),
            product: p.name,
            productCode: p.code,
            description: p.detail || '',
            qty: 1,
            unitPrice: p.cost || 0,
            amount: p.cost || 0
        };
        if (editingInvoice) {
            setEditingInvoice({ ...editingInvoice, items: [...(editingInvoice.items || []), newItem] });
        } else {
            setForm({ ...form, items: [...form.items, newItem], showItems: true });
        }
        setIsProductPickerOpen(false);
    };

    const onQuoteSelect = (quote: any) => {
        const newItems: InvoiceItem[] = quote.items.map((it: any) => {
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
                productCode: '-',
                description: specParts.join(' / '),
                qty: it.qty,
                unitPrice: 0,
                amount: 0
            };
        });
        setForm(prev => ({ ...prev, client: quote.client, items: newItems }));
        setIsQuotePickerOpen(false);
        setIsCreateModalOpen(true);
        alert(`${quote.no} 견적 내용이 불러와졌습니다. (가격은 0으로 설정되었습니다)`);
    };

    const handleSave = async () => {
        if (!form.client) return alert('거래처를 선택하세요.');
        try {
            setLoading(true);
            const total = form.items.reduce((acc, it) => acc + (it.qty * it.unitPrice), 0);
            await notionCreate(DB_INVOICES(), {
                '이름': TITLE(form.invoiceNo),
                InvoiceNo: RT(form.invoiceNo),
                Client: RT(form.client),
                Currency: select(form.currency),
                Amount: num(total),
                IssueDate: dateISO(form.issueDate),
                DueDate: dateISO(form.dueDate),
                Status: select(form.status),
                Category: select(form.category),
                BillingReason: RT(form.billingReason),
                Description: RT(form.description),
                Attachment: form.attachment ? FILES(form.attachment.url, form.attachment.name) : { files: [] }
            });
            if (form.showItems) {
                for (const it of form.items) {
                    await notionCreate(DB_INVOICE_DETAIL(), {
                        '이름': TITLE(it.product),
                        InvoiceNo: RT(form.invoiceNo),
                        Product: RT(it.product),
                        ProductCode: RT(it.productCode),
                        Description: RT(it.description),
                        Qty: num(it.qty),
                        UnitPrice: num(it.unitPrice),
                        Amount: num(it.qty * it.unitPrice)
                    });
                }
            }
            alert('청구서가 성공적으로 생성되었습니다.');
            setIsCreateModalOpen(false);
            setForm({
                ...form,
                invoiceNo: 'INV-' + new Date().getFullYear() + '-' + Math.floor(Math.random() * 1000).toString().padStart(3, '0'),
                items: [],
                billingReason: '',
                description: '',
                attachment: null
            });
            fetchData();
        } catch (e: any) {
            alert('저장 실패: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateInvoice = async () => {
        if (!editingInvoice) return;
        if (!validatePeriod(editingInvoice.issueDate)) return;
        try {
            setLoading(true);
            const total = editingInvoice.items?.reduce((acc, it) => acc + (it.qty * it.unitPrice), 0) || editingInvoice.totalAmount;
            await notionUpdate(editingInvoice.id, {
                Status: select(editingInvoice.status),
                BillingReason: RT(editingInvoice.billingReason),
                Description: RT(editingInvoice.description),
                Amount: num(total)
            });
            const oldItems = await notionQuery(DB_INVOICE_DETAIL(), {
                filter: { property: 'InvoiceNo', rich_text: { equals: editingInvoice.invoiceNo } }
            });
            for (const r of oldItems.results) await notionDelete(r.id);
            for (const it of (editingInvoice.items || [])) {
                await notionCreate(DB_INVOICE_DETAIL(), {
                    '이름': TITLE(it.product),
                    InvoiceNo: RT(editingInvoice.invoiceNo),
                    Product: RT(it.product),
                    ProductCode: RT(it.productCode),
                    Description: RT(it.description),
                    Qty: num(it.qty),
                    UnitPrice: num(it.unitPrice),
                    Amount: num(it.qty * it.unitPrice)
                });
            }
            alert('수정되었습니다.');
            setEditingInvoice(null);
            fetchData();
        } catch (e) {
            alert('업데이트 실패');
        } finally {
            setLoading(false);
        }
    };

    const openInvoiceDetail = async (inv: Invoice) => {
        try {
            setLoading(true);
            const res = await notionQuery(DB_INVOICE_DETAIL(), {
                filter: { property: 'InvoiceNo', rich_text: { equals: inv.invoiceNo } }
            });
            const items = res.results.map((r: any) => {
                const p = r.properties;
                return {
                    id: r.id,
                    product: p.Product?.rich_text?.[0]?.plain_text || '-',
                    productCode: p.ProductCode?.rich_text?.[0]?.plain_text || '-',
                    description: p.Description?.rich_text?.[0]?.plain_text || '',
                    qty: p.Qty?.number || 0,
                    unitPrice: p.UnitPrice?.number || 0,
                    amount: p.Amount?.number || 0
                };
            });
            setEditingInvoice({ ...inv, items });
        } catch (e) {
            console.error('상세 조회 실패:', e);
        } finally {
            setLoading(false);
        }
    };

    const startPrint = async (inv: Invoice) => {
        try {
            setLoading(true);
            const res = await notionQuery(DB_INVOICE_DETAIL(), {
                filter: { property: 'InvoiceNo', rich_text: { equals: inv.invoiceNo } }
            });
            const items = res.results.map((r: any) => {
                const p = r.properties;
                return {
                    id: r.id,
                    product: p.Product?.rich_text?.[0]?.plain_text || '-',
                    productCode: p.ProductCode?.rich_text?.[0]?.plain_text || '-',
                    description: p.Description?.rich_text?.[0]?.plain_text || '',
                    qty: p.Qty?.number || 0,
                    unitPrice: p.UnitPrice?.number || 0,
                    amount: p.Amount?.number || 0
                };
            });
            const clientDoc = clients.find(c => c.properties.ClientName?.title?.[0]?.plain_text === inv.client);
            const clientInfo = clientDoc ? {
                address: clientDoc.properties.Address?.rich_text?.[0]?.plain_text || clientDoc.properties['주소']?.rich_text?.[0]?.plain_text || '',
                bizNo: clientDoc.properties.BizNo?.rich_text?.[0]?.plain_text || clientDoc.properties['사업자번호']?.rich_text?.[0]?.plain_text || '',
                ceo: clientDoc.properties.CEO?.rich_text?.[0]?.plain_text || clientDoc.properties['대표자']?.rich_text?.[0]?.plain_text || ''
            } : undefined;
            setPrintData({ ...inv, items, clientInfo });
            setView('print');
        } catch (e) {
            alert('출력 데이터 로드 실패');
        } finally {
            setLoading(false);
        }
    };

    const isLate = (dueDate: string, status: string) => {
        if (status === '완료') return false;
        if (!dueDate || dueDate === '-') return false;
        return new Date(dueDate) < new Date();
    };

    const currencySymbol = (cur: string) => {
        if (cur === 'USD') return '$';
        if (cur === 'RMB') return '¥';
        return '₩';
    };

    const sortedInvoices = [...invoices]
        .filter(inv =>
            (inv.client.toLowerCase().includes(search.toLowerCase()) || inv.invoiceNo.toLowerCase().includes(search.toLowerCase())) &&
            (statusFilter === 'All' || inv.status === statusFilter)
        )
        .sort((a, b) => {
            if (sortBy === 'amount') return b.totalAmount - a.totalAmount;
            if (sortBy === 'dueDate') return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            return new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime();
        });

    if (view === 'print' && printData) {
        return (
            <div style={{ background: 'white', color: 'black', minHeight: '100vh', padding: '40px' }} id="print-area">
                <style>{`
                    @media print {
                        body * { visibility: hidden !important; }
                        aside, header, nav, .sidebar, [role="complementary"] { display: none !important; }
                        #print-area, #print-area * { visibility: visible !important; }
                        .no-print, .no-print * { display: none !important; }
                        #print-area { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; margin: 0 !important; padding: 0 !important; background: white !important; z-index: 9999 !important; }
                        table { page-break-inside: auto; }
                        tr { page-break-inside: avoid; page-break-after: auto; }
                        thead { display: table-header-group; }
                        tfoot { display: table-footer-group; }
                        @page { size: auto; margin: 10mm; }
                    }
                    .dn-table th { background: #f0f0f0 !important; border: 1px solid #333; padding: 10px; font-size: 13px; text-align: center; font-weight: 700; -webkit-print-color-adjust: exact; }
                    .dn-table td { border: 1px solid #333; padding: 10px; font-size: 13px; }
                    .box-container { display: grid; grid-template-columns: 1fr 1fr; border: 2px solid #333; margin-bottom: 30px; }
                    .box-left { border-right: 1px solid #333; padding: 20px; position: relative; }
                    .box-right { padding: 20px; position: relative; min-height: 180px; }
                    .info-label { font-size: 0.9rem; color: #666; margin-bottom: 5px; }
                `}</style>
                <div className="no-print" style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
                    <button onClick={() => setView('all')} style={{ padding: '10px 20px', background: '#333', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                        ◀ 뒤로가기
                    </button>
                    <button
                        onClick={() => {
                            const originalTitle = document.title;
                            document.title = `${printData.issueDate}_거래명세표_${printData.invoiceNo}`;
                            window.print();
                            document.title = originalTitle;
                        }}
                        style={{ padding: '10px 20px', background: '#0070f3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                    >
                        🖨️ 인쇄하기 (PDF 저장)
                    </button>
                </div>
                <div style={{ width: '100%', margin: '0 auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', marginTop: '20px', position: 'relative' }}>
                        {company.logoUrl && <img src={company.logoUrl} alt="Logo" style={{ height: '80px', maxWidth: '200px', objectFit: 'contain' }} />}
                        <h1 style={{ fontSize: '3.5rem', fontWeight: 900, textDecoration: 'underline', textUnderlineOffset: '10px', letterSpacing: '10px', margin: 0, flex: 1, textAlign: 'center' }}>거 래 명 세 표</h1>
                        <div style={{ textAlign: 'right', minWidth: '150px' }}>
                            <p style={{ fontSize: '1.2rem', fontWeight: 600 }}>No: {printData.invoiceNo}</p>
                        </div>
                    </div>
                    <div className="box-container">
                        <div className="box-left">
                            <p className="info-label">공급받는자 (BUYER)</p>
                            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '15px 0 25px 0' }}>{printData.client} <span style={{ fontSize: '1.1rem', fontWeight: 400 }}>귀하</span></h2>
                            <div style={{ fontSize: '1rem', lineHeight: '2' }}>
                                <p><span style={{ fontWeight: 600, display: 'inline-block', width: '80px' }}>일자:</span> {printData.issueDate}</p>
                                <p><span style={{ fontWeight: 600, display: 'inline-block', width: '80px' }}>P.O No:</span> {printData.invoiceNo}</p>
                                {printData.clientInfo?.bizNo && <p><span style={{ fontWeight: 600, display: 'inline-block', width: '80px' }}>등록번호:</span> {printData.clientInfo.bizNo}</p>}
                                {printData.clientInfo?.address && <p><span style={{ fontWeight: 600, display: 'inline-block', width: '80px' }}>주소:</span> {printData.clientInfo.address}</p>}
                            </div>
                        </div>
                        <div className="box-right">
                            <p className="info-label">공급자 (SELLER)</p>
                            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '15px 0 25px 0', whiteSpace: 'nowrap', display: 'inline-block' }}>{company.name}</h2>
                            <div style={{ fontSize: '1rem', lineHeight: '1.8' }}>
                                <p><span style={{ fontWeight: 600, display: 'inline-block', width: '80px' }}>등록번호:</span> {company.bizNo}</p>
                                <p><span style={{ fontWeight: 600, display: 'inline-block', width: '80px' }}>대표자:</span> {company.ceo}<span style={{ marginLeft: '10px' }}>(인)</span></p>
                                <p><span style={{ fontWeight: 600, display: 'inline-block', width: '80px' }}>주소:</span> {company.address}</p>
                                <p><span style={{ fontWeight: 600, display: 'inline-block', width: '80px' }}>업태:</span> {company.bizType} <span style={{ margin: '0 10px' }}>/</span> <span style={{ fontWeight: 600 }}>종목:</span> {company.bizItem}</p>
                            </div>
                        </div>
                    </div>
                    <table className="dn-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
                        <thead>
                            <tr style={{ height: '40px' }}>
                                <th style={{ width: '50px' }}>No</th>
                                <th>품명 및 규격 (DESCRIPTION)</th>
                                <th style={{ width: '80px' }}>수량</th>
                                <th style={{ width: '100px' }}>단가</th>
                                <th style={{ width: '120px' }}>공급가액</th>
                                <th style={{ width: '80px' }}>비고</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(printData.items || []).map((it, idx) => (
                                <tr key={idx}>
                                    <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                                    <td>
                                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>{it.product}</div>
                                        <div style={{ fontSize: '0.85rem', color: '#555', marginTop: '2px' }}>{it.description}</div>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>{it.qty}</td>
                                    <td style={{ textAlign: 'right' }}>{it.unitPrice.toLocaleString()}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{it.amount.toLocaleString()}</td>
                                    <td style={{ textAlign: 'center' }}></td>
                                </tr>
                            ))}
                            {[...Array(Math.max(0, 10 - (printData.items?.length || 0)))].map((_, i) => (
                                <tr key={`empty-${i}`} style={{ height: '35px' }}><td></td><td></td><td></td><td></td><td></td><td></td></tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={2} style={{ textAlign: 'center', fontWeight: 700, padding: '15px' }}>부가가치세 (VAT 10%) - 별도 표기 없을 시 포함</td>
                                <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700, padding: '15px' }}>{Math.round(printData.totalAmount * 0.1).toLocaleString()}</td>
                            </tr>
                            <tr style={{ background: '#f9f9f9' }}>
                                <td colSpan={2} style={{ textAlign: 'center', fontWeight: 800, fontSize: '1.2rem', padding: '15px' }}>합 계 금 액 (GRAND TOTAL)</td>
                                <td colSpan={4} style={{ textAlign: 'right', fontWeight: 900, fontSize: '1.3rem', padding: '15px' }}>
                                    {currencySymbol(printData.currency)} {(printData.totalAmount + Math.round(printData.totalAmount * 0.1)).toLocaleString()}
                                    <span style={{ fontSize: '0.8rem', marginLeft: '10px', fontWeight: 400 }}>(VAT 포함)</span>
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div style={{ border: '1px solid #ccc', padding: '20px', borderRadius: '8px' }}>
                            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '10px' }}>[입금계좌 안내]</p>
                            <p style={{ fontSize: '1.1rem', fontWeight: 800 }}>{company.bank || '-'}</p>
                        </div>
                        <div style={{ border: '1px solid #ccc', padding: '30px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', minHeight: '120px' }}>
                            <h3 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '2px', zIndex: 2 }}>위 금액을 정히 영수(청구)함.</h3>
                            {company.stampUrl && <img src={company.stampUrl} alt="Stamp" style={{ position: 'absolute', right: '10%', bottom: '5px', width: '320px', height: 'auto', opacity: 0.5, zIndex: 1, transform: 'rotate(-2deg)', pointerEvents: 'none' }} />}
                        </div>
                    </div>
                    <div style={{ marginTop: '30px', textAlign: 'center', fontSize: '0.8rem', color: '#888' }}>
                        본 명세표는 인터넷으로 발행되었습니다. / 문의: {company.email}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1rem' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '0.5rem' }}>
                        <div style={{ padding: '8px', background: 'rgba(0, 112, 243, 0.1)', borderRadius: '10px' }}>
                            <span style={{ fontSize: '1.5rem' }}>🧾</span>
                        </div>
                        <h2 style={{ fontSize: '2.2rem', fontWeight: 900, margin: 0, background: 'linear-gradient(135deg, #0070f3, #6c5ce7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>회계 / 계약 관리</h2>
                    </div>
                    <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontWeight: 500 }}>정식 거래처 연동 및 품목별 정산 시스템 (Debit Note 생성 가능)</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button onClick={() => setIsQuotePickerOpen(true)} style={{ background: 'rgba(0,112,243,0.1)', border: '1px solid rgba(0,112,243,0.3)', padding: '0.8rem 1.5rem', borderRadius: '14px', color: '#0070f3', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        🛒 견적 불러오기 (자동입력)
                    </button>
                    <button onClick={() => setView(view === 'dashboard' ? 'all' : 'dashboard')} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '0.8rem 1.5rem', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
                        {view === 'dashboard' ? '전체 내역 보기' : '통합 대시보드'}
                    </button>
                    <button onClick={() => setIsCreateModalOpen(true)} style={{ background: 'linear-gradient(135deg, #0070f3 0%, #00dfd8 100%)', border: 'none', padding: '0.8rem 2rem', borderRadius: '14px', color: 'white', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(0, 112, 243, 0.2)', cursor: 'pointer' }}>
                        + 청구서 작성
                    </button>
                </div>
            </header>

            <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>전체 청구 내역</h3>
                    <div style={{ display: 'flex', gap: '0.8rem' }}>
                        <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                            <input placeholder="거래처, 번호 검색..." value={search} onChange={e => setSearch(e.target.value)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.6rem 1rem 0.6rem 2.5rem', borderRadius: '10px', color: 'white', width: '220px' }} />
                        </div>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.6rem', borderRadius: '10px', color: 'white' }}>
                            <option value="All">전체 상태</option>
                            <option value="대기">대기</option>
                            <option value="완료">완료</option>
                            <option value="지체">지체</option>
                        </select>
                    </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <th style={{ padding: '1rem' }}>청구 번호</th>
                                <th style={{ padding: '1rem' }}>거래처명 (연동)</th>
                                <th style={{ padding: '1rem', textAlign: 'right' }}>청구 금액</th>
                                <th style={{ padding: '1rem' }}>마감 기한</th>
                                <th style={{ padding: '1rem' }}>청구 사유</th>
                                <th style={{ padding: '1rem' }}>상태</th>
                                <th style={{ padding: '1rem' }}>도구</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && invoices.length === 0 ? (
                                <tr><td colSpan={7} style={{ padding: '5rem', textAlign: 'center', opacity: 0.5 }}>연동 데이터를 불러오는 중...</td></tr>
                            ) : sortedInvoices.map(inv => {
                                const late = isLate(inv.dueDate, inv.status);
                                return (
                                    <tr key={inv.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: late ? 'rgba(255,59,48,0.03)' : 'transparent' }}>
                                        <td onClick={() => openInvoiceDetail(inv)} style={{ padding: '1.2rem 1rem', fontWeight: 800, cursor: 'pointer' }}>{inv.invoiceNo}</td>
                                        <td style={{ padding: '1.2rem 1rem' }}>{inv.client}</td>
                                        <td style={{ padding: '1.2rem 1rem', textAlign: 'right', fontWeight: 900 }}>{currencySymbol(inv.currency)} {inv.totalAmount.toLocaleString()}</td>
                                        <td style={{ padding: '1.2rem 1rem', color: late ? '#ff3b30' : 'rgba(255,255,255,0.5)' }}>{inv.dueDate}</td>
                                        <td style={{ padding: '1.2rem 1rem', fontSize: '0.8rem', opacity: 0.6 }}>{inv.billingReason || '-'}</td>
                                        <td style={{ padding: '1.2rem 1rem' }}>
                                            <button
                                                onClick={async () => {
                                                    if (!validatePeriod(inv.issueDate)) return;
                                                    const nextStatus = inv.status === '완료' ? '대기' : '완료';
                                                    await notionUpdate(inv.id, { Status: select(nextStatus) });
                                                    fetchData();
                                                }}
                                                style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: '20px', border: 'none', cursor: 'pointer', background: inv.status === '완료' ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.05)', color: inv.status === '완료' ? '#00ff88' : 'white' }}
                                            >
                                                {inv.status}
                                            </button>
                                        </td>
                                        <td style={{ padding: '1.2rem 1rem' }}>
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <button onClick={() => startPrint(inv)} title="Debit Note 출력" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>🖨️</button>
                                                <button onClick={() => openInvoiceDetail(inv)} title="편집" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>✏️</button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="신규 청구서 발행">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>관리 거래처 선택</label>
                            <select value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} style={{ width: '100%', padding: '0.75rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white' }}>
                                <option value="">-- 거래처 선택 --</option>
                                {clients.map(c => <option key={c.id} value={c.properties.ClientName?.title?.[0]?.plain_text}>{c.properties.ClientName?.title?.[0]?.plain_text}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>통화</label>
                            <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white' }}>
                                <option value="KRW">KRW</option><option value="USD">USD</option><option value="RMB">RMB</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>청구 사유 (Debit Note 표시용)</label>
                        <input value={form.billingReason} onChange={e => setForm({ ...form, billingReason: e.target.value })} placeholder="청구 목적 및 내용" style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>발행일</label>
                            <input type="date" value={form.issueDate} onChange={e => setForm({ ...form, issueDate: e.target.value })} style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', colorScheme: 'dark' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>마감기한</label>
                            <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', colorScheme: 'dark' }} />
                        </div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>청구 품목 상세</span>
                            <button onClick={() => setIsProductPickerOpen(true)} style={{ background: 'rgba(0,112,243,0.1)', border: '1px solid #0070f3', padding: '4px 12px', borderRadius: '20px', color: '#0070f3', fontSize: '0.7rem', cursor: 'pointer' }}>+ 제품 추가</button>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tbody>
                                {form.items.map((it, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '8px 0' }}>{it.product}</td>
                                        <td><input type="number" value={it.qty} onChange={e => { const newItems = [...form.items]; newItems[idx].qty = Number(e.target.value); setForm({ ...form, items: newItems }); }} style={{ width: '50px', background: 'none', border: 'none', color: 'white' }} /></td>
                                        <td><input type="number" value={it.unitPrice} onChange={e => { const newItems = [...form.items]; newItems[idx].unitPrice = Number(e.target.value); setForm({ ...form, items: newItems }); }} style={{ width: '80px', background: 'none', border: 'none', color: 'white', textAlign: 'right' }} /></td>
                                        <td style={{ textAlign: 'right' }}><button onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })} style={{ color: '#ff4d4f', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <button onClick={handleSave} style={{ width: '100%', padding: '1rem', borderRadius: '15px', background: '#0070f3', color: 'white', fontWeight: 800, border: 'none', cursor: 'pointer' }}>청구서 발행</button>
                </div>
            </Modal>

            <Modal isOpen={!!editingInvoice} onClose={() => setEditingInvoice(null)} title={`청구서 편집: ${editingInvoice?.invoiceNo}`}>
                {editingInvoice && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>상태</label>
                                <select value={editingInvoice.status} onChange={e => setEditingInvoice({ ...editingInvoice, status: e.target.value })} style={{ width: '100%', padding: '0.75rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white' }}>
                                    <option value="대기">대기</option><option value="완료">완료</option><option value="지체">지체</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>청구 합계</label>
                                <p style={{ fontSize: '1.2rem', fontWeight: 900 }}>{currencySymbol(editingInvoice.currency)} {editingInvoice.items?.reduce((acc, it) => acc + (it.qty * it.unitPrice), 0).toLocaleString()}</p>
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>청구 사유</label>
                            <input value={editingInvoice.billingReason} onChange={e => setEditingInvoice({ ...editingInvoice, billingReason: e.target.value })} style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white' }} />
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>품목 관리</span>
                                <button onClick={() => setIsProductPickerOpen(true)} style={{ color: '#0070f3', background: 'none', border: 'none', fontSize: '0.7rem', cursor: 'pointer' }}>+ 추가</button>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <tbody>
                                    {editingInvoice.items?.map((it, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '8px 0' }}>{it.product}</td>
                                            <td><input type="number" value={it.qty} onChange={e => { const newItems = [...(editingInvoice.items || [])]; newItems[idx].qty = Number(e.target.value); setEditingInvoice({ ...editingInvoice, items: newItems }); }} style={{ width: '40px', background: 'none', border: 'none', color: 'white' }} /></td>
                                            <td style={{ textAlign: 'right' }}><input type="number" value={it.unitPrice} onChange={e => { const newItems = [...(editingInvoice.items || [])]; newItems[idx].unitPrice = Number(e.target.value); setEditingInvoice({ ...editingInvoice, items: newItems }); }} style={{ width: '80px', background: 'none', border: 'none', color: 'white', textAlign: 'right' }} /></td>
                                            <td style={{ textAlign: 'right' }}><button onClick={() => setEditingInvoice({ ...editingInvoice, items: editingInvoice.items?.filter((_, i) => i !== idx) })} style={{ color: '#ff4d4f', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={handleUpdateInvoice} style={{ flex: 2, padding: '1rem', background: '#0070f3', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 800, cursor: 'pointer' }}>수정 내용 저장</button>
                            <button onClick={() => setEditingInvoice(null)} style={{ flex: 1, padding: '1rem', background: 'rgba(255,255,255,0.05)', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>취소</button>
                        </div>
                    </div>
                )}
            </Modal>

            <ProductPicker isOpen={isProductPickerOpen} onClose={() => setIsProductPickerOpen(false)} onSelect={onProductSelect} />
            <QuotePicker isOpen={isQuotePickerOpen} onClose={() => setIsQuotePickerOpen(false)} onSelect={onQuoteSelect} />
        </div>
    );
}
