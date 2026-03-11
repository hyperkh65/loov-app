'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

const AnimalHero3D = dynamic(() => import('@/components/landing/AnimalHero3D'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
    </div>
  ),
});

function useTypewriter(texts: string[], speed = 65, pause = 2600) {
  const [display, setDisplay] = useState('');
  const [idx, setIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      const cur = texts[idx];
      if (!deleting) {
        setDisplay(cur.slice(0, charIdx + 1));
        if (charIdx + 1 === cur.length) setTimeout(() => setDeleting(true), pause);
        else setCharIdx(c => c + 1);
      } else {
        setDisplay(cur.slice(0, charIdx - 1));
        if (charIdx - 1 === 0) { setDeleting(false); setIdx(i => (i + 1) % texts.length); setCharIdx(0); }
        else setCharIdx(c => c - 1);
      }
    }, deleting ? speed / 2 : speed);
    return () => clearTimeout(t);
  }, [charIdx, deleting, idx, texts, speed, pause]);
  return display;
}

function useScrollReveal(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, visible } = useScrollReveal();
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(24px)',
      transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

const EMPLOYEES = [
  { icon: '📊', dept: '영업팀', color: '#0066FF', tasks: ['리드 발굴', '제안서 작성', 'CRM 관리', '계약 협상', '영업 분석'] },
  { icon: '💰', dept: '회계팀', color: '#00C07F', tasks: ['매출 정리', '세무 신고 준비', '인보이스 발행', '손익 분석', '예산 관리'] },
  { icon: '📣', dept: '마케팅', color: '#FF6B35', tasks: ['SNS 콘텐츠', '블로그 포스팅', '광고 기획', '캠페인 분석', '뉴스레터'] },
  { icon: '💻', dept: '개발팀', color: '#8B5CF6', tasks: ['코드 리뷰', 'API 설계', '자동화 구축', '기술 문서', 'UI 제작'] },
  { icon: '🎨', dept: '디자인', color: '#EC4899', tasks: ['홍보물 기획', 'UI/UX 가이드', '브랜드 전략', '제품 시각화', '영상 기획'] },
  { icon: '🤝', dept: 'HR팀', color: '#F59E0B', tasks: ['채용 공고', '성과 평가', '조직 문화', '온보딩', '급여 명세'] },
];

const INTEGRATIONS = [
  { icon: '📝', name: '네이버 블로그', desc: 'SEO 최적화 자동 발행', color: '#03C75A' },
  { icon: '📸', name: 'Instagram', desc: '피드·릴스·스토리 자동화', color: '#E1306C' },
  { icon: '▶', name: 'YouTube', desc: '쇼츠·설명 자동 생성', color: '#FF0000' },
  { icon: '🌐', name: 'WordPress', desc: 'AI 블로그 완전 자동화', color: '#21759B' },
  { icon: '📅', name: 'Google Calendar', desc: '일정 양방향 동기화', color: '#4285F4' },
  { icon: '📓', name: 'Notion', desc: '문서·데이터베이스 연동', color: '#000000' },
  { icon: '🛒', name: 'Coupang', desc: '제휴 상품 자동 포스팅', color: '#FF6B35' },
  { icon: '⚙️', name: 'n8n', desc: '워크플로우 자동화', color: '#EA4B71' },
];

const PLANS = [
  { name: '무료', price: 0, employees: 1, features: ['AI 직원 1명', '기본 채팅', '프로젝트 관리', '7일 히스토리'], cta: '무료로 시작' },
  { name: '베이직', price: 29000, employees: 3, features: ['AI 직원 3명', '영업 ERP', '회계 기본', '30일 히스토리', '스케줄 관리'], cta: '시작하기' },
  { name: '스타터', price: 59000, employees: 5, highlight: true, badge: '가장 인기', features: ['AI 직원 5명', '전체 ERP', '마케팅 허브', 'SNS 관리', '90일 히스토리'], cta: '시작하기' },
  { name: '프로', price: 99000, employees: 10, features: ['AI 직원 10명', '직원별 AI 설정', '홈페이지 빌더', 'Obsidian 백업', '무제한 히스토리'], cta: '시작하기' },
];

const FAQS = [
  { q: 'AI 직원이 실제로 업무를 처리할 수 있나요?', a: 'Claude, Gemini, GPT-4o 등 최신 AI 모델을 탑재한 AI 직원이 영업 제안서 작성, 회계 분류, SNS 콘텐츠 생성 등 실제 업무를 수행합니다.' },
  { q: '네이버 블로그·SNS 자동화는 어떻게 작동하나요?', a: 'Playwright 기반 로컬 에이전트가 실제 브라우저를 제어해 네이버 블로그에 글을 발행합니다. Instagram, YouTube는 공식 API로 자동 업로드됩니다.' },
  { q: 'API 키는 어떻게 설정하나요?', a: '설정 → AI 설정 메뉴에서 Claude, Gemini, GPT API 키를 입력합니다. 전체 직원 일괄 적용 또는 직원별 개별 설정이 가능합니다.' },
  { q: '나중에 플랜을 변경할 수 있나요?', a: '언제든지 업그레이드하거나 다운그레이드할 수 있습니다. 업그레이드 즉시 추가 직원 채용이 가능합니다.' },
];

