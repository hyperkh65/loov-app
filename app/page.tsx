'use client';

import { useState, useEffect, Suspense, lazy } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

// 3D는 SSR 비활성화로 동적 로드
const AnimalHero3D = dynamic(() => import('@/components/landing/AnimalHero3D'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-slate-600 text-sm animate-pulse">AI 팀 소환 중...</div>
    </div>
  ),
});

// ── 타이핑 애니메이션 훅 ──────────────────────────────
function useTypewriter(texts: string[], speed = 80, pause = 2200) {
  const [display, setDisplay] = useState('');
  const [idx, setIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = texts[idx];
    const timeout = setTimeout(() => {
      if (!deleting) {
        setDisplay(current.slice(0, charIdx + 1));
        if (charIdx + 1 === current.length) {
          setTimeout(() => setDeleting(true), pause);
        } else {
          setCharIdx((c) => c + 1);
        }
      } else {
        setDisplay(current.slice(0, charIdx - 1));
        if (charIdx - 1 === 0) {
          setDeleting(false);
          setIdx((i) => (i + 1) % texts.length);
          setCharIdx(0);
        } else {
          setCharIdx((c) => c - 1);
        }
      }
    }, deleting ? speed / 2 : speed);
    return () => clearTimeout(timeout);
  }, [charIdx, deleting, idx, texts, speed, pause]);

  return display;
}

// ── AI 직원 유형 데이터 ───────────────────────────────
const AI_EMPLOYEES = [
  { icon: '📊', dept: '영업팀', color: 'from-blue-500 to-blue-700', bg: 'bg-blue-50 border-blue-200',
    tasks: ['리드 발굴', '제안서 작성', 'CRM 관리', '계약 협상', '영업 보고서'] },
  { icon: '💰', dept: '회계팀', color: 'from-emerald-500 to-emerald-700', bg: 'bg-emerald-50 border-emerald-200',
    tasks: ['매출 관리', '세무 신고', '인보이스', '예산 분석', '손익 보고'] },
  { icon: '📣', dept: '마케팅', color: 'from-orange-500 to-orange-700', bg: 'bg-orange-50 border-orange-200',
    tasks: ['SNS 콘텐츠', '광고 집행', '마케팅 분석', '브랜드 전략', '이메일 캠페인'] },
  { icon: '💻', dept: '개발팀', color: 'from-violet-500 to-violet-700', bg: 'bg-violet-50 border-violet-200',
    tasks: ['웹 개발', 'API 연동', '자동화 구축', 'UI 제작', '기술 지원'] },
  { icon: '🎨', dept: '디자인', color: 'from-pink-500 to-pink-700', bg: 'bg-pink-50 border-pink-200',
    tasks: ['홍보물 제작', 'UI/UX 설계', '브랜딩', '영상 제작', '제품 디자인'] },
  { icon: '🤝', dept: 'HR팀', color: 'from-amber-500 to-amber-700', bg: 'bg-amber-50 border-amber-200',
    tasks: ['채용 관리', '성과 평가', '조직 문화', '교육 기획', '급여 관리'] },
];

// ── 구독 플랜 데이터 ──────────────────────────────────
const PLANS = [
  {
    name: '무료',
    price: 0,
    employees: 1,
    color: 'border-gray-200',
    badge: '',
    features: ['AI 직원 1명', '기본 채팅', '프로젝트 관리', '7일 히스토리'],
  },
  {
    name: '베이직',
    price: 29000,
    employees: 3,
    color: 'border-blue-200',
    badge: '',
    features: ['AI 직원 3명', '영업 ERP', '회계 기본', '30일 히스토리', '스케줄 관리'],
  },
  {
    name: '스타터',
    price: 59000,
    employees: 5,
    color: 'border-indigo-400',
    badge: '인기',
    features: ['AI 직원 5명', '전체 ERP', '마케팅 허브', 'SNS 관리', '90일 히스토리'],
    highlight: true,
  },
  {
    name: '프로',
    price: 99000,
    employees: 10,
    color: 'border-purple-400',
    badge: '',
    features: ['AI 직원 10명', '직원별 AI 설정', '홈페이지 빌더', 'Obsidian 백업', '무제한 히스토리'],
  },
];

