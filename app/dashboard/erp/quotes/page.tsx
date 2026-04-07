'use client';

import React, { useState, useEffect } from 'react';
import { Quote, Plus, Search, FileText, Trash2, Printer, ChevronRight, Calculator, User, Building, MapPin, Mail, Phone, Box, ArrowLeft, Download, CheckCircle, Clock } from 'lucide-react';
import Modal from '@/components/erp/Modal';
import ProductPicker from '@/components/erp/ProductPicker';
import {
    notionQuery, notionCreate, notionUpdate, notionDelete,
    isWithinCurrentMonth, validatePeriod,
    DB_QUOTES, DB_CLIENTS, DB_PRODUCTS, RT, TITLE, num, dateISO, FILES, uploadFile
} from '@/lib/notion-erp';
import { getSettings } from '@/lib/erp-settings';

interface QuoteItem {
    id: number | string;
    product: string;
    description: string;
    voltage: string;
    watts: string;
    luminousEff: string;
    lumenOutput: string;
    cct: string;
    unit: string;
    unitPrice: number;
    qty: number;
    amount: number;
    remarks: string;
}

interface QuoteRecord {
    pageId: string;
    no: string;
    date: string;
    client: string;
    totalAmount: number;
    currency: string;
    items: QuoteItem[];
    generalInfo?: string;
    specialNotes?: string;
    attach1?: string;
    attach2?: string;
    attach3?: string;
    attacht1?: string;
    attacht2?: string;
    attacht3?: string;
    docType?: 'QUOTE' | 'PROFORMA';
    clientInfo?: {
        address: string;
        bizNo: string;
        ceo: string;
    };
}

const getCurrencySymbol = (cur: string) => {
    switch (cur) {
        case 'USD': return '$';
        case 'RMB': return '¥';
        case 'KRW': return '₩';
        default: return '';
    }
};

