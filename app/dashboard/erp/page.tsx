'use client';

import Link from 'next/link';

const ERP_MENUS = [
    { href: '/dashboard/erp/accounting', icon: '💰', label: '회계/영업 ERP', desc: '매출, 세금계산서, 재무 관리' },
    { href: '/dashboard/erp/quotes', icon: '📋', label: '견적 관리', desc: '견적서 작성 및 관리' },
    { href: '/dashboard/erp/purchase-orders', icon: '🛒', label: '발주 관리', desc: '발주서 작성 및 추적' },
    { href: '/dashboard/erp/imports', icon: '🚢', label: '수입 관리', desc: '수입 화물 및 통관 추적' },
    { href: '/dashboard/erp/clients', icon: '🤝', label: '거래처 관리', desc: '고객사 및 협력사 DB' },
    { href: '/dashboard/erp/crm', icon: '📊', label: 'CRM 영업관리', desc: '영업 파이프라인 관리' },
    { href: '/dashboard/erp/products', icon: '📦', label: '제품 DB', desc: 'AI 자동 제품 등록/관리' },
    { href: '/dashboard/erp/inventory', icon: '🏭', label: '재고 관리', desc: '입출고 및 재고 현황' },
    { href: '/dashboard/erp/scm', icon: '🔗', label: 'SCM 공급망', desc: '공급망 및 납기 관리' },
    { href: '/dashboard/erp/hr', icon: '👥', label: '인사 관리', desc: '직원 정보 및 HR' },
    { href: '/dashboard/erp/settings', icon: '⚙️', label: 'ERP 설정', desc: '회사 정보 및 기본 설정' },
];

export default function ErpHomePage() {
    return (
        <div style={{ padding: '2rem' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#ffffff', margin: '0 0 0.5rem' }}>ERP 시스템</h1>
                <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>Notion 기반 통합 ERP — 영업, 재고, 수입, 인사를 한곳에서</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                {ERP_MENUS.map(menu => (
                    <Link
                        key={menu.href}
                        href={menu.href}
                        style={{
                            display: 'block',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '16px',
                            padding: '1.5rem',
                            textDecoration: 'none',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,112,243,0.4)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'; }}
                    >
                        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>{menu.icon}</div>
                        <h3 style={{ fontWeight: 700, color: '#ffffff', margin: '0 0 0.25rem', fontSize: '0.95rem' }}>{menu.label}</h3>
                        <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', margin: 0 }}>{menu.desc}</p>
                    </Link>
                ))}
            </div>

            <div style={{ marginTop: '3rem', background: 'linear-gradient(135deg, rgba(0,112,243,0.2), rgba(108,92,231,0.2))', border: '1px solid rgba(0,112,243,0.3)', borderRadius: '16px', padding: '1.5rem' }}>
                <h2 style={{ color: '#fff', fontWeight: 800, margin: '0 0 0.5rem', fontSize: '1.1rem' }}>💡 Notion 연동 안내</h2>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem', margin: '0 0 1rem' }}>
                    이 ERP 시스템은 Notion 데이터베이스를 백엔드로 사용합니다.<br />
                    NOTION_API_KEY 환경변수가 설정되어 있어야 데이터를 불러올 수 있습니다.
                </p>
                <Link
                    href="/dashboard/erp/settings"
                    style={{ display: 'inline-block', background: 'rgba(0,112,243,0.8)', color: 'white', fontWeight: 700, padding: '0.5rem 1.25rem', borderRadius: '20px', fontSize: '0.875rem', textDecoration: 'none' }}
                >
                    ERP 설정 바로가기
                </Link>
            </div>
        </div>
    );
}