export default function LandingPage() {
  const typed = useTypewriter(['영업 팀장', '회계 담당자', '마케터', 'AI 팀 전체']);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <div className="bg-white text-gray-900 overflow-x-hidden selection:bg-blue-100">
      <style>{`
        /* ── 기본 유틸 ── */
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes marquee { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .fade-up{animation:fadeUp 0.7s ease both}
        .fade-up-1{animation:fadeUp 0.7s 0.1s ease both}
        .fade-up-2{animation:fadeUp 0.7s 0.2s ease both}
        .fade-up-3{animation:fadeUp 0.7s 0.3s ease both}
        .hover-lift{transition:transform 0.2s ease,box-shadow 0.2s ease}
        .hover-lift:hover{transform:translateY(-3px);box-shadow:0 12px 40px rgba(0,0,0,0.1)}
        .nav-link{position:relative}
        .nav-link::after{content:'';position:absolute;bottom:-2px;left:0;width:0;height:1.5px;background:#1d1d1f;transition:width 0.25s ease}
        .nav-link:hover::after{width:100%}
        .card-hover{transition:all 0.25s ease}
        .card-hover:hover{background:#f5f5f7;transform:translateY(-2px)}
        .pill{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;background:#f5f5f7;border-radius:100px;font-size:12px;font-weight:500;color:#6e6e73}
        .dot-pulse{animation:pulse 2s ease-in-out infinite}

        /* ── HERO: Remotion-style 시퀀스 애니메이션 ── */

        /* 배경 진입 */
        @keyframes bgReveal{from{opacity:0}to{opacity:1}}
        .hero-bg{animation:bgReveal 0.6s ease both}

        /* 그리드 라인 페이드 */
        @keyframes gridFade{0%{opacity:0}100%{opacity:1}}
        .hero-grid-anim{animation:gridFade 1.2s 0.2s ease both}

        /* 배지 드롭 */
        @keyframes badgeDrop{0%{opacity:0;transform:translateY(-16px) scale(0.9)}100%{opacity:1;transform:translateY(0) scale(1)}}
        .badge-anim{animation:badgeDrop 0.5s 0.35s cubic-bezier(0.34,1.56,0.64,1) both}

        /* 텍스트 클립 리빌 (Remotion 시그니처) */
        @keyframes clipReveal{0%{clip-path:inset(110% 0 0 0);transform:translateY(24px);opacity:0}100%{clip-path:inset(0% 0 0 0);transform:translateY(0);opacity:1}}
        .word-1{animation:clipReveal 0.65s 0.55s cubic-bezier(0.16,1,0.3,1) both}
        .word-2{animation:clipReveal 0.65s 0.72s cubic-bezier(0.16,1,0.3,1) both}
        .sub-line{animation:clipReveal 0.55s 0.95s cubic-bezier(0.16,1,0.3,1) both}
        .desc-line{animation:clipReveal 0.55s 1.1s cubic-bezier(0.16,1,0.3,1) both}

        /* 텍스트 그라디언트 시머 */
        @keyframes shimmerFlow{0%{background-position:-300% center}100%{background-position:300% center}}
        .gradient-text{
          background:linear-gradient(90deg,#6366f1,#8b5cf6,#a78bfa,#c4b5fd,#8b5cf6,#6366f1);
          background-size:300% auto;
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
          animation:shimmerFlow 4s 1.4s linear infinite;
        }

        /* CTA 버튼 팝 */
        @keyframes ctaPop{0%{opacity:0;transform:scale(0.92) translateY(12px)}70%{transform:scale(1.02) translateY(-1px)}100%{opacity:1;transform:scale(1) translateY(0)}}
        .cta-anim{animation:ctaPop 0.55s 1.25s cubic-bezier(0.34,1.56,0.64,1) both}

        /* 통계 카운트업 슬라이드 */
        @keyframes statSlide{0%{opacity:0;transform:translateY(16px)}100%{opacity:1;transform:translateY(0)}}
        .stat-1{animation:statSlide 0.45s 1.45s ease both}
        .stat-2{animation:statSlide 0.45s 1.55s ease both}
        .stat-3{animation:statSlide 0.45s 1.65s ease both}

        /* 캐릭터 엔트런스 (blur + scale) */
        @keyframes charEntrance{
          0%{opacity:0;transform:scale(0.75) translateY(50px);filter:blur(20px)}
          60%{filter:blur(0px)}
          80%{transform:scale(1.03) translateY(-4px)}
          100%{opacity:1;transform:scale(1) translateY(0);filter:blur(0)}
        }
        .char-anim{animation:charEntrance 1s 1.8s cubic-bezier(0.16,1,0.3,1) both}

        /* 플로팅 카드 */
        @keyframes cardFloat{0%{opacity:0;transform:translateX(30px) scale(0.9)}100%{opacity:1;transform:translateX(0) scale(1)}}
        .card-1{animation:cardFloat 0.6s 2.3s cubic-bezier(0.16,1,0.3,1) both}
        .card-2{animation:cardFloat 0.6s 2.55s cubic-bezier(0.16,1,0.3,1) both}
        .card-3{animation:cardFloat 0.6s 2.8s cubic-bezier(0.16,1,0.3,1) both}

        /* 연속 부유 */
        @keyframes levitate{0%,100%{transform:translateY(0px) rotate(0deg)}40%{transform:translateY(-10px) rotate(0.5deg)}70%{transform:translateY(4px) rotate(-0.3deg)}}
        .lev-1{animation:levitate 5s 3.5s ease-in-out infinite}
        .lev-2{animation:levitate 6s 3.8s ease-in-out infinite}
        .lev-3{animation:levitate 4.5s 4.1s ease-in-out infinite}

        /* 스캔 라인 (cinematic effect) */
        @keyframes scan{0%{top:-2px;opacity:0.8}100%{top:100%;opacity:0}}
        .scan-line{animation:scan 3s 2s linear infinite}

        /* AI 액티비티 틱 */
        @keyframes actTick{0%,100%{opacity:1}50%{opacity:0.5}}
        .act-tick{animation:actTick 1.8s ease-in-out infinite}

        /* 오브 글로우 */
        @keyframes orbPulse{0%,100%{opacity:0.15;transform:scale(1)}50%{opacity:0.25;transform:scale(1.08)}}
        .orb-1{animation:orbPulse 6s ease-in-out infinite}
        .orb-2{animation:orbPulse 8s 2s ease-in-out infinite}
        .orb-3{animation:orbPulse 5s 4s ease-in-out infinite}

        /* 하단 그라디언트 트랜지션 */
        @keyframes sectionReveal{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
        .section-reveal{animation:sectionReveal 0.7s ease both}

        /* 다크 히어로 추가 애니메이션 */
        @keyframes orbDrift1 { 0%{transform:translate(0,0) scale(1)} 33%{transform:translate(40px,-30px) scale(1.1)} 66%{transform:translate(-20px,20px) scale(0.95)} 100%{transform:translate(0,0) scale(1)} }
        @keyframes orbDrift2 { 0%{transform:translate(0,0) scale(1)} 50%{transform:translate(-60px,40px) scale(1.15)} 100%{transform:translate(0,0) scale(1)} }
        @keyframes scanBeam { 0%{top:-5%;opacity:0} 5%{opacity:0.5} 95%{opacity:0.1} 100%{top:105%;opacity:0} }
        @keyframes borderGlow { 0%,100%{box-shadow:0 0 30px rgba(99,102,241,0.4)} 50%{box-shadow:0 0 50px rgba(139,92,246,0.7),0 0 80px rgba(99,102,241,0.3)} }
        @keyframes typingDot { 0%,80%,100%{transform:scale(0.7);opacity:0.3} 40%{transform:scale(1);opacity:1} }
        .orb-drift-1{animation:orbDrift1 15s ease-in-out infinite}
        .orb-drift-2{animation:orbDrift2 20s ease-in-out infinite}
      `}</style>

      {/* ── NAV ──────────────────────────────────────────────── */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/80 backdrop-blur-2xl border-b border-black/[0.06]' : 'bg-white/0'}`}>
        <nav className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#1d1d1f] flex items-center justify-center">
              <span className="text-white text-xs font-black tracking-tight">L</span>
            </div>
            <span className="font-semibold text-[15px] tracking-tight text-[#1d1d1f]">LOOV</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            {[['#features','기능'],['#integrations','연동'],['#pricing','요금제'],['#faq','FAQ']].map(([h,l]) => (
              <a key={h} href={h} className="nav-link text-[13px] text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-medium">{l}</a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="text-[13px] text-[#6e6e73] hover:text-[#1d1d1f] transition-colors px-3 py-1.5 font-medium">로그인</Link>
            <Link href="/signup" className="text-[13px] bg-[#1d1d1f] hover:bg-[#3d3d3f] text-white px-4 py-2 rounded-full font-medium transition-colors">
              무료 시작
            </Link>
          </div>
        </nav>
      </header>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-14 overflow-hidden bg-[#080810]">
        {/* 배경 오브 */}
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none orb-drift-1" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-violet-600/10 blur-[100px] pointer-events-none orb-drift-2" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full bg-blue-900/10 blur-[80px] pointer-events-none" />

        {/* 그리드 패턴 */}
        <div className="absolute inset-0 hero-grid-pattern pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(99,102,241,0.08) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.08) 1px,transparent 1px)',
          backgroundSize: '60px 60px',
          animation: 'gridPulse 4s ease-in-out infinite'
        }} />

        {/* 스캔 빔 */}
        <div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent pointer-events-none" style={{animation:'scanBeam 5s 2s linear infinite',position:'absolute'}} />

        <div className="relative w-full max-w-6xl mx-auto grid lg:grid-cols-[1.2fr_0.8fr] gap-8 lg:gap-4 items-center py-20">
          {/* 텍스트 */}
          <div>
            <div className="badge-anim inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 backdrop-blur-sm">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full dot-pulse" />
              <span className="text-[12px] text-indigo-300 font-medium tracking-wide">AI 직원 플랫폼 · LOOV</span>
            </div>

            <h1 className="text-[64px] md:text-[96px] font-black leading-[1.0] tracking-[-0.04em] text-white mb-5">
              <span className="block word-1">혼자서도</span>
              <span className="block word-2">
                <span className="gradient-text" style={{textShadow:'none',filter:'drop-shadow(0 0 40px rgba(139,92,246,0.5))'}}>팀처럼.</span>
              </span>
            </h1>

            <div className="h-8 mb-6 sub-line">
              <p className="text-lg md:text-xl text-white/50 font-medium">
                지금 바로{' '}
                <span className="text-white font-semibold">
                  {typed}
                  <span className="text-indigo-400 animate-pulse ml-0.5">|</span>
                </span>
                을 고용하세요
              </p>
            </div>

            <p className="desc-line text-[16px] md:text-[17px] text-white/40 leading-relaxed mb-10 max-w-md">
              AI 직원이 영업·회계·마케팅을 대신합니다.<br />
              Claude, Gemini, GPT-4o 중 원하는 AI로<br />당신만의 팀을 구성하세요.
            </p>

            <div className="cta-anim flex items-center gap-3 mb-14">
              <Link href="/signup" className="relative inline-flex items-center gap-2 text-white text-[15px] font-bold px-7 py-3.5 rounded-full overflow-hidden transition-all hover:scale-[1.03] active:scale-[0.97]"
                style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',boxShadow:'0 0 30px rgba(99,102,241,0.4)',animation:'borderGlow 3s 2s ease-in-out infinite'}}>
                <span className="relative z-10">무료로 시작하기</span>
                <svg className="w-4 h-4 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <a href="#features" className="text-[14px] font-medium text-white/40 hover:text-white/70 transition-colors flex items-center gap-1.5 px-4 py-3.5 rounded-full border border-white/10 hover:border-white/20">
                기능 보기 <span className="text-xs">↓</span>
              </a>
            </div>

            {/* 통계 */}
            <div className="stat-1 flex items-center gap-1">
              <div className="h-px flex-1 max-w-[1px] bg-white/10" />
              <div className="flex items-center gap-8 px-0">
                {[
                  { v: '2,400+', l: '사용 중인 1인 기업' },
                  { v: '97%', l: '업무 완료율' },
                  { v: '3×', l: '생산성 향상' },
                ].map((s, i) => (
                  <div key={s.l} className={`stat-${i+1}`}>
                    <div className="text-xl md:text-2xl font-black text-white tracking-tight">{s.v}</div>
                    <div className="text-[11px] text-white/35 mt-0.5">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 3D 동물 + UI */}
          <div className="relative h-[280px] lg:h-[360px]">
            {/* 캐릭터 글로우 베이스 */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-20 rounded-full blur-3xl opacity-30 pointer-events-none"
              style={{background:'rgba(139,92,246,0.6)'}} />

            {/* 캐릭터 컨테이너 - 글래스 프레임 */}
            <div className="absolute inset-0 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-sm overflow-hidden char-anim">
              <AnimalHero3D />
            </div>

            {/* 플로팅 카드 1: AI 채팅 */}
            <div className="card-1 absolute -top-4 -left-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 shadow-2xl hidden lg:block"
              style={{animation:'cardFloat 0.6s 2.3s cubic-bezier(0.16,1,0.3,1) both'}}>
              <div className="text-[10px] text-white/40 mb-1">Fox 팀장 · 영업</div>
              <div className="text-[13px] font-semibold text-white">제안서 3건 완료 ✓</div>
              <div className="flex items-center gap-1 mt-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" style={{animation:'typingDot 1.4s 0s ease-in-out infinite'}} />
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" style={{animation:'typingDot 1.4s 0.2s ease-in-out infinite'}} />
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" style={{animation:'typingDot 1.4s 0.4s ease-in-out infinite'}} />
                <span className="text-[10px] text-white/30 ml-1">처리 중</span>
              </div>
            </div>

            {/* 플로팅 카드 2: SNS */}
            <div className="card-2 absolute -bottom-4 -right-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 shadow-2xl hidden lg:block">
              <div className="text-[10px] text-white/40 mb-1">Rabbit · 마케팅</div>
              <div className="text-[13px] font-semibold text-white">SNS 예약 완료 ✓</div>
              <div className="flex items-center gap-1.5 mt-2">
                {['#6366f1','#ec4899','#ef4444'].map((c,i) => (
                  <div key={i} className="w-5 h-5 rounded-full flex items-center justify-center text-[9px]"
                    style={{background:`${c}30`,border:`1px solid ${c}60`}}>
                    {['IG','YT','📝'][i]}
                  </div>
                ))}
              </div>
            </div>

            {/* 플로팅 카드 3: AI 모델 */}
            <div className="card-3 absolute top-1/2 -right-10 -translate-y-1/2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-3 py-3 shadow-2xl hidden lg:flex flex-col gap-2">
              {[{name:'Claude',c:'#FF6B35'},{name:'Gemini',c:'#4285F4'},{name:'GPT-4o',c:'#10a37f'}].map(ai => (
                <div key={ai.name} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full act-tick" style={{background:ai.c}} />
                  <span className="text-[10px] text-white/50 font-mono">{ai.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 하단 스크롤 인디케이터 */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-40 stat-3">
          <span className="text-[11px] text-white/50 tracking-widest uppercase">Scroll</span>
          <div className="w-px h-12 bg-gradient-to-b from-white/30 to-transparent" style={{animation:'scan 2s ease-in-out infinite'}} />
        </div>
      </section>

      {/* ── 마퀴 ────────────────────────────────────────────── */}
      <div className="border-y border-white/[0.06] py-3 overflow-hidden bg-[#0d0d18]">
        <div className="flex gap-0 whitespace-nowrap" style={{ animation: 'marquee 28s linear infinite' }}>
          {[...Array(2)].flatMap(() =>
            ['네이버 블로그', 'Instagram', 'YouTube', 'WordPress', 'Google Calendar', 'Notion', 'Coupang', 'n8n', 'Claude AI', 'Gemini', 'GPT-4o', '영업 ERP', '회계 장부', 'SNS 자동화'].map((item, i) => (
              <span key={`${item}-${i}`} className="inline-flex items-center gap-2 px-6 text-[12px] text-white/30 font-medium">
                <span className="w-1 h-1 bg-white/20 rounded-full" />
                {item}
              </span>
            ))
          )}
        </div>
      </div>

      {/* ── AI 직원 ─────────────────────────────────────────── */}
      <section id="features" className="py-28 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-xl mb-16">
            <div className="pill mb-4">AI 직원 라인업</div>
            <h2 className="text-[44px] font-black tracking-[-0.03em] leading-tight text-[#1d1d1f] mb-4">
              필요한 팀원만<br />골라서 채용하세요.
            </h2>
            <p className="text-[17px] text-[#6e6e73] leading-relaxed">
              각 AI 직원은 해당 직무 전문 지식을 갖추고 있습니다.<br />
              Claude · Gemini · GPT-4o를 직원별로 자유롭게 배치하세요.
            </p>
          </Reveal>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {EMPLOYEES.map((emp, i) => (
              <Reveal key={emp.dept} delay={i * 60}>
                <div className="card-hover bg-[#f5f5f7] rounded-3xl p-6 cursor-default">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-4"
                    style={{ background: `${emp.color}15` }}>
                    {emp.icon}
                  </div>
                  <h3 className="text-[17px] font-bold text-[#1d1d1f] mb-3">{emp.dept}</h3>
                  <div className="space-y-1.5 mb-4">
                    {emp.tasks.map(t => (
                      <div key={t} className="flex items-center gap-2 text-[13px] text-[#6e6e73]">
                        <div className="w-1 h-1 rounded-full bg-[#c7c7cc] flex-shrink-0" />
                        {t}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1.5 pt-3 border-t border-black/[0.06]">
                    {['Claude','Gemini','GPT-4o'].map(ai => (
                      <span key={ai} className="text-[10px] px-2 py-0.5 bg-white rounded-full text-[#6e6e73] border border-black/[0.06]">{ai}</span>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 대시보드 섹션 ─────────────────────────────────── */}
      <section className="py-28 px-6 bg-[#f5f5f7]">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <Reveal>
            <div className="pill mb-4">내장 ERP</div>
            <h2 className="text-[44px] font-black tracking-[-0.03em] leading-tight text-[#1d1d1f] mb-4">
              AI 팀이 직접<br />운영하는 ERP.
            </h2>
            <p className="text-[17px] text-[#6e6e73] leading-relaxed mb-10">
              영업 파이프라인, 회계 장부, 마케팅 캘린더까지 —<br />
              대표의 지시에 따라 AI 팀이 직접 운영합니다.
            </p>
            <div className="space-y-3">
              {[
                { icon: '📊', title: '영업 ERP', desc: '리드 관리 · 파이프라인 · 계약 추적' },
                { icon: '💰', title: '회계 ERP', desc: '수입/지출 · 인보이스 · 재무 보고서' },
                { icon: '📣', title: '마케팅 허브', desc: 'SNS 캘린더 · 캠페인 · 성과 분석' },
                { icon: '🌐', title: '홈페이지 빌더', desc: 'AI 블록 에디터 · 서브도메인 발행' },
              ].map(item => (
                <div key={item.title} className="flex items-center gap-4 bg-white rounded-2xl px-5 py-4 hover-lift">
                  <span className="text-xl">{item.icon}</span>
                  <div>
                    <div className="text-[14px] font-semibold text-[#1d1d1f]">{item.title}</div>
                    <div className="text-[12px] text-[#6e6e73]">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={100}>
            {/* 대시보드 목업 */}
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-br from-indigo-50 to-violet-50 rounded-[2rem]" />
              <div className="relative bg-white rounded-[1.5rem] overflow-hidden shadow-2xl shadow-black/10 border border-black/[0.06]">
                {/* 브라우저 바 */}
                <div className="flex items-center gap-1.5 px-4 py-3 border-b border-black/[0.05] bg-[#fafafa]">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
                  <div className="flex-1 mx-3 h-5 bg-[#f0f0f0] rounded-md text-[10px] text-[#6e6e73] flex items-center px-2">
                    app.loov.co.kr/dashboard
                  </div>
                </div>
                <div className="flex" style={{ height: 340 }}>
                  {/* 사이드바 */}
                  <div className="w-12 border-r border-black/[0.05] flex flex-col items-center py-3 gap-3 bg-[#fafafa]">
                    <div className="w-7 h-7 rounded-lg bg-[#1d1d1f] flex items-center justify-center text-[10px] font-black text-white">L</div>
                    {['🏠','💬','📊','💰','📣'].map((ic, i) => (
                      <div key={i} className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm ${i===0 ? 'bg-indigo-50' : 'hover:bg-gray-50'} cursor-pointer`}>{ic}</div>
                    ))}
                  </div>
                  {/* 콘텐츠 */}
                  <div className="flex-1 p-4 overflow-hidden">
                    <div className="text-[11px] font-semibold text-[#1d1d1f] mb-3">대시보드 개요</div>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {[
                        { l:'이번달 매출', v:'₩4,250만', c:'#00C07F' },
                        { l:'진행중 리드', v:'23건', c:'#0066FF' },
                        { l:'SNS 노출', v:'14.2만', c:'#FF6B35' },
                      ].map(s => (
                        <div key={s.l} className="bg-[#f5f5f7] rounded-xl p-2.5">
                          <div className="text-[9px] text-[#6e6e73] mb-1">{s.l}</div>
                          <div className="text-[13px] font-black" style={{ color: s.c }}>{s.v}</div>
                        </div>
                      ))}
                    </div>
                    <div className="bg-[#f5f5f7] rounded-xl p-3 mb-2">
                      <div className="text-[10px] font-semibold text-[#6e6e73] mb-2">AI 직원 현황</div>
                      {[
                        { name:'Fox 팀장', status:'제안서 작성 중', c:'#0066FF', pct:65 },
                        { name:'Bear 담당', status:'결산 완료', c:'#00C07F', pct:100 },
                        { name:'Rabbit', status:'SNS 3건 예약', c:'#FF6B35', pct:100 },
                      ].map(e => (
                        <div key={e.name} className="flex items-center gap-2 mb-1.5">
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: e.c }} />
                          <span className="text-[10px] text-[#1d1d1f] font-medium w-14 flex-shrink-0">{e.name}</span>
                          <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width:`${e.pct}%`, background: e.c }} />
                          </div>
                          <span className="text-[9px] text-[#6e6e73] flex-shrink-0 w-20 truncate">{e.status}</span>
                        </div>
                      ))}
                    </div>
                    <div className="bg-indigo-50 rounded-xl px-3 py-2.5 text-[11px] text-indigo-700 font-medium">
                      💬 &quot;이번 주 인스타그램 콘텐츠 3개 준비해줘&quot;
                    </div>
                    <div className="bg-[#f5f5f7] rounded-xl px-3 py-2 mt-1.5 text-[10px] text-[#6e6e73]">
                      🐇 피드·스토리·릴스로 준비했습니다. 검토해주세요 ✅
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 통합 서비스 ────────────────────────────────────── */}
      <section id="integrations" className="py-28 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-xl mb-16">
            <div className="pill mb-4">통합 서비스</div>
            <h2 className="text-[44px] font-black tracking-[-0.03em] leading-tight text-[#1d1d1f] mb-4">
              모든 채널을<br />하나로.
            </h2>
            <p className="text-[17px] text-[#6e6e73] leading-relaxed">
              AI 직원이 네이버 블로그, Instagram, WordPress 등<br />
              모든 채널을 자동으로 운영합니다.
            </p>
          </Reveal>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
            {INTEGRATIONS.map((intg, i) => (
              <Reveal key={intg.name} delay={i * 50}>
                <div className="card-hover bg-[#f5f5f7] rounded-3xl p-5 cursor-default">
                  <div className="text-2xl mb-3">{intg.icon}</div>
                  <div className="text-[15px] font-semibold text-[#1d1d1f] mb-1">{intg.name}</div>
                  <div className="text-[12px] text-[#6e6e73]">{intg.desc}</div>
                  <div className="flex items-center gap-1.5 mt-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <span className="text-[11px] text-[#6e6e73]">연동 가능</span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI 모델 ─────────────────────────────────────────── */}
      <section className="py-28 px-6 bg-[#f5f5f7]">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-16">
            <div className="pill mx-auto mb-4">AI 모델 선택</div>
            <h2 className="text-[44px] font-black tracking-[-0.03em] leading-tight text-[#1d1d1f] mb-4">
              원하는 AI로<br />팀을 구성하세요.
            </h2>
            <p className="text-[17px] text-[#6e6e73]">
              API 키 하나면 됩니다. 직원별로 다른 AI를 배치할 수 있습니다.
            </p>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {[
              { name:'Claude', sub:'by Anthropic', icon:'🧠', badge:'추천', feats:['뛰어난 추론 능력','긴 컨텍스트','한국어 최적화','안전한 응답'], accent:'#FF6B35' },
              { name:'Gemini', sub:'by Google', icon:'💎', badge:'', feats:['멀티모달 지원','실시간 검색','이미지 분석','빠른 응답'], accent:'#4285F4' },
              { name:'GPT-4o', sub:'by OpenAI', icon:'⚡', badge:'', feats:['코드 생성 특화','범용 업무','정밀한 지시','플러그인'], accent:'#10a37f' },
            ].map((ai, i) => (
              <Reveal key={ai.name} delay={i * 80}>
                <div className="relative bg-white rounded-3xl p-6 hover-lift border border-black/[0.05]">
                  {ai.badge && (
                    <span className="absolute top-5 right-5 text-[11px] font-bold px-2.5 py-1 bg-[#1d1d1f] text-white rounded-full">{ai.badge}</span>
                  )}
                  <div className="text-3xl mb-4">{ai.icon}</div>
                  <div className="text-[18px] font-black text-[#1d1d1f] mb-0.5">{ai.name}</div>
                  <div className="text-[12px] text-[#6e6e73] mb-4">{ai.sub}</div>
                  <div className="space-y-2 mb-5">
                    {ai.feats.map(f => (
                      <div key={f} className="flex items-center gap-2 text-[13px] text-[#6e6e73]">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ai.accent }} />
                        {f}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between bg-[#f5f5f7] rounded-xl px-3 py-2.5">
                    <span className="text-[11px] text-[#6e6e73] font-mono">API Key: ••••••</span>
                    <span className="text-[11px] font-semibold text-green-500">연결됨</span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────── */}
      <section className="py-28 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <Reveal className="text-center mb-16">
            <div className="pill mx-auto mb-4">시작하기</div>
            <h2 className="text-[44px] font-black tracking-[-0.03em] leading-tight text-[#1d1d1f]">
              4단계면 충분합니다.
            </h2>
          </Reveal>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { n:'1', icon:'🏢', t:'회사 등록', d:'회사 정보와 목표를 입력하면 AI가 최적의 팀 구성을 추천합니다' },
              { n:'2', icon:'👤', t:'직원 채용', d:'영업·회계·마케팅 등 필요한 부서의 AI 직원을 채용하세요' },
              { n:'3', icon:'💬', t:'지시 내리기', d:'채팅으로 업무를 지시하면 AI 직원이 즉시 수행합니다' },
              { n:'4', icon:'📈', t:'결과 확인', d:'모든 업무 결과가 대시보드에 실시간으로 집약됩니다' },
            ].map((step, i) => (
              <Reveal key={step.n} delay={i * 80}>
                <div className="text-center">
                  <div className="w-14 h-14 bg-[#f5f5f7] rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4">
                    {step.icon}
                  </div>
                  <div className="text-[11px] font-black text-[#c7c7cc] mb-2 tracking-widest">STEP {step.n}</div>
                  <h3 className="text-[15px] font-bold text-[#1d1d1f] mb-2">{step.t}</h3>
                  <p className="text-[13px] text-[#6e6e73] leading-relaxed">{step.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 1인 기업 특화 ───────────────────────────────────── */}
      <section className="py-28 px-6 bg-[#f5f5f7]">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-xl mb-14">
            <div className="pill mb-4">1인 기업 특화</div>
            <h2 className="text-[44px] font-black tracking-[-0.03em] leading-tight text-[#1d1d1f]">
              꼭 필요한 기능만<br />담았습니다.
            </h2>
          </Reveal>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon:'🏛️', t:'정부지원사업 알림', d:'1인 창업자·소상공인 대상 지원 사업을 AI가 자동 탐색합니다' },
              { icon:'📋', t:'세금/세무 가이드', d:'부가세·종합소득세·절세 방법을 회계 AI가 안내합니다' },
              { icon:'📑', t:'계약서 초안 작성', d:'업무 위탁·NDA·서비스 계약서 초안을 AI가 작성합니다' },
              { icon:'📈', t:'비즈니스 분석', d:'매출 트렌드·고객 이탈·마진율을 AI가 분석하고 개선안을 제안합니다' },
              { icon:'🌐', t:'홈페이지 관리', d:'회사 홈페이지 콘텐츠 업데이트와 블로그 포스팅을 대신합니다' },
              { icon:'🔔', t:'일정·마감 관리', d:'세금 신고일·계약 갱신·프로젝트 마감을 추적하고 알림을 보냅니다' },
            ].map((item, i) => (
              <Reveal key={item.t} delay={i * 50}>
                <div className="card-hover bg-white rounded-3xl p-6">
                  <div className="text-2xl mb-3">{item.icon}</div>
                  <h3 className="text-[15px] font-bold text-[#1d1d1f] mb-2">{item.t}</h3>
                  <p className="text-[13px] text-[#6e6e73] leading-relaxed">{item.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 요금제 ──────────────────────────────────────────── */}
      <section id="pricing" className="py-28 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-16">
            <div className="pill mx-auto mb-4">요금제</div>
            <h2 className="text-[44px] font-black tracking-[-0.03em] leading-tight text-[#1d1d1f] mb-3">
              성장에 맞게<br />팀을 늘려가세요.
            </h2>
            <p className="text-[17px] text-[#6e6e73]">무료로 시작, 필요할 때 업그레이드</p>
          </Reveal>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map((plan, i) => (
              <Reveal key={plan.name} delay={i * 70}>
                <div className={`relative rounded-3xl p-6 flex flex-col h-full transition-all duration-200 ${
                  plan.highlight
                    ? 'bg-[#1d1d1f] text-white shadow-2xl shadow-black/20 scale-[1.02]'
                    : 'bg-[#f5f5f7] hover:bg-[#ebebeb]'
                }`}>
                  {(plan as any).badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[11px] font-bold px-3 py-1 rounded-full whitespace-nowrap">
                      {(plan as any).badge}
                    </div>
                  )}
                  <div className="mb-5 mt-1">
                    <h3 className={`text-[16px] font-bold mb-2 ${plan.highlight ? 'text-white' : 'text-[#1d1d1f]'}`}>{plan.name}</h3>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-[30px] font-black tracking-tight ${plan.highlight ? 'text-white' : 'text-[#1d1d1f]'}`}>
                        {plan.price === 0 ? '무료' : `₩${(plan.price/10000).toFixed(0)}만`}
                      </span>
                      {plan.price > 0 && <span className={`text-[13px] ${plan.highlight ? 'text-white/60' : 'text-[#6e6e73]'}`}>/월</span>}
                    </div>
                    <div className={`text-[12px] mt-1.5 ${plan.highlight ? 'text-white/60' : 'text-[#6e6e73]'}`}>
                      AI 직원 <strong className={plan.highlight ? 'text-white' : 'text-[#1d1d1f]'}>{plan.employees}명</strong>
                    </div>
                  </div>
                  <div className="space-y-2 flex-1 mb-6">
                    {plan.features.map(f => (
                      <div key={f} className={`flex items-center gap-2 text-[13px] ${plan.highlight ? 'text-white/80' : 'text-[#6e6e73]'}`}>
                        <svg className={`w-3.5 h-3.5 flex-shrink-0 ${plan.highlight ? 'text-white' : 'text-[#1d1d1f]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        {f}
                      </div>
                    ))}
                  </div>
                  <Link href="/signup" className={`block text-center py-3 rounded-2xl text-[14px] font-semibold transition-all ${
                    plan.highlight
                      ? 'bg-white text-[#1d1d1f] hover:bg-gray-100'
                      : 'bg-[#1d1d1f] text-white hover:bg-[#3d3d3f]'
                  }`}>
                    {plan.cta}
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal className="text-center mt-8">
            <p className="text-[13px] text-[#c7c7cc]">엔터프라이즈 플랜 별도 문의 · 모든 플랜 부가세 별도</p>
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <section id="faq" className="py-28 px-6 bg-[#f5f5f7]">
        <div className="max-w-2xl mx-auto">
          <Reveal className="text-center mb-14">
            <div className="pill mx-auto mb-4">FAQ</div>
            <h2 className="text-[44px] font-black tracking-[-0.03em] text-[#1d1d1f]">자주 묻는 질문</h2>
          </Reveal>
          <div className="space-y-2">
            {FAQS.map((faq, i) => (
              <Reveal key={i} delay={i * 40}>
                <div className={`bg-white rounded-2xl overflow-hidden transition-all ${openFaq===i ? 'shadow-sm' : ''}`}>
                  <button
                    className="w-full text-left px-6 py-4 flex items-center justify-between gap-4"
                    onClick={() => setOpenFaq(openFaq===i ? null : i)}>
                    <span className="text-[15px] font-semibold text-[#1d1d1f]">{faq.q}</span>
                    <div className={`w-6 h-6 rounded-full bg-[#f5f5f7] flex items-center justify-center flex-shrink-0 transition-transform duration-200 ${openFaq===i ? 'rotate-45' : ''}`}>
                      <svg className="w-3 h-3 text-[#1d1d1f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                  </button>
                  {openFaq===i && (
                    <div className="px-6 pb-5 text-[14px] text-[#6e6e73] leading-relaxed border-t border-black/[0.04] pt-4">
                      {faq.a}
                    </div>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section className="py-36 px-6 bg-[#1d1d1f] text-white text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(99,102,241,0.15),transparent)]" />
        <Reveal className="relative max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-full bg-white/[0.08] text-[12px] text-white/60">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full dot-pulse" />
            지금 2,400+ 1인 기업이 사용 중
          </div>
          <h2 className="text-[56px] md:text-[72px] font-black tracking-[-0.04em] leading-[1.02] mb-5">
            지금 시작하세요.
          </h2>
          <p className="text-[17px] text-white/50 mb-12 leading-relaxed">
            무료로 시작해서 성장에 맞게 팀을 늘려가세요.<br />
            신용카드 없이 30초면 됩니다.
          </p>
          <Link href="/signup"
            className="inline-flex items-center gap-2 bg-white text-[#1d1d1f] text-[16px] font-bold px-8 py-4 rounded-full hover:bg-gray-100 transition-all hover:scale-[1.02] active:scale-[0.98]">
            무료로 AI 팀 구성하기
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <p className="text-[12px] text-white/30 mt-5">AI 직원 1명 영구 무료 · 언제든 업그레이드</p>
        </Reveal>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────── */}
      <footer className="bg-[#1d1d1f] border-t border-white/[0.08] py-14 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-5 gap-10 mb-10">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center">
                  <span className="text-[#1d1d1f] text-xs font-black">L</span>
                </div>
                <span className="font-bold text-white">LOOV</span>
              </div>
              <p className="text-[13px] text-white/40 leading-relaxed max-w-xs">
                1인 기업을 위한 AI 직원 플랫폼.<br />
                Leverage · Orchestrate · Own · Venture
              </p>
            </div>
            {[
              { title:'제품', links:['기능 소개','통합 서비스','요금제','API 문서'] },
              { title:'지원', links:['도움말','FAQ','문의하기','커뮤니티'] },
              { title:'회사', links:['소개','블로그','채용','파트너십'] },
            ].map(col => (
              <div key={col.title}>
                <h4 className="text-[13px] font-semibold text-white/60 mb-4">{col.title}</h4>
                <div className="space-y-2.5">
                  {col.links.map(l => (
                    <div key={l} className="text-[13px] text-white/30 hover:text-white/60 cursor-pointer transition-colors">{l}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-white/[0.08] pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <span className="text-[12px] text-white/25">© 2026 LOOV. All rights reserved.</span>
            <div className="flex gap-6">
              {['개인정보처리방침','이용약관'].map(l => (
                <span key={l} className="text-[12px] text-white/25 hover:text-white/50 cursor-pointer transition-colors">{l}</span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
