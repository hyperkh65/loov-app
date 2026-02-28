export type AnimalType = 'pig' | 'cat' | 'rabbit' | 'fox' | 'otter' | 'tiger' | 'deer' | 'elephant' | 'monkey';
export type Role = '대표' | '영업팀장' | '회계팀장' | '마케터' | '개발자' | '디자이너' | 'HR매니저' | '고객지원' | '전략기획';

// ── AI 공급자 ─────────────────────────────────────────
export type AIProvider = 'claude' | 'gemini' | 'gpt4o' | 'gpt4' | 'gpt35' | 'custom';

export interface AIProviderConfig {
  provider: AIProvider;
  apiKey: string;
  model?: string;
  customEndpoint?: string;
}

export const AI_PROVIDER_INFO: Record<AIProvider, { label: string; models: string[]; placeholder: string }> = {
  claude:  { label: 'Claude (Anthropic)', models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'], placeholder: 'sk-ant-...' },
  gemini:  { label: 'Gemini (Google)',    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],          placeholder: 'AIza...' },
  gpt4o:   { label: 'GPT-4o (OpenAI)',   models: ['gpt-4o', 'gpt-4o-mini'],                                            placeholder: 'sk-...' },
  gpt4:    { label: 'GPT-4 (OpenAI)',    models: ['gpt-4-turbo', 'gpt-4'],                                             placeholder: 'sk-...' },
  gpt35:   { label: 'GPT-3.5 (OpenAI)',  models: ['gpt-3.5-turbo'],                                                    placeholder: 'sk-...' },
  custom:  { label: '커스텀 API',         models: [],                                                                   placeholder: 'API Key...' },
};

// ── 구독 등급 ─────────────────────────────────────────
export type SubscriptionTier = 'free' | 'basic' | 'starter' | 'professional' | 'enterprise';

export interface SubscriptionPlan {
  tier: SubscriptionTier;
  name: string;
  price: number;
  maxEmployees: number;
  features: string[];
  popular?: boolean;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    tier: 'free',
    name: '무료',
    price: 0,
    maxEmployees: 1,
    features: ['AI 직원 1명', '기본 채팅', '프로젝트 관리'],
  },
  {
    tier: 'basic',
    name: '베이직',
    price: 29000,
    maxEmployees: 3,
    features: ['AI 직원 3명', '사내 ERP 기본', '영업 파이프라인', '채팅 히스토리 30일'],
  },
  {
    tier: 'starter',
    name: '스타터',
    price: 59000,
    maxEmployees: 5,
    features: ['AI 직원 5명', '전체 ERP', '마케팅 허브', 'SNS 관리', '채팅 히스토리 90일'],
    popular: true,
  },
  {
    tier: 'professional',
    name: '프로',
    price: 99000,
    maxEmployees: 10,
    features: ['AI 직원 10명', '전체 ERP + 고급분석', 'API 키 직원별 설정', '홈페이지 빌더', '무제한 히스토리'],
  },
  {
    tier: 'enterprise',
    name: '엔터프라이즈',
    price: 0,
    maxEmployees: 999,
    features: ['무제한 AI 직원', '전용 서버', '맞춤 AI 모델', '전담 CS', 'Obsidian 자동 백업'],
  },
];

// ── 직원 (확장) ──────────────────────────────────────
export interface Employee {
  id: string;
  name: string;
  animal: AnimalType;
  role: Role;
  department: Department;
  hiredAt: string;
  aiConfig?: AIProviderConfig;
  skills: string[];
  taskCount: number;
  completedTaskCount: number;
  status: 'active' | 'busy' | 'offline';
}

export type Department = '영업' | '회계' | '마케팅' | '개발' | 'HR' | '고객지원' | '전략' | '경영';

export const DEPARTMENT_COLOR: Record<Department, string> = {
  영업:   'bg-blue-100 text-blue-700',
  회계:   'bg-emerald-100 text-emerald-700',
  마케팅: 'bg-orange-100 text-orange-700',
  개발:   'bg-violet-100 text-violet-700',
  HR:     'bg-pink-100 text-pink-700',
  고객지원:'bg-cyan-100 text-cyan-700',
  전략:   'bg-indigo-100 text-indigo-700',
  경영:   'bg-amber-100 text-amber-700',
};

