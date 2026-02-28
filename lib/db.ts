/**
 * BOSS.AI — Supabase DB 레이어
 * 모든 테이블 CRUD를 중앙 관리 (bossai_ 접두어)
 */
import { supabase, TABLES } from './supabase';
import type {
  Employee, DirectChat, Meeting, Project, DailyReport, CompanySettings,
  CEODirective, SalesLead, AccountingEntry, MarketingCampaign, ScheduleEvent, Message,
  AIProviderConfig,
} from './types';

// ── 현재 유저 ID ──────────────────────────────────────────────
async function uid(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

// ── 회사 설정 ─────────────────────────────────────────────────
export const dbCompany = {
  async load(): Promise<Partial<CompanySettings> | null> {
    const userId = await uid();
    const { data } = await supabase
      .from(TABLES.COMPANY_SETTINGS)
      .select('*')
      .eq('user_id', userId)
      .single();
    if (!data) return null;
    return {
      companyName:    data.company_name,
      slogan:         data.slogan,
      ceoName:        data.ceo_name,
      industry:       data.industry,
      website:        data.website,
      businessNumber: data.business_number,
      address:        data.address,
      phone:          data.phone,
      email:          data.email,
      instagram:      data.instagram,
      twitter:        data.twitter,
      linkedin:       data.linkedin,
      facebook:       data.facebook,
      youtube:        data.youtube,
      tiktok:         data.tiktok,
      kakao:          data.kakao,
      targetAudience: data.target_audience,
      brandTone:      data.brand_tone,
      hashtags:       data.hashtags,
      adBudget:       data.ad_budget,
      subscriptionTier: data.subscription_tier,
    };
  },

  async save(settings: Partial<CompanySettings>): Promise<void> {
    const userId = await uid();
    await supabase.from(TABLES.COMPANY_SETTINGS).upsert({
      user_id:         userId,
      company_name:    settings.companyName,
      slogan:          settings.slogan,
      ceo_name:        settings.ceoName,
      industry:        settings.industry,
      website:         settings.website,
      business_number: settings.businessNumber,
      address:         settings.address,
      phone:           settings.phone,
      email:           settings.email,
      instagram:       settings.instagram,
      twitter:         settings.twitter,
      linkedin:        settings.linkedin,
      facebook:        settings.facebook,
      youtube:         settings.youtube,
      tiktok:          settings.tiktok,
      kakao:           settings.kakao,
      target_audience: settings.targetAudience,
      brand_tone:      settings.brandTone,
      hashtags:        settings.hashtags,
      ad_budget:       settings.adBudget,
      subscription_tier: settings.subscriptionTier,
    }, { onConflict: 'user_id' });
  },
};

// ── 직원 ──────────────────────────────────────────────────────
export const dbEmployees = {
  async loadAll(): Promise<Employee[]> {
    const userId = await uid();
    const { data, error } = await supabase
      .from(TABLES.EMPLOYEES)
      .select('*')
      .eq('user_id', userId)
      .order('hired_at', { ascending: true });
    if (error || !data) return [];
    return data.map(rowToEmployee);
  },

  async create(emp: Employee): Promise<void> {
    const userId = await uid();
    await supabase.from(TABLES.EMPLOYEES).insert({
      id:                   emp.id,
      user_id:              userId,
      name:                 emp.name,
      animal:               emp.animal,
      role:                 emp.role,
      department:           emp.department,
      hired_at:             emp.hiredAt,
      status:               emp.status,
      skills:               emp.skills,
      task_count:           emp.taskCount,
      completed_task_count: emp.completedTaskCount,
      ai_provider:          emp.aiConfig?.provider,
      ai_model:             emp.aiConfig?.model,
    });
  },

  async update(id: string, emp: Partial<Employee>): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (emp.status)     patch.status     = emp.status;
    if (emp.taskCount !== undefined) patch.task_count = emp.taskCount;
    if (emp.completedTaskCount !== undefined) patch.completed_task_count = emp.completedTaskCount;
    if (emp.aiConfig) {
      patch.ai_provider = emp.aiConfig.provider;
      patch.ai_model    = emp.aiConfig.model;
    }
    if (Object.keys(patch).length === 0) return;
    await supabase.from(TABLES.EMPLOYEES).update(patch).eq('id', id);
  },

  async remove(id: string): Promise<void> {
    await supabase.from(TABLES.EMPLOYEES).delete().eq('id', id);
  },
};

