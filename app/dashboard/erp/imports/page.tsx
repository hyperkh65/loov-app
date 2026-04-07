'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    Ship, Plus, Search, Save, Calculator, FileText, Globe, Anchor,
    Package, History, ChevronRight, X, Download, FileUp, AlertCircle, TrendingUp, Truck
} from 'lucide-react';
import {
    notionQuery, notionCreate, notionDelete, notionUpdate,
    isWithinCurrentMonth, validatePeriod,
    DB_IMPORTS_MASTER, DB_IMPORTS_DETAIL, DB_PRODUCTS, DB_CLIENTS,
    RT, num, dateISO, select, TITLE, FILES, uploadFile, MS
} from '@/lib/notion-erp';
import Modal from '@/components/erp/Modal';
import ProductPicker from '@/components/erp/ProductPicker';

// 수입 품목 타입 (Items DB 전용)
interface ImportItem {
    id: string | number;
    product: string;
    productCode: string;
    hsCode: string;
    origin: string;
    currency: string;
    unitPrice: number;
    qty: number;
    amount: number;
    gw: number;
    nw: number;
    cbm: number;
    dutyRate: number;
    dutyAmount: number;
    vatRate: number;
    vatAmount: number;
    allocFreight: number;
    allocLocal: number;
    finalPreUnitCost: number;
    finalPostUnitCost: number;
    finalTotalCost: number;
    itDutyRate: number;    // 품목별 통관 환율 (사전)
    itPaymentRate: number; // 품목별 지급 환율 (사후)
}

// 수입 마스터 타입 (Master DB 전용)
interface ImportMaster {
    id: string;
    importNo: string;
    date: string;
    exporter: string;
    importer: string;
    forwarder: string;
    transportType: string;
    containerType: string;
    pol: string;
    pod: string;
    vesselVoyage: string;
    blNoMaster: string;
    blNoHouse: string;
    currency: string;
    incoterms: string;
    dutyExchangeRate: number;      // 통관 환율 (제품 KRW 환산용)
    freightExchangeRate: number;   // 해상운임 환율 (USD 운임 환산용)
    paymentExchangeRate: number;   // 지급 환율 (사후 원가 분석용)
    freight: number;
    localCharges: number;
    inlandFreight: number;
    customsInspectionFee: number;
    extraLogisticsFee: number;
    extraCargoInsurance: number;
    unexpectedFee: number;
    totalCost: number;
    dutyRate: number;
    vatRate: number;
    dutyAmount: number;
    vatAmount: number;
    clearanceDate: string;
    files: {
        bl?: { name: string; url: string };
        pk?: { name: string; url: string };
        iv?: { name: string; url: string };
        ot?: { name: string; url: string };
    };
    items?: ImportItem[];
}