// ── 메시지 / 채팅 ────────────────────────────────────
export interface Message {
  id: string;
  from: 'user' | string;
  content: string;
  timestamp: string;
}

export interface DirectChat {
  employeeId: string;
  messages: Message[];
}

export interface MeetingMessage {
  id: string;
  from: 'user' | string;
  fromName: string;
  content: string;
  timestamp: string;
}

export interface Meeting {
  id: string;
  title: string;
  participantIds: string[];
  messages: MeetingMessage[];
  scheduledAt?: string;
  createdAt: string;
}

// ── 프로젝트 ────────────────────────────────────────
export interface Project {
  id: string;
  name: string;
  description: string;
  colorKey: string;
  assignedEmployeeIds: string[];
  status: 'planning' | 'active' | 'done';
  createdAt: string;
}

// ── 일일 보고 ────────────────────────────────────────
export interface DailyReport {
  id: string;
  date: string;
  content: string;
  generatedAt: string;
}

// ── CEO 지시사항 ─────────────────────────────────────
export interface CEODirective {
  id: string;
  title: string;
  content: string;
  targetEmployeeIds: string[];
  targetDepartment?: Department;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'acknowledged' | 'in_progress' | 'completed';
  createdAt: string;
  deadline?: string;
  responses: DirectiveResponse[];
}

export interface DirectiveResponse {
  employeeId: string;
  employeeName: string;
  content: string;
  timestamp: string;
}

// ── 영업 ERP ────────────────────────────────────────
export type LeadStatus = 'lead' | 'contacted' | 'proposal' | 'negotiating' | 'won' | 'lost';

export interface SalesLead {
  id: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  phone?: string;
  status: LeadStatus;
  value: number;
  assignedEmployeeId?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  lead:        '리드',
  contacted:   '컨택',
  proposal:    '제안',
  negotiating: '협상',
  won:         '수주',
  lost:        '실패',
};

export const LEAD_STATUS_COLOR: Record<LeadStatus, string> = {
  lead:        'bg-gray-100 text-gray-600',
  contacted:   'bg-blue-100 text-blue-600',
  proposal:    'bg-indigo-100 text-indigo-600',
  negotiating: 'bg-amber-100 text-amber-600',
  won:         'bg-emerald-100 text-emerald-600',
  lost:        'bg-red-100 text-red-600',
};

// ── 회계 ERP ────────────────────────────────────────
export type AccountingType = 'income' | 'expense';

export interface AccountingEntry {
  id: string;
  type: AccountingType;
  category: string;
  description: string;
  amount: number;
  date: string;
  assignedEmployeeId?: string;
  invoiceNumber?: string;
  isRecurring: boolean;
  tags: string[];
}

export const INCOME_CATEGORIES = ['제품 판매', '서비스 용역', '자문/컨설팅', '광고 수익', '로열티', '기타 수익'];
export const EXPENSE_CATEGORIES = ['인건비', '임대료', '마케팅비', '광고비', '소모품', '통신비', '세금', '보험', '기타 비용'];

// ── 마케팅 ───────────────────────────────────────────
export type MarketingPlatform = 'instagram' | 'twitter' | 'linkedin' | 'facebook' | 'youtube' | 'tiktok' | 'blog' | 'email' | 'kakao';
export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'completed' | 'paused';

export interface MarketingCampaign {
  id: string;
  name: string;
  platform: MarketingPlatform;
  status: CampaignStatus;
  startDate: string;
  endDate?: string;
  budget?: number;
  content?: string;
  targetAudience?: string;
  assignedEmployeeId?: string;
  metrics?: {
    impressions?: number;
    clicks?: number;
    conversions?: number;
    spend?: number;
  };
}

export const PLATFORM_LABEL: Record<MarketingPlatform, string> = {
  instagram: '인스타그램',
  twitter:   '트위터/X',
  linkedin:  '링크드인',
  facebook:  '페이스북',
  youtube:   '유튜브',
  tiktok:    '틱톡',
  blog:      '블로그',
  email:     '이메일',
  kakao:     '카카오',
};