function rowToEmployee(row: Record<string, unknown>): Employee {
  return {
    id:                   row.id as string,
    name:                 row.name as string,
    animal:               row.animal as Employee['animal'],
    role:                 row.role as Employee['role'],
    department:           row.department as Employee['department'],
    hiredAt:              row.hired_at as string,
    status:               (row.status as Employee['status']) || 'active',
    skills:               (row.skills as string[]) || [],
    taskCount:            (row.task_count as number) || 0,
    completedTaskCount:   (row.completed_task_count as number) || 0,
    aiConfig:             row.ai_provider ? { provider: row.ai_provider as AIProviderConfig['provider'], apiKey: '', model: row.ai_model as string } : undefined,
  };
}

// ── 채팅 메시지 ───────────────────────────────────────────────
export const dbChats = {
  async loadAll(): Promise<DirectChat[]> {
    const userId = await uid();
    const { data, error } = await supabase
      .from(TABLES.DIRECT_CHATS)
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: true });
    if (error || !data) return [];

    // employee_id 기준으로 그루핑
    const chatMap: Record<string, DirectChat> = {};
    for (const row of data) {
      if (!chatMap[row.employee_id]) {
        chatMap[row.employee_id] = { employeeId: row.employee_id, messages: [] };
      }
      chatMap[row.employee_id].messages.push({
        id: row.id,
        from: row.from_role,
        content: row.content,
        timestamp: row.timestamp,
      });
    }
    return Object.values(chatMap);
  },

  async addMessage(employeeId: string, msg: Message): Promise<void> {
    const userId = await uid();
    await supabase.from(TABLES.DIRECT_CHATS).insert({
      id:          msg.id,
      user_id:     userId,
      employee_id: employeeId,
      from_role:   msg.from,
      content:     msg.content,
      timestamp:   msg.timestamp,
    });
  },
};

// ── CEO 지시사항 ─────────────────────────────────────────────
export const dbDirectives = {
  async loadAll(): Promise<CEODirective[]> {
    const userId = await uid();
    const { data, error } = await supabase
      .from(TABLES.DIRECTIVES)
      .select(`*, ${TABLES.DIRECTIVE_RESPONSES}(*)`)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return data.map((row) => ({
      id:                 row.id,
      title:              row.title || '',
      content:            row.content,
      targetEmployeeIds:  row.target_employee_ids || [],
      targetDepartment:   row.target_department,
      priority:           row.priority,
      status:             row.status,
      createdAt:          row.created_at,
      deadline:           row.deadline,
      responses:          (row[TABLES.DIRECTIVE_RESPONSES] || []).map((r: Record<string, string>) => ({
        employeeId:   r.employee_id,
        employeeName: r.employee_name,
        content:      r.content,
        timestamp:    r.timestamp,
      })),
    }));
  },

  async create(d: CEODirective): Promise<void> {
    const userId = await uid();
    await supabase.from(TABLES.DIRECTIVES).insert({
      id:                  d.id,
      user_id:             userId,
      title:               d.title,
      content:             d.content,
      target_employee_ids: d.targetEmployeeIds,
      target_department:   d.targetDepartment,
      priority:            d.priority,
      status:              d.status,
      deadline:            d.deadline,
    });
  },

  async update(id: string, updates: Partial<CEODirective>): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (updates.status) patch.status = updates.status;
    if (updates.title)  patch.title  = updates.title;
    if (Object.keys(patch).length > 0) {
      await supabase.from(TABLES.DIRECTIVES).update(patch).eq('id', id);
    }
  },

  async addResponse(directiveId: string, resp: CEODirective['responses'][0]): Promise<void> {
    await supabase.from(TABLES.DIRECTIVE_RESPONSES).insert({
      directive_id:  directiveId,
      employee_id:   resp.employeeId,
      employee_name: resp.employeeName,
      content:       resp.content,
      timestamp:     resp.timestamp,
    });
  },
};

