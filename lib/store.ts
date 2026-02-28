'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Employee, Message, DirectChat, Meeting, MeetingMessage,
  Project, DailyReport, CompanySettings, DEFAULT_COMPANY_SETTINGS,
  ANIMAL_MODEL, CEODirective, SalesLead, AccountingEntry,
  MarketingCampaign, ScheduleEvent, AIProviderConfig,
} from './types';

// Supabase 동기화는 동적 import로 (SSR 안전)
async function syncDB() {
  if (typeof window === 'undefined') return null;
  return import('./db');
}

interface AppState {
  employees: Employee[];
  directChats: DirectChat[];
  meetings: Meeting[];
  projects: Project[];
  dailyReports: DailyReport[];
  companySettings: CompanySettings;
  directives: CEODirective[];
  salesLeads: SalesLead[];
  accountingEntries: AccountingEntry[];
  marketingCampaigns: MarketingCampaign[];
  scheduleEvents: ScheduleEvent[];

  addEmployee: (employee: Employee) => void;
  removeEmployee: (id: string) => void;
  updateEmployee: (id: string, updates: Partial<Employee>) => void;
  updateEmployeeAI: (id: string, config: AIProviderConfig) => void;
  updateCompanySettings: (settings: Partial<CompanySettings>) => void;

  addDirectMessage: (employeeId: string, message: Message) => void;
  addMeeting: (meeting: Meeting) => void;
  addMeetingMessage: (meetingId: string, message: MeetingMessage) => void;

  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  removeProject: (id: string) => void;

  addDailyReport: (report: DailyReport) => void;

  addDirective: (directive: CEODirective) => void;
  updateDirective: (id: string, updates: Partial<CEODirective>) => void;
  addDirectiveResponse: (directiveId: string, response: CEODirective['responses'][0]) => void;

  addSalesLead: (lead: SalesLead) => void;
  updateSalesLead: (id: string, updates: Partial<SalesLead>) => void;
  removeSalesLead: (id: string) => void;

  addAccountingEntry: (entry: AccountingEntry) => void;
  updateAccountingEntry: (id: string, updates: Partial<AccountingEntry>) => void;
  removeAccountingEntry: (id: string) => void;

  addMarketingCampaign: (campaign: MarketingCampaign) => void;
  updateMarketingCampaign: (id: string, updates: Partial<MarketingCampaign>) => void;
  removeMarketingCampaign: (id: string) => void;