export const PLATFORM_ICON: Record<MarketingPlatform, string> = {
  instagram: '📸',
  twitter:   '🐦',
  linkedin:  '💼',
  facebook:  '📘',
  youtube:   '▶️',
  tiktok:    '🎵',
  blog:      '📝',
  email:     '📧',
  kakao:     '💬',
};

// ── 스케줄 ───────────────────────────────────────────
export type EventType = 'meeting' | 'deadline' | 'call' | 'review' | 'task' | 'other';

export interface ScheduleEvent {
  id: string;
  title: string;
  description?: string;
  date: string;
  time?: string;
  endTime?: string;
  type: EventType;
  assignedEmployeeIds: string[];
  isAllDay: boolean;
  color?: string;
}

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  meeting:  '회의',
  deadline: '마감',
  call:     '통화',
  review:   '검토',
  task:     '업무',
  other:    '기타',
};

export const EVENT_TYPE_COLOR: Record<EventType, string> = {
  meeting:  'bg-blue-100 text-blue-700 border-blue-200',
  deadline: 'bg-red-100 text-red-700 border-red-200',
  call:     'bg-green-100 text-green-700 border-green-200',
  review:   'bg-purple-100 text-purple-700 border-purple-200',
  task:     'bg-amber-100 text-amber-700 border-amber-200',
  other:    'bg-gray-100 text-gray-700 border-gray-200',
};

// ── 회사 설정 ────────────────────────────────────────
export interface CompanySettings {
  companyName: string;
  slogan: string;
  ceoName: string;
  industry: string;
  website: string;
  businessNumber: string;
  address: string;
  phone: string;
  email: string;
  // SNS
  instagram: string;
  twitter: string;
  linkedin: string;
  facebook: string;
  youtube: string;
  tiktok: string;
  kakao: string;
  // 마케팅
  targetAudience: string;
  brandTone: string;
  hashtags: string;
  adBudget: string;
  // AI 글로벌 설정
  globalAIConfig?: AIProviderConfig;
  subscriptionTier: SubscriptionTier;
}

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  companyName: 'My Company',
  slogan: '',
  ceoName: '',
  industry: '',
  website: '',
  businessNumber: '',
  address: '',
  phone: '',
  email: '',
  instagram: '',
  twitter: '',
  linkedin: '',
  facebook: '',
  youtube: '',
  tiktok: '',
  kakao: '',
  targetAudience: '',
  brandTone: '',
  hashtags: '',
  adBudget: '',
  globalAIConfig: undefined,
  subscriptionTier: 'free',
};

// ── 동물 모델 / 이모지 / 성격 ─────────────────────────
export const ANIMAL_MODEL: Record<AnimalType, string> = {
  pig:      '/models/pig.glb',
  cat:      '/models/cat.glb',
  rabbit:   '/models/rabbit.glb',
  fox:      '/models/fox.glb',
  otter:    '/models/otter.glb',
  tiger:    '/models/tiger.glb',
  deer:     '/models/deer.glb',
  elephant: '/models/elephant.glb',
  monkey:   '/models/monkey.glb',
};

export const ANIMAL_MODEL_ROTATION: Record<AnimalType, number> = {
  pig:      0,
  cat:      -Math.PI / 2,
  rabbit:   Math.PI / 2,
  fox:      -Math.PI / 2,
  otter:    -Math.PI / 2,
  tiger:    -Math.PI / 2,
  deer:     -Math.PI / 2,
  elephant: -Math.PI / 2,
  monkey:   -Math.PI / 2,
};

export const ANIMAL_IMG: Record<AnimalType, string> = {
  pig:      'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f437.png',
  cat:      'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f431.png',
  rabbit:   'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f430.png',
  fox:      'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f98a.png',
  otter:    'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f9a6.png',
  tiger:    'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f42f.png',
  deer:     'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f98c.png',
  elephant: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f418.png',
  monkey:   'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f435.png',
};

export const ANIMAL_EMOJI: Record<AnimalType, string> = {
  pig: '🐷', cat: '🐱', rabbit: '🐰', fox: '🦊', otter: '🦦',
  tiger: '🐯', deer: '🦌', elephant: '🐘', monkey: '🐵',
};

