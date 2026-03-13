'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';

const NAV_GROUPS = [
  {
    label: '홈',
    items: [
      { href: '/dashboard',           icon: '🏠', label: '대시보드' },
      { href: '/dashboard/directives', icon: '📋', label: '대표 지시사항' },
      { href: '/dashboard/chat',       icon: '💬', label: '채팅 센터' },
      { href: '/dashboard/schedule',   icon: '📅', label: '스케줄' },
    ],
  },
  {
    label: '직원 관리',
    items: [
      { href: '/dashboard/employees',  icon: '👥', label: 'AI 직원 관리' },
    ],
  },
  {
    label: 'ERP 시스템',
    items: [
      { href: '/dashboard/erp/sales',       icon: '📊', label: '영업 ERP' },
      { href: '/dashboard/erp/accounting',  icon: '💰', label: '회계 ERP' },
      { href: '/dashboard/marketing',       icon: '📣', label: '마케팅 허브' },
    ],
  },
  {
    label: '온라인',
    items: [
      { href: '/dashboard/keyword',          icon: '🔑', label: '키워드 도구' },
      { href: '/dashboard/keyword/advanced', icon: '⚡', label: '고급 키워드 분석' },
      { href: '/dashboard/sns',        icon: '🌐', label: 'SNS 관리' },
      { href: '/dashboard/shorts',             icon: '🎬', label: '숏폼 스튜디오' },
      { href: '/dashboard/shorts/remove-text', icon: '✂️', label: '동영상 텍스트 제거' },
      { href: '/dashboard/coupang',   icon: '🛒', label: '쿠팡파트너스' },
      { href: '/dashboard/wordpress', icon: '📝', label: 'WordPress 발행' },
      { href: '/dashboard/naver',     icon: '🟢', label: '네이버 블로그' },
      { href: '/dashboard/website',        icon: '🏢', label: '홈페이지 관리' },
      { href: '/dashboard/product-detail', icon: '📱', label: '상품 상세페이지' },
    ],
  },
  {
    label: '성장',
    items: [
      { href: '/dashboard/insights',  icon: '🧠', label: 'AI 인사이트' },
      { href: '/dashboard/courses',   icon: '🎓', label: '강의' },
      { href: '/dashboard/community', icon: '🤝', label: '커뮤니티' },
      { href: '/dashboard/notion',    icon: '📔', label: 'Notion 연동' },
      { href: '/dashboard/gallery',   icon: '🖼️', label: '갤러리' },
    ],
  },
  {
    label: '설정',
    items: [
      { href: '/dashboard/settings', icon: '⚙️', label: 'AI 설정' },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  isMobile?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({ collapsed, onToggle, isMobile, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { employees, companySettings, directives } = useStore();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user.email ?? null);
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const pendingDirectives = directives.filter((d) => d.status === 'pending').length;
  const activeEmployees = employees.filter((e) => e.status === 'active').length;

  const getBadge = (href: string): number | null => {
    if (href === '/dashboard/directives') return pendingDirectives || null;
    return null;
  };

  const handleNavClick = () => {
    if (isMobile && onMobileClose) {
      onMobileClose();
    }
  };

  return (
    <aside
      className={`flex flex-col h-full bg-slate-900 border-r border-slate-700/50 transition-all duration-300 ${
        isMobile ? 'w-72' : collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* 로고 + 토글 */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-700/50 flex-shrink-0">
        {(!collapsed || isMobile) && (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-black text-white flex-shrink-0">
              L
            </div>
            <div className="min-w-0">
              <div className="font-black text-white text-sm leading-none">LOOV</div>
              <div className="text-[10px] text-slate-400 truncate mt-0.5">{companySettings.companyName}</div>
            </div>
          </div>
        )}
        {collapsed && !isMobile && (
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-black text-white mx-auto">
            L
          </div>
        )}

        {/* 모바일 닫기 버튼 */}
        {isMobile && onMobileClose && (
          <button
            onClick={onMobileClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-700/50"
            aria-label="메뉴 닫기"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* 데스크탑 접기/펼치기 버튼 */}
        {!isMobile && !collapsed && (
          <button onClick={onToggle} className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-700/50">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        )}
        {!isMobile && collapsed && (
          <button onClick={onToggle} className="absolute -right-3 top-5 w-6 h-6 bg-slate-700 border border-slate-600 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-600 transition-all z-10">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* 대표 정보 */}
      {(!collapsed || isMobile) && (
        <div className="px-3 py-3 border-b border-slate-700/50 flex-shrink-0">
          <div className="flex items-center gap-2.5 bg-slate-800/60 rounded-xl px-3 py-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-sm font-black text-white flex-shrink-0">
              {companySettings.ceoName ? companySettings.ceoName[0] : '대'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-white truncate">
                {companySettings.ceoName || '대표님'}
              </div>
              <div className="text-[10px] text-amber-400 font-medium">CEO · 대표</div>
            </div>
            <div className="w-2 h-2 bg-emerald-400 rounded-full flex-shrink-0" />
          </div>
        </div>
      )}

      {/* 직원 요약 */}
      {(!collapsed || isMobile) && employees.length > 0 && (
        <div className="px-3 py-2 border-b border-slate-700/50 flex-shrink-0">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>AI 직원 {employees.length}명</span>
            <span className="text-emerald-400">{activeEmployees}명 활동 중</span>
          </div>
        </div>
      )}

      {/* 네비게이션 */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {(!collapsed || isMobile) && (
              <div className="px-2 mb-1">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{group.label}</span>
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = item.href === '/dashboard'
                  ? pathname === '/dashboard'
                  : pathname.startsWith(item.href);
                const badge = getBadge(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleNavClick}
                    title={collapsed && !isMobile ? item.label : undefined}
                    className={`relative flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm font-medium transition-all group ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                    }`}
                  >
                    <span className={`text-base flex-shrink-0 ${collapsed && !isMobile ? 'mx-auto' : ''}`}>{item.icon}</span>
                    {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
                    {badge !== null && badge > 0 && (
                      <span className={`ml-auto flex-shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                        isActive ? 'bg-white/20 text-white' : 'bg-red-500 text-white'
                      }`}>
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* 하단 */}
      <div className="p-2 border-t border-slate-700/50 flex-shrink-0 space-y-0.5">
        {(!collapsed || isMobile) && userEmail && (
          <div className="px-2.5 py-1.5">
            <div className="text-[10px] text-slate-500 truncate">{userEmail}</div>
          </div>
        )}
        <Link
          href="/"
          onClick={handleNavClick}
          className={`flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm text-slate-500 hover:text-slate-300 hover:bg-slate-700/30 transition-all ${
            collapsed && !isMobile ? 'justify-center' : ''
          }`}
          title={collapsed && !isMobile ? '서비스 소개' : undefined}
        >
          <span className="text-base flex-shrink-0">🏠</span>
          {(!collapsed || isMobile) && <span className="text-xs">서비스 소개</span>}
        </Link>
        <button
          onClick={handleLogout}
          title={collapsed && !isMobile ? '로그아웃' : undefined}
          className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all ${
            collapsed && !isMobile ? 'justify-center' : ''
          }`}
        >
          <span className="text-base flex-shrink-0">🚪</span>
          {(!collapsed || isMobile) && <span className="text-xs">로그아웃</span>}
        </button>
      </div>
    </aside>
  );
}