  addScheduleEvent: (event: ScheduleEvent) => void;
  updateScheduleEvent: (id: string, updates: Partial<ScheduleEvent>) => void;
  removeScheduleEvent: (id: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      employees: [],
      directChats: [],
      meetings: [],
      projects: [],
      dailyReports: [],
      companySettings: DEFAULT_COMPANY_SETTINGS,
      directives: [],
      salesLeads: [],
      accountingEntries: [],
      marketingCampaigns: [],
      scheduleEvents: [],

      // ── 회사 설정 ─────────────────────────────────
      updateCompanySettings: (settings) => {
        set((state) => ({ companySettings: { ...state.companySettings, ...settings } }));
        syncDB().then((db) => db?.dbCompany.save(settings).catch(console.warn));
      },

      // ── 직원 ──────────────────────────────────────
      addEmployee: (employee) => {
        set((state) => ({
          employees: [...state.employees, employee],
          directChats: [...state.directChats, { employeeId: employee.id, messages: [] }],
        }));
        syncDB().then((db) => db?.dbEmployees.create(employee).catch(console.warn));
      },

      removeEmployee: (id) => {
        set((state) => ({
          employees: state.employees.filter((e) => e.id !== id),
          directChats: state.directChats.filter((c) => c.employeeId !== id),
        }));
        syncDB().then((db) => db?.dbEmployees.remove(id).catch(console.warn));
      },

      updateEmployee: (id, updates) => {
        set((state) => ({
          employees: state.employees.map((e) => e.id === id ? { ...e, ...updates } : e),
        }));
        syncDB().then((db) => db?.dbEmployees.update(id, updates).catch(console.warn));
      },

      updateEmployeeAI: (id, config) => {
        set((state) => ({
          employees: state.employees.map((e) =>
            e.id === id ? { ...e, aiConfig: config } : e
          ),
        }));
        syncDB().then((db) => db?.dbEmployees.update(id, { aiConfig: config }).catch(console.warn));
      },

      // ── 채팅 ──────────────────────────────────────
      addDirectMessage: (employeeId, message) => {
        set((state) => ({
          directChats: state.directChats.map((c) =>
            c.employeeId === employeeId
              ? { ...c, messages: [...c.messages, message] }
              : c
          ),
        }));
        syncDB().then((db) => db?.dbChats.addMessage(employeeId, message).catch(console.warn));
      },

      addMeeting: (meeting) =>
        set((state) => ({ meetings: [meeting, ...state.meetings] })),

      addMeetingMessage: (meetingId, message) =>
        set((state) => ({
          meetings: state.meetings.map((m) =>
            m.id === meetingId ? { ...m, messages: [...m.messages, message] } : m
          ),
        })),

      // ── 프로젝트 ──────────────────────────────────
      addProject: (project) => {
        set((state) => ({ projects: [...state.projects, project] }));
        syncDB().then((db) => db?.dbProjects.create(project).catch(console.warn));
      },

      updateProject: (id, updates) => {
        set((state) => ({
          projects: state.projects.map((p) => p.id === id ? { ...p, ...updates } : p),
        }));
        syncDB().then((db) => db?.dbProjects.update(id, updates).catch(console.warn));
      },

      removeProject: (id) => {
        set((state) => ({ projects: state.projects.filter((p) => p.id !== id) }));
        syncDB().then((db) => db?.dbProjects.remove(id).catch(console.warn));
      },

      addDailyReport: (report) =>
        set((state) => ({
          dailyReports: [report, ...state.dailyReports].slice(0, 30),
        })),

      // ── CEO 지시사항 ──────────────────────────────
      addDirective: (directive) => {
        set((state) => ({ directives: [directive, ...state.directives] }));
        syncDB().then((db) => db?.dbDirectives.create(directive).catch(console.warn));
      },

      updateDirective: (id, updates) => {
        set((state) => ({
          directives: state.directives.map((d) => d.id === id ? { ...d, ...updates } : d),
        }));
        syncDB().then((db) => db?.dbDirectives.update(id, updates).catch(console.warn));
      },

      addDirectiveResponse: (directiveId, response) => {
        set((state) => ({
          directives: state.directives.map((d) =>
            d.id === directiveId
              ? { ...d, responses: [...d.responses, response], status: 'acknowledged' }
              : d
          ),
        }));
        syncDB().then((db) => db?.dbDirectives.addResponse(directiveId, response).catch(console.warn));
      },

      // ── 영업 ──────────────────────────────────────
      addSalesLead: (lead) => {
        set((state) => ({ salesLeads: [lead, ...state.salesLeads] }));
        syncDB().then((db) => db?.dbSales.create(lead).catch(console.warn));
      },

      updateSalesLead: (id, updates) => {
        set((state) => ({
          salesLeads: state.salesLeads.map((l) =>
            l.id === id ? { ...l, ...updates, updatedAt: new Date().toISOString() } : l
          ),
        }));
        syncDB().then((db) => db?.dbSales.update(id, updates).catch(console.warn));
      },

      removeSalesLead: (id) => {
        set((state) => ({ salesLeads: state.salesLeads.filter((l) => l.id !== id) }));
        syncDB().then((db) => db?.dbSales.remove(id).catch(console.warn));
      },

      // ── 회계 ──────────────────────────────────────
      addAccountingEntry: (entry) => {
        set((state) => ({ accountingEntries: [entry, ...state.accountingEntries] }));
        syncDB().then((db) => db?.dbAccounting.create(entry).catch(console.warn));
      },

      updateAccountingEntry: (id, updates) => {
        set((state) => ({
          accountingEntries: state.accountingEntries.map((e) =>
            e.id === id ? { ...e, ...updates } : e
          ),
        }));
        syncDB().then((db) => db?.dbAccounting.update(id, updates).catch(console.warn));
      },

      removeAccountingEntry: (id) => {
        set((state) => ({ accountingEntries: state.accountingEntries.filter((e) => e.id !== id) }));
        syncDB().then((db) => db?.dbAccounting.remove(id).catch(console.warn));
      },

      // ── 마케팅 ────────────────────────────────────
      addMarketingCampaign: (campaign) => {
        set((state) => ({ marketingCampaigns: [campaign, ...state.marketingCampaigns] }));
        syncDB().then((db) => db?.dbMarketing.create(campaign).catch(console.warn));
      },

      updateMarketingCampaign: (id, updates) => {
        set((state) => ({
          marketingCampaigns: state.marketingCampaigns.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        }));
        syncDB().then((db) => db?.dbMarketing.update(id, updates).catch(console.warn));
      },

      removeMarketingCampaign: (id) => {
        set((state) => ({ marketingCampaigns: state.marketingCampaigns.filter((c) => c.id !== id) }));
        syncDB().then((db) => db?.dbMarketing.remove(id).catch(console.warn));
      },

      // ── 스케줄 ────────────────────────────────────
      addScheduleEvent: (event) => {
        set((state) => ({ scheduleEvents: [...state.scheduleEvents, event] }));
        syncDB().then((db) => db?.dbSchedule.create(event).catch(console.warn));
      },

      updateScheduleEvent: (id, updates) => {
        set((state) => ({
          scheduleEvents: state.scheduleEvents.map((e) =>
            e.id === id ? { ...e, ...updates } : e
          ),
        }));
        syncDB().then((db) => db?.dbSchedule.update(id, updates).catch(console.warn));
      },

      removeScheduleEvent: (id) => {
        set((state) => ({ scheduleEvents: state.scheduleEvents.filter((e) => e.id !== id) }));
        syncDB().then((db) => db?.dbSchedule.remove(id).catch(console.warn));
      },
    }),
    {
      name: 'bossai-v2',
      version: 2,
      migrate: (persisted: unknown) => {
        const state = persisted as Partial<AppState> & { employees?: Employee[]; directChats?: DirectChat[] };
        const validAnimals = new Set(Object.keys(ANIMAL_MODEL));
        const validEmployees = (state.employees ?? []).filter((e) => validAnimals.has(e.animal));
        const validIds = new Set(validEmployees.map((e) => e.id));
        return {
          ...state,
          employees: validEmployees,
          directChats: (state.directChats ?? []).filter((c) => validIds.has(c.employeeId)),
        };
      },
    }
  )
);
