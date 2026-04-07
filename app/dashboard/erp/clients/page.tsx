'use client';

import React, { useState, useEffect } from 'react';
import Modal from '@/components/erp/Modal';
import {
    notionQuery, notionCreate, notionUpdate, notionDelete, DB_CLIENTS,
    RT, TITLE, FILES, uploadFile, email, select, dateISO
} from '@/lib/notion-erp';

export default function ClientsPage() {
    const [clients, setClients] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState<any | null>(null);
    const [uploading, setUploading] = useState<string | null>(null);

    const [form, setForm] = useState<any>({
        clientName: '', businessNo: '', ceo: '', type: '', industry: '', address: '', address2: '',
        tel: '', fax: '', email: '', bank: '', accountNo: '', accountHolder: '',
        taxType: '과세', currency: 'KRW', status: '정상', regDate: new Date().toISOString().split('T')[0],
        bizLicenseFile: null, bankCopyFile: null
    });

    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleAiScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsAnalyzing(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', 'client');

            const res = await fetch('/api/ai/analyze', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) throw new Error((await res.json()).error || '분석 실패');

            const data = await res.json();

            setSelectedClient(null);
            setForm((prev: any) => ({
                ...prev,
                clientName: data.clientName || '',
                businessNo: data.businessNo || '',
                ceo: data.ceo || '',
                industry: data.industry || '',
                type: data.type || '',
                address: data.address || '',
                tel: data.tel || '',
                fax: data.fax || '',
                email: data.email || '',
                taxType: '과세',
                currency: 'KRW',
                status: '정상',
                regDate: new Date().toISOString().split('T')[0]
            }));

            setIsModalOpen(true);
            alert('AI가 사업자등록증 정보를 추출했습니다. 내용을 확인해주세요.');
        } catch (err: any) {
            console.error(err);
            alert(`AI 분석 오류: ${err.message}`);
        } finally {
            setIsAnalyzing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    useEffect(() => {
        fetchClients();
    }, []);

    async function fetchClients() {
        try {
            setLoading(true);
            const res = await notionQuery(DB_CLIENTS, { sorts: [{ property: 'ClientName', direction: 'ascending' }] });
            setClients(res.results);
        } finally {
            setLoading(false);
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setUploading(field);
            const data = await uploadFile(file);
            setForm({ ...form, [field]: data });
        } catch (err) { alert('업로드 실패'); }
        finally { setUploading(null); }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        const isDuplicate = clients.some(c => {
            if (selectedClient && c.id === selectedClient.id) return false;
            const existingName = c.properties.ClientName?.title?.[0]?.plain_text || '';
            return existingName.trim() === form.clientName.trim();
        });

        if (isDuplicate) {
            alert(`이미 등록된 업체명입니다: "${form.clientName}"\n동일한 이름의 거래처를 중복 등록할 수 없습니다.`);
            return;
        }

        try {
            const getF = (val: any, defaultName: string) => {
                if (!val) return FILES('');
                if (typeof val === 'string') return FILES(val, defaultName);
                return FILES(val.url, val.name);
            };

            const props = {
                'ClientName': TITLE(form.clientName),
                'BusinessNo': RT(form.businessNo),
                'CEO': RT(form.ceo),
                'Type': select(form.type),
                'Industry': RT(form.industry),
                'Address': RT(form.address),
                'Address2': RT(form.address2),
                'Tel': RT(form.tel),
                'Fax': RT(form.fax),
                'Email': email(form.email),
                'Bank': RT(form.bank),
                'AccountNo': RT(form.accountNo),
                'AccountHolder': RT(form.accountHolder),
                'TaxType': select(form.taxType),
                'Currency': select(form.currency),
                'Status': select(form.status),
                'RegDate': dateISO(form.regDate),
                'BizLicenseFile': getF(form.bizLicenseFile, '사업자등록증'),
                'BankCopyFile': getF(form.bankCopyFile, '통장사본')
            };

            if (selectedClient) await notionUpdate(selectedClient.id, props);
            else await notionCreate(DB_CLIENTS, props);

            setIsModalOpen(false);
            fetchClients();
            alert('거래처 정보가 노션에 완벽하게 저장되었습니다.');
        } catch (err: any) { alert('오류: ' + err.message); }
    };

    const openModal = (c?: any) => {
        if (c) {
            setSelectedClient(c);
            const p = c.properties;
            setForm({
                clientName: p.ClientName?.title?.[0]?.plain_text || '',
                businessNo: p.BusinessNo?.rich_text?.[0]?.plain_text || '',
                ceo: p.CEO?.rich_text?.[0]?.plain_text || '',
                type: p.Type?.select?.name || '',
                industry: p.Industry?.rich_text?.[0]?.plain_text || '',
                address: p.Address?.rich_text?.[0]?.plain_text || '',
                address2: p.Address2?.rich_text?.[0]?.plain_text || '',
                tel: p.Tel?.rich_text?.[0]?.plain_text || '',
                fax: p.Fax?.rich_text?.[0]?.plain_text || '',
                email: p.Email?.email || '',
                bank: p.Bank?.rich_text?.[0]?.plain_text || '',
                accountNo: p.AccountNo?.rich_text?.[0]?.plain_text || '',
                accountHolder: p.AccountHolder?.rich_text?.[0]?.plain_text || '',
                taxType: p.TaxType?.select?.name || '과세',
                currency: p.Currency?.select?.name || 'KRW',
                status: p.Status?.select?.name || '정상',
                regDate: p.RegDate?.date?.start || new Date().toISOString().split('T')[0],
                bizLicenseFile: p.BizLicenseFile?.files?.[0]?.external?.url || '',
                bankCopyFile: p.BankCopyFile?.files?.[0]?.external?.url || ''
            });
        } else {
            setSelectedClient(null);
            setForm({
                clientName: '', businessNo: '', ceo: '', type: '', industry: '', address: '', address2: '',
                tel: '', fax: '', email: '', bank: '', accountNo: '', accountHolder: '',
                taxType: '과세', currency: 'KRW', status: '정상', regDate: new Date().toISOString().split('T')[0],
                bizLicenseFile: null, bankCopyFile: null
            });
        }
        setIsModalOpen(true);
    };

    const getUrl = (val: any) => (typeof val === 'string' ? val : val?.url);

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.5rem' }}>거래처 관리 (CRM)</h2>
                    <p style={{ color: 'rgba(255, 255, 255, 0.5)' }}>노션 DB 19개 필드 통합 동기화</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept="image/*,application/pdf"
                        onChange={handleAiScan}
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isAnalyzing}
                        style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', padding: '0.75rem 1.5rem', borderRadius: '12px', color: 'white', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                    >
                        {isAnalyzing ? (
                            <>⏳ 분석 중...</>
                        ) : (
                            <>✅ AI 자동 등록</>
                        )}
                    </button>
                    <button onClick={() => openModal()} style={{ background: 'linear-gradient(135deg, #0070f3, #6c5ce7)', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '12px', color: 'white', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        + 신규 거래처 등록
                    </button>
                </div>
            </header>

            <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1000px' }}>
                    <thead>
                        <tr style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <th style={{ padding: '1rem' }}>업체명</th>
                            <th style={{ padding: '1rem' }}>대표자/업태</th>
                            <th style={{ padding: '1rem' }}>연락처/이메일</th>
                            <th style={{ padding: '1rem' }}>금융 정보</th>
                            <th style={{ padding: '1rem' }}>상태</th>
                            <th style={{ padding: '1rem', width: '80px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (<tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center' }}>데이터 동기화 중...</td></tr>) :
                            clients.map(c => {
                                const p = c.properties;
                                return (
                                    <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}>
                                        <td style={{ padding: '1.25rem 1rem' }}>
                                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{p.ClientName?.title?.[0]?.plain_text || '명칭 없음'}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#0070f3', marginTop: '2px' }}>{p.BusinessNo?.rich_text?.[0]?.plain_text}</div>
                                        </td>
                                        <td style={{ padding: '1.25rem 1rem' }}>
                                            <div style={{ fontSize: '0.9rem' }}>{p.CEO?.rich_text?.[0]?.plain_text || '-'}</div>
                                            <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>{p.Type?.select?.name} / {p.Industry?.rich_text?.[0]?.plain_text}</div>
                                        </td>
                                        <td style={{ padding: '1.25rem 1rem' }}>
                                            <div style={{ fontSize: '0.9rem' }}>{p.Tel?.rich_text?.[0]?.plain_text || '-'}</div>
                                            <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>{p.Email?.email}</div>
                                        </td>
                                        <td style={{ padding: '1.25rem 1rem' }}>
                                            <div style={{ fontSize: '0.85rem' }}>{p.Bank?.rich_text?.[0]?.plain_text}</div>
                                            <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>{p.AccountNo?.rich_text?.[0]?.plain_text}</div>
                                        </td>
                                        <td style={{ padding: '1.25rem 1rem' }}>
                                            <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '6px', background: p.Status?.select?.name === '정상' ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.1)', color: p.Status?.select?.name === '정상' ? '#00ff88' : 'white' }}>
                                                {p.Status?.select?.name || '기타'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1.25rem 1rem' }}>
                                            <button onClick={() => openModal(c)} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', cursor: 'pointer' }}>✏️</button>
                                        </td>
                                    </tr>
                                );
                            })}
                    </tbody>
                </table>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedClient ? "거래처 상세 정보" : "신규 거래처 등록"} size="lg">
                <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', maxHeight: '80vh', overflowY: 'auto', paddingRight: '1rem' }}>
                    {/* Basic Info Section */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0070f3', marginBottom: '0.5rem' }}>기본 정보</h3>
                        <input placeholder="업체명 *" required value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem', color: 'white' }} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            <input placeholder="사업자번호" value={form.businessNo} onChange={e => setForm({ ...form, businessNo: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem', color: 'white' }} />
                            <input placeholder="대표자명" value={form.ceo} onChange={e => setForm({ ...form, ceo: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem', color: 'white' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem', color: 'white' }}>
                                <option value="">거래처 구분</option><option value="고객">고객</option><option value="공급업체">공급업체</option><option value="겸용">겸용</option>
                            </select>
                            <input placeholder="업태/종목" value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem', color: 'white' }} />
                        </div>
                        <input placeholder="주소 1" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem', color: 'white' }} />
                        <input placeholder="주소 2 (상세)" value={form.address2} onChange={e => setForm({ ...form, address2: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem', color: 'white' }} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            <input placeholder="전화번호" value={form.tel} onChange={e => setForm({ ...form, tel: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem', color: 'white' }} />
                            <input placeholder="팩스번호" value={form.fax} onChange={e => setForm({ ...form, fax: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem', color: 'white' }} />
                        </div>
                        <input placeholder="이메일" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem', color: 'white' }} />
                    </div>

                    {/* Financial & Files Section */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#00ff88', marginBottom: '0.5rem' }}>금융 및 계약 정보</h3>
                        <input placeholder="거래 은행" value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem', color: 'white' }} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            <input placeholder="계좌번호" value={form.accountNo} onChange={e => setForm({ ...form, accountNo: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem', color: 'white' }} />
                            <input placeholder="예금주" value={form.accountHolder} onChange={e => setForm({ ...form, accountHolder: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem', color: 'white' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                            <select value={form.taxType} onChange={e => setForm({ ...form, taxType: e.target.value })} style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.6rem', color: 'white', fontSize: '0.85rem' }}>
                                <option value="과세">과세</option><option value="영세">영세</option><option value="면세">면세</option>
                            </select>
                            <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.6rem', color: 'white', fontSize: '0.85rem' }}>
                                <option value="KRW">KRW</option><option value="USD">USD</option><option value="CNY">CNY</option><option value="RMB">RMB</option>
                            </select>
                            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.6rem', color: 'white', fontSize: '0.85rem' }}>
                                <option value="정상">정상</option><option value="중단">중단</option><option value="보류">보류</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <label style={{ fontSize: '0.75rem', opacity: 0.5, marginLeft: '4px' }}>등록일</label>
                            <input type="date" value={form.regDate} onChange={e => setForm({ ...form, regDate: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem', color: 'white', colorScheme: 'dark' }} />
                        </div>

                        {/* File Uploads */}
                        {['bizLicenseFile', 'bankCopyFile'].map(f => (
                            <div key={f} style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px dashed rgba(255,255,255,0.1)' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{f === 'bizLicenseFile' ? '사업자등록증' : '통장사본'}</span>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {getUrl(form[f]) && (
                                        <button type="button" onClick={() => window.open(getUrl(form[f]), '_blank')} style={{ color: '#0070f3', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>
                                            🔗
                                        </button>
                                    )}
                                    <label style={{ cursor: 'pointer', background: uploading === f ? '#555' : '#0070f3', padding: '6px 10px', borderRadius: '8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '5px', color: 'white' }}>
                                        📤 {uploading === f ? '...' : '올리기'}
                                        <input type="file" hidden onChange={e => handleFileUpload(e, f)} />
                                    </label>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ gridColumn: '1 / -1', marginTop: '1rem' }}>
                        <button type="submit" disabled={!!uploading} style={{ width: '100%', padding: '1rem', borderRadius: '12px', background: 'linear-gradient(135deg, #0070f3, #6c5ce7)', border: 'none', color: 'white', fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,112,243,0.3)' }}>거래처 정보 노션 동기화 저장</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
