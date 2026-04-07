'use client';

import React, { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Search, FileText, Trash2, Printer, ChevronRight, Calculator, User, Building, MapPin, Mail, Phone, Box, ArrowLeft, Download, CheckCircle, Package } from 'lucide-react';
import Modal from '@/components/erp/Modal';
import ProductPicker from '@/components/erp/ProductPicker';
import QuotePicker from '@/components/erp/QuotePicker';
import {
    notionQuery, notionCreate, notionUpdate, notionDelete,
    isWithinCurrentMonth, validatePeriod,
    DB_PURCHASE_ORDERS, DB_CLIENTS, DB_PRODUCTS, RT, TITLE, num, dateISO, FILES, uploadFile
} from '@/lib/notion-erp';
import { getSettings } from '@/lib/erp-settings';

interface POItem {
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

interface PORecord {
    pageId: string;
    no: string;
    date: string;
    supplier: string;
    totalAmount: number;
    currency: string;
    items: POItem[];
    generalInfo?: string;
    specialNotes?: string;
    attach1?: string;
    attach2?: string;
    attach3?: string;
    attacht1?: string;
    attacht2?: string;
    attacht3?: string;
    root?: string;
    supplierDetail?: {
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

export default function PurchaseOrdersPage() {
    const [pos, setPos] = useState<PORecord[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'list' | 'create' | 'print'>('list');
    const [search, setSearch] = useState('');
    const [form, setForm] = useState<{
        no: string;
        date: string;
        supplier: string;
        currency: string;
        generalInfo: string;
        specialNotes: string;
        attach1: string;
        attach2: string;
        attach3: string;
        attacht1: string;
        attacht2: string;
        attacht3: string;
        root: string;
        items: POItem[];
    }>({
        no: 'PO' + new Date().toISOString().substring(0, 10).replace(/-/g, '') + '-01',
        date: new Date().toISOString().substring(0, 10),
        supplier: '',
        currency: 'KRW',
        generalInfo: '',
        specialNotes: '',
        attach1: '',
        attach2: '',
        attach3: '',
        attacht1: '',
        attacht2: '',
        attacht3: '',
        root: '',
        items: [{
            id: Date.now(),
            product: '', description: '',
            voltage: '-', watts: '-', luminousEff: '-',
            lumenOutput: '-', cct: '-', unit: 'PCS',
            unitPrice: 0, qty: 1, amount: 0, remarks: ''
        }]
    });

    const [printData, setPrintData] = useState<PORecord | null>(null);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [isQuotePickerOpen, setIsQuotePickerOpen] = useState(false);
    const [activeIdx, setActiveIdx] = useState<number | null>(null);
    const [company, setCompany] = useState(getSettings());
    const [editMode, setEditMode] = useState(false);
    const [currentPoNo, setCurrentPoNo] = useState<string | null>(null);
    const [uploading, setUploading] = useState<string | null>(null);
    const [isRootModalOpen, setIsRootModalOpen] = useState(false);

    useEffect(() => {
        fetchInitialData();
        setCompany(getSettings());
    }, []);

    async function fetchInitialData() {
        try {
            setLoading(true);
            const [poRes, sRes] = await Promise.all([
                notionQuery(DB_PURCHASE_ORDERS, { sorts: [{ property: 'Date', direction: 'descending' }] }),
                notionQuery(DB_CLIENTS)
            ]);

            const groupedPOs: { [key: string]: PORecord } = {};
            poRes.results.forEach((r: any) => {
                const props = r.properties;
                // 사용자의 스크린샷과 일치하는 속성명 우선 사용
                const no = props.PoNo?.rich_text?.[0]?.plain_text || props.PoNo1?.rich_text?.[0]?.plain_text || props.PoNo?.title?.[0]?.plain_text || 'Unknown';
                if (!groupedPOs[no]) {
                    groupedPOs[no] = {
                        pageId: r.id,
                        no,
                        date: props.Date?.date?.start || '-',
                        supplier: props.Supplier?.rich_text?.[0]?.plain_text || props.Supplier?.title?.[0]?.plain_text || '-',
                        currency: props.Currency?.rich_text?.[0]?.plain_text || props.Currency?.select?.name || props.Unit?.select?.name || 'KRW',
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
                        root: props.root?.files?.[0]?.external?.url || props.root?.files?.[0]?.file?.url || ''
                    };
                }
                const amt = props.Amount?.number || 0;
                groupedPOs[no].totalAmount += amt;
                groupedPOs[no].items.push({
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

            setPos(Object.values(groupedPOs));
            setSuppliers(sRes.results);
            // Fetch products for bulk price application
            const pRes = await notionQuery(DB_PRODUCTS);
            setProducts(pRes.results);
        } catch (e) {
            console.error('발주 데이터 로드 실패:', e);
        } finally {
            setLoading(false);
        }
    }

    const filteredPOs = pos.filter(p =>
        p.no.toLowerCase().includes(search.toLowerCase()) ||
        p.supplier.toLowerCase().includes(search.toLowerCase())
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

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, field: string) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploading(field);
        try {
            const { url } = await uploadFile(file);
            setForm(prev => ({ ...prev, [field]: url }));
        } catch (error) {
            console.error('File upload failed:', error);
            alert('파일 업로드 실패.');
        } finally {
            setUploading(null);
        }
    };

    const handleSave = async () => {
        if (!form.supplier) return alert('공급처를 선택하세요.');
        if (form.items.length === 0) return alert('최소 1개의 품목이 필요합니다.');

        // 당월 체크 (수정인 경우)
        if (editMode && currentPoNo) {
            if (!validatePeriod(form.date)) return;
        }

        try {
            if (editMode && currentPoNo) {
                const toDelete = pos.find(p => p.no === currentPoNo)?.items.map(it => it.id.toString()) || [];
                for (const pid of toDelete) await notionDelete(pid);
            }

            for (let i = 0; i < form.items.length; i++) {
                const item = form.items[i];
                await notionCreate(DB_PURCHASE_ORDERS, {
                    // 스크린샷 1: "Estimate No"가 제목 속성인 것으로 보임
                    "Estimate No": TITLE(form.supplier),
                    PoNo: RT(form.no),
                    index: RT(String(i + 1)),
                    Date: dateISO(form.date),
                    Supplier: RT(form.supplier),
                    Currency: RT(form.currency),
                    Product: RT(item.product),
                    Description: RT(item.description),
                    Voltage: RT(item.voltage),
                    Watts: RT(item.watts),
                    LuminousEff: RT(item.luminousEff),
                    LumenOutput: RT(item.lumenOutput),
                    CCT: RT(item.cct),
                    // 스크린샷 2: "Unit" 컬럼에 KRW, RMB이 저장되어 있음
                    Unit: { select: { name: form.currency } },
                    UnitPrice: num(item.unitPrice),
                    Qty: num(item.qty),
                    Amount: num(item.qty * item.unitPrice),
                    Remarks: RT(item.remarks),
                    GeneralInfo: RT(form.generalInfo),
                    SpecialNotes: RT(form.specialNotes),
                    attach1: FILES(form.attach1),
                    attach2: FILES(form.attach2),
                    attach3: FILES(form.attach3),
                    attacht1: RT(form.attacht1),
                    attacht2: RT(form.attacht2),
                    attacht3: RT(form.attacht3),
                    root: FILES(form.root)
                });
            }
            alert('발주서가 저장되었습니다.');
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

    const handleEdit = (p: PORecord) => {
        setForm({
            no: p.no,
            date: p.date,
            supplier: p.supplier,
            currency: p.currency || 'KRW',
            generalInfo: p.generalInfo || '',
            specialNotes: p.specialNotes || '',
            attach1: p.attach1 || '',
            attach2: p.attach2 || '',
            attach3: p.attach3 || '',
            attacht1: p.attacht1 || '',
            attacht2: p.attacht2 || '',
            attacht3: p.attacht3 || '',
            root: p.root || '',
            items: p.items.map(it => ({ ...it }))
        });
        setEditMode(true);
        setCurrentPoNo(p.no);
        setView('create');
    };

    const onProductSelect = (p: any) => {
        if (activeIdx === null) return;
        const updated = [...form.items];
        updated[activeIdx] = {
            ...updated[activeIdx],
            product: p.name,
            description: p.detail || '',
            voltage: p.voltage || '-',
            watts: p.watts || '-',
            luminousEff: p.efficiency || '-',
            lumenOutput: p.lumen || '-',
            cct: p.cct || '-',
            unit: p.unit || 'PCS'
        };
        setForm({ ...form, items: updated });
        setIsPickerOpen(false);
    };

    const onQuoteSelect = (quote: any) => {
        const newItems = quote.items.map((it: any) => ({
            id: Date.now() + Math.random(),
            product: it.product,
            description: it.description,
            voltage: it.voltage,
            watts: it.watts,
            luminousEff: it.luminousEff,
            lumenOutput: it.lumenOutput,
            cct: it.cct,
            unit: it.unit,
            unitPrice: 0, // 가격은 직접 입력하도록 0으로 설정
            qty: it.qty,
            amount: 0,
            remarks: ''
        }));

        setForm(prev => ({
            ...prev,
            supplier: quote.client, // 견적 업체명을 공급업체명으로 권장
            currency: quote.currency,
            items: newItems
        }));
        setIsQuotePickerOpen(false);
        setView('create'); // 불러오기 성공 시 작성 화면으로 전환
        alert(`${quote.no} 견적 내용이 불러와졌습니다. (가격은 0으로 설정되었습니다)`);
    };
    const applyCostPrices = () => {
        if (!products || products.length === 0) {
            alert('제품 데이터를 불러오는 중이거나 데이터가 없습니다. (데이터를 불러온 후 다시 시도해 주세요)');
            return;
        }

        let matchCount = 0;
        const updatedItems = form.items.map(item => {
            if (!item.product) return item;

            const trimmedItemProduct = item.product.trim().toLowerCase();
            const matchedProduct = products.find(p => {
                const props = p.properties;
                // ProductName이 Title일 수도 있고 RichText일 수도 있음 (기존 코드의 불일치 대응)
                const pNameFromRT = props.ProductName?.rich_text?.[0]?.plain_text;
                const pNameFromTitle = props.ProductName?.title?.[0]?.plain_text;
                const pNameAlternative = props['이름']?.title?.[0]?.plain_text;
                const pCode = props.ProductCode?.rich_text?.[0]?.plain_text;

                const possibleNames = [pNameFromRT, pNameFromTitle, pNameAlternative, pCode]
                    .filter(n => n != null)
                    .map(n => n!.trim().toLowerCase());

                return possibleNames.includes(trimmedItemProduct);
            });

            if (matchedProduct) {
                const cost = matchedProduct.properties.Cost?.number || 0;
                if (cost > 0) {
                    matchCount++;
                    return { ...item, unitPrice: cost, amount: cost * item.qty };
                }
            }
            return item;
        });

        if (matchCount === 0) {
            alert('일치하는 제품 정보나 등록된 단가를 찾을 수 없습니다.\n(제품 데이터베이스의 [제품명] 또는 [제품코드]와 정확히 일치해야 합니다)');
        } else {
            setForm(prev => ({ ...prev, items: updatedItems }));
            alert(`${matchCount}개 항목의 등록 단가가 적용되었습니다.`);
        }
    };

    const handlePrint = (p: PORecord) => {
        // 공급업체 정보 매핑
        const supDoc = suppliers.find(s => {
            const sName = s.properties.ClientName?.title?.[0]?.plain_text || s.properties.ClientName?.rich_text?.[0]?.plain_text;
            return sName === p.supplier;
        });

        const supplierDetail = supDoc ? {
            address: supDoc.properties.Address?.rich_text?.[0]?.plain_text || supDoc.properties['주소']?.rich_text?.[0]?.plain_text || '',
            bizNo: supDoc.properties.BizNo?.rich_text?.[0]?.plain_text || supDoc.properties['사업자번호']?.rich_text?.[0]?.plain_text || '',
            ceo: supDoc.properties.CEO?.rich_text?.[0]?.plain_text || supDoc.properties['대표자']?.rich_text?.[0]?.plain_text || ''
        } : undefined;

        setPrintData({ ...p, supplierDetail });
        setCompany(getSettings());
        setView('print');
        // window.print calls are removed to allow rendering first
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
                    .po-table { width: 100%; border-collapse: collapse; margin-top: 30px; }
                    .po-table th { text-align: center; border-top: 2px solid #171717; border-bottom: 1px solid #171717; padding: 10px 4px; font-size: 11px; font-weight: 700; color: #171717; background: #f9f9f9; text-transform: uppercase; }
                    .po-table td { border-bottom: 1px solid #e5e5e5; padding: 10px 4px; font-size: 11px; color: #333; vertical-align: middle; }
                    .po-table tr:last-child td { border-bottom: 1px solid #171717; }
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
                            <h1 style={{ fontSize: '32px', fontWeight: 900, letterSpacing: '4px', margin: '0 0 5px 0', color: '#171717' }}>PURCHASE ORDER</h1>
                            <div style={{ width: '40px', height: '4px', background: '#171717', margin: '15px auto' }}></div>
                        </div>
                        <div style={{ width: '30%', textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', textTransform: 'uppercase' }}>P.O Number</div>
                            <div style={{ fontSize: '16px', fontWeight: 700, color: '#171717', marginBottom: '10px' }}>{printData.no}</div>

                            <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', textTransform: 'uppercase' }}>Issue Date</div>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: '#333' }}>{printData.date}</div>
                        </div>
                    </div>

                    {/* Company Info (Buyer) & Supplier */}
                    <div className="box-container">
                        {/* Supplier */}
                        <div className="box">
                            <div className="box-title">Supplier (Vendor)</div>
                            <div className="box-content">
                                <div style={{ fontSize: '18px', fontWeight: 800, marginBottom: '10px', color: '#171717' }}>{printData.supplier}</div>
                                {printData.supplierDetail && (
                                    <>
                                        <div style={{ marginBottom: '2px' }}>Attn: {printData.supplierDetail.ceo || '-'}</div>
                                        <div style={{ marginBottom: '2px' }}>{printData.supplierDetail.address}</div>
                                        <div>Biz No: {printData.supplierDetail.bizNo}</div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Ship To (Buyer) */}
                        <div className="box" style={{ background: '#fafafa', border: 'none' }}>
                            <div className="box-title" style={{ background: '#fafafa' }}>Ship To (Buyer)</div>
                            <div className="box-content">
                                <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '10px', color: '#171717' }}>{company.name}</div>
                                <div style={{ marginBottom: '2px' }}>{company.address}</div>
                                <div style={{ marginBottom: '2px' }}>Tel: {company.tel} / Fax: {company.fax}</div>
                                <div>Attn: Purchase Department</div>
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <table className="po-table">
                        <thead>
                            <tr>
                                <th style={{ width: '5%' }}>No</th>
                                <th style={{ textAlign: 'left', paddingLeft: '10px' }}>Description / Specifications</th>
                                <th style={{ width: '15%' }}>Tech Data</th>
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
                                    <td style={{ textAlign: 'center', fontSize: '10px', color: '#666' }}>{it.voltage}/{it.watts}/{it.cct}</td>
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

                    {/* Terms and Signature */}
                    <div style={{ display: 'flex', gap: '30px', marginTop: '40px' }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#171717', marginBottom: '10px', textTransform: 'uppercase' }}>Terms & Conditions</div>
                            <div style={{ fontSize: '12px', color: '#555', lineHeight: '1.6', whiteSpace: 'pre-wrap', borderTop: '1px solid #e5e5e5', paddingTop: '10px' }}>
                                {printData.specialNotes || '1. Please confirm receipt of this order.\n2. Payment terms as agreed.\n3. Notify us immediately if unable to ship as specified.'}
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
                {(printData.attach1 || printData.attach2 || printData.attach3) && (
                    <div style={{ pageBreakBefore: 'always', marginTop: '50px', padding: '40px' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '20px', borderBottom: '2px solid #171717', paddingBottom: '10px' }}>ATTACHMENTS</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                            {[1, 2, 3].map(n => {
                                const attachUrl = (printData as any)[`attach${n}`];
                                return attachUrl && (
                                    <div key={n}>
                                        <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '5px', color: '#888' }}>Attachment {n}</div>
                                        <img src={attachUrl} alt={`Attachment ${n}`} style={{ maxWidth: '100%', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
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
                        <Printer size={16} /> Print Purchase Order
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
                        <div style={{ padding: '8px', background: 'rgba(230,126,34,0.1)', borderRadius: '10px' }}>
                            <ShoppingCart size={24} style={{ color: '#e67e22' }} />
                        </div>
                        <h2 style={{ fontSize: '2rem', fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }}>Purchase Orders</h2>
                    </div>
                    <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '1rem' }}>Procurement management and supply chain tracking</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                        onClick={() => setIsQuotePickerOpen(true)}
                        style={{ background: 'rgba(0,112,243,0.1)', border: '1px solid rgba(0,112,243,0.3)', padding: '0.8rem 1.5rem', borderRadius: '14px', color: '#0070f3', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                    >
                        <ShoppingCart size={18} /> 견적 불러오기 (자동입력)
                    </button>
                    {view === 'list' && (
                        <button onClick={() => {
                            const now = new Date();
                            const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
                            const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
                            const msStr = String(now.getMilliseconds()).padStart(3, '0');
                            const randomStr = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
                            const newNo = 'PO' + dateStr + '-' + timeStr + msStr + '-' + randomStr;
                            setForm({
                                no: newNo,
                                date: new Date().toISOString().substring(0, 10),
                                supplier: '',
                                currency: 'KRW',
                                generalInfo: '',
                                specialNotes: '',
                                attach1: '',
                                attach2: '',
                                attach3: '',
                                attacht1: '',
                                attacht2: '',
                                attacht3: '',
                                root: '',
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
                        }} style={{ background: 'linear-gradient(135deg, #e67e22 0%, #d35400 100%)', border: 'none', padding: '0.8rem 1.8rem', borderRadius: '14px', color: 'white', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', boxShadow: '0 4px 15px rgba(211,84,0,0.3)', transition: 'transform 0.2s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                            <Plus size={20} /> Create New P.O
                        </button>
                    )}
                </div>
            </header>

            {view === 'create' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Bulk Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-10px' }}>
                        <button
                            onClick={applyCostPrices}
                            style={{
                                background: '#171717',
                                border: '1px solid #333',
                                padding: '10px 20px',
                                borderRadius: '10px',
                                color: 'white',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                            }}
                        >
                            <CheckCircle size={16} /> 등록된 원가 일괄 적용
                        </button>
                    </div>

                    {/* Customer PO Root Buffer Section */}
                    <div className="glass" style={{ padding: '1.5rem 2.5rem', border: '1px solid rgba(230,126,34,0.3)', background: 'rgba(230,126,34,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div style={{ padding: '12px', background: 'rgba(230,126,34,0.2)', borderRadius: '12px' }}>
                                <FileText size={24} style={{ color: '#e67e22' }} />
                            </div>
                            <div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white', margin: '0 0 4px 0' }}>Customer P.O (Reference Source)</h3>
                                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>가급적 고객사 발주서를 먼저 업로드하여 데이터의 근거를 확보해 주세요. (내부 보관용)</p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <button
                                onClick={() => setIsQuotePickerOpen(true)}
                                style={{ background: 'rgba(0,112,243,0.1)', border: '1px solid rgba(0,112,243,0.3)', padding: '10px 20px', borderRadius: '12px', color: '#0070f3', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                <ShoppingCart size={18} /> 견적 불러오기 (자동입력)
                            </button>
                            {form.root ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,255,136,0.1)', padding: '8px 15px', borderRadius: '10px', border: '1px solid rgba(0,255,136,0.2)' }}>
                                    <CheckCircle size={16} style={{ color: '#00ff88' }} />
                                    <span style={{ fontSize: '0.85rem', color: '#00ff88', fontWeight: 600 }}>File Attached</span>
                                    <button onClick={() => setForm({ ...form, root: '' })} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', marginLeft: '5px' }}>×</button>
                                </div>
                            ) : (
                                <button onClick={() => setIsRootModalOpen(true)} style={{ background: '#e67e22', border: 'none', padding: '10px 25px', borderRadius: '12px', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(230,126,34,0.3)' }}>
                                    Click to Upload Reference
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="glass" style={{ padding: '2.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1.25rem', marginBottom: '2.5rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>P.O Number</label>
                                <input value={form.no} readOnly style={{ width: '100%', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '0.8rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600, cursor: 'not-allowed' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>Issue Date</label>
                                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.8rem', color: 'white', colorScheme: 'dark' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>Supplier (Vender)</label>
                                <select value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.8rem', color: 'white', fontWeight: 600 }}>
                                    <option value="">-- Select Supplier --</option>
                                    {suppliers.map(s => <option key={s.id} value={s.properties.ClientName.title[0].plain_text}>{s.properties.ClientName.title[0].plain_text}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>Currency</label>
                                <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.8rem', color: '#e67e22', fontWeight: 800 }}>
                                    <option value="KRW">KRW (₩)</option>
                                    <option value="USD">USD ($)</option>
                                    <option value="RMB">RMB (¥)</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>Shipping Condition</label>
                                <input value={form.generalInfo} onChange={e => setForm({ ...form, generalInfo: e.target.value })} placeholder="e.g. FOB China" style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.8rem', color: 'white' }} />
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto', marginBottom: '2.5rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.1)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1600px' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(255,255,255,0.02)', color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                        <th style={{ padding: '15px' }}>Product</th>
                                        <th style={{ padding: '15px' }}>Description/Detail</th>
                                        <th style={{ padding: '15px', width: '90px' }}>Volt</th>
                                        <th style={{ padding: '15px', width: '90px' }}>Watt</th>
                                        <th style={{ padding: '15px', width: '90px' }}>Eff</th>
                                        <th style={{ padding: '15px', width: '100px' }}>Lumen</th>
                                        <th style={{ padding: '15px', width: '100px' }}>CCT</th>
                                        <th style={{ padding: '15px', width: '90px' }}>Unit</th>
                                        <th style={{ padding: '15px', width: '120px', textAlign: 'right' }}>Cost</th>
                                        <th style={{ padding: '15px', width: '80px', textAlign: 'right' }}>Qty</th>
                                        <th style={{ padding: '15px', width: '140px', textAlign: 'right' }}>Amount</th>
                                        <th style={{ padding: '15px' }}>Remarks</th>
                                        <th style={{ padding: '15px', width: '40px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {form.items.map((it, idx) => (
                                        <tr key={it.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}>
                                            <td style={{ padding: '12px' }}>
                                                <input value={it.product} onClick={() => { setActiveIdx(idx); setIsPickerOpen(true); }} readOnly placeholder="Select Product..." style={{ width: '100%', background: 'rgba(230,126,34,0.1)', border: '1px dashed rgba(230,126,34,0.3)', color: '#e67e22', fontWeight: 700, cursor: 'pointer', padding: '8px 12px', borderRadius: '8px', fontSize: '0.85rem' }} />
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
                                            <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: '#e67e22' }}>
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
                                                <button onClick={() => setForm({ ...form, items: form.items.filter(item => item.id !== it.id) })} style={{ color: '#ff4d4f', opacity: 0.5, border: 'none', background: 'transparent', cursor: 'pointer' }}>
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
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Purchase Notes / Terms</label>
                                <textarea value={form.specialNotes} onChange={e => setForm({ ...form, specialNotes: e.target.value })} placeholder="Enter specific ordering conditions or quality requirements..." style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.2rem', color: 'white', height: '140px', resize: 'none', lineHeight: '1.6', fontSize: '0.9rem' }} />

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
                                            }} onClick={() => !(form as any)[`attach${n}`] && document.getElementById(`file-po-${n}`)?.click()}>
                                                {(form as any)[`attach${n}`] ? (
                                                    <img src={(form as any)[`attach${n}`]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <label style={{ cursor: 'pointer', textAlign: 'center' }}>
                                                        <Plus size={24} style={{ color: 'rgba(255,255,255,0.2)' }} />
                                                        <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.2)', marginTop: '4px' }}>Upload Image</p>
                                                        <input type="file" hidden onChange={e => handleFileUpload(e, `attach${n}`)} disabled={!!uploading} />
                                                    </label>
                                                )}
                                                {uploading === `attach${n}` && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>Uploading...</div>}
                                                {(form as any)[`attach${n}`] && (
                                                    <button onClick={() => setForm({ ...form, [`attach${n}`]: '' })} style={{ position: 'absolute', top: '5px', right: '5px', background: 'rgba(255,0,0,0.6)', border: 'none', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>×</button>
                                                )}
                                            </div>
                                            <input
                                                placeholder="Purpose/Instruction..."
                                                value={(form as any)[`attacht${n}`]}
                                                onChange={e => setForm({ ...form, [`attacht${n}`]: e.target.value })}
                                                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.5rem', fontSize: '0.75rem', color: 'white' }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ background: 'rgba(230,126,34,0.05)', border: '1px solid rgba(230,126,34,0.1)', borderRadius: '24px', padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end' }}>
                                <p style={{ fontSize: '0.8rem', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '10px' }}>Total Purchase Amount</p>
                                <h3 style={{ fontSize: '3.5rem', fontWeight: 950, color: '#e67e22', margin: 0, letterSpacing: '-2px' }}>
                                    {getCurrencySymbol(form.currency)}{form.items.reduce((acc, it) => acc + (it.qty * it.unitPrice), 0).toLocaleString()}
                                </h3>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'flex-end', marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <button onClick={() => setView('list')} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', padding: '1rem 2.5rem', borderRadius: '14px', color: 'white', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleSave} style={{ background: 'linear-gradient(135deg, #e67e22 0%, #d35400 100%)', border: 'none', padding: '1rem 4rem', borderRadius: '14px', color: 'white', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px rgba(211,84,0,0.4)' }}>
                                {editMode ? 'Update P.O' : 'Save & Issue P.O'}
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
                                placeholder="Search by P.O No or Supplier..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '1rem 1rem 1rem 3.2rem', borderRadius: '16px', color: 'white', fontSize: '0.95rem' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div style={{ padding: '10px 15px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>
                                Active Orders: <span style={{ color: '#e67e22', fontWeight: 700 }}>{filteredPOs.length}</span>
                            </div>
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
                                    <th style={{ padding: '1.2rem' }}>P.O Reference</th>
                                    <th style={{ padding: '1.2rem' }}>Order Date</th>
                                    <th style={{ padding: '1.2rem' }}>Supplier Name</th>
                                    <th style={{ padding: '1.2rem', textAlign: 'right' }}>Order Total</th>
                                    <th style={{ padding: '1.2rem', width: '180px', textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={5} style={{ padding: '5rem', textAlign: 'center', opacity: 0.5 }}>Loading procurement data...</td></tr>
                                ) : filteredPOs.length === 0 ? (
                                    <tr><td colSpan={5} style={{ padding: '5rem', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>No purchase orders found.</td></tr>
                                ) : filteredPOs.map((p) => (
                                    <tr key={p.pageId} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={{ padding: '1.5rem 1.2rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#e67e22' }}></div>
                                                <span style={{ fontWeight: 700, color: 'white', fontSize: '1rem' }}>{p.no}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.5rem 1.2rem', color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>{p.date}</td>
                                        <td style={{ padding: '1.5rem 1.2rem' }}>
                                            <div style={{ fontWeight: 700, color: 'white', marginBottom: '4px' }}>{p.supplier}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '4px' }}><Package size={10} /> {p.items.length} SKUs</div>
                                        </td>
                                        <td style={{ padding: '1.5rem 1.2rem', textAlign: 'right' }}>
                                            <div style={{ fontWeight: 950, color: '#e67e22', fontSize: '1.1rem' }}>{getCurrencySymbol(p.currency)}{p.totalAmount.toLocaleString()}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>Status: Issued</div>
                                        </td>
                                        <td style={{ padding: '1.5rem 1.2rem' }}>
                                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                                                <button onClick={() => handlePrint(p)} style={{ padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', color: 'white', cursor: 'pointer' }}><Printer size={18} /></button>
                                                <button onClick={() => handleEdit(p)} style={{ padding: '10px', background: 'rgba(230,126,34,0.1)', border: '1px solid rgba(230,126,34,0.1)', borderRadius: '12px', color: '#e67e22', cursor: 'pointer' }}><ChevronRight size={18} /></button>
                                                <button onClick={async () => {
                                                    if (!validatePeriod(p.date)) return;
                                                    if (confirm('Are you sure you want to delete this order?')) { for (const it of p.items) await notionDelete(it.id.toString()); fetchInitialData(); }
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
            <QuotePicker isOpen={isQuotePickerOpen} onClose={() => setIsQuotePickerOpen(false)} onSelect={onQuoteSelect} />

            <Modal isOpen={isRootModalOpen} onClose={() => setIsRootModalOpen(false)} title="Reference Document Upload">
                <div style={{ padding: '2rem', textAlign: 'center' }}>
                    <div style={{ padding: '20px', background: 'rgba(230,126,34,0.1)', borderRadius: '20px', display: 'inline-flex', marginBottom: '20px' }}>
                        <FileText size={48} style={{ color: '#e67e22' }} />
                    </div>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'white', marginBottom: '10px' }}>고객사 발주서 업로드</h2>
                    <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: '1.6', marginBottom: '30px' }}>
                        발주서 작성의 근거가 되는 고객사 발주서(Reference PO)를 업로드해 주세요.<br />
                        업로드된 파일은 내부 관리용으로만 사용되며 출력물에는 포함되지 않습니다.
                    </p>

                    <div style={{ padding: '40px', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: '20px', position: 'relative', cursor: 'pointer', background: 'rgba(255,255,255,0.02)' }} onClick={() => document.getElementById('root-upload-input')?.click()}>
                        {uploading === 'root' ? (
                            <div style={{ color: '#e67e22', fontWeight: 700 }}>Uploading...</div>
                        ) : form.root ? (
                            <div style={{ color: '#00ff88', fontWeight: 700 }}>
                                <CheckCircle size={32} style={{ margin: '0 auto 10px auto' }} />
                                발주서 업로드 완료
                            </div>
                        ) : (
                            <>
                                <Plus size={32} style={{ color: 'rgba(255,255,255,0.2)', margin: '0 auto 10px auto' }} />
                                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>클릭하여 파일 선택 (PDF, JPG, PNG 등)</div>
                            </>
                        )}
                        <input id="root-upload-input" type="file" hidden onChange={e => {
                            handleFileUpload(e, 'root');
                            setTimeout(() => setIsRootModalOpen(false), 2000);
                        }} disabled={!!uploading} />
                    </div>

                    <button onClick={() => setIsRootModalOpen(false)} style={{ marginTop: '30px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px 40px', borderRadius: '14px', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
                        {form.root ? 'Close' : 'Cancel'}
                    </button>
                </div>
            </Modal>
        </div>
    );
}