export default function QuotesPage() {
    const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
    const [clients, setClients] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'list' | 'create' | 'print'>('list');
    const [search, setSearch] = useState('');

    const [form, setForm] = useState<{
        no: string;
        date: string;
        client: string;
        currency: string;
        generalInfo: string;
        specialNotes: string;
        attach1: string;
        attach2: string;
        attach3: string;
        attacht1: string;
        attacht2: string;
        attacht3: string;
        docType: 'QUOTE' | 'PROFORMA';
        items: QuoteItem[];
    }>({
        no: 'Q' + new Date().toISOString().substring(0, 10).replace(/-/g, '') + '-01',
        date: new Date().toISOString().substring(0, 10),
        client: '',
        currency: 'KRW',
        generalInfo: '',
        specialNotes: '',
        attach1: '',
        attach2: '',
        attach3: '',
        attacht1: '',
        attacht2: '',
        attacht3: '',
        docType: 'QUOTE',
        items: [{
            id: Date.now(),
            product: '', description: '',
            voltage: '-', watts: '-', luminousEff: '-',
            lumenOutput: '-', cct: '-', unit: 'PCS',
            unitPrice: 0, qty: 1, amount: 0, remarks: ''
        }]
    });

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, field: string) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploading(field);
        try {
            const data = await uploadFile(file);
            setForm(prev => ({ ...prev, [field]: data.url }));
        } catch (error) {
            console.error('File upload failed:', error);
            alert('파일 업로드 실패.');
        } finally {
            setUploading(null);
        }
    };

    const [printData, setPrintData] = useState<QuoteRecord | null>(null);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [activeIdx, setActiveIdx] = useState<number | null>(null);
    const [company, setCompany] = useState(getSettings());
    const [editMode, setEditMode] = useState(false);
    const [currentQuoteNo, setCurrentQuoteNo] = useState<string | null>(null);
    const [uploading, setUploading] = useState<string | null>(null);

    useEffect(() => {
        fetchInitialData();
        setCompany(getSettings());
    }, []);

    async function fetchInitialData() {
        try {
            setLoading(true);
            const [qRes, cRes] = await Promise.all([
                notionQuery(DB_QUOTES, { sorts: [{ property: 'Date', direction: 'descending' }] }),
                notionQuery(DB_CLIENTS)
            ]);

            const groupedQuotes: { [key: string]: QuoteRecord } = {};
            qRes.results.forEach((r: any) => {
                const props = r.properties;
                const no = props.EstimateNo1?.title?.[0]?.plain_text || props.EstimateNo?.rich_text?.[0]?.plain_text || 'Unknown';
                if (!groupedQuotes[no]) {
                    groupedQuotes[no] = {
                        pageId: r.id,
                        no,
                        date: props.Date?.date?.start || '-',
                        client: props.Client?.rich_text?.[0]?.plain_text || props.Client?.title?.[0]?.plain_text || '-',
                        currency: props.Currency?.rich_text?.[0]?.plain_text || props.Currency?.select?.name || props.Currency?.title?.[0]?.plain_text || 'KRW',
                        totalAmount: 0,
                        items: [],
                        generalInfo: props.GeneralInfo?.rich_text?.[0]?.plain_text || props.generalInfo?.rich_text?.[0]?.plain_text || '',
                        specialNotes: props.SpecialNotes?.rich_text?.[0]?.plain_text || props.specialNotes?.rich_text?.[0]?.plain_text || '',
                        attach1: props.attach1?.files?.[0]?.external?.url || props.Attach1?.files?.[0]?.external?.url || props.attach1?.files?.[0]?.file?.url || props.Attach1?.files?.[0]?.file?.url || '',
                        attach2: props.attach2?.files?.[0]?.external?.url || props.Attach2?.files?.[0]?.external?.url || props.attach2?.files?.[0]?.file?.url || props.Attach2?.files?.[0]?.file?.url || '',
                        attach3: props.attach3?.files?.[0]?.external?.url || props.Attach3?.files?.[0]?.external?.url || props.attach3?.files?.[0]?.file?.url || props.Attach3?.files?.[0]?.file?.url || '',
                        attacht1: props.attacht1?.rich_text?.[0]?.plain_text || props.Attacht1?.rich_text?.[0]?.plain_text || '',
                        attacht2: props.attacht2?.rich_text?.[0]?.plain_text || props.Attacht2?.rich_text?.[0]?.plain_text || '',
                        attacht3: props.attacht3?.rich_text?.[0]?.plain_text || props.Attacht3?.rich_text?.[0]?.plain_text || '',
                        docType: no.startsWith('PI') ? 'PROFORMA' : 'QUOTE'
                    };
                }
                const amt = props.Amount?.number || 0;
                groupedQuotes[no].totalAmount += amt;
                groupedQuotes[no].items.push({
                    id: r.id,
                    product: props.Product?.rich_text?.[0]?.plain_text || '-',
                    description: props.Description?.rich_text?.[0]?.plain_text || '',
                    voltage: props.Voltage?.rich_text?.[0]?.plain_text || '-',
                    watts: props.Watts?.rich_text?.[0]?.plain_text || '-',
                    luminousEff: props.LuminousEff?.rich_text?.[0]?.plain_text || '-',
                    lumenOutput: props.LumenOutput?.rich_text?.[0]?.plain_text || '-',
                    cct: props.CCT?.rich_text?.[0]?.plain_text || '-',
                    unit: props.Unit?.select?.name || props.Unit?.rich_text?.[0]?.plain_text || 'PCS',
                    unitPrice: props.UnitPrice?.number || 0,
                    qty: props.Qty?.number || 0,
                    amount: amt,
                    remarks: props.Remarks?.rich_text?.[0]?.plain_text || ''
                });
            });

            setQuotes(Object.values(groupedQuotes));
            setClients(cRes.results);
        } catch (e) {
            console.error('데이터 로드 실패:', e);
        } finally {
            setLoading(false);
        }
    }

    const filteredQuotes = quotes.filter(q =>
        q.no.toLowerCase().includes(search.toLowerCase()) ||
        q.client.toLowerCase().includes(search.toLowerCase())
    );

    const addItem = () => setForm({
        ...form,
        items: [...form.items, {
            id: Date.now(), product: '', description: '',
            voltage: '-', watts: '-', luminousEff: '-',
            lumenOutput: '-', cct: '-', unit: 'PCS',
            unitPrice: 0, qty: 1, amount: 0, remarks: ''
        }]
    });

    const handleSave = async () => {
        if (!form.client) return alert('거래처를 선택하세요.');
        if (form.items.length === 0) return alert('최소 1개의 항목이 필요합니다.');

        // 당월 체크 (수정인 경우)
        if (form.items.some(it => it.id && typeof it.id === 'string')) {
            if (!validatePeriod(form.date)) return;
        }

        try {
            if (editMode && currentQuoteNo) {
                const toDelete = quotes.find(q => q.no === currentQuoteNo)?.items.map(it => it.id.toString()) || [];
                for (const pid of toDelete) await notionDelete(pid);
            }

            for (let i = 0; i < form.items.length; i++) {
                const item = form.items[i];
                await notionCreate(DB_QUOTES, {
                    EstimateNo1: TITLE(form.no),
                    index: RT(String(i + 1)),
                    Date: dateISO(form.date),
                    Client: RT(form.client),
                    Product: RT(item.product),
                    Description: RT(item.description),
                    Voltage: RT(item.voltage),
                    Watts: RT(item.watts),
                    LuminousEff: RT(item.luminousEff),
                    LumenOutput: RT(item.lumenOutput),
                    CCT: RT(item.cct),
                    Unit: { select: { name: item.unit } },
                    UnitPrice: num(item.unitPrice),
                    Qty: num(item.qty),
                    Amount: num(item.qty * item.unitPrice),
                    Currency: RT(form.currency),
                    Remarks: RT(item.remarks),
                    EstimateNo: RT(form.no),
                    GeneralInfo: RT(form.generalInfo),
                    SpecialNotes: RT(form.specialNotes),
                    attach1: FILES(form.attach1),
                    attach2: FILES(form.attach2),
                    attach3: FILES(form.attach3),
                    attacht1: RT(form.attacht1),
                    attacht2: RT(form.attacht2),
                    attacht3: RT(form.attacht3)
                });
            }
            alert('견적서가 저장되었습니다.');
            setView('list');
            setEditMode(false);
            fetchInitialData();
        } catch (e: any) {
            console.error('Save Error:', e);
            let msg = e.message;
            try {
                const errorObj = JSON.parse(e.message);
                if (errorObj.message) msg = errorObj.message;
            } catch (err) { }
            alert('저장 오류: ' + msg);
        }
    };

    const handleEdit = (q: QuoteRecord) => {
        setForm({
            no: q.no,
            date: q.date,
            client: q.client,
            currency: q.currency || 'KRW',
            generalInfo: q.generalInfo || '',
            specialNotes: q.specialNotes || '',
            attach1: q.attach1 || '',
            attach2: q.attach2 || '',
            attach3: q.attach3 || '',
            attacht1: q.attacht1 || '',
            attacht2: q.attacht2 || '',
            attacht3: q.attacht3 || '',
            docType: q.docType || 'QUOTE',
            items: q.items.map(it => ({ ...it }))
        });
        setEditMode(true);
        setCurrentQuoteNo(q.no);
        setView('create');
    };

    const onProductSelect = (p: any) => {
        if (activeIdx === null) return;
        const updated = [...form.items];
        updated[activeIdx] = {
            ...updated[activeIdx],
            product: p.name,
            description: p.detail,
            voltage: p.voltage || '-',
            watts: p.watts || '-',
            luminousEff: p.luminousEff || '-',
            lumenOutput: p.lumenOutput || '-',
            cct: p.cct || '-',
            unitPrice: p.cost || 0
        };
        setForm({ ...form, items: updated });
    };

    const handlePrint = (q: QuoteRecord) => {
        // 고객사 정보 매핑
        const clientDoc = clients.find(c => {
            const cName = c.properties.ClientName?.title?.[0]?.plain_text || c.properties.ClientName?.rich_text?.[0]?.plain_text;
            return cName === q.client;
        });

        const clientInfo = clientDoc ? {
            address: clientDoc.properties.Address?.rich_text?.[0]?.plain_text || clientDoc.properties['주소']?.rich_text?.[0]?.plain_text || '',
            bizNo: clientDoc.properties.BizNo?.rich_text?.[0]?.plain_text || clientDoc.properties['사업자번호']?.rich_text?.[0]?.plain_text || '',
            ceo: clientDoc.properties.CEO?.rich_text?.[0]?.plain_text || clientDoc.properties['대표자']?.rich_text?.[0]?.plain_text || ''
        } : undefined;

        setPrintData({ ...q, clientInfo });
        setCompany(getSettings());
        setView('print');
    };

    if (view === 'print' && printData) {
        return (
            <div id="print-area" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', background: 'white', color: '#171717', fontFamily: '"Noto Sans KR", sans-serif', boxSizing: 'border-box', padding: '10mm', position: 'relative' }}>
                <style>{`
                    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;900&display=swap');
                    @media print { 
                        body * { visibility: hidden !important; }
                        #print-area, #print-area * { visibility: visible !important; } 
                        #print-area { position: absolute !important; left: 0 !important; top: 0 !important; width: 210mm !important; min-height: 297mm !important; margin: 0 !important; padding: 10mm !important; z-index: 9999 !important; background: white !important; box-sizing: border-box !important; }
                        .no-print { display: none !important; }
                        @page { size: A4 portrait; margin: 0; }
                    }
                    .quote-table { width: 100%; border-collapse: collapse; margin-top: 30px; }
                    .quote-table th { text-align: center; border-top: 2px solid #171717; border-bottom: 1px solid #171717; padding: 10px 4px; font-size: 11px; font-weight: 700; color: #171717; background: #f9f9f9; text-transform: uppercase; }
                    .quote-table td { border-bottom: 1px solid #e5e5e5; padding: 10px 4px; font-size: 11px; color: #333; vertical-align: middle; }
                    .quote-table tr:last-child td { border-bottom: 1px solid #171717; }
                    .box-container { display: flex; gap: 30px; margin-bottom: 30px; }
                    .box { flex: 1; border: 1px solid #e5e5e5; padding: 20px; border-radius: 8px; position: relative; }
                    .box-title { position: absolute; top: -10px; left: 15px; background: white; padding: 0 10px; font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 1px; }
                    .box-content { font-size: 13px; line-height: 1.6; color: #333; }
                `}</style>
                <div>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '50px' }}>
                        <div style={{ width: '30%' }}>
                            {company.logoUrl && (
                                <img src={company.logoUrl} alt="Logo" style={{ height: '45px', objectFit: 'contain', display: 'block' }} />
                            )}
                        </div>
                        <div style={{ textAlign: 'center', flex: 1 }}>
                            <h1 style={{ fontSize: '32px', fontWeight: 900, letterSpacing: '4px', margin: '0 0 5px 0', color: '#171717' }}>
                                {printData.docType === 'PROFORMA' ? 'PROFORMA INVOICE' : 'QUOTATION'}
                            </h1>
                            <div style={{ width: '40px', height: '4px', background: '#171717', margin: '15px auto' }}></div>
                        </div>
                        <div style={{ width: '30%', textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', textTransform: 'uppercase' }}>Reference No.</div>
                            <div style={{ fontSize: '16px', fontWeight: 700, color: '#171717', marginBottom: '10px' }}>{printData.no}</div>

                            <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', textTransform: 'uppercase' }}>Date</div>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: '#333' }}>{printData.date}</div>
                        </div>
                    </div>

                    {/* Company Info (Seller) & Client (Buyer) */}
                    <div className="box-container">
                        {/* Seller (From) */}
                        <div className="box" style={{ background: '#fafafa', border: 'none' }}>
                            <div className="box-title" style={{ background: '#fafafa' }}>From (Seller)</div>
                            <div className="box-content">
                                <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '10px', color: '#171717' }}>{company.name}</div>
                                <div style={{ marginBottom: '2px' }}>{company.address}</div>
                                <div style={{ marginBottom: '2px' }}>Tel: {company.tel} / Fax: {company.fax}</div>
                                <div>Email: {company.email}</div>
                            </div>
                        </div>

                        {/* Buyer (To) */}
                        <div className="box">
                            <div className="box-title">To (Buyer)</div>
                            <div className="box-content">
                                <div style={{ fontSize: '18px', fontWeight: 800, marginBottom: '10px', color: '#171717' }}>{printData.client}</div>
                                {printData.clientInfo && (
                                    <>
                                        <div style={{ marginBottom: '2px' }}>Attn: {printData.clientInfo.ceo || '-'}</div>
                                        <div style={{ marginBottom: '2px' }}>{printData.clientInfo.address}</div>
                                        <div>Biz No: {printData.clientInfo.bizNo}</div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <table className="quote-table">
                        <thead>
                            <tr>
                                <th style={{ width: '5%' }}>No</th>
                                <th style={{ textAlign: 'left', paddingLeft: '10px' }}>Description / Specifications</th>
                                <th style={{ width: '15%' }}>Tech Detail</th>
                                <th style={{ width: '8%' }}>Unit</th>
                                <th style={{ width: '8%' }}>Qty</th>
                                <th style={{ width: '12%', textAlign: 'right' }}>Unit Price</th>
                                <th style={{ width: '15%', textAlign: 'right' }}>Amount</th>
                                <th style={{ width: '15%' }}>Remarks</th>
                            </tr>
                        </thead>
                        <tbody>
                            {printData.items.map((it, i) => (
                                <tr key={i}>
                                    <td style={{ textAlign: 'center', color: '#888' }}>{i + 1}</td>
                                    <td style={{ paddingLeft: '10px' }}>
                                        <div style={{ fontWeight: 600, color: '#171717' }}>{it.product}</div>
                                        <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>{it.description}</div>
                                    </td>
                                    <td style={{ textAlign: 'center', fontSize: '10px', color: '#666' }}>
                                        {it.voltage}/{it.watts}<br />
                                        {it.luminousEff}/{it.cct}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>{it.unit}</td>
                                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{it.qty}</td>
                                    <td style={{ textAlign: 'right' }}>{it.unitPrice.toLocaleString()}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#171717' }}>{it.amount.toLocaleString()}</td>
                                    <td style={{ textAlign: 'center', fontSize: '10px', color: '#888' }}>{it.remarks}</td>
                                </tr>
                            ))}
                            {/* Fill empty rows */}
                            {Array.from({ length: Math.max(0, 8 - printData.items.length) }).map((_, i) => (
                                <tr key={`empty-${i}`}>
                                    <td style={{ padding: '15px' }}></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Total Section */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#666' }}>GRAND TOTAL ({printData.currency})</div>
                            <div style={{ fontSize: '24px', fontWeight: 900, color: '#171717' }}>
                                {getCurrencySymbol(printData.currency)}{printData.totalAmount.toLocaleString()}
                            </div>
                        </div>
                    </div>

                    {/* Terms and Bank Info */}
                    <div style={{ display: 'flex', gap: '30px', marginTop: '40px' }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#171717', marginBottom: '10px', textTransform: 'uppercase' }}>Terms & Bank Info</div>
                            <div style={{ fontSize: '12px', color: '#555', lineHeight: '1.6', borderTop: '1px solid #e5e5e5', paddingTop: '10px' }}>
                                <div style={{ marginBottom: '10px', whiteSpace: 'pre-wrap' }}>{printData.specialNotes}</div>
                                <div style={{ background: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
                                    <div style={{ fontWeight: 700, marginBottom: '5px' }}>Bank Account</div>
                                    {printData.currency === 'KRW' ? company.bank : `${company.bankForeign1}\n${company.bankForeign2}`}
                                </div>
                            </div>
                        </div>
                        <div style={{ width: '250px', display: 'flex', flexDirection: 'column', height: '150px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#171717', marginBottom: '10px', textTransform: 'uppercase' }}>Authorized Signature</div>
                            <div style={{ flex: 1, borderBottom: '2px solid #171717', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {company.stampUrl && (
                                    <img src={company.stampUrl} alt="Stamp" style={{ width: '250px', opacity: 0.8, transform: 'rotate(-5deg)', position: 'absolute' }} />
                                )}
                            </div>
                            <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 700, marginTop: '8px', color: '#171717' }}>{company.name}</div>
                        </div>
                    </div>
                </div>

                {/* Attachments Page (if needed) */}
                {(printData.attach1 || printData.attach2 || printData.attach3 || printData.attacht1 || printData.attacht2 || printData.attacht3) && (
                    <div style={{ pageBreakBefore: 'always', marginTop: '50px', padding: '40px' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '20px', borderBottom: '2px solid #171717', paddingBottom: '10px' }}>ATTACHMENTS</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                            {[1, 2, 3].map(n => {
                                const img = (printData as any)[`attach${n}`];
                                const text = (printData as any)[`attacht${n}`];
                                if (!img && !text) return null;
                                return (
                                    <div key={n} className="attach-item">
                                        <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '5px', color: '#888' }}>Attachment {n}</div>
                                        {img && <img src={img} style={{ maxWidth: '100%', border: '1px solid #e5e5e5', borderRadius: '4px', marginBottom: '10px' }} />}
                                        {text && <div style={{ fontSize: '12px', lineHeight: '1.6', color: '#333', whiteSpace: 'pre-wrap' }}>{text}</div>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="no-print" style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '15px', background: 'rgba(255,255,255,0.9)', padding: '10px 20px', borderRadius: '30px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', border: '1px solid rgba(0,0,0,0.1)' }}>
                    <button onClick={() => setView('list')} style={{ background: 'transparent', color: '#171717', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                        <ArrowLeft size={16} /> Exit
                    </button>
                    <div style={{ width: '1px', height: '20px', background: '#e5e5e5' }}></div>
                    <button onClick={() => window.print()} style={{ background: '#171717', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, padding: '8px 20px', borderRadius: '20px' }}>
                        <Printer size={16} /> Print Quote
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1rem' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.5rem' }}>
                        <div style={{ padding: '8px', background: 'rgba(0,112,243,0.1)', borderRadius: '10px' }}>
                            <Quote size={24} style={{ color: '#0070f3' }} />
                        </div>
                        <h2 style={{ fontSize: '2rem', fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }}>Quotation Manager</h2>
                    </div>
                    <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '1rem' }}>Manage professional quotations with Notion DB synchronization</p>
                </div>
                {view === 'list' && (
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={() => {
                            const now = new Date();
                            const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
                            const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
                            const msStr = String(now.getMilliseconds()).padStart(3, '0');
                            const randomStr = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
                            const newNo = 'Q' + dateStr + '-' + timeStr + msStr + '-' + randomStr;
                            setForm({
                                no: newNo,
                                date: new Date().toISOString().substring(0, 10),
                                client: '',
                                currency: 'KRW',
                                generalInfo: '',
                                specialNotes: '',
                                attach1: '',
                                attach2: '',
                                attach3: '',
                                attacht1: '',
                                attacht2: '',
                                attacht3: '',
                                docType: 'QUOTE',
                                items: [{
                                    id: Date.now(),
                                    product: '', description: '',
                                    voltage: '-', watts: '-', luminousEff: '-',
                                    lumenOutput: '-', cct: '-', unit: 'PCS',
                                    unitPrice: 0, qty: 1, amount: 0, remarks: ''
                                }]
                            });
                            setEditMode(false);
                            setView('create');
                        }} style={{ background: 'linear-gradient(135deg, #0070f3, #6c5ce7)', border: 'none', padding: '0.8rem 1.8rem', borderRadius: '14px', color: 'white', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,112,243,0.3)', transition: 'transform 0.2s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                            <Plus size={20} /> Create New Quote
                        </button>
                        <button onClick={() => {
                            const now = new Date();
                            const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
                            const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
                            const msStr = String(now.getMilliseconds()).padStart(3, '0');
                            const randomStr = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
                            const newNo = 'PI' + dateStr + '-' + timeStr + msStr + '-' + randomStr;
                            setForm({
                                no: newNo,
                                date: new Date().toISOString().substring(0, 10),
                                client: '',
                                currency: 'USD',
                                generalInfo: '',
                                specialNotes: '',
                                attach1: '',
                                attach2: '',
                                attach3: '',
                                attacht1: '',
                                attacht2: '',
                                attacht3: '',
                                docType: 'PROFORMA',
                                items: [{
                                    id: Date.now(),
                                    product: '', description: '',
                                    voltage: '-', watts: '-', luminousEff: '-',
                                    lumenOutput: '-', cct: '-', unit: 'PCS',
                                    unitPrice: 0, qty: 1, amount: 0, remarks: ''
                                }]
                            });
                            setEditMode(false);
                            setView('create');
                        }} style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none', padding: '0.8rem 1.8rem', borderRadius: '14px', color: 'white', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', boxShadow: '0 4px 15px rgba(118,75,162,0.3)', transition: 'transform 0.2s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                            <FileText size={20} /> PROFORMA Quote
                        </button>
                    </div>
                )}
            </header>

            {view === 'create' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="glass" style={{ padding: '2.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1.25rem', marginBottom: '2.5rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>Quote Reference</label>
                                <input value={form.no} readOnly style={{ width: '100%', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '0.8rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600, cursor: 'not-allowed' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>Date</label>
                                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.8rem', color: 'white', colorScheme: 'dark' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>Client (Receiver)</label>
                                <select value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.8rem', color: 'white', fontWeight: 600 }}>
                                    <option value="">-- Select Client --</option>
                                    {clients.map(c => <option key={c.id} value={c.properties.ClientName.title[0].plain_text}>{c.properties.ClientName.title[0].plain_text}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>Currency</label>
                                <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.8rem', color: '#0070f3', fontWeight: 800 }}>
                                    <option value="KRW">KRW (₩)</option>
                                    <option value="USD">USD ($)</option>
                                    <option value="RMB">RMB (¥)</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>General Condition</label>
                                <input value={form.generalInfo} onChange={e => setForm({ ...form, generalInfo: e.target.value })} placeholder="e.g. Nett 30 Days" style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.8rem', color: 'white' }} />
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto', marginBottom: '2.5rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.1)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1600px' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(255,255,255,0.02)', color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                        <th style={{ padding: '15px' }}>Product</th>
                                        <th style={{ padding: '15px' }}>Spec/Detail</th>
                                        <th style={{ padding: '15px', width: '90px' }}>Volt</th>
                                        <th style={{ padding: '15px', width: '90px' }}>Watt</th>
                                        <th style={{ padding: '15px', width: '90px' }}>Eff</th>
                                        <th style={{ padding: '15px', width: '100px' }}>Lumen</th>
                                        <th style={{ padding: '15px', width: '100px' }}>CCT</th>
                                        <th style={{ padding: '15px', width: '90px' }}>Unit</th>
                                        <th style={{ padding: '15px', width: '120px', textAlign: 'right' }}>Price</th>
                                        <th style={{ padding: '15px', width: '80px', textAlign: 'right' }}>Qty</th>
                                        <th style={{ padding: '15px', width: '140px', textAlign: 'right' }}>Total</th>
                                        <th style={{ padding: '15px' }}>Remarks</th>
                                        <th style={{ padding: '15px', width: '40px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {form.items.map((it, idx) => (
                                        <tr key={it.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <td style={{ padding: '12px' }}>
                                                <input value={it.product} onClick={() => { setActiveIdx(idx); setIsPickerOpen(true); }} readOnly placeholder="Click to select..." style={{ width: '100%', background: 'rgba(0,112,243,0.1)', border: '1px dashed rgba(0,112,243,0.3)', color: '#0070f3', fontWeight: 700, cursor: 'pointer', padding: '8px 12px', borderRadius: '8px', fontSize: '0.85rem' }} />
                                            </td>
                                            <td style={{ padding: '12px' }}>
                                                <input value={it.description} onChange={e => {
                                                    const updated = [...form.items];
                                                    updated[idx].description = e.target.value;
                                                    setForm({ ...form, items: updated });
                                                }} style={{ width: '100%', background: 'transparent', border: 'none', color: 'white', fontSize: '0.85rem' }} />
                                            </td>
                                            {['voltage', 'watts', 'luminousEff', 'lumenOutput', 'cct'].map(field => (
                                                <td key={field} style={{ padding: '12px' }}>
                                                    <input value={(it as any)[field]} onChange={e => {
                                                        const updated = [...form.items];
                                                        (updated[idx] as any)[field] = e.target.value;
                                                        setForm({ ...form, items: updated });
                                                    }} style={{ width: '100%', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', textAlign: 'center' }} />
                                                </td>
                                            ))}
                                            <td style={{ padding: '12px' }}>
                                                <select value={it.unit} onChange={e => {
                                                    const updated = [...form.items];
                                                    updated[idx].unit = e.target.value;
                                                    setForm({ ...form, items: updated });
                                                }} style={{ width: '100%', background: 'transparent', border: 'none', color: 'white', fontSize: '0.8rem', textAlign: 'center' }}>
                                                    <option value="PCS">PCS</option>
                                                    <option value="SET">SET</option>
                                                    <option value="EA">EA</option>
                                                    <option value="UNIT">UNIT</option>
                                                    <option value="BOX">BOX</option>
                                                    <option value="M">M</option>
                                                </select>
                                            </td>
                                            <td style={{ padding: '12px' }}>
                                                <input type="number" value={it.unitPrice} onChange={e => {
                                                    const updated = [...form.items];
                                                    updated[idx].unitPrice = Number(e.target.value);
                                                    setForm({ ...form, items: updated });
                                                }} style={{ width: '100%', background: 'transparent', border: 'none', color: 'white', textAlign: 'right', fontWeight: 700 }} />
                                            </td>
                                            <td style={{ padding: '12px' }}>
                                                <input type="number" value={it.qty} onChange={e => {
                                                    const updated = [...form.items];
                                                    updated[idx].qty = Number(e.target.value);
                                                    setForm({ ...form, items: updated });
                                                }} style={{ width: '100%', background: 'transparent', border: 'none', color: '#00ff88', textAlign: 'right', fontWeight: 800 }} />
                                            </td>
                                            <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: '#0070f3' }}>
                                                {getCurrencySymbol(form.currency)}{(it.qty * it.unitPrice).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '12px' }}>
                                                <input value={it.remarks} onChange={e => {
                                                    const updated = [...form.items];
                                                    updated[idx].remarks = e.target.value;
                                                    setForm({ ...form, items: updated });
                                                }} placeholder="..." style={{ width: '100%', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }} />
                                            </td>
                                            <td style={{ padding: '12px' }}>
                                                <button onClick={() => setForm({ ...form, items: form.items.filter(item => item.id !== it.id) })} style={{ color: '#ff4d4f', opacity: 0.5, border: 'none', background: 'transparent', cursor: 'pointer', transition: 'opacity 0.2s' }} onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)' }}>
                                <button onClick={addItem} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '8px 20px', borderRadius: '10px', color: 'white', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Plus size={16} /> Add Item
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '2.5rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Special Instructions / Remarks</label>
                                <textarea value={form.specialNotes} onChange={e => setForm({ ...form, specialNotes: e.target.value })} placeholder="Enter terms, bank info, or specific conditions..." style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.2rem', color: 'white', height: '140px', resize: 'none', lineHeight: '1.6', fontSize: '0.9rem' }} />

                                <div style={{ marginTop: '2.5rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                                    {[1, 2, 3].map(n => (
                                        <div key={n} className="glass" style={{ padding: '1.25rem', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '20px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                <label style={{ fontSize: '0.7rem', fontWeight: 900, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Attachment {n}</label>
                                                {(form as any)[`attach${n}`] && <button onClick={() => setForm({ ...form, [`attach${n}`]: '' })} style={{ background: 'rgba(255,75,75,0.1)', color: '#ff4b4b', border: 'none', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}>Remove</button>}
                                            </div>
                                            <div style={{
                                                width: '100%', aspectRatio: '16/9', background: 'rgba(0,0,0,0.3)',
                                                borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                overflow: 'hidden', cursor: 'pointer', marginBottom: '15px', position: 'relative'
                                            }} onClick={() => !(form as any)[`attach${n}`] && document.getElementById(`file-quote-${n}`)?.click()}>
                                                {(form as any)[`attach${n}`] ? (
                                                    <img src={(form as any)[`attach${n}`]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <div style={{ textAlign: 'center', opacity: 0.3 }}>
                                                        <Plus size={24} style={{ margin: '0 auto 5px' }} />
                                                        <p style={{ fontSize: '0.6rem' }}>Click to upload reference image</p>
                                                    </div>
                                                )}
                                                {uploading === `attach${n}` && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>Uploading...</div>}
                                                <input id={`file-quote-${n}`} type="file" hidden onChange={e => handleFileUpload(e, `attach${n}`)} />
                                            </div>
                                            <textarea
                                                placeholder="Enter purpose or reference description for this item..."
                                                value={(form as any)[`attacht${n}`]}
                                                onChange={e => setForm({ ...form, [`attacht${n}`]: e.target.value })}
                                                style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '0.8rem', fontSize: '0.8rem', color: 'white', height: '80px', resize: 'none' }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ background: 'rgba(0,112,243,0.05)', border: '1px solid rgba(0,112,243,0.1)', borderRadius: '24px', padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end' }}>
                                <p style={{ fontSize: '0.8rem', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '1px' }}>Grand Total Amount</p>
                                <h3 style={{ fontSize: '3.5rem', fontWeight: 950, color: '#0070f3', margin: 0, letterSpacing: '-2px' }}>
                                    {getCurrencySymbol(form.currency)}{form.items.reduce((acc, it) => acc + (it.qty * it.unitPrice), 0).toLocaleString()}
                                </h3>
                                <p style={{ marginTop: '10px', color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem' }}>Based on {form.items.length} items</p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'flex-end', marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <button onClick={() => setView('list')} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', padding: '1rem 2.5rem', borderRadius: '14px', color: 'white', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleSave} style={{ background: 'linear-gradient(135deg, #0070f3, #6c5ce7)', border: 'none', padding: '1rem 4rem', borderRadius: '14px', color: 'white', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,112,243,0.4)' }}>
                                {editMode ? 'Update Quotation' : 'Save & Publish Quote'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="glass" style={{ padding: '2rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                        <div style={{ position: 'relative', width: '450px' }}>
                            <Search size={20} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
                            <input
                                type="text"
                                placeholder="Search by Quote No or Client..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '1rem 1rem 1rem 3.2rem', borderRadius: '16px', color: 'white', fontSize: '0.95rem' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div style={{ padding: '10px 15px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>
                                Total: <span style={{ color: 'white', fontWeight: 700 }}>{filteredQuotes.length}</span> Quotes
                            </div>
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
                                    <th style={{ padding: '1.2rem' }}>Quote Ref</th>
                                    <th style={{ padding: '1.2rem' }}>Date</th>
                                    <th style={{ padding: '1.2rem' }}>Client Name</th>
                                    <th style={{ padding: '1.2rem', textAlign: 'right' }}>Total Amount</th>
                                    <th style={{ padding: '1.2rem', width: '180px', textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={5} style={{ padding: '5rem', textAlign: 'center', opacity: 0.5 }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                            <div className="spinner"></div>
                                            <span>Synchronizing with Notion DB...</span>
                                        </div>
                                    </td></tr>
                                ) : filteredQuotes.length === 0 ? (
                                    <tr><td colSpan={5} style={{ padding: '5rem', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>No quotations found match your search.</td></tr>
                                ) : filteredQuotes.map((q) => (
                                    <tr key={q.pageId} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={{ padding: '1.5rem 1.2rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0070f3' }}></div>
                                                <span style={{ fontWeight: 700, color: 'white', fontSize: '1rem' }}>{q.no}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.5rem 1.2rem', color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>{q.date}</td>
                                        <td style={{ padding: '1.5rem 1.2rem' }}>
                                            <div style={{ fontWeight: 700, color: 'white', marginBottom: '4px' }}>{q.client}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '4px' }}><Box size={10} /> {q.items.length} Items included</div>
                                        </td>
                                        <td style={{ padding: '1.5rem 1.2rem', textAlign: 'right' }}>
                                            <div style={{ fontWeight: 950, color: '#0070f3', fontSize: '1.1rem' }}>{getCurrencySymbol(q.currency)}{q.totalAmount.toLocaleString()}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>Currency: {q.currency}</div>
                                        </td>
                                        <td style={{ padding: '1.5rem 1.2rem' }}>
                                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                                                <button onClick={() => handlePrint(q)} title="Print Document" style={{ padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', color: 'white', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; }}><Printer size={18} /></button>
                                                <button onClick={() => handleEdit(q)} title="Edit Details" style={{ padding: '10px', background: 'rgba(0,112,243,0.1)', border: '1px solid rgba(0,112,243,0.1)', borderRadius: '12px', color: '#0070f3', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,112,243,0.2)'; e.currentTarget.style.borderColor = 'rgba(0,112,243,0.3)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,112,243,0.1)'; e.currentTarget.style.borderColor = 'rgba(0,112,243,0.1)'; }}><ChevronRight size={18} /></button>
                                                <button onClick={async () => {
                                                    if (!validatePeriod(q.date)) return;
                                                    if (confirm('Are you sure to delete this quotation?')) { for (const it of q.items) await notionDelete(it.id.toString()); fetchInitialData(); }
                                                }} title="Delete" style={{ padding: '10px', background: 'rgba(255,77,79,0.1)', border: '1px solid rgba(255,77,79,0.1)', borderRadius: '12px', color: '#ff4d4f', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,77,79,0.2)'; e.currentTarget.style.borderColor = 'rgba(255,77,79,0.3)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,77,79,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,77,79,0.1)'; }}>
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            <ProductPicker isOpen={isPickerOpen} onClose={() => setIsPickerOpen(false)} onSelect={onProductSelect} />
        </div>
    );
}
