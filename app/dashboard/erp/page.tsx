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
        <div className="p-8">
            <div className="mb-8">
                <h1 className="text-3xl font-black text-gray-900">ERP 시스템</h1>
                <p className="text-gray-500 mt-2">Notion 기반 통합 ERP — 영업, 재고, 수입, 인사를 한곳에서</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {ERP_MENUS.map(menu => (
                    <Link
                        key={menu.href}
                        href={menu.href}
                        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md hover:border-blue-200 transition-all group"
                    >
                        <div className="text-4xl mb-3">{menu.icon}</div>
                        <h3 className="font-bold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">{menu.label}</h3>
                        <p className="text-xs text-gray-500">{menu.desc}</p>
                    </Link>
                ))}
            </div>

            <div className="mt-12 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white">
                <h2 className="text-xl font-black mb-2">💡 Notion 연동 안내</h2>
                <p className="text-blue-100 text-sm mb-4">
                    이 ERP 시스템은 Notion 데이터베이스를 백엔드로 사용합니다.<br />
                    NOTION_API_KEY 환경변수가 설정되어 있어야 데이터를 불러올 수 있습니다.
                </p>
                <Link
                    href="/dashboard/erp/settings"
                    className="inline-block bg-white text-blue-700 font-bold px-5 py-2 rounded-full text-sm hover:bg-blue-50 transition-colors"
                >
                    ERP 설정 바로가기
                </Link>
            </div>
        </div>
    );
}
