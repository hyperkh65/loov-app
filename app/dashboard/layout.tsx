'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/dashboard/Sidebar';
import { supabase } from '@/lib/supabase';
import { loadAllData } from '@/lib/db';
import { useStore } from '@/lib/store';

const BOTTOM_NAV = [
  { href: '/dashboard', icon: '🏠', label: '홈' },
  { href: '/dashboard/chat', icon: '💬', label: '채팅' },
  { href: '/dashboard/erp/sales', icon: '📊', label: 'ERP' },
  { href: '/dashboard/settings', icon: '⚙️', label: '설정' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const { updateCompanySettings } = useStore();

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }

      try {
        const data = await loadAllData();
        if (!mounted) return;

        const store = useStore.getState();

        if (data.company) {
          store.updateCompanySettings(data.company);
        }

        if (data.employees.length > 0) {
          const existingIds = new Set(store.employees.map((e) => e.id));
          for (const emp of data.employees) {
            if (!existingIds.has(emp.id)) {
              store.addEmployee(emp);
            }
          }
        }

        for (const directive of data.directives) {
          const exists = store.directives.some((d) => d.id === directive.id);
          if (!exists) store.addDirective(directive);
        }

        for (const lead of data.salesLeads) {
          const exists = store.salesLeads.some((l) => l.id === lead.id);
          if (!exists) store.addSalesLead(lead);
        }

        for (const entry of data.accountingEntries) {
          const exists = store.accountingEntries.some((e) => e.id === entry.id);
          if (!exists) store.addAccountingEntry(entry);
        }

        for (const campaign of data.marketingCampaigns) {
          const exists = store.marketingCampaigns.some((c) => c.id === campaign.id);
          if (!exists) store.addMarketingCampaign(campaign);
        }

        for (const event of data.scheduleEvents) {
          const exists = store.scheduleEvents.some((e) => e.id === event.id);
          if (!exists) store.addScheduleEvent(event);
        }

        for (const project of data.projects) {
          const exists = store.projects.some((p) => p.id === project.id);
          if (!exists) store.addProject(project);
        }

        for (const chat of data.chats) {
          const existingChat = store.directChats.find((c) => c.employeeId === chat.employeeId);
          if (existingChat) {
            const existingIds = new Set(existingChat.messages.map((m) => m.id));
            for (const msg of chat.messages) {
              if (!existingIds.has(msg.id)) {
                store.addDirectMessage(chat.employeeId, msg);
              }
            }
          }
        }

      } catch (err) {
        console.error('Supabase load error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        router.replace('/login');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-screen bg-slate-900 items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xl font-black text-white mx-auto mb-4 animate-pulse">
            L
          </div>
          <div className="text-white font-semibold mb-2">LOOV</div>
          <div className="text-slate-400 text-sm flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-slate-600 border-t-indigo-400 rounded-full animate-spin" />
            데이터 불러오는 중...
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* 모바일 상단 헤더 */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-100 px-4 flex items-center gap-3 h-[52px]">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="메뉴 열기"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-black text-white flex-shrink-0">
            L
          </div>
          <span className="font-black text-gray-900 text-sm">LOOV</span>
        </div>
      </div>

      <div className="flex bg-gray-50 overflow-hidden" style={{ height: '100dvh' }}>
        {/* 데스크탑 사이드바 */}
        <div className="hidden md:flex relative flex-shrink-0">
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
        </div>

        {/* 모바일 드로어 오버레이 */}
        {sidebarOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="relative z-50 flex flex-col h-full">
              <Sidebar
                collapsed={false}
                onToggle={() => {}}
                isMobile
                onMobileClose={() => setSidebarOpen(false)}
              />
            </div>
          </div>
        )}

        {/* 메인 컨텐츠 */}
        <main className="flex-1 overflow-y-auto pt-[52px] md:pt-0 pb-[60px] md:pb-0">
          {children}
        </main>
      </div>

      {/* 모바일 하단 네비게이션 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 flex" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {BOTTOM_NAV.map((item) => {
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-colors ${
                isActive ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <span className="text-xl leading-tight">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