// ── HOW IT WORKS 데이터 ───────────────────────────────
const STEPS = [
  { num: '01', title: '회사를 등록하세요', desc: '회사 정보, 업종, 목표를 입력하면 AI가 맞춤 직원 구성을 추천해드립니다.', icon: '🏢' },
  { num: '02', title: 'AI 직원을 채용하세요', desc: '영업, 회계, 마케팅 등 필요한 부서의 AI 직원을 구독 등급에 맞게 채용하세요.', icon: '👤' },
  { num: '03', title: '지시를 내리세요', desc: '채팅이나 지시사항 게시판에서 업무를 지시하면 AI 직원이 즉시 수행합니다.', icon: '💬' },
  { num: '04', title: '결과를 확인하세요', desc: '영업 실적, 회계 보고서, 마케팅 분석 등 모든 업무 결과가 대시보드에 집약됩니다.', icon: '📈' },
];

// ── 통계 데이터 ───────────────────────────────────────
const STATS = [
  { value: '2,400+', label: '1인 기업 사용 중' },
  { value: '18개', label: '지원 AI 직원 유형' },
  { value: '97%', label: '업무 완료율' },
  { value: '3배', label: '평균 생산성 향상' },
];

// ── FAQ 데이터 ────────────────────────────────────────
const FAQS = [
  {
    q: 'AI 직원이 실제로 업무를 처리할 수 있나요?',
    a: '네. Claude, Gemini, GPT-4 등 최신 AI 모델을 탑재한 AI 직원이 영업 제안서 작성, 회계 분류, SNS 콘텐츠 생성, 이메일 작성 등 실제 업무를 수행합니다.',
  },
  {
    q: 'API 키는 어떻게 설정하나요?',
    a: '설정 → AI 설정 메뉴에서 Claude, Gemini, GPT 등의 API 키를 입력하면 됩니다. 전체 직원에게 한 번에 적용하거나, 직원마다 다른 AI를 배치할 수 있습니다.',
  },
  {
    q: '데이터는 어떻게 보관되나요?',
    a: 'Supabase 클라우드 데이터베이스에 안전하게 저장됩니다. 프로 플랜 이상에서는 Obsidian Vault로 자동 백업 기능도 제공됩니다.',
  },
  {
    q: '나중에 플랜을 변경할 수 있나요?',
    a: '언제든지 플랜을 업그레이드하거나 다운그레이드할 수 있습니다. 업그레이드 시 즉시 추가 직원 채용이 가능합니다.',
  },
  {
    q: '기존에 사용하던 ERP나 CRM과 연동되나요?',
    a: '현재 자체 ERP(영업, 회계, 마케팅)를 내장하고 있으며, 향후 외부 서비스 연동(Notion, Slack, Google Workspace 등)을 지원할 예정입니다.',
  },
];