// ── 영업 ERP ─────────────────────────────────────────────────
export const dbSales = {
  async loadAll(): Promise<SalesLead[]> {
    const userId = await uid();
    const { data, error } = await supabase
      .from(TABLES.SALES_LEADS)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return data.map((row) => ({
      id:                  row.id,
      companyName:         row.company_name,
      contactName:         row.contact_name || '',
      contactEmail:        row.contact_email || '',
      phone:               row.phone,
      status:              row.status,
      value:               row.value || 0,
      assignedEmployeeId:  row.assigned_employee_id,
      notes:               row.notes || '',
      createdAt:           row.created_at,
      updatedAt:           row.updated_at,
      closedAt:            row.closed_at,
    }));
  },

  async create(lead: SalesLead): Promise<void> {
    const userId = await uid();
    await supabase.from(TABLES.SALES_LEADS).insert({
      id:                   lead.id,
      user_id:              userId,
      company_name:         lead.companyName,
      contact_name:         lead.contactName,
      contact_email:        lead.contactEmail,
      phone:                lead.phone,
      status:               lead.status,
      value:                lead.value,
      assigned_employee_id: lead.assignedEmployeeId,
      notes:                lead.notes,
    });
  },

  async update(id: string, updates: Partial<SalesLead>): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (updates.status)      patch.status       = updates.status;
    if (updates.value !== undefined) patch.value = updates.value;
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (updates.contactName) patch.contact_name  = updates.contactName;
    if (updates.assignedEmployeeId !== undefined) patch.assigned_employee_id = updates.assignedEmployeeId;
    if (Object.keys(patch).length > 0) {
      await supabase.from(TABLES.SALES_LEADS).update(patch).eq('id', id);
    }
  },

  async remove(id: string): Promise<void> {
    await supabase.from(TABLES.SALES_LEADS).delete().eq('id', id);
  },
};

// ── 회계 ERP ─────────────────────────────────────────────────
export const dbAccounting = {
  async loadAll(): Promise<AccountingEntry[]> {
    const userId = await uid();
    const { data, error } = await supabase
      .from(TABLES.ACCOUNTING_ENTRIES)
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });
    if (error || !data) return [];
    return data.map((row) => ({
      id:                  row.id,
      type:                row.type,
      category:            row.category,
      description:         row.description,
      amount:              row.amount,
      date:                row.date,
      assignedEmployeeId:  row.assigned_employee_id,
      invoiceNumber:       row.invoice_number,
      isRecurring:         row.is_recurring || false,
      tags:                row.tags || [],
    }));
  },

  async create(entry: AccountingEntry): Promise<void> {
    const userId = await uid();
    await supabase.from(TABLES.ACCOUNTING_ENTRIES).insert({
      id:                   entry.id,
      user_id:              userId,
      type:                 entry.type,
      category:             entry.category,
      description:          entry.description,
      amount:               entry.amount,
      date:                 entry.date,
      assigned_employee_id: entry.assignedEmployeeId,
      invoice_number:       entry.invoiceNumber,
      is_recurring:         entry.isRecurring,
      tags:                 entry.tags,
    });
  },

  async update(id: string, updates: Partial<AccountingEntry>): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (updates.category)    patch.category    = updates.category;
    if (updates.description) patch.description = updates.description;
    if (updates.amount !== undefined) patch.amount = updates.amount;
    if (Object.keys(patch).length > 0) {
      await supabase.from(TABLES.ACCOUNTING_ENTRIES).update(patch).eq('id', id);
    }
  },

  async remove(id: string): Promise<void> {
    await supabase.from(TABLES.ACCOUNTING_ENTRIES).delete().eq('id', id);
  },
};

// ── 마케팅 ───────────────────────────────────────────────────
export const dbMarketing = {
  async loadAll(): Promise<MarketingCampaign[]> {
    const userId = await uid();
    const { data, error } = await supabase
      .from(TABLES.MARKETING_CAMPAIGNS)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return data.map((row) => ({
      id:                  row.id,
      name:                row.name,
      platform:            row.platform,
      status:              row.status,
      startDate:           row.start_date,
      endDate:             row.end_date,
      budget:              row.budget,
      content:             row.content,
      targetAudience:      row.target_audience,
      assignedEmployeeId:  row.assigned_employee_id,
      metrics: {
        impressions: row.impressions,
        clicks:      row.clicks,
        conversions: row.conversions,
        spend:       row.spend,
      },
    }));
  },

  async create(c: MarketingCampaign): Promise<void> {
    const userId = await uid();
    await supabase.from(TABLES.MARKETING_CAMPAIGNS).insert({
      id:                   c.id,
      user_id:              userId,
      name:                 c.name,
      platform:             c.platform,
      status:               c.status,
      start_date:           c.startDate,
      end_date:             c.endDate,
      budget:               c.budget,
      content:              c.content,
      target_audience:      c.targetAudience,
      assigned_employee_id: c.assignedEmployeeId,
    });
  },

  async update(id: string, updates: Partial<MarketingCampaign>): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (updates.status)  patch.status  = updates.status;
    if (updates.content) patch.content = updates.content;
    if (updates.budget !== undefined) patch.budget = updates.budget;
    if (Object.keys(patch).length > 0) {
      await supabase.from(TABLES.MARKETING_CAMPAIGNS).update(patch).eq('id', id);
    }
  },

  async remove(id: string): Promise<void> {
    await supabase.from(TABLES.MARKETING_CAMPAIGNS).delete().eq('id', id);
  },
};