export const ANIMAL_LABEL: Record<AnimalType, string> = {
  pig: '돼지', cat: '고양이', rabbit: '토끼', fox: '여우', otter: '수달',
  tiger: '호랑이', deer: '사슴', elephant: '코끼리', monkey: '원숭이',
};

export const ANIMAL_PERSONALITY: Record<AnimalType, string> = {
  pig:      '꼼꼼하고 진지하며 세심. 격식체 사용. 세부사항을 매우 중요시함.',
  cat:      '도도하고 간결. 핵심만 말함. 불필요한 말 없음. 가끔 냉소적.',
  rabbit:   '조심스럽고 신중. 걱정이 많지만 열심히 함.',
  fox:      '영리하고 계산적. 항상 더 나은 방법을 찾음.',
  otter:    '활발하고 부지런함. 창고를 누비며 척척 해결. 에너지가 넘침.',
  tiger:    '강인하고 리더십 있음. 직설적이고 결단력 있음. 책임감이 강함.',
  deer:     '우아하고 섬세함. 조화를 중시하고 배려가 깊음. 부드러운 말투.',
  elephant: '신중하고 기억력이 뛰어남. 큰 그림을 봄. 묵직한 신뢰감을 줌.',
  monkey:   '호기심 많고 재치 있음. 아이디어가 넘침. 빠르게 배우고 적응함.',
};

export const ORB_GRADIENT: Record<AnimalType, string> = {
  pig:      'radial-gradient(circle at 32% 28%, #fce7f3 0%, #fbcfe8 20%, #f472b6 50%, #db2777 80%, #9d174d 100%)',
  cat:      'radial-gradient(circle at 32% 28%, #f8fafc 0%, #e2e8f0 20%, #94a3b8 50%, #475569 80%, #1e293b 100%)',
  rabbit:   'radial-gradient(circle at 32% 28%, #f5f3ff 0%, #ddd6fe 20%, #a78bfa 50%, #7c3aed 80%, #4c1d95 100%)',
  fox:      'radial-gradient(circle at 32% 28%, #fff1f2 0%, #fecdd3 20%, #fb7185 50%, #e11d48 80%, #9f1239 100%)',
  otter:    'radial-gradient(circle at 32% 28%, #ecfdf5 0%, #a7f3d0 20%, #34d399 50%, #0d9488 80%, #134e4a 100%)',
  tiger:    'radial-gradient(circle at 32% 28%, #fffbeb 0%, #fde68a 20%, #f59e0b 50%, #d97706 80%, #92400e 100%)',
  deer:     'radial-gradient(circle at 32% 28%, #fef3c7 0%, #fde68a 20%, #ca8a04 50%, #92400e 80%, #78350f 100%)',
  elephant: 'radial-gradient(circle at 32% 28%, #f0f9ff 0%, #bae6fd 20%, #38bdf8 50%, #0369a1 80%, #0c4a6e 100%)',
  monkey:   'radial-gradient(circle at 32% 28%, #fef9c3 0%, #fde68a 20%, #a16207 50%, #78350f 80%, #451a03 100%)',
};

export const ORB_SHADOW: Record<AnimalType, string> = {
  pig:      '0 2px 4px rgba(219,39,119,.2), 0 8px 28px rgba(219,39,119,.35), inset 0 -6px 14px rgba(157,23,77,.3), inset 0 4px 12px rgba(255,255,255,.7)',
  cat:      '0 2px 4px rgba(71,85,105,.2), 0 8px 28px rgba(71,85,105,.35), inset 0 -6px 14px rgba(30,41,59,.3), inset 0 4px 12px rgba(255,255,255,.7)',
  rabbit:   '0 2px 4px rgba(124,58,237,.2), 0 8px 28px rgba(124,58,237,.35), inset 0 -6px 14px rgba(76,29,149,.3), inset 0 4px 12px rgba(255,255,255,.7)',
  fox:      '0 2px 4px rgba(225,29,72,.2), 0 8px 28px rgba(225,29,72,.35), inset 0 -6px 14px rgba(159,18,57,.3), inset 0 4px 12px rgba(255,255,255,.7)',
  otter:    '0 2px 4px rgba(13,148,136,.2), 0 8px 28px rgba(13,148,136,.35), inset 0 -6px 14px rgba(19,78,74,.3), inset 0 4px 12px rgba(255,255,255,.7)',
  tiger:    '0 2px 4px rgba(217,119,6,.2), 0 8px 28px rgba(217,119,6,.35), inset 0 -6px 14px rgba(146,64,14,.3), inset 0 4px 12px rgba(255,255,255,.7)',
  deer:     '0 2px 4px rgba(202,138,4,.2), 0 8px 28px rgba(202,138,4,.35), inset 0 -6px 14px rgba(120,53,15,.3), inset 0 4px 12px rgba(255,255,255,.7)',
  elephant: '0 2px 4px rgba(3,105,161,.2), 0 8px 28px rgba(3,105,161,.35), inset 0 -6px 14px rgba(12,74,110,.3), inset 0 4px 12px rgba(255,255,255,.7)',
  monkey:   '0 2px 4px rgba(161,98,7,.2), 0 8px 28px rgba(161,98,7,.35), inset 0 -6px 14px rgba(120,53,15,.3), inset 0 4px 12px rgba(255,255,255,.7)',
};