export default function ImportsPage() {
    const [view, setView] = useState<'create' | 'list'>('list');
    const [imports, setImports] = useState<ImportMaster[]>([]);
    const [clients, setClients] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedImport, setSelectedImport] = useState<ImportMaster | null>(null);
    const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
    const [cbmCalcIdx, setCbmCalcIdx] = useState<number | null>(null);
    const [cbmInput, setCbmInput] = useState({ l: 0, w: 0, h: 0, pkg: 1 });

    // Form State
    const [form, setForm] = useState<ImportMaster>({
        id: '',
        importNo: 'I' + new Date().toISOString().substring(0, 10).replace(/-/g, '') + '-001',
        date: new Date().toISOString().split('T')[0],
        exporter: '',
        importer: 'YNK GLOBAL',
        forwarder: '',
        transportType: 'SEA',
        containerType: '20GP',
        pol: '',
        pod: '',
        vesselVoyage: '',
        blNoMaster: '',
        blNoHouse: '',
        currency: 'USD', // 수입 결제 및 정산의 메인 통화 (보통 USD)
        incoterms: 'FOB',
        dutyExchangeRate: 1385,
        freightExchangeRate: 1385,
        paymentExchangeRate: 1410,
        freight: 0,
        localCharges: 0,
        inlandFreight: 0,
        customsInspectionFee: 0,
        extraLogisticsFee: 0,
        extraCargoInsurance: 0,
        unexpectedFee: 0,
        totalCost: 0,
        dutyAmount: 0,
        vatAmount: 0,
        dutyRate: 0,
        vatRate: 10,
        clearanceDate: '',
        files: {},
        items: []
    });

    const [unipassData, setUnipassData] = useState<any>(null);
    const [unipassLoading, setUnipassLoading] = useState(false);

    // 당월 수정 제한 여부 계산
    const isPastMonth = useMemo(() => {
        if (!form.id) return false;
        return !isWithinCurrentMonth(form.date);
    }, [form.id, form.date]);

    // 실시간 환율 가이드 데이터
    const [realtimeExRates, setRealtimeExRates] = useState({ usd: 1385, cny: 191.5 });

    useEffect(() => {
        fetchInitialData();
        fetchRealtimeRates();
    }, []);

    const fetchRealtimeRates = async () => {
        try {
            // 외부 무료 API 사용 (exchangerate-api 등)
            const res = await fetch('https://open.er-api.com/v6/latest/USD');
            const data = await res.json();
            if (data && data.rates) {
                const usdToKrw = data.rates.KRW;
                const usdToCny = data.rates.CNY;
                setRealtimeExRates({
                    usd: Number(usdToKrw.toFixed(1)),
                    cny: Number((usdToKrw / usdToCny).toFixed(1))
                });
            }
        } catch (e) {
            console.error('환율 조회 실패:', e);
        }
    };

    // 실시간 계산된 데이터 (Derived State)
    const calculatedData = useMemo(() => {
        const items = [...(form.items || [])];
        const totalCBM = items.reduce((acc, it) => acc + (Number(it.cbm) || 0), 0) || 1;

        let totalDutyAmount = 0;
        let totalVATAmount = 0;
        let grandTotalCost = 0;

        // 해상운임(USD)을 전용 해상운임 환율(freightExchangeRate)로 환산
        const freightKRW = (Number(form.freight) || 0) * (Number(form.freightExchangeRate) || 0);

        const totalSurchargesKRW =
            freightKRW +
            Number(form.localCharges) +
            Number(form.inlandFreight) +
            Number(form.customsInspectionFee) +
            Number(form.extraLogisticsFee) +
            Number(form.extraCargoInsurance) +
            Number(form.unexpectedFee);

        const updatedItems = items.map(it => {
            const unitPrice = Number(it.unitPrice) || 0;
            const qty = Number(it.qty) || 0;
            const cbm = Number(it.cbm) || 0;
            const itemForeign = unitPrice * qty;

            // 사전 원가 기준 (품목별 설정 환율)
            const itemKRW_Pre = itemForeign * (it.itDutyRate || form.dutyExchangeRate);
            // 사후 원가 기준 (품목별 설정 환율)
            const itemKRW_Post = itemForeign * (it.itPaymentRate || form.paymentExchangeRate);

            // 관세/부가세는 통관 환율 기준
            const dAmount = Math.floor(itemKRW_Pre * ((it.dutyRate || 0) / 100));
            const vAmount = Math.floor((itemKRW_Pre + dAmount) * ((it.vatRate || 10) / 100));

            // 부대비용 배분 (CBM 기준)
            const allocSurcharge = Math.floor(totalSurchargesKRW * (cbm / totalCBM));

            // 최종 원가 계산
            const finalPreTotal = itemKRW_Pre + dAmount + allocSurcharge;
            const finalPostTotal = itemKRW_Post + dAmount + allocSurcharge;

            const finalPreUnit = qty > 0 ? Math.floor(finalPreTotal / qty) : 0;
            const finalPostUnit = qty > 0 ? Math.floor(finalPostTotal / qty) : 0;

            totalDutyAmount += dAmount;
            totalVATAmount += vAmount;
            grandTotalCost += finalPostTotal;

            return {
                ...it,
                amount: itemForeign,
                dutyAmount: dAmount,
                vatAmount: vAmount,
                allocFreight: allocSurcharge,
                finalPreUnitCost: finalPreUnit,
                finalPostUnitCost: finalPostUnit,
                finalTotalCost: finalPostTotal
            };
        });

        return {
            items: updatedItems,
            totalDutyAmount,
            totalVATAmount,
            totalCost: grandTotalCost
        };
    }, [form.items, form.freight, form.localCharges, form.inlandFreight, form.customsInspectionFee, form.extraLogisticsFee, form.extraCargoInsurance, form.unexpectedFee, form.dutyExchangeRate, form.freightExchangeRate, form.paymentExchangeRate]);

    async function fetchInitialData() {
        try {
            setLoading(true);
            const [impRes, clientRes] = await Promise.all([
                notionQuery(DB_IMPORTS_MASTER(), { sorts: [{ property: 'Date', direction: 'descending' }] }),
                notionQuery(DB_CLIENTS())
            ]);

            setClients(clientRes.results);

            const mapped = impRes.results.map((r: any) => {
                const p = r.properties;
                return {
                    id: r.id,
                    importNo: p.ImportNo?.title?.[0]?.plain_text || p.ImportNo?.rich_text?.[0]?.plain_text || '-',
                    date: p.Date?.date?.start || '-',
                    exporter: p.Exporter?.rich_text?.[0]?.plain_text || '-',
                    importer: p.Importer?.rich_text?.[0]?.plain_text || '-',
                    blNoMaster: p.BLNoMaster?.rich_text?.[0]?.plain_text || '-',
                    blNoHouse: p.BLNoHouse?.rich_text?.[0]?.plain_text || '-',
                    totalCost: p.TotalCost?.number || 0,
                    currency: p.Currency?.select?.name || 'USD',
                } as ImportMaster;
            });
            setImports(mapped);
        } catch (e) {
            console.error('데이터 로드 실패:', e);
        } finally {
            setLoading(false);
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: keyof ImportMaster['files']) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setLoading(true);
            const uploaded = await uploadFile(file);
            setForm(prev => ({
                ...prev,
                files: { ...prev.files, [type]: uploaded }
            }));
            alert(`${file.name} 업로드 완료`);
        } catch (err) {
            alert('파일 업로드 실패');
        } finally {
            setLoading(false);
        }
    };

    const addProduct = (p: any) => {
        const newItem: ImportItem = {
            id: Date.now(),
            product: p.name,
            productCode: p.code,
            hsCode: '',
            origin: 'CHINA',
            currency: 'USD',
            unitPrice: 0,
            qty: 1,
            amount: 0,
            gw: 0,
            nw: 0,
            cbm: 0.1,
            dutyRate: 0,
            dutyAmount: 0,
            vatRate: 10,
            vatAmount: 0,
            allocFreight: 0,
            allocLocal: 0,
            itDutyRate: form.dutyExchangeRate,
            itPaymentRate: form.paymentExchangeRate,
            finalPreUnitCost: 0,
            finalPostUnitCost: 0,
            finalTotalCost: 0
        };
        setForm(prev => ({
            ...prev,
            items: [...(prev.items || []), newItem]
        }));
    };

    const updateItem = (idx: number, updates: Partial<ImportItem>) => {
        const newItems = [...(form.items || [])];
        newItems[idx] = { ...newItems[idx], ...updates };
        setForm({ ...form, items: newItems });
    };

    const handleSave = async () => {
        if (!form.exporter || (form.items?.length || 0) === 0) {
            return alert('기본 정보와 품목을 입력하세요.');
        }

        // 당월 체크
        const isPastMonth = form.id && !isWithinCurrentMonth(form.date);

        try {
            setLoading(true);
            // 1. Master Save
            const masterProps: any = {
                ImportNo: RT(form.importNo),
                Date: dateISO(form.date),
                Exporter: RT(form.exporter),
                Importer: RT(form.importer),
                Forwarder: RT(form.forwarder),
                TransportType: RT(form.transportType),
                ContainerType: RT(form.containerType),
                POL: RT(form.pol),
                POD: RT(form.pod),
                VesselVoyage: RT(form.vesselVoyage),
                BLNoMaster: RT(form.blNoMaster),
                BLNoHouse: RT(form.blNoHouse),
                Currency: select(form.currency),
                Incoterms: MS([form.incoterms]),
                DutyExchangeRate: num(form.dutyExchangeRate),
                // FreightExchangeRate: num(form.freightExchangeRate), // 노션에 해당 컬럼 추가 전까지 주석 처리
                PaymentExchangeRate: num(form.paymentExchangeRate),
                Freight: num(form.freight),
                LocalCharges: num(form.localCharges),
                InlandFreight: num(form.inlandFreight),
                CustomsInspectionFee: num(form.customsInspectionFee),
                ExtraLogisticsFee: num(form.extraLogisticsFee),
                ExtraCargoInsurance: num(form.extraCargoInsurance),
                UnexpectedFee: num(form.unexpectedFee),
                TotalCost: num(form.totalCost),
                DutyAmount: num(form.dutyAmount),
                VATAmount: num(form.vatAmount),
                ClearanceDate: dateISO(form.clearanceDate),
            };

            // Files
            if (form.files.bl) masterProps.BLFile = FILES(form.files.bl.url, form.files.bl.name);
            if (form.files.pk) masterProps.PackingList = FILES(form.files.pk.url, form.files.pk.name);
            if (form.files.iv) masterProps.Invoice = FILES(form.files.iv.url, form.files.iv.name);
            if (form.files.ot) masterProps.OtherDoc = FILES(form.files.ot.url, form.files.ot.name);

            if (form.id) {
                // Update
                await notionUpdate(form.id, masterProps);

                // Details (Delete and Re-create)
                const existingDetails = await notionQuery(DB_IMPORTS_DETAIL(), { filter: { property: 'ImportNo', rich_text: { equals: form.importNo } } });
                for (const r of existingDetails.results) await notionDelete(r.id);
            } else {
                // Create
                await notionCreate(DB_IMPORTS_MASTER(), masterProps);
            }

            // 2. Items Save (calculatedData에서 최신 계산된 항목들 사용)
            for (const it of (calculatedData.items || [])) {
                await notionCreate(DB_IMPORTS_DETAIL(), {
                    ImportNo: RT(form.importNo),
                    Product: RT(it.product),
                    ProductCode: RT(it.productCode),
                    HSCode: RT(it.hsCode),
                    Origin: RT(it.origin),
                    UnitPrice: num(it.unitPrice),
                    Qty: num(it.qty),
                    Amount: num(it.amount),
                    GW: num(it.gw),
                    NW: num(it.nw),
                    CBM: num(it.cbm),
                    DutyRate: num(it.dutyRate),
                    DutyAmount: num(it.dutyAmount),
                    VATRate: num(it.vatRate),
                    VATAmount: num(it.vatAmount),
                    AllocFreight: num(it.allocFreight),
                    AllocLocal: num(it.allocLocal),
                    FinalPreUnitCost: num(it.finalPreUnitCost),
                    FinalPostUnitCost: num(it.finalPostUnitCost),
                    FinalTotalCost: num(it.finalTotalCost),
                    Currency: select(it.currency),
                    // 지급환율은 상세에도 저장 (itPaymentRate)
                    ITPaymentRate: num(it.itPaymentRate || 0),
                    ITDutyRate: num(it.itDutyRate || 0)
                });
            }

            if (isPastMonth) {
                alert('과거 데이터입니다. 사후단가(지급 환율) 정보만 업데이트 되었습니다.');
            } else {
                alert('수입 내역이 성공적으로 저장되었습니다.');
            }
            setView('list');
            fetchInitialData();
            // Reset
            setForm({
                ...form,
                importNo: 'I' + new Date().toISOString().substring(0, 10).replace(/-/g, '') + '-00' + (imports.length + 2),
                items: [],
                files: {}
            });
        } catch (e: any) {
            alert('저장 실패: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchShipmentTracking = async (blNo: string) => {
        if (!blNo || blNo === '-') return;
        setUnipassLoading(true);
        try {
            const res = await fetch(`/api/shipment/tracking?blNo=${encodeURIComponent(blNo)}`);
            const data = await res.json();
            if (data.success) {
                setUnipassData(data);
            } else {
                setUnipassData({ error: data.error });
            }
        } catch (err) {
            setUnipassData({ error: '조회 중 오류 발생' });
        } finally {
            setUnipassLoading(false);
        }
    };

    const openImportDetail = async (imp: ImportMaster) => {
        try {
            setLoading(true);
            setUnipassData(null);
            const res = await notionQuery(DB_IMPORTS_DETAIL(), {
                filter: { property: 'ImportNo', rich_text: { equals: imp.importNo } }
            });
            const details = res.results.map((r: any) => {
                const p = r.properties;
                return {
                    id: r.id,
                    product: p.Product?.rich_text?.[0]?.plain_text || '-',
                    productCode: p.ProductCode?.rich_text?.[0]?.plain_text || '',
                    hsCode: p.HSCode?.rich_text?.[0]?.plain_text || '',
                    origin: p.Origin?.rich_text?.[0]?.plain_text || '',
                    currency: p.Currency?.select?.name || 'USD',
                    unitPrice: p.UnitPrice?.number || 0,
                    qty: p.Qty?.number || 0,
                    amount: p.Amount?.number || 0,
                    cbm: p.CBM?.number || 0.1,
                    dutyRate: p.DutyRate?.number || 0,
                    dutyAmount: p.DutyAmount?.number || 0,
                    vatRate: p.VATRate?.number || 10,
                    vatAmount: p.VATAmount?.number || 0,
                    allocFreight: p.AllocFreight?.number || 0,
                    allocLocal: p.AllocLocal?.number || 0,
                    finalPreUnitCost: p.FinalPreUnitCost?.number || p.FinalUnitCost?.number || 0,
                    finalPostUnitCost: p.FinalPostUnitCost?.number || 0,
                    finalTotalCost: p.FinalTotalCost?.number || 0
                };
            });

            const masterRes = await notionQuery(DB_IMPORTS_MASTER(), {
                filter: { property: 'ImportNo', title: { equals: imp.importNo } }
            });
            const fullMaster = masterRes.results[0]?.properties;

            const masterData: ImportMaster = {
                ...imp,
                items: details as any,
                forwarder: fullMaster?.Forwarder?.rich_text?.[0]?.plain_text || '',
                pol: fullMaster?.POL?.rich_text?.[0]?.plain_text || '',
                pod: fullMaster?.POD?.rich_text?.[0]?.plain_text || '',
                vesselVoyage: fullMaster?.VesselVoyage?.rich_text?.[0]?.plain_text || '',
                containerType: fullMaster?.ContainerType?.rich_text?.[0]?.plain_text || '20GP',
                incoterms: fullMaster?.Incoterms?.multi_select?.[0]?.name || fullMaster?.Incoterms?.select?.name || 'FOB',
                dutyExchangeRate: fullMaster?.DutyExchangeRate?.number || 1385,
                freightExchangeRate: fullMaster?.FreightExchangeRate?.number || fullMaster?.DutyExchangeRate?.number || 1385,
                paymentExchangeRate: fullMaster?.PaymentExchangeRate?.number || 1410,
                freight: fullMaster?.Freight?.number || 0,
                localCharges: fullMaster?.LocalCharges?.number || 0,
                inlandFreight: fullMaster?.InlandFreight?.number || 0,
                customsInspectionFee: fullMaster?.CustomsInspectionFee?.number || 0,
                extraLogisticsFee: fullMaster?.ExtraLogisticsFee?.number || 0,
                extraCargoInsurance: fullMaster?.ExtraCargoInsurance?.number || 0,
                unexpectedFee: fullMaster?.UnexpectedFee?.number || 0,
                blNoHouse: fullMaster?.BLNoHouse?.rich_text?.[0]?.plain_text || '',
                blNoMaster: fullMaster?.BLNoMaster?.rich_text?.[0]?.plain_text || fullMaster?.BLNoMaster?.title?.[0]?.plain_text || '-',
                dutyAmount: fullMaster?.DutyAmount?.number || 0,
                vatAmount: fullMaster?.VATAmount?.number || 0,
                clearanceDate: fullMaster?.ClearanceDate?.date?.start || '',
                files: {
                    bl: fullMaster?.BLFile?.files?.[0]?.external || fullMaster?.BLFile?.files?.[0]?.file,
                    pk: fullMaster?.PackingList?.files?.[0]?.external || fullMaster?.PackingList?.files?.[0]?.file,
                    iv: fullMaster?.Invoice?.files?.[0]?.external || fullMaster?.Invoice?.files?.[0]?.file,
                    ot: fullMaster?.OtherDoc?.files?.[0]?.external || fullMaster?.OtherDoc?.files?.[0]?.file,
                } as any
            };

            setSelectedImport(masterData);

            // B/L 번호가 있으면 자동 조회
            const targetBL = masterData.blNoHouse !== '-' ? masterData.blNoHouse : masterData.blNoMaster;
            if (targetBL && targetBL !== '-') {
                fetchShipmentTracking(targetBL);
            }
        } catch (e) {
            console.error('상세 조회 실패:', e);
        } finally {
            setLoading(false);
        }
    };

    const enterEditMode = () => {
        if (!selectedImport) return;
        setForm({ ...selectedImport });
        setView('create');
        setSelectedImport(null);
    };

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1rem' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '0.5rem' }}>
                        <div style={{ padding: '8px', background: 'rgba(0, 112, 243, 0.1)', borderRadius: '10px' }}>
                            <Ship size={24} style={{ color: '#0070f3' }} />
                        </div>
                        <h2 style={{ fontSize: '2rem', fontWeight: 900, margin: 0 }}>수입 물류 관리</h2>
                    </div>
                    <p style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Master B/L 기준 통합 물류 원가 계산 및 서류 관리</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        onClick={() => {
                            if (view === 'create') {
                                setForm({
                                    id: '',
                                    importNo: 'I' + new Date().toISOString().substring(0, 10).replace(/-/g, '') + '-00' + (imports.length + 1),
                                    date: new Date().toISOString().split('T')[0],
                                    exporter: '',
                                    importer: 'YNK GLOBAL',
                                    forwarder: '',
                                    transportType: 'SEA',
                                    containerType: '20GP',
                                    pol: '',
                                    pod: '',
                                    vesselVoyage: '',
                                    blNoMaster: '',
                                    blNoHouse: '',
                                    currency: 'USD',
                                    incoterms: 'FOB',
                                    dutyExchangeRate: 1400,
                                    freightExchangeRate: 1400,
                                    paymentExchangeRate: 1450,
                                    freight: 0,
                                    localCharges: 0,
                                    inlandFreight: 0,
                                    customsInspectionFee: 0,
                                    extraLogisticsFee: 0,
                                    extraCargoInsurance: 0,
                                    unexpectedFee: 0,
                                    totalCost: 0,
                                    dutyAmount: 0,
                                    vatAmount: 0,
                                    dutyRate: 0,
                                    vatRate: 10,
                                    clearanceDate: '',
                                    files: {},
                                    items: []
                                });
                            }
                            setView(view === 'create' ? 'list' : 'create');
                        }}
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.8rem 1.5rem', borderRadius: '14px', color: 'white', fontWeight: 600 }}
                    >
                        {view === 'create' ? <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><History size={18} /> 수입 내역 조회</div> : <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Plus size={18} /> 신규 수입 등록</div>}
                    </button>
                    {view === 'create' && (
                        <button onClick={handleSave} disabled={loading} style={{ background: 'linear-gradient(135deg, #0070f3 0%, #00a6fb 100%)', border: 'none', padding: '0.8rem 2.5rem', borderRadius: '14px', color: 'white', fontWeight: 800, boxShadow: '0 4px 15px rgba(0, 112, 243, 0.3)' }}>
                            {loading ? '처리 중...' : (form.id ? '수입 정보 업데이트' : '수입 상세 저장')}
                        </button>
                    )}
                </div>
            </header>

            {view === 'create' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* 마스터 정보 */}
                    <div className="glass" style={{ padding: '2rem' }}>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Anchor size={18} /> 물류 마스터 정보 (Import Master)
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.2rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>수입 번호</label>
                                <input value={form.importNo} readOnly style={{ width: '100%', padding: '0.7rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'rgba(255,255,255,0.5)' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>Incoterms</label>
                                <select disabled={isPastMonth} value={form.incoterms} onChange={e => setForm({ ...form, incoterms: e.target.value })} style={{ width: '100%', padding: '0.7rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white' }}>
                                    <option value="FOB">FOB</option>
                                    <option value="EXW">EXW</option>
                                    <option value="CIF">CIF</option>
                                    <option value="CFR">CFR</option>
                                    <option value="DDP">DDP</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>통관 환율 (KRW)</label>
                                <input disabled={isPastMonth} type="number" value={form.dutyExchangeRate} onChange={e => setForm({ ...form, dutyExchangeRate: Number(e.target.value) })} style={{ width: '100%', padding: '0.7rem', background: 'rgba(255,255,255,0.05)', border: '1px solid #0070f3', borderRadius: '10px', color: 'white' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>수출업체</label>
                                <select disabled={isPastMonth} value={form.exporter} onChange={e => setForm({ ...form, exporter: e.target.value })} style={{ width: '100%', padding: '0.7rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white' }}>
                                    <option value="">-- 업체 선택 --</option>
                                    {clients.map(c => <option key={c.id} value={c.properties.ClientName.title[0].plain_text}>{c.properties.ClientName.title[0].plain_text}</option>)}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>MBL No.</label>
                                <input disabled={isPastMonth} value={form.blNoMaster} onChange={e => setForm({ ...form, blNoMaster: e.target.value })} placeholder="MBL#" style={{ width: '100%', padding: '0.7rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>HBL No.</label>
                                <input disabled={isPastMonth} value={form.blNoHouse} onChange={e => setForm({ ...form, blNoHouse: e.target.value })} placeholder="HBL#" style={{ width: '100%', padding: '0.7rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>운송 수단</label>
                                <select disabled={isPastMonth} value={form.transportType} onChange={e => setForm({ ...form, transportType: e.target.value })} style={{ width: '100%', padding: '0.7rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white' }}>
                                    <option value="SEA">해상 (SEA)</option>
                                    <option value="AIR">항공 (AIR)</option>
                                    <option value="COURIER">특송 (COURIER)</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>출고/수입 일자</label>
                                <input disabled={isPastMonth} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ width: '100%', padding: '0.7rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white', colorScheme: 'dark' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>Vessel/Flight</label>
                                <input disabled={isPastMonth} value={form.vesselVoyage} onChange={e => setForm({ ...form, vesselVoyage: e.target.value })} placeholder="선명/항공편" style={{ width: '100%', padding: '0.7rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>해상운임 환율 (USD/KRW)</label>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <input disabled={isPastMonth} type="number" value={form.freightExchangeRate} onChange={e => setForm({ ...form, freightExchangeRate: Number(e.target.value) })} style={{ flex: 1, padding: '0.7rem', background: 'rgba(0,112,243,0.05)', border: '1px solid #0070f3', borderRadius: '10px', color: 'white' }} />
                                    <TrendingUp size={16} style={{ color: '#0070f3' }} />
                                </div>
                                <p style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>* USD 운임을 원화로 계산할 때 사용</p>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>품목 적용 환율 (기본)</label>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <input type="number" value={form.paymentExchangeRate} onChange={e => setForm({ ...form, paymentExchangeRate: Number(e.target.value) })} style={{ flex: 1, padding: '0.7rem', background: 'rgba(230,126,34,0.05)', border: '1px solid #e67e22', borderRadius: '10px', color: 'white' }} />
                                    <History size={16} style={{ color: '#e67e22' }} />
                                </div>
                                <p style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>* 대금 지급 시점의 기준값 (사후 원가)</p>
                            </div>
                            <div className="glass" style={{ padding: '0.5rem 1rem', borderRadius: '10px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', margin: 0 }}>실시간 환율 가이드 (Naver/Yahoo)</p>
                                <div style={{ fontSize: '0.8rem', display: 'flex', gap: '15px', fontWeight: 700 }}>
                                    <div style={{ color: '#00ff88' }}>USD: <span style={{ color: 'white' }}>{realtimeExRates.usd.toLocaleString()}</span></div>
                                    <div style={{ color: '#00ff88' }}>RMB: <span style={{ color: 'white' }}>{realtimeExRates.cny.toLocaleString()}</span></div>
                                </div>
                            </div>
                        </div>

                        {/* 비용 입력 - 상세화 및 미세조정 */}
                        <div style={{ marginTop: '2rem', background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                            <h4 style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'rgba(255,255,255,0.6)' }}>부대 비용 및 제반 수수료 (Surcharges)</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                                {[
                                    { label: '해상/항공운임 (Freight)', key: 'freight', color: '#00bd68', step: 10 },
                                    { label: '국내 부대비용 (Local)', key: 'localCharges', color: '#00bd68', step: 1000 },
                                    { label: '내륙운송/EXW (Inland)', key: 'inlandFreight', color: '#e67e22', step: 1000 },
                                    { label: '통관 수수료 (Customs)', key: 'customsInspectionFee', color: '#e67e22', step: 1000 },
                                    { label: '물류 기타 (Extra)', key: 'extraLogisticsFee', color: '#e67e22', step: 1000 },
                                    { label: '적하 보험료 (Insurance)', key: 'extraCargoInsurance', color: '#e67e22', step: 1000 },
                                    { label: '예비/기타비용 (Unexpected)', key: 'unexpectedFee', color: '#ff4d4f', step: 1000 },
                                ].map((fee) => (
                                    <div key={fee.key}>
                                        <label style={{ display: 'block', fontSize: '0.7rem', color: fee.color, marginBottom: '8px' }}>{fee.label}</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <button disabled={isPastMonth} onClick={() => setForm({ ...form, [fee.key]: Math.max(0, Number(form[fee.key as keyof ImportMaster]) - fee.step) })} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', padding: '8px', borderRadius: '4px', cursor: 'pointer', opacity: isPastMonth ? 0.3 : 1 }}>-</button>
                                            <input
                                                disabled={isPastMonth}
                                                type="number"
                                                value={form[fee.key as keyof ImportMaster] as number}
                                                onChange={e => setForm({ ...form, [fee.key]: Number(e.target.value) })}
                                                style={{ flex: 1, padding: '0.6rem', textAlign: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.85rem' }}
                                            />
                                            <button disabled={isPastMonth} onClick={() => setForm({ ...form, [fee.key]: Number(form[fee.key as keyof ImportMaster]) + fee.step })} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', padding: '8px', borderRadius: '4px', cursor: 'pointer', opacity: isPastMonth ? 0.3 : 1 }}>+</button>
                                        </div>
                                    </div>
                                ))}
                                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderLeft: '1px solid rgba(255,255,255,0.05)', paddingLeft: '1rem' }}>
                                    <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>총 수입 원가 (Total KRW)</p>
                                    <h4 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0070f3', margin: 0 }}>₩{calculatedData.totalCost?.toLocaleString()}</h4>
                                </div>
                            </div>
                        </div>

                        {/* 파일 업로드 섹션 */}
                        <div style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                            {['bl', 'pk', 'iv', 'ot'].map((type) => (
                                <div key={type} style={{ position: 'relative' }}>
                                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>
                                        {type === 'bl' ? 'B/L 파일' : type === 'pk' ? 'Packing List' : type === 'iv' ? 'Invoice' : '기타 서류'}
                                    </label>
                                    <div className="glass" style={{ padding: '8px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: '0.7rem', color: form.files[type as keyof ImportMaster['files']] ? '#00ff88' : 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {form.files[type as keyof ImportMaster['files']] ? form.files[type as keyof ImportMaster['files']]?.name : '파일 없음'}
                                        </span>
                                        <label style={{ cursor: isPastMonth ? 'not-allowed' : 'pointer', opacity: isPastMonth ? 0.3 : 1 }}>
                                            <FileUp size={16} />
                                            <input disabled={isPastMonth} type="file" hidden onChange={e => handleFileUpload(e, type as any)} />
                                        </label>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 품목 리스트 */}
                    <div className="glass" style={{ padding: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Package size={18} /> 수입 품목 상세 (Import Items)
                            </h3>
                            <button disabled={isPastMonth} onClick={() => setIsProductPickerOpen(true)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '6px 15px', borderRadius: '8px', color: 'white', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px', opacity: isPastMonth ? 0.3 : 1, cursor: isPastMonth ? 'not-allowed' : 'pointer' }}>
                                <Plus size={14} /> 품목 추가
                            </button>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
                                <thead>
                                    <tr style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                        <th style={{ padding: '10px' }}>제품명/코드</th>
                                        <th style={{ padding: '10px', width: '80px' }}>수량</th>
                                        <th style={{ padding: '10px', width: '100px' }}>단가($)</th>
                                        <th style={{ padding: '10px', width: '80px' }}>CBM</th>
                                        <th style={{ padding: '10px', width: '80px' }}>관세(%)</th>
                                        <th style={{ padding: '10px', textAlign: 'right' }}>배분비용(KRW)</th>
                                        <th style={{ padding: '10px', textAlign: 'right', color: '#00ff88' }}>단위 원가(KRW)</th>
                                        <th style={{ padding: '10px', width: '40px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {calculatedData.items.map((it, idx) => (
                                        <tr key={it.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '12px 10px' }}>
                                                <div style={{ fontWeight: 600 }}>{it.product}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>{it.productCode}</div>
                                            </td>
                                            <td>
                                                <input
                                                    disabled={isPastMonth}
                                                    type="text"
                                                    value={it.qty}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        if (val === '' || /^\d+$/.test(val)) {
                                                            updateItem(idx, { qty: val as any });
                                                        }
                                                    }}
                                                    style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: 'none', padding: '6px', borderRadius: '4px', textAlign: 'center', color: 'white' }}
                                                />
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <select disabled={isPastMonth} value={it.currency} onChange={e => updateItem(idx, { currency: e.target.value })} style={{ background: 'rgba(0,0,0,0.2)', border: 'none', color: 'white', fontSize: '0.7rem', borderRadius: '4px' }}>
                                                        <option value="USD">USD</option>
                                                        <option value="RMB">RMB</option>
                                                        <option value="EUR">EUR</option>
                                                        <option value="JPY">JPY</option>
                                                    </select>
                                                    <input
                                                        disabled={isPastMonth}
                                                        type="text"
                                                        value={it.unitPrice}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                                                updateItem(idx, { unitPrice: val as any });
                                                            }
                                                        }}
                                                        style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: 'none', padding: '6px', borderRadius: '4px', textAlign: 'center', color: 'white' }}
                                                    />
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', opacity: isPastMonth ? 0.3 : 1 }}>
                                                    <button disabled={isPastMonth} onClick={() => updateItem(idx, { cbm: Math.max(0, Number((Number(it.cbm) - 0.01).toFixed(3))) })} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer', color: 'white', padding: '4px' }}>-</button>
                                                    <div style={{ position: 'relative' }}>
                                                        <input
                                                            disabled={isPastMonth}
                                                            type="text"
                                                            value={it.cbm}
                                                            onFocus={() => { setCbmCalcIdx(idx); setCbmInput({ l: 0, w: 0, h: 0, pkg: Number(it.qty) || 1 }); }}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                                                    updateItem(idx, { cbm: val as any });
                                                                }
                                                            }}
                                                            style={{ width: '50px', background: 'rgba(0,0,0,0.2)', border: 'none', padding: '6px', borderRadius: '4px', textAlign: 'center', color: '#00ff88', fontSize: '0.8rem' }}
                                                        />
                                                        <Calculator
                                                            size={12}
                                                            onClick={() => !isPastMonth && setCbmCalcIdx(cbmCalcIdx === idx ? null : idx)}
                                                            style={{ position: 'absolute', right: '-15px', top: '50%', transform: 'translateY(-50%)', cursor: isPastMonth ? 'not-allowed' : 'pointer', color: '#00ff88', opacity: 0.6 }}
                                                        />
                                                    </div>
                                                    <button disabled={isPastMonth} onClick={() => updateItem(idx, { cbm: Number((Number(it.cbm) + 0.01).toFixed(3)) })} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer', color: 'white', padding: '4px' }}>+</button>
                                                </div>
                                                {cbmCalcIdx === idx && (
                                                    <div className="glass" style={{ position: 'absolute', zIndex: 100, padding: '10px', marginTop: '5px', width: '180px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #00ff88' }}>
                                                        <div style={{ display: 'flex', gap: '4px', fontSize: '0.7rem' }}>
                                                            <input type="number" placeholder="L(cm)" onChange={e => setCbmInput({ ...cbmInput, l: Number(e.target.value) })} style={{ width: '33%', padding: '4px', background: 'black', border: '1px solid #333' }} />
                                                            <input type="number" placeholder="W(cm)" onChange={e => setCbmInput({ ...cbmInput, w: Number(e.target.value) })} style={{ width: '33%', padding: '4px', background: 'black', border: '1px solid #333' }} />
                                                            <input type="number" placeholder="H(cm)" onChange={e => setCbmInput({ ...cbmInput, h: Number(e.target.value) })} style={{ width: '33%', padding: '4px', background: 'black', border: '1px solid #333' }} />
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <input type="number" placeholder="Box수" value={cbmInput.pkg} onChange={e => setCbmInput({ ...cbmInput, pkg: Number(e.target.value) })} style={{ width: '40px', padding: '4px', background: 'black', border: '1px solid #333', fontSize: '0.7rem' }} />
                                                            <button
                                                                onClick={() => {
                                                                    const val = (cbmInput.l * cbmInput.w * cbmInput.h * cbmInput.pkg) / 1000000;
                                                                    updateItem(idx, { cbm: Number(val.toFixed(3)) });
                                                                    setCbmCalcIdx(null);
                                                                }}
                                                                style={{ background: '#00ff88', color: 'black', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}
                                                            >적용</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <input
                                                    disabled={isPastMonth}
                                                    type="text"
                                                    value={it.dutyRate}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                                            updateItem(idx, { dutyRate: val as any });
                                                        }
                                                    }}
                                                    style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: 'none', padding: '6px', borderRadius: '4px', textAlign: 'center', color: 'white' }}
                                                />
                                            </td>
                                            <td style={{ padding: '12px 10px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', minWidth: '35px' }}>통관:</span>
                                                        <input
                                                            type="text"
                                                            value={it.itDutyRate}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                                                    updateItem(idx, { itDutyRate: val as any });
                                                                }
                                                            }}
                                                            style={{ width: '60px', background: 'rgba(0,112,243,0.1)', border: 'none', padding: '4px', borderRadius: '4px', textAlign: 'center', color: '#0070f3', fontSize: '0.8rem' }}
                                                        />
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', minWidth: '35px' }}>지급:</span>
                                                        <input
                                                            type="text"
                                                            value={it.itPaymentRate || ''}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                                                    updateItem(idx, { itPaymentRate: val as any });
                                                                }
                                                            }}
                                                            style={{ width: '60px', background: 'rgba(230,126,34,0.1)', border: 'none', padding: '4px', borderRadius: '4px', textAlign: 'center', color: '#e67e22', fontSize: '0.8rem' }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ textAlign: 'right', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                                                <div>배분: ₩{it.allocFreight?.toLocaleString()}</div>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ fontWeight: 800, color: '#00ff88', fontSize: '0.9rem' }}>Pre: ₩{it.finalPreUnitCost?.toLocaleString()}</div>
                                                <div style={{ fontWeight: 600, color: '#0070f3', fontSize: '0.85rem' }}>Post: ₩{it.finalPostUnitCost?.toLocaleString()}</div>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                {!isPastMonth && (
                                                    <button onClick={() => setForm({ ...form, items: (form.items || []).filter(i => i.id !== it.id) })} style={{ color: '#ff4d4f', border: 'none', background: 'none', cursor: 'pointer' }}><X size={16} /></button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="glass" style={{ padding: '1.5rem', overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1000px' }}>
                            <thead>
                                <tr style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.75rem', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                    <th style={{ padding: '1rem' }}>수입 번호</th>
                                    <th style={{ padding: '1rem', width: '100px', textAlign: 'center' }}>상태</th>
                                    <th style={{ padding: '1rem' }}>날짜</th>
                                    <th style={{ padding: '1rem' }}>수출업체</th>
                                    <th style={{ padding: '1rem' }}>Master B/L</th>
                                    <th style={{ padding: '1rem', textAlign: 'right' }}>총 수입 원가</th>
                                    <th style={{ padding: '1rem' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={7} style={{ padding: '5rem', textAlign: 'center', opacity: 0.5 }}>로드 중...</td></tr>
                                ) : imports.map(imp => (
                                    <tr key={imp.id} onClick={() => openImportDetail(imp)} style={{ cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={{ padding: '1.2rem 1rem', fontWeight: 800 }}>{imp.importNo}</td>
                                        <td style={{ padding: '1.2rem 1rem', textAlign: 'center' }}>
                                            {(imp.blNoMaster && imp.blNoMaster !== '-') || (imp.blNoHouse && imp.blNoHouse !== '-') ? (
                                                <span style={{ fontSize: '0.75rem', padding: '5px 10px', borderRadius: '20px', background: 'rgba(0, 255, 136, 0.1)', color: '#00ff88', fontWeight: 700, border: '1px solid rgba(0, 255, 136, 0.2)', whiteSpace: 'nowrap' }}>진행 중</span>
                                            ) : (
                                                <span style={{ fontSize: '0.75rem', padding: '5px 10px', borderRadius: '20px', background: 'rgba(255, 255, 255, 0.05)', color: 'rgba(255, 255, 255, 0.4)', fontWeight: 600, border: '1px solid rgba(255, 255, 255, 0.1)', whiteSpace: 'nowrap' }}>종 료</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '1.2rem 1rem', color: 'rgba(255,255,255,0.6)' }}>{imp.date}</td>
                                        <td style={{ padding: '1.2rem 1rem' }}>{imp.exporter}</td>
                                        <td style={{ padding: '1.2rem 1rem' }}>{imp.blNoMaster}</td>
                                        <td style={{ padding: '1.2rem 1rem', textAlign: 'right', fontWeight: 900, color: '#0070f3' }}>₩{imp.totalCost.toLocaleString()}</td>
                                        <td style={{ padding: '1.2rem 1rem', textAlign: 'center' }}><ChevronRight size={18} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* 수입 상세 모달 */}
            <Modal isOpen={!!selectedImport} onClose={() => setSelectedImport(null)} title={`수입 상세 분석: ${selectedImport?.importNo}`}>
                {selectedImport && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ gridColumn: 'span 2' }}>
                                <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>수출자 / Incoterms</p>
                                <p style={{ fontWeight: 800, fontSize: '1.1rem' }}>{selectedImport.exporter} <span style={{ color: '#0070f3', fontSize: '0.9rem' }}>({selectedImport.incoterms})</span></p>
                            </div>
                            <div>
                                <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>Master B/L</p>
                                <p style={{ fontWeight: 700 }}>{selectedImport.blNoMaster}</p>
                            </div>
                            <div>
                                <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>수입일자</p>
                                <p style={{ fontWeight: 700 }}>{selectedImport.date}</p>
                            </div>

                            <div className="glass" style={{ padding: '0.8rem', borderRadius: '10px' }}>
                                <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>통관 환율 (Pre)</p>
                                <p style={{ fontWeight: 700, margin: 0 }}>₩{selectedImport.dutyExchangeRate?.toLocaleString()}</p>
                            </div>
                            <div className="glass" style={{ padding: '0.8rem', borderRadius: '10px' }}>
                                <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>지급 환율 (Post)</p>
                                <p style={{ fontWeight: 700, margin: 0, color: '#e67e22' }}>₩{selectedImport.paymentExchangeRate?.toLocaleString()}</p>
                            </div>
                            <div style={{ gridColumn: 'span 2', textAlign: 'right', paddingRight: '1rem' }}>
                                <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', margin: 0 }}>최종 분석 원가 (KRW)</p>
                                <p style={{ fontWeight: 900, color: '#0070f3', fontSize: '1.5rem', margin: 0 }}>₩{selectedImport.totalCost.toLocaleString()}</p>
                            </div>

                            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', gridColumn: 'span 3', display: 'flex', gap: '20px' }}>
                                <span>운임: ₩{selectedImport.freight.toLocaleString()}</span>
                                <span>부대비: ₩{selectedImport.localCharges.toLocaleString()}</span>
                                <span>내륙비: ₩{selectedImport.inlandFreight.toLocaleString()}</span>
                                <span>기타: ₩{(selectedImport.customsInspectionFee + selectedImport.extraLogisticsFee + selectedImport.extraCargoInsurance + selectedImport.unexpectedFee).toLocaleString()}</span>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                {selectedImport.files.bl && <a href={selectedImport.files.bl.url} target="_blank" className="glass" style={{ padding: '8px', borderRadius: '8px', fontSize: '0.75rem' }}><Download size={14} /> B/L</a>}
                                {selectedImport.files.iv && <a href={selectedImport.files.iv.url} target="_blank" className="glass" style={{ padding: '8px', borderRadius: '8px', fontSize: '0.75rem' }}><Download size={14} /> IV</a>}
                            </div>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                                    <th style={{ padding: '10px' }}>품목명</th>
                                    <th style={{ padding: '10px' }}>수량</th>
                                    <th style={{ padding: '10px' }}>외자단가($)</th>
                                    <th style={{ padding: '10px', textAlign: 'right' }}>최종 단위 원가(KRW)</th>
                                    <th style={{ padding: '10px', textAlign: 'right' }}>최종 합계(KRW)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedImport.items?.map((d: any) => (
                                    <tr key={d.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '12px 10px', fontWeight: 600 }}>{d.product}</td>
                                        <td style={{ padding: '12px 10px' }}>{d.qty}</td>
                                        <td style={{ padding: '12px 10px' }}>{d.currency} {d.unitPrice?.toLocaleString()}</td>
                                        <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                                            <div style={{ fontWeight: 800, color: '#00ff88' }}>₩{d.finalPreUnitCost?.toLocaleString() || d.finalUnitCost?.toLocaleString()}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>사후: ₩{d.finalPostUnitCost?.toLocaleString() || '-'}</div>
                                        </td>
                                        <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 700 }}>₩{((d.qty || 0) * (d.finalPreUnitCost || d.finalUnitCost || 0)).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* UNIPASS Tracking Section */}
                        <div className="glass" style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '15px', border: '1px solid rgba(0, 112, 243, 0.2)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                                <Truck size={18} style={{ color: '#0070f3' }} />
                                <h4 style={{ fontWeight: 700, margin: 0 }}>실시간 화물 추적 (UNIPASS)</h4>
                                {unipassLoading && <div style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#0070f3', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />}
                            </div>

                            {unipassData ? (
                                unipassData.error ? (
                                    <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>조회된 데이터가 없습니다. (B/L 번호를 확인하세요)</p>
                                ) : (
                                    <div style={{ fontSize: '0.85rem' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px dashed rgba(255,255,255,0.1)' }}>
                                            <div>
                                                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>현재 단계</p>
                                                <p style={{ fontWeight: 800, color: '#00ff88' }}>{unipassData.data?.csclPrgsStts || unipassData.data?.expFfmnStts || '확인불가'}</p>
                                            </div>
                                            <div>
                                                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>선명/항공편</p>
                                                <p style={{ fontWeight: 600 }}>{unipassData.data?.shipNm || unipassData.data?.trShtNm || '-'}</p>
                                            </div>
                                            <div>
                                                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>입항/출고일</p>
                                                <p style={{ fontWeight: 600 }}>{unipassData.data?.etdate || unipassData.data?.dtnyDclrDt || '-'}</p>
                                            </div>
                                            <div>
                                                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>입항지/장소</p>
                                                <p style={{ fontWeight: 600 }}>{unipassData.data?.lodPrtNm || unipassData.data?.expDclrPrtNm || '-'}</p>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {(unipassData.details || []).slice(0, 5).map((step: any, sIdx: number) => (
                                                <div key={sIdx} style={{ display: 'flex', gap: '15px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: sIdx === 0 ? '#0070f3' : 'rgba(255,255,255,0.2)', boxShadow: sIdx === 0 ? '0 0 10px #0070f3' : 'none' }} />
                                                        {sIdx !== 4 && <div style={{ width: '1px', flex: 1, background: 'rgba(255,255,255,0.1)', marginTop: '4px' }} />}
                                                    </div>
                                                    <div style={{ paddingBottom: '10px' }}>
                                                        <p style={{ margin: 0, fontWeight: sIdx === 0 ? 800 : 400, color: sIdx === 0 ? '#fff' : 'rgba(255,255,255,0.6)' }}>{step.cargStepNm}</p>
                                                        <p style={{ margin: 0, fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>{step.dclrTime || step.prcsTime}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            ) : (
                                <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                                    {unipassLoading ? 'UNIPASS에서 정보를 불러오고 있습니다...' : 'B/L 번호가 입력되면 실시간 추적이 가능합니다.'}
                                </p>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                            <button
                                onClick={enterEditMode}
                                style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', background: '#0070f3', color: 'white', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                            >
                                <Plus size={16} /> 수정 / 업데이트
                            </button>
                            <button
                                onClick={async () => {
                                    if (!validatePeriod(selectedImport.date)) return;
                                    if (confirm('이 수입 내역과 모든 상세 항목을 삭제하시겠습니까?')) {
                                        await notionDelete(selectedImport.id);
                                        // Detail delete requires query by ImportNo first
                                        const details = await notionQuery(DB_IMPORTS_DETAIL(), { filter: { property: 'ImportNo', rich_text: { equals: selectedImport.importNo } } });
                                        for (const r of details.results) await notionDelete(r.id);
                                        setSelectedImport(null);
                                        fetchInitialData();
                                    }
                                }}
                                style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: '1px solid #ff4d4f', color: '#ff4d4f', fontWeight: 600 }}
                            >
                                삭제
                            </button>
                            <button onClick={() => setSelectedImport(null)} style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', color: 'white', fontWeight: 700 }}>닫기</button>
                        </div>
                    </div>
                )}
            </Modal>

            <ProductPicker
                isOpen={isProductPickerOpen}
                onClose={() => setIsProductPickerOpen(false)}
                onSelect={(p) => {
                    addProduct(p);
                    setIsProductPickerOpen(false);
                }}
            />
        </div>
    );
}