// ── 스케줄 ───────────────────────────────────────────────────
export const dbSchedule = {
  async loadAll(): Promise<ScheduleEvent[]> {
    const userId = await uid();
    const { data, error } = await supabase
      .from(TABLES.SCHEDULE_EVENTS)
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true });
    if (error || !data) return [];
    return data.map((row) => ({
      id:                   row.id,
      title:                row.title,
      description:          row.description,
      date:                 row.date,
      time:                 row.time,
      endTime:              row.end_time,
      type:                 row.type,
      assignedEmployeeIds:  row.assigned_employee_ids || [],
      isAllDay:             row.is_all_day || false,
      color:                row.color,
    }));
  },

  async create(event: ScheduleEvent): Promise<void> {
    const userId = await uid();
    await supabase.from(TABLES.SCHEDULE_EVENTS).insert({
      id:                    event.id,
      user_id:               userId,
      title:                 event.title,
      description:           event.description,
      date:                  event.date,
      time:                  event.time,
      end_time:              event.endTime,
      type:                  event.type,
      assigned_employee_ids: event.assignedEmployeeIds,
      is_all_day:            event.isAllDay,
      color:                 event.color,
    });
  },

  async update(id: string, updates: Partial<ScheduleEvent>): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (updates.title) patch.title = updates.title;
    if (updates.date)  patch.date  = updates.date;
    if (updates.time)  patch.time  = updates.time;
    if (Object.keys(patch).length > 0) {
      await supabase.from(TABLES.SCHEDULE_EVENTS).update(patch).eq('id', id);
    }
  },

  async remove(id: string): Promise<void> {
    await supabase.from(TABLES.SCHEDULE_EVENTS).delete().eq('id', id);
  },
};

// ── 프로젝트 ─────────────────────────────────────────────────
export const dbProjects = {
  async loadAll(): Promise<Project[]> {
    const userId = await uid();
    const { data, error } = await supabase
      .from(TABLES.PROJECTS)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error || !data) return [];
    return data.map((row) => ({
      id:                  row.id,
      name:                row.name,
      description:         row.description || '',
      colorKey:            row.color_key || 'indigo',
      assignedEmployeeIds: row.assigned_employee_ids || [],
      status:              row.status,
      createdAt:           row.created_at,
    }));
  },

  async create(p: Project): Promise<void> {
    const userId = await uid();
    await supabase.from(TABLES.PROJECTS).insert({
      id:                   p.id,
      user_id:              userId,
      name:                 p.name,
      description:          p.description,
      color_key:            p.colorKey,
      assigned_employee_ids: p.assignedEmployeeIds,
      status:               p.status,
    });
  },

  async update(id: string, updates: Partial<Project>): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (updates.status)      patch.status      = updates.status;
    if (updates.name)        patch.name        = updates.name;
    if (updates.description) patch.description = updates.description;
    if (Object.keys(patch).length > 0) {
      await supabase.from(TABLES.PROJECTS).update(patch).eq('id', id);
    }
  },

  async remove(id: string): Promise<void> {
    await supabase.from(TABLES.PROJECTS).delete().eq('id', id);
  },
};

// ── 전체 데이터 로드 (대시보드 초기화) ────────────────────────
export async function loadAllData() {
  const [employees, chats, directives, salesLeads, accountingEntries, marketingCampaigns, scheduleEvents, projects, company] =
    await Promise.all([
      dbEmployees.loadAll().catch(() => []),
      dbChats.loadAll().catch(() => []),
      dbDirectives.loadAll().catch(() => []),
      dbSales.loadAll().catch(() => []),
      dbAccounting.loadAll().catch(() => []),
      dbMarketing.loadAll().catch(() => []),
      dbSchedule.loadAll().catch(() => []),
      dbProjects.loadAll().catch(() => []),
      dbCompany.load().catch(() => null),
    ]);

  return { employees, chats, directives, salesLeads, accountingEntries, marketingCampaigns, scheduleEvents, projects, company };
}