export const ROLE_BADGE: Record<Role, string> = {
  '대표':     'bg-amber-100 text-amber-800 border border-amber-300',
  '영업팀장': 'bg-blue-100 text-blue-800 border border-blue-300',
  '회계팀장': 'bg-emerald-100 text-emerald-800 border border-emerald-300',
  '마케터':   'bg-orange-100 text-orange-800 border border-orange-300',
  '개발자':   'bg-violet-100 text-violet-800 border border-violet-300',
  '디자이너': 'bg-rose-100 text-rose-800 border border-rose-300',
  'HR매니저': 'bg-pink-100 text-pink-800 border border-pink-300',
  '고객지원': 'bg-cyan-100 text-cyan-800 border border-cyan-300',
  '전략기획': 'bg-indigo-100 text-indigo-800 border border-indigo-300',
};

export const PROJECT_COLORS: Record<string, { dot: string; badge: string }> = {
  indigo:  { dot: 'bg-indigo-500',  badge: 'bg-indigo-50 text-indigo-700' },
  pink:    { dot: 'bg-pink-500',    badge: 'bg-pink-50 text-pink-700' },
  emerald: { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700' },
  orange:  { dot: 'bg-orange-500',  badge: 'bg-orange-50 text-orange-700' },
  blue:    { dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700' },
  rose:    { dot: 'bg-rose-500',    badge: 'bg-rose-50 text-rose-700' },
  violet:  { dot: 'bg-violet-500',  badge: 'bg-violet-50 text-violet-700' },
  teal:    { dot: 'bg-teal-500',    badge: 'bg-teal-50 text-teal-700' },
};

// ── 직원 기본 스킬 ────────────────────────────────────
export const ROLE_DEFAULT_SKILLS: Record<Role, string[]> = {
  '대표':     ['전략수립', '의사결정', '리더십', '투자유치'],
  '영업팀장': ['고객발굴', '제안서 작성', 'B2B 영업', 'CRM 관리', '계약 협상'],
  '회계팀장': ['재무제표', '세무신고', '예산관리', '손익분석', '인보이스'],
  '마케터':   ['SNS 운영', '콘텐츠 제작', '광고 집행', '데이터 분석', 'SEO'],
  '개발자':   ['웹 개발', 'API 연동', '자동화', '시스템 구축', '유지보수'],
  '디자이너': ['UI/UX', '브랜딩', '홍보물 제작', '영상 편집', '제품 디자인'],
  'HR매니저': ['채용', '조직문화', '급여 관리', '교육 기획', '성과 평가'],
  '고객지원': ['CS 응대', '불만 처리', 'FAQ 작성', '고객 만족도', '리텐션'],
  '전략기획': ['시장 분석', '사업 계획', '경쟁사 분석', 'KPI 설정', '사업 개발'],
};

export const ROLE_DEPARTMENT: Record<Role, Department> = {
  '대표':     '경영',
  '영업팀장': '영업',
  '회계팀장': '회계',
  '마케터':   '마케팅',
  '개발자':   '개발',
  '디자이너': '마케팅',
  'HR매니저': 'HR',
  '고객지원': '고객지원',
  '전략기획': '전략',
};