export default function LandingPage() {
  const typed = useTypewriter([
    '영업 팀장을 고용하세요',
    '회계 담당자를 채용하세요',
    '마케터를 배치하세요',
    '개발자를 투입하세요',
    '1인 기업도 팀이 있습니다',
  ]);

  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <div className="bg-[#06091a] text-white overflow-x-hidden">

      {/* ── NAVBAR ─────────────────────────────────────── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-[#06091a]/95 backdrop-blur-xl border-b border-white/10 shadow-xl' : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-black text-white">L</div>
            <span className="font-black text-lg tracking-tight">LOOV<span className="text-indigo-400 font-normal text-sm">.co.kr</span></span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-300">
            <a href="#features" className="hover:text-white transition-colors">기능</a>
            <a href="#how" className="hover:text-white transition-colors">사용법</a>
            <a href="#pricing" className="hover:text-white transition-colors">요금제</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-gray-300 hover:text-white transition-colors px-3 py-1.5">
              로그인
            </Link>
            <Link href="/signup" className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors">
              무료로 시작
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ──────────────────────────────────────── */}
      <section className="relative min-h-screen overflow-hidden pt-16">
        {/* 배경 그라디언트 */}
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/40 via-[#06091a] to-[#06091a]" />
        <div className="absolute top-1/4 left-1/3 w-[600px] h-[400px] bg-indigo-600/15 rounded-full blur-[130px]" />
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'linear-gradient(rgba(99,102,241,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.5) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

        <div className="relative z-10 max-w-7xl mx-auto px-6 min-h-[calc(100vh-4rem)] grid lg:grid-cols-2 gap-8 items-center py-16">

          {/* ── 텍스트 (왼쪽) ── */}
          <div className="flex flex-col items-start">

            {/* LOOV 이니셜 배지 */}
            <div className="inline-flex items-center gap-3 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl px-5 py-3 text-sm mb-8">
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse flex-shrink-0" />
              <span className="text-indigo-300 font-semibold tracking-wider">
                <span className="text-white font-black">L</span>everage&nbsp;·&nbsp;
                <span className="text-white font-black">O</span>rchestrate&nbsp;·&nbsp;
                <span className="text-white font-black">O</span>wn&nbsp;·&nbsp;
                <span className="text-white font-black">V</span>enture
              </span>
            </div>

            {/* 헤드라인 */}
            <h1 className="text-5xl md:text-6xl xl:text-7xl font-black leading-tight mb-6 tracking-tight">
              혼자지만<br />
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
                팀처럼 일하세요
              </span>
            </h1>

            {/* 타이핑 효과 */}
            <div className="h-9 mb-6">
              <p className="text-xl text-gray-300">
                AI로{' '}
                <span className="text-white font-semibold border-b-2 border-indigo-400">
                  {typed}
                  <span className="animate-pulse">|</span>
                </span>
              </p>
            </div>

            <p className="text-lg text-gray-400 max-w-xl mb-10 leading-relaxed">
              AI 직원을 채용해 영업·회계·마케팅을 맡기세요.<br />
              당신은 대표로서 지시만 내리면 됩니다.
            </p>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row gap-4 mb-12">
              <Link href="/signup"
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all hover:scale-105 hover:shadow-2xl hover:shadow-indigo-500/30">
                무료로 시작하기 →
              </Link>
              <a href="#how"
                className="border border-white/20 hover:border-white/40 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all hover:bg-white/5 text-center">
                어떻게 작동하나요?
              </a>
            </div>

            {/* 통계 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 w-full">
              {STATS.map((s) => (
                <div key={s.label}>
                  <div className="text-2xl font-black text-white">{s.value}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 3D 동물 캐러셀 (오른쪽) ── */}
          <div className="relative w-full h-[480px] lg:h-[600px]">
            {/* 아래 글로우 */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4/5 h-24 bg-indigo-600/20 rounded-full blur-3xl" />
            <AnimalHero3D />
          </div>
        </div>

        {/* 스크롤 힌트 */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-gray-600 text-xs animate-bounce">
          <span>스크롤</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </section>

      {/* ── PROBLEM / SOLUTION ────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <div className="text-sm font-semibold text-red-400 mb-4 uppercase tracking-widest">1인 기업의 고민</div>
              <h2 className="text-3xl md:text-4xl font-black mb-8 leading-tight">
                혼자 모든 걸<br />처리하기엔<br />
                <span className="text-red-400">너무 벅찹니다</span>
              </h2>
              <div className="space-y-4">
                {['고객 응대하면서 세금 신고도 해야 하고', 'SNS는 매일 올려야 하는데 시간이 없고', '영업도 해야 하고 개발도 해야 하고', '혼자 하니까 실수가 잦고 놓치는 것도 많고'].map((text) => (
                  <div key={text} className="flex items-center gap-3 text-gray-400">
                    <span className="text-red-400 text-lg">✗</span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold text-indigo-400 mb-4 uppercase tracking-widest">LOOV의 해결책</div>
              <h2 className="text-3xl md:text-4xl font-black mb-8 leading-tight">
                AI 직원에게<br />맡기고 당신은<br />
                <span className="text-indigo-400">대표에 집중하세요</span>
              </h2>
              <div className="space-y-4">
                {['영업팀장이 리드를 발굴하고 제안서를 작성하고', '회계 담당자가 매출을 정리하고 세금을 준비하고', '마케터가 매일 SNS에 콘텐츠를 올리고', '당신은 지시만 내리고 결과를 확인하면 됩니다'].map((text) => (
                  <div key={text} className="flex items-center gap-3 text-gray-300">
                    <span className="text-indigo-400 text-lg">✓</span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── AI 직원 유형 ───────────────────────────────── */}
      <section id="features" className="py-24 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-indigo-950/20 to-transparent" />
        <div className="relative max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-sm font-semibold text-indigo-400 uppercase tracking-widest mb-4">AI 직원 라인업</div>
            <h2 className="text-4xl md:text-5xl font-black mb-4">
              필요한 팀원을<br />골라서 채용하세요
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              각 AI 직원은 해당 직무의 전문 지식을 갖추고 있으며,<br />
              AI 모델(Claude/Gemini/GPT)을 자유롭게 배치할 수 있습니다.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {AI_EMPLOYEES.map((emp) => (
              <div key={emp.dept}
                className="group relative bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${emp.color} flex items-center justify-center text-2xl mb-4 shadow-lg`}>
                  {emp.icon}
                </div>
                <h3 className="text-xl font-bold mb-3">{emp.dept}</h3>
                <div className="space-y-1.5">
                  {emp.tasks.map((task) => (
                    <div key={task} className="flex items-center gap-2 text-sm text-gray-400">
                      <span className="w-1 h-1 bg-indigo-400 rounded-full flex-shrink-0" />
                      {task}
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-white/10">
                  <span className="text-xs text-gray-500">Claude · Gemini · GPT-4o 지원</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────── */}
      <section id="how" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-sm font-semibold text-indigo-400 uppercase tracking-widest mb-4">사용 방법</div>
            <h2 className="text-4xl md:text-5xl font-black">
              4단계로 시작하는<br />AI 팀 운영
            </h2>
          </div>
          <div className="relative">
            <div className="hidden md:block absolute top-8 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500/0 via-indigo-500/50 to-indigo-500/0" />
            <div className="grid md:grid-cols-4 gap-8">
              {STEPS.map((step) => (
                <div key={step.num} className="relative text-center">
                  <div className="relative z-10 w-16 h-16 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4 shadow-xl shadow-indigo-500/20">
                    {step.icon}
                  </div>
                  <div className="text-5xl font-black text-white/5 absolute -top-2 left-1/2 -translate-x-1/2">{step.num}</div>
                  <h3 className="font-bold text-lg mb-2">{step.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── ERP 기능 소개 ────────────────────────────── */}
      <section className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-950/30 to-purple-950/30" />
        <div className="relative max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="text-sm font-semibold text-indigo-400 uppercase tracking-widest mb-4">사내 ERP 시스템</div>
              <h2 className="text-4xl md:text-5xl font-black mb-6">
                AI 직원이 직접<br />운영하는<br />
                <span className="text-indigo-400">사내 ERP</span>
              </h2>
              <p className="text-gray-400 text-lg mb-8 leading-relaxed">
                영업 파이프라인, 회계 장부, 마케팅 캘린더까지 — 대표의 지시에 따라 AI 팀이 직접 ERP를 운영합니다.
              </p>
              <div className="space-y-4">
                {[
                  { icon: '📊', title: '영업 ERP', desc: '리드 관리, 파이프라인, 계약 추적' },
                  { icon: '💰', title: '회계 ERP', desc: '수입/지출, 인보이스, 재무 보고서' },
                  { icon: '📣', title: '마케팅 허브', desc: 'SNS 캘린더, 캠페인 관리, 성과 분석' },
                  { icon: '🌐', title: '홈페이지 관리', desc: '회사 웹사이트, 랜딩페이지 관리' },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-4 bg-white/5 border border-white/10 rounded-xl p-4">
                    <span className="text-2xl">{item.icon}</span>
                    <div>
                      <div className="font-bold">{item.title}</div>
                      <div className="text-sm text-gray-400">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 대시보드 미리보기 */}
            <div className="relative">
              <div className="bg-[#0d1326] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-white/5">
                  <div className="w-3 h-3 rounded-full bg-red-500/70" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/70" />
                  <div className="w-3 h-3 rounded-full bg-green-500/70" />
                  <div className="flex-1 mx-4 h-5 bg-white/10 rounded text-xs text-gray-500 flex items-center px-2">
                    app.loov.co.kr/dashboard
                  </div>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[
                      { label: '이번달 매출', value: '₩4,250만', color: 'text-emerald-400' },
                      { label: '진행중 리드', value: '23건', color: 'text-blue-400' },
                      { label: '마케팅 노출', value: '14.2만', color: 'text-orange-400' },
                    ].map((stat) => (
                      <div key={stat.label} className="bg-white/5 rounded-lg p-3">
                        <div className={`text-lg font-black ${stat.color}`}>{stat.value}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{stat.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 mb-3">
                    <div className="text-xs text-gray-400 mb-2 font-semibold">AI 직원 현황</div>
                    <div className="space-y-1.5">
                      {[
                        { name: 'Fox 팀장', status: '제안서 작성 중', color: 'bg-blue-400' },
                        { name: 'Bear 담당', status: '3월 결산 진행 중', color: 'bg-emerald-400' },
                        { name: 'Rabbit 마케터', status: 'SNS 콘텐츠 예약 완료', color: 'bg-orange-400' },
                      ].map((emp) => (
                        <div key={emp.name} className="flex items-center gap-2 text-xs">
                          <div className={`w-2 h-2 rounded-full ${emp.color} flex-shrink-0`} />
                          <span className="text-gray-300 font-medium w-24 flex-shrink-0">{emp.name}</span>
                          <span className="text-gray-500 truncate">{emp.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-2 font-semibold">최근 지시사항</div>
                    <div className="bg-indigo-600/20 border border-indigo-500/30 rounded-lg px-3 py-2 text-xs text-indigo-200">
                      💬 &quot;이번 주 인스타그램 콘텐츠 3개 준비해줘&quot;
                    </div>
                    <div className="mt-1.5 bg-white/5 rounded-lg px-3 py-2 text-xs text-gray-400">
                      📣 Rabbit: 네, 제품 소개 / 고객 후기 / 팁 콘텐츠로 준비하겠습니다.
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -inset-4 bg-indigo-600/10 rounded-3xl -z-10 blur-xl" />
            </div>
          </div>
        </div>
      </section>

      {/* ── AI 설정 섹션 ────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="text-sm font-semibold text-indigo-400 uppercase tracking-widest mb-4">AI 커스터마이징</div>
          <h2 className="text-4xl md:text-5xl font-black mb-6">
            원하는 AI로<br />직원을 구성하세요
          </h2>
          <p className="text-gray-400 text-lg mb-12 max-w-2xl mx-auto">
            Claude, Gemini, GPT-4 등 원하는 AI 모델의 API 키를 등록하고<br />
            전체 직원에게 적용하거나 직원별로 다르게 설정할 수 있습니다.
          </p>
          <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {[
              { name: 'Claude', company: 'Anthropic', icon: '🧠', badge: '추천', color: 'from-orange-500 to-amber-500' },
              { name: 'Gemini', company: 'Google', icon: '💎', badge: '', color: 'from-blue-500 to-cyan-500' },
              { name: 'GPT-4o', company: 'OpenAI', icon: '⚡', badge: '', color: 'from-green-500 to-emerald-500' },
            ].map((ai) => (
              <div key={ai.name} className="relative bg-white/5 border border-white/10 rounded-2xl p-6 text-left hover:bg-white/8 transition-all">
                {ai.badge && (
                  <span className="absolute -top-2.5 left-4 bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full font-bold">{ai.badge}</span>
                )}
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${ai.color} flex items-center justify-center text-2xl mb-3`}>
                  {ai.icon}
                </div>
                <div className="font-bold text-lg">{ai.name}</div>
                <div className="text-sm text-gray-400 mb-4">{ai.company}</div>
                <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-500 font-mono">API Key: ••••••••</span>
                  <span className="ml-auto text-xs text-emerald-400">연결됨</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 가격 요금제 ────────────────────────────────── */}
      <section id="pricing" className="py-24 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-indigo-950/20 to-transparent" />
        <div className="relative max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-sm font-semibold text-indigo-400 uppercase tracking-widest mb-4">요금제</div>
            <h2 className="text-4xl md:text-5xl font-black mb-4">
              성장에 맞게<br />팀을 늘려가세요
            </h2>
            <p className="text-gray-400 text-lg">무료로 시작, 필요할 때 업그레이드</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLANS.map((plan) => (
              <div key={plan.name}
                className={`relative rounded-2xl p-6 flex flex-col ${
                  plan.highlight
                    ? 'bg-gradient-to-b from-indigo-600 to-indigo-700 border-2 border-indigo-400 shadow-2xl shadow-indigo-500/30 scale-105'
                    : 'bg-white/5 border border-white/10'
                }`}>
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-black text-xs font-black px-3 py-1 rounded-full">
                    {plan.badge}
                  </div>
                )}
                <div className="mb-4">
                  <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                  <div className="flex items-end gap-1">
                    <span className="text-3xl font-black">
                      {plan.price === 0 ? '무료' : `₩${(plan.price / 10000).toFixed(0)}만`}
                    </span>
                    {plan.price > 0 && <span className="text-gray-300 text-sm mb-1">/월</span>}
                  </div>
                  <div className={`text-sm mt-2 ${plan.highlight ? 'text-indigo-200' : 'text-gray-400'}`}>
                    AI 직원 <strong className="text-white">{plan.employees}명</strong> 채용 가능
                  </div>
                </div>
                <div className="space-y-2.5 flex-1 mb-6">
                  {plan.features.map((feat) => (
                    <div key={feat} className="flex items-center gap-2 text-sm">
                      <span className={plan.highlight ? 'text-indigo-200' : 'text-indigo-400'}>✓</span>
                      <span className={plan.highlight ? 'text-white' : 'text-gray-300'}>{feat}</span>
                    </div>
                  ))}
                </div>
                <Link href="/signup"
                  className={`block text-center py-3 rounded-xl font-bold text-sm transition-all ${
                    plan.highlight
                      ? 'bg-white text-indigo-700 hover:bg-gray-100'
                      : 'border border-white/20 hover:border-white/40 hover:bg-white/5'
                  }`}>
                  {plan.price === 0 ? '무료로 시작' : '구독하기'}
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-gray-500 text-sm mt-8">
            엔터프라이즈 플랜은 별도 문의 · 모든 플랜 부가세 별도
          </p>
        </div>
      </section>

      {/* ── 1인 기업 지원 특화 ──────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-sm font-semibold text-indigo-400 uppercase tracking-widest mb-4">중소기업/1인 기업 특화</div>
            <h2 className="text-3xl md:text-4xl font-black">1인 기업에 꼭 필요한 모든 것</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: '🏛️', title: '정부지원사업 알림', desc: '1인 창업자, 소상공인 대상 지원 사업을 AI가 자동으로 탐색하고 알려줍니다.' },
              { icon: '📋', title: '세금/세무 가이드', desc: '부가세 신고, 종합소득세, 사업자 세금 절세 방법을 회계 AI가 안내합니다.' },
              { icon: '📑', title: '계약서 초안 작성', desc: '업무 위탁 계약서, NDA, 서비스 계약서를 AI 직원이 초안으로 작성합니다.' },
              { icon: '📈', title: '비즈니스 성장 분석', desc: '매출 트렌드, 고객 이탈, 마진율 등을 AI가 분석하고 개선안을 제안합니다.' },
              { icon: '🌐', title: '홈페이지 자동 관리', desc: '회사 홈페이지 콘텐츠 업데이트, 블로그 포스팅을 AI 직원이 대신합니다.' },
              { icon: '🔔', title: '일정/마감 관리', desc: '세금 신고일, 계약 갱신, 프로젝트 마감을 자동으로 추적하고 알림을 보냅니다.' },
            ].map((item) => (
              <div key={item.title} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/8 transition-all">
                <div className="text-3xl mb-3">{item.icon}</div>
                <h3 className="font-bold text-lg mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────── */}
      <section id="faq" className="py-24 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-indigo-950/15 to-transparent" />
        <div className="relative max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-sm font-semibold text-indigo-400 uppercase tracking-widest mb-4">자주 묻는 질문</div>
            <h2 className="text-3xl md:text-4xl font-black">FAQ</h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <button
                  className="w-full text-left px-6 py-4 flex items-center justify-between gap-4 hover:bg-white/5 transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span className="font-semibold">{faq.q}</span>
                  <span className={`text-2xl transition-transform flex-shrink-0 ${openFaq === i ? 'rotate-45' : ''}`}>+</span>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4 text-gray-400 text-sm leading-relaxed border-t border-white/5 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────── */}
      <section className="py-32 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/0 via-indigo-900/20 to-indigo-950/0" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-indigo-600/20 rounded-full blur-[100px]" />
        <div className="relative max-w-3xl mx-auto">
          <div className="text-lg font-semibold text-indigo-400 mb-4 tracking-widest">
            L · O · O · V
          </div>
          <h2 className="text-4xl md:text-6xl font-black mb-6 leading-tight">
            지금 당장<br />
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              AI 팀을 구성하세요
            </span>
          </h2>
          <p className="text-gray-400 text-lg mb-10">
            무료로 시작해서 성장에 맞게 팀을 늘려가세요.<br />
            신용카드 없이 바로 시작 가능합니다.
          </p>
          <Link href="/signup"
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-10 py-5 rounded-2xl font-black text-xl transition-all hover:scale-105 hover:shadow-2xl hover:shadow-indigo-500/40">
            무료로 AI 팀 구성하기
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <p className="text-gray-600 text-sm mt-4">AI 직원 1명 영구 무료 · 언제든 업그레이드 가능</p>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────── */}
      <footer className="border-t border-white/10 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-black text-white">L</div>
                <span className="font-black">LOOV</span>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed">
                1인 기업을 위한 AI 직원 플랫폼.<br />
                Leverage · Orchestrate · Own · Venture
              </p>
            </div>
            {[
              { title: '제품', links: ['기능 소개', '요금제', '업데이트 노트', 'API 문서'] },
              { title: '지원', links: ['도움말 센터', 'FAQ', '문의하기', '커뮤니티'] },
              { title: '회사', links: ['소개', '블로그', '채용', '파트너십'] },
            ].map((col) => (
              <div key={col.title}>
                <h4 className="font-semibold mb-3 text-sm">{col.title}</h4>
                <div className="space-y-2">
                  {col.links.map((link) => (
                    <div key={link} className="text-gray-500 text-sm hover:text-gray-300 cursor-pointer transition-colors">{link}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-600">
            <span>© 2026 LOOV. All rights reserved.</span>
            <div className="flex gap-6">
              <span className="hover:text-gray-400 cursor-pointer">개인정보처리방침</span>
              <span className="hover:text-gray-400 cursor-pointer">이용약관</span>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
