'use client';

import React, { useState, useEffect } from 'react';
import { getSettings, saveSettings, CompanySettings, fetchCompanySettings, saveCompanySettingsNotion } from '@/lib/erp-settings';

export default function SettingsPage() {
    const [settings, setSettings] = useState<CompanySettings | null>(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        fetchCompanySettings().then(setSettings);
    }, []);

    const handleSave = async () => {
        if (settings) {
            try {
                const res = await saveCompanySettingsNotion(settings);
                if (res && (res.error || res.status >= 400)) {
                    const errorMsg = res.message || res.error || '알 수 없는 노션 오류';
                    alert(`노션 저장 실패: ${errorMsg}\n(DB 속성 이름이나 API 키를 확인해주세요.)`);
                } else {
                    setSaved(true);
                    setTimeout(() => setSaved(false), 2000);
                }
            } catch (e: any) {
                console.error('Settings handleSave Error:', e);
                alert(`설정 저장 중 시스템 오류가 발생했습니다: ${e.message}\n(브라우저 콘솔 로그를 확인해주세요.)`);
            }
        }
    };

    if (!settings) return <div style={{ padding: '2rem' }}>로딩 중...</div>;

    const glassStyle = {
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '16px',
        padding: '2rem'
    };

    const inputStyle = {
        width: '100%',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px',
        padding: '0.75rem',
        color: 'white'
    };

    const labelStyle = {
        display: 'block' as const,
        fontSize: '0.85rem',
        color: 'rgba(255,255,255,0.5)',
        marginBottom: '0.5rem'
    };

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <header style={{ marginBottom: '2.5rem' }}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.5rem' }}>시스템 설정</h2>
                <p style={{ color: 'rgba(255, 255, 255, 0.5)' }}>ERP 환경설정 및 회사 기초 정보를 관리합니다.</p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div style={glassStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem' }}>
                            <span style={{ color: '#0070f3', fontSize: '1.2rem' }}>🏢</span>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>회사 기초 정보</h3>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={labelStyle}>회사명</label>
                                <input value={settings.name} onChange={e => setSettings({ ...settings, name: e.target.value })} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>대표자</label>
                                <input value={settings.ceo} onChange={e => setSettings({ ...settings, ceo: e.target.value })} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>사업자번호</label>
                                <input value={settings.bizNo} onChange={e => setSettings({ ...settings, bizNo: e.target.value })} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>업태</label>
                                <input value={settings.bizType} onChange={e => setSettings({ ...settings, bizType: e.target.value })} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>종목</label>
                                <input value={settings.bizItem} onChange={e => setSettings({ ...settings, bizItem: e.target.value })} style={inputStyle} />
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={labelStyle}>주소</label>
                                <input value={settings.address} onChange={e => setSettings({ ...settings, address: e.target.value })} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>전화번호</label>
                                <input value={settings.tel} onChange={e => setSettings({ ...settings, tel: e.target.value })} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>팩스번호</label>
                                <input value={settings.fax} onChange={e => setSettings({ ...settings, fax: e.target.value })} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>이메일</label>
                                <input value={settings.email} onChange={e => setSettings({ ...settings, email: e.target.value })} style={inputStyle} />
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={labelStyle}>입금 계좌 (국내)</label>
                                <input value={settings.bank} onChange={e => setSettings({ ...settings, bank: e.target.value })} placeholder="은행명 계좌번호 (예금주)" style={inputStyle} />
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={labelStyle}>입금 계좌 (해외) - 라인 1</label>
                                <input value={settings.bankForeign1} onChange={e => setSettings({ ...settings, bankForeign1: e.target.value })} placeholder="BANK NAME / SWIFT CODE" style={inputStyle} />
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={labelStyle}>입금 계좌 (해외) - 라인 2</label>
                                <input value={settings.bankForeign2} onChange={e => setSettings({ ...settings, bankForeign2: e.target.value })} placeholder="ACCOUNT NO / NAME" style={inputStyle} />
                            </div>
                        </div>
                        <button onClick={handleSave} style={{ marginTop: '2.5rem', width: '100%', background: 'linear-gradient(135deg, #0070f3, #6c5ce7)', border: 'none', padding: '1rem', borderRadius: '12px', color: 'white', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
                            {saved ? <>✅ 설정 저장 완료</> : <>💾 전체 설정 저장</>}
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div style={glassStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem' }}>
                            <span style={{ color: '#0070f3', fontSize: '1.2rem' }}>🔗</span>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>로고 및 직인 URL</h3>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div>
                                <label style={labelStyle}>로고 이미지 URL</label>
                                <input value={settings.logoUrl} onChange={e => setSettings({ ...settings, logoUrl: e.target.value })} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>직인(도장) 이미지 URL</label>
                                <input value={settings.stampUrl} onChange={e => setSettings({ ...settings, stampUrl: e.target.value })} style={inputStyle} />
                            </div>
                            <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
                                <div style={{ flex: 1, background: 'white', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ fontSize: '0.7rem', color: '#666', marginBottom: '5px' }}>로고 미리보기</p>
                                    <img src={settings.logoUrl} alt="Logo" style={{ maxHeight: '60px', maxWidth: '100%' }} />
                                </div>
                                <div style={{ flex: 1, background: 'white', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ fontSize: '0.7rem', color: '#666', marginBottom: '5px' }}>직인 미리보기</p>
                                    <img src={settings.stampUrl} alt="Stamp" style={{ maxHeight: '60px', maxWidth: '100%' }} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ ...glassStyle, border: '1px solid rgba(0, 112, 243, 0.3)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
                            <span style={{ color: '#0070f3', fontSize: '1rem' }}>ℹ️</span>
                            <h4 style={{ fontSize: '0.9rem', fontWeight: 700 }}>설정 안내</h4>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                            여기에 입력된 정보는 <strong>견적서(Quotation)</strong> 및 <strong>거래명세서</strong> 상단과 하단의 공급자 정보로 자동 반영됩니다.
                            로고와 직인은 투명 배경(PNG) 이미지를 사용하시기를 권장합니다.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
