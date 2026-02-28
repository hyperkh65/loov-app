'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/dashboard/Sidebar';
import { supabase } from '@/lib/supabase';
import { loadAllData } from '@/lib/db';
import { useStore } from '@/lib/store';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const {
    updateCompanySettings,
  } = useStore();

  useEffect(() => {
    let mounted = true;

    async function init() {
      // 1. 세션 확인
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }

      // 2. Supabase에서 전체 데이터 로드 → Zustand 스토어에 병합
      try {
        const data = await loadAllData();
        if (!mounted) return;

        const store = useStore.getState();

        // 회사 설정
        if (data.company) {
          store.updateCompanySettings(data.company);
        }

        // 직원 (새로 로드한 것으로 대체)
        if (data.employees.length > 0) {
          // 기존 로컬 직원과 병합 (Supabase 데이터 우선)
          const existingIds = new Set(store.employees.map((e) => e.id));
          for (const emp of data.employees) {
            if (!existingIds.has(emp.id)) {
              store.addEmployee(emp);
            }
          }
        }

        // 지시사항
        for (const directive of data.directives) {
          const exists = store.directives.some((d) => d.id === directive.id);
          if (!exists) store.addDirective(directive);
        }

        // 영업 리드
        for (const lead of data.salesLeads) {
          const exists = store.salesLeads.some((l) => l.id === lead.id);
          if (!exists) store.addSalesLead(lead);
        }

        // 회계
        for (const entry of data.accountingEntries) {
          const exists = store.accountingEntries.some((e) => e.id === entry.id);
          if (!exists) store.addAccountingEntry(entry);
        }

        // 마케팅
        for (const campaign of data.marketingCampaigns) {
          const exists = store.marketingCampaigns.some((c) => c.id === campaign.id);
          if (!exists) store.addMarketingCampaign(campaign);
        }

        // 스케줄
        for (const event of data.scheduleEvents) {
          const exists = store.scheduleEvents.some((e) => e.id === event.id);
          if (!exists) store.addScheduleEvent(event);
        }

        // 프로젝트
        for (const project of data.projects) {
          const exists = store.projects.some((p) => p.id === project.id);
          if (!exists) store.addProject(project);
        }

        // 채팅 메시지
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
        // 로드 실패해도 로컬 데이터로 계속 동작
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();

    // 인증 상태 변화 구독
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
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <div className="relative flex-shrink-0">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      </div>
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
