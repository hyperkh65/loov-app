'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

const AnimalHero3D = dynamic(() => import('@/components/landing/AnimalHero3D'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
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
      transform: visible ? 'translateY(0)' : 'translateY(28px)',
      transition: `opacity 0.65s ease ${delay}ms, transform 0.65s ease ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

// ── 마우스 패럴랙스 훅 ──────────────────────────────────────────────────────
function useMouseParallax() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      setPos({ x: (e.clientX - cx) / cx, y: (e.clientY - cy) / cy });
    };
    window.addEventListener('mousemove', fn);
    return () => window.removeEventListener('mousemove', fn);
  }, []);
  return pos;
}

const EMPLOYEES = [
  { icon: '📊', dept: '영업팀', color: '#6366F1', tasks: ['리드 발굴', '제안서 작성', 'CRM 관리', '계약 협상', '영업 분석'] },
  { icon: '💰', dept: '회계팀', color: '#10B981', tasks: ['매출 정리', '세무 신고 준비', '인보이스 발행', '손익 분석', '예산 관리'] },
  { icon: '📣', dept: '마케팅', color: '#F59E0B', tasks: ['SNS 콘텐츠', '블로그 포스팅', '광고 기획', '캠페인 분석', '뉴스레터'] },
  { icon: '💻', dept: '개발팀', color: '#8B5CF6', tasks: ['코드 리뷰', 'API 설계', '자동화 구축', '기술 문서', 'UI 제작'] },
  { icon: '🎨', dept: '디자인', color: '#EC4899', tasks: ['홍보물 기획', 'UI/UX 가이드', '브랜드 전략', '제품 시각화', '영상 기획'] },
  { icon: '🤝', dept: 'HR팀', color: '#F97316', tasks: ['채용 공고', '성과 평가', '조직 문화', '온보딩', '급여 명세'] },
];

const INTEGRATIONS = [
  { icon: '📝', name: '네이버 블로그', desc: 'SEO 최적화 자동 발행', color: '#03C75A', bg: '#EDFFF4' },
  { icon: '📸', name: 'Instagram', desc: '피드·릴스·스토리 자동화', color: '#E1306C', bg: '#FFF0F5' },
  { icon: '▶', name: 'YouTube', desc: '쇼츠·설명 자동 생성', color: '#FF0000', bg: '#FFF0F0' },
  { icon: '🌐', name: 'WordPress', desc: 'AI 블로그 완전 자동화', color: '#21759B', bg: '#EFF8FF' },
  { icon: '📅', name: 'Google Calendar', desc: '일정 양방향 동기화', color: '#4285F4', bg: '#EFF5FF' },
  { icon: '📓', name: 'Notion', desc: '문서·데이터베이스 연동', color: '#5B5BD6', bg: '#F0EFFF' },
  { icon: '🛒', name: 'Coupang', desc: '제휴 상품 자동 포스팅', color: '#FF6B35', bg: '#FFF4EF' },
  { icon: '⚙️', name: 'n8n', desc: '워크플로우 자동화', color: '#EA4B71', bg: '#FFF0F3' },
];

const PLANS = [
  { name: '무료', price: 0, employees: 1, features: ['AI 직원 1명', '기본 채팅', '프로젝트 관리', '7일 히스토리'], cta: '무료로 시작', color: '#6366F1' },
  { name: '베이직', price: 29000, employees: 3, features: ['AI 직원 3명', '영업 ERP', '회계 기본', '30일 히스토리', '스케줄 관리'], cta: '시작하기', color: '#10B981' },
  { name: '스타터', price: 59000, employees: 5, highlight: true, badge: '가장 인기', features: ['AI 직원 5명', '전체 ERP', '마케팅 허브', 'SNS 관리', '90일 히스토리'], cta: '시작하기', color: '#6366F1' },
  { name: '프로', price: 99000, employees: 10, features: ['AI 직원 10명', '직원별 AI 설정', '홈페이지 빌더', 'Obsidian 백업', '무제한 히스토리'], cta: '시작하기', color: '#8B5CF6' },
];

const FAQS = [
  { q: 'AI 직원이 실제로 업무를 처리할 수 있나요?', a: 'Claude, Gemini, GPT-4o 등 최신 AI 모델을 탑재한 AI 직원이 영업 제안서 작성, 회계 분류, SNS 콘텐츠 생성 등 실제 업무를 수행합니다.' },
  { q: '네이버 블로그·SNS 자동화는 어떻게 작동하나요?', a: 'Playwright 기반 로컬 에이전트가 실제 브라우저를 제어해 네이버 블로그에 글을 발행합니다. Instagram, YouTube는 공식 API로 자동 업로드됩니다.' },
  { q: 'API 키는 어떻게 설정하나요?', a: '설정 → AI 설정 메뉴에서 Claude, Gemini, GPT API 키를 입력합니다. 전체 직원 일괄 적용 또는 직원별 개별 설정이 가능합니다.' },
  { q: '나중에 플랜을 변경할 수 있나요?', a: '언제든지 업그레이드하거나 다운그레이드할 수 있습니다. 업그레이드 즉시 추가 직원 채용이 가능합니다.' },
];

// ── 데모 영상 모달 ────────────────────────────────────────────────────────────
function VideoModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', fn); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div className="relative w-full max-w-4xl aspect-video rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* 로컬 video 파일 우선, 없으면 YouTube 대체 */}
        <video
          className="w-full h-full object-cover"
          controls
          autoPlay
          src="/demo.mp4"
          onError={(e) => {
            // 로컬 파일 없으면 YouTube로 대체
            const target = e.currentTarget;
            const parent = target.parentElement;
            if (parent) {
              const iframe = document.createElement('iframe');
              iframe.src = 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1';
              iframe.className = 'w-full h-full';
              iframe.allow = 'autoplay; fullscreen';
              iframe.allowFullscreen = true;
              parent.replaceChild(iframe, target);
            }
          }}
        />
        <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors text-lg font-bold">×</button>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const typed = useTypewriter(['영업 팀장', '회계 담당자', '마케터', 'AI 팀 전체']);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);
  const [videoOpen, setVideoOpen] = useState(false);
  const [hoveredEmployee, setHoveredEmployee] = useState<number | null>(null);
  const mouse = useMouseParallax();

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const FEATURES = [
    {
      tab: '💬 AI 채팅',
      title: '대화 한 줄이 업무가 됩니다',
      desc: '"이번 주 제안서 3건 작성해줘" → 즉시 실행. AI 팀장이 명확하게 이해하고 결과를 만들어냅니다.',
      items: ['자연어 업무 지시', '컨텍스트 기억', '멀티 직원 협업', '작업 이력 관리'],
      color: '#6366F1', bg: 'from-indigo-50 to-violet-50',
      preview: (
        <div className="space-y-3">
          <div className="flex justify-end"><div className="bg-indigo-600 text-white text-sm px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-xs">이번 주 인스타그램 콘텐츠 3개 준비해줘</div></div>
          <div className="flex gap-2 items-end"><div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center text-sm flex-shrink-0">🐇</div><div className="bg-white border border-gray-100 text-sm px-4 py-2.5 rounded-2xl rounded-tl-sm max-w-xs shadow-sm">피드·스토리·릴스 각 1편 준비했습니다. 캡션과 해시태그 포함해서 검토해주세요 ✅</div></div>
          <div className="flex gap-2 items-end"><div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm flex-shrink-0">🦊</div><div className="bg-white border border-gray-100 text-sm px-4 py-2.5 rounded-2xl rounded-tl-sm max-w-xs shadow-sm">제안서도 같이 보냈습니다. 오늘 마감이라 먼저 처리했어요 ✓</div></div>
          <div className="flex items-center gap-2 mt-2 pl-10"><div className="flex gap-1">{[0,1,2].map(i=><div key={i} className="w-2 h-2 rounded-full bg-indigo-300" style={{animation:`bounce 1.2s ${i*0.15}s ease-in-out infinite`}} />)}</div><span className="text-xs text-gray-400">Bear 담당 작성 중...</span></div>
        </div>
      ),
    },
    {
      tab: '📊 ERP',
      title: 'AI가 운영하는 ERP',
      desc: '영업 파이프라인, 회계 장부, 마케팅 캘린더. AI 팀이 대표의 지시에 따라 직접 운영합니다.',
      items: ['영업 파이프라인 관리', '실시간 손익 분석', 'SNS 캘린더 운영', '인보이스 자동 발행'],
      color: '#10B981', bg: 'from-emerald-50 to-teal-50',
      preview: (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[{l:'이번달 매출',v:'₩4,250만',c:'#10B981'},{l:'진행중 리드',v:'23건',c:'#6366F1'},{l:'SNS 노출',v:'14.2만',c:'#F59E0B'}].map(s=>(
              <div key={s.l} className="bg-white rounded-xl p-2.5 border border-gray-100 shadow-sm">
                <div className="text-[9px] text-gray-400 mb-1">{s.l}</div>
                <div className="text-sm font-black" style={{color:s.c}}>{s.v}</div>
              </div>
            ))}
          </div>
          {[{n:'Fox 팀장',s:'제안서 작성 중',c:'#6366F1',p:65},{n:'Bear 담당',s:'결산 완료',c:'#10B981',p:100},{n:'Rabbit',s:'SNS 3건 예약',c:'#F59E0B',p:100}].map(e=>(
            <div key={e.n} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-gray-100 shadow-sm">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:e.c}} />
              <span className="text-xs font-semibold text-gray-800 w-14 flex-shrink-0">{e.n}</span>
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{width:`${e.p}%`,background:e.c}} /></div>
              <span className="text-[10px] text-gray-400 w-20 truncate flex-shrink-0">{e.s}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      tab: '🌐 SNS 자동화',
      title: '모든 채널 동시 발행',
      desc: '네이버 블로그·인스타·유튜브·워드프레스까지. 한 번 지시하면 모든 채널에 맞게 자동 변환 발행합니다.',
      items: ['멀티 채널 동시 발행', '플랫폼별 최적화', '예약 발행', '성과 트래킹'],
      color: '#F59E0B', bg: 'from-amber-50 to-orange-50',
      preview: (
        <div className="space-y-2">
          {[
            {icon:'📝',name:'네이버 블로그',status:'발행 완료',time:'방금 전',c:'#03C75A'},
            {icon:'📸',name:'Instagram',status:'예약됨 (오후 7시)',time:'3시간 후',c:'#E1306C'},
            {icon:'▶',name:'YouTube Shorts',status:'업로드 중...',time:'진행 중',c:'#FF0000'},
            {icon:'🌐',name:'WordPress',status:'발행 완료',time:'5분 전',c:'#21759B'},
          ].map(ch=>(
            <div key={ch.name} className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 border border-gray-100 shadow-sm">
              <span className="text-xl">{ch.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-800">{ch.name}</div>
                <div className="text-[10px] text-gray-400">{ch.status}</div>
              </div>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:ch.c,boxShadow:`0 0 6px ${ch.c}80`}} />
            </div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="bg-white text-gray-900 overflow-x-hidden selection:bg-indigo-100">
      {videoOpen && <VideoModal onClose={() => setVideoOpen(false)} />}

      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes marquee { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes float { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-12px)} }
        @keyframes floatSlow { 0%,100%{transform:translateY(0px) rotate(0deg)} 50%{transform:translateY(-8px) rotate(2deg)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes gradientShift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes scanBeam { 0%{opacity:0;top:0} 10%{opacity:1} 90%{opacity:0.3} 100%{top:100%;opacity:0} }
        @keyframes ripple { 0%{transform:scale(0.8);opacity:1} 100%{transform:scale(2.4);opacity:0} }
        @keyframes badgePop { 0%{opacity:0;transform:scale(0.8) translateY(-10px)} 100%{opacity:1;transform:scale(1) translateY(0)} }

        .fade-up { animation: fadeUp 0.7s ease both; }
        .fade-up-1 { animation: fadeUp 0.7s 0.1s ease both; }
        .fade-up-2 { animation: fadeUp 0.7s 0.2s ease both; }
        .fade-up-3 { animation: fadeUp 0.7s 0.35s ease both; }

        .gradient-text {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 30%, #ec4899 60%, #f59e0b 100%);
          background-size: 200% auto;
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
          animation: shimmer 4s linear infinite;
        }

        .hero-gradient {
          background: linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 30%, #FCE7F3 60%, #FFF7ED 100%);
          background-size: 400% 400%;
          animation: gradientShift 12s ease infinite;
        }

        .card-3d {
          transition: transform 0.3s ease, box-shadow 0.3s ease;
          transform-style: preserve-3d;
        }
        .card-3d:hover {
          transform: translateY(-6px) rotateX(3deg);
          box-shadow: 0 20px 60px rgba(99,102,241,0.15);
        }

        .btn-glow {
          position: relative;
          background: linear-gradient(135deg, #6366f1, #8b5cf6, #ec4899);
          background-size: 200% 200%;
          animation: gradientShift 4s ease infinite;
          box-shadow: 0 4px 20px rgba(99,102,241,0.4);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn-glow:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 8px 30px rgba(99,102,241,0.5);
        }
        .btn-glow:active { transform: scale(0.98); }

        .ripple-ring {
          animation: ripple 2s ease-out infinite;
        }
        .ripple-ring-2 {
          animation: ripple 2s 0.7s ease-out infinite;
        }

        .dot-pulse { animation: pulse 2s ease-in-out infinite; }
        .float-1 { animation: float 4s ease-in-out infinite; }
        .float-2 { animation: floatSlow 5s 0.5s ease-in-out infinite; }
        .float-3 { animation: float 3.5s 1s ease-in-out infinite; }

        .badge-pop { animation: badgePop 0.5s 0.3s cubic-bezier(0.34,1.56,0.64,1) both; }

        .feature-tab {
          transition: all 0.25s ease;
          white-space: nowrap;
        }

        .integration-card {
          transition: all 0.2s ease;
        }
        .integration-card:hover {
          transform: translateY(-4px) scale(1.02);
        }

        .video-play-btn {
          transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s ease;
        }
        .video-play-btn:hover {
          transform: scale(1.12);
          box-shadow: 0 0 0 12px rgba(99,102,241,0.15), 0 20px 60px rgba(99,102,241,0.3);
        }
      `}</style>

      {/* ── NAV ─────────────────────────────────────────────── */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/90 backdrop-blur-2xl border-b border-gray-100 shadow-sm' : 'bg-transparent'}`}>
        <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-sm"
              style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>L</div>
            <span className="font-black text-[16px] tracking-tight text-gray-900">LOOV</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            {[['#features','기능'],['#demo','데모'],['#integrations','연동'],['#pricing','요금제'],['#faq','FAQ']].map(([h,l]) => (
              <a key={h} href={h} className="text-[13px] text-gray-500 hover:text-gray-900 transition-colors font-medium relative group">
                {l}
                <span className="absolute -bottom-0.5 left-0 w-0 h-0.5 rounded-full group-hover:w-full transition-all duration-300" style={{background:'linear-gradient(90deg,#6366f1,#8b5cf6)'}} />
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="text-[13px] text-gray-500 hover:text-gray-900 transition-colors px-3 py-2 font-medium">로그인</Link>
            <Link href="/signup" className="btn-glow text-[13px] text-white px-5 py-2.5 rounded-full font-bold">
              무료 시작 →
            </Link>
          </div>
        </nav>
      </header>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-16 overflow-hidden hero-gradient">
        {/* 패럴랙스 배경 오브 */}
        <div className="absolute top-1/4 left-1/5 w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)',
            transform: `translate(${mouse.x * -20}px, ${mouse.y * -20}px)`,
            transition: 'transform 0.1s ease-out',
          }} />
        <div className="absolute bottom-1/3 right-1/5 w-[350px] h-[350px] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(236,72,153,0.14) 0%, transparent 70%)',
            transform: `translate(${mouse.x * 25}px, ${mouse.y * 25}px)`,
            transition: 'transform 0.1s ease-out',
          }} />
        <div className="absolute top-1/2 right-1/4 w-[250px] h-[250px] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 70%)',
            transform: `translate(${mouse.x * 15}px, ${mouse.y * -15}px)`,
            transition: 'transform 0.1s ease-out',
          }} />

        {/* 그리드 패턴 */}
        <div className="absolute inset-0 pointer-events-none opacity-40" style={{
          backgroundImage: 'linear-gradient(rgba(99,102,241,0.07) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.07) 1px,transparent 1px)',
          backgroundSize: '60px 60px',
        }} />

        <div className="relative w-full max-w-6xl mx-auto grid lg:grid-cols-[1.15fr_0.85fr] gap-10 items-center py-20">
          {/* 텍스트 */}
          <div>
            {/* 배지 */}
            <div className="badge-pop inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-full bg-white/80 backdrop-blur border border-indigo-100 shadow-sm">
              <span className="w-2 h-2 bg-green-400 rounded-full dot-pulse" />
              <span className="text-[12px] font-semibold text-indigo-700">🚀 AI 직원 플랫폼 LOOV</span>
              <span className="text-[11px] text-gray-400 hidden sm:inline">2,400+ 1인 기업 사용 중</span>
            </div>

            <h1 className="text-[58px] md:text-[82px] font-black leading-[1.0] tracking-[-0.04em] text-gray-900 mb-5 fade-up">
              <span className="block">혼자서도</span>
              <span className="block gradient-text">팀처럼.</span>
            </h1>

            <div className="h-9 mb-6 fade-up-1">
              <p className="text-lg md:text-xl text-gray-500 font-medium">
                지금 바로{' '}
                <span className="text-gray-900 font-bold">
                  {typed}
                  <span className="text-indigo-500 animate-pulse ml-0.5">|</span>
                </span>
                을 고용하세요
              </p>
            </div>

            <p className="fade-up-2 text-[16px] md:text-[17px] text-gray-500 leading-relaxed mb-10 max-w-md">
              AI 직원이 영업·회계·마케팅을 대신합니다.<br />
              Claude, Gemini, GPT-4o 중 원하는 AI로<br />당신만의 팀을 구성하세요.
            </p>

            <div className="fade-up-3 flex flex-wrap items-center gap-3 mb-14">
              <Link href="/signup" className="btn-glow inline-flex items-center gap-2 text-white text-[15px] font-bold px-8 py-4 rounded-full">
                무료로 시작하기
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </Link>
              <button
                onClick={() => setVideoOpen(true)}
                className="inline-flex items-center gap-2.5 text-[14px] font-semibold text-gray-700 hover:text-indigo-600 bg-white/70 hover:bg-white border border-gray-200 px-5 py-4 rounded-full transition-all backdrop-blur"
              >
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs" style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>▶</span>
                데모 영상 보기
              </button>
            </div>

            {/* 통계 */}
            <div className="flex items-center gap-8 fade-up-3">
              {[{ v: '2,400+', l: '사용 중인 1인 기업' },{ v: '97%', l: '업무 완료율' },{ v: '3×', l: '생산성 향상' }].map((s, i) => (
                <div key={s.l}>
                  <div className="text-xl md:text-2xl font-black text-gray-900 tracking-tight"
                    style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
                    {s.v}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 3D 캐릭터 + UI */}
          <div className="relative h-[300px] lg:h-[420px]">
            <div className="absolute inset-0 rounded-3xl overflow-hidden border border-white/60 shadow-2xl shadow-indigo-100/50 float-1"
              style={{background:'linear-gradient(135deg,rgba(255,255,255,0.8),rgba(239,246,255,0.8))',backdropFilter:'blur(8px)'}}>
              <AnimalHero3D />
            </div>

            {/* 플로팅 카드 */}
            <div className="float-2 absolute -top-5 -left-8 bg-white border border-indigo-100 rounded-2xl px-4 py-3 shadow-xl hidden lg:block"
              style={{boxShadow:'0 8px 30px rgba(99,102,241,0.15)'}}>
              <div className="text-[10px] text-gray-400 mb-1">Fox 팀장 · 영업</div>
              <div className="text-[13px] font-bold text-gray-900">제안서 3건 완료 ✓</div>
              <div className="flex items-center gap-1 mt-1.5">
                {[0,1,2].map(i=><span key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-400" style={{animation:`bounce 1.2s ${i*0.15}s ease-in-out infinite`}} />)}
                <span className="text-[10px] text-gray-400 ml-1">처리 중</span>
              </div>
            </div>

            <div className="float-3 absolute -bottom-5 -right-6 bg-white border border-pink-100 rounded-2xl px-4 py-3 shadow-xl hidden lg:block"
              style={{boxShadow:'0 8px 30px rgba(236,72,153,0.12)'}}>
              <div className="text-[10px] text-gray-400 mb-1">Rabbit · 마케팅</div>
              <div className="text-[13px] font-bold text-gray-900">SNS 예약 완료 ✓</div>
              <div className="flex items-center gap-1.5 mt-2">
                {['#6366f1','#ec4899','#ef4444'].map((c,i) => (
                  <div key={i} className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold"
                    style={{background:c,color:'white'}}>
                    {['IG','YT','📝'][i]}
                  </div>
                ))}
              </div>
            </div>

            <div className="float-1 absolute top-1/2 -right-12 -translate-y-1/2 bg-white border border-violet-100 rounded-2xl px-3 py-3 shadow-xl hidden lg:flex flex-col gap-2"
              style={{boxShadow:'0 8px 30px rgba(139,92,246,0.12)'}}>
              {[{name:'Claude',c:'#FF6B35'},{name:'Gemini',c:'#4285F4'},{name:'GPT-4o',c:'#10a37f'}].map(ai => (
                <div key={ai.name} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full dot-pulse" style={{background:ai.c}} />
                  <span className="text-[10px] text-gray-500 font-mono">{ai.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 스크롤 인디케이터 */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 fade-up-3">
          <span className="text-[10px] text-gray-400 tracking-widest uppercase">Scroll</span>
          <div className="w-5 h-8 border-2 border-gray-300 rounded-full flex items-start justify-center pt-1">
            <div className="w-1 h-2 bg-gray-400 rounded-full" style={{animation:'bounce 1.5s ease-in-out infinite'}} />
          </div>
        </div>
      </section>

      {/* ── 마퀴 ─────────────────────────────────────────────── */}
      <div className="border-y border-gray-100 py-3.5 overflow-hidden bg-gradient-to-r from-indigo-50 via-white to-purple-50">
        <div className="flex gap-0 whitespace-nowrap" style={{ animation: 'marquee 30s linear infinite' }}>
          {[...Array(2)].flatMap(() =>
            ['네이버 블로그', 'Instagram', 'YouTube', 'WordPress', 'Google Calendar', 'Notion', 'Coupang', 'n8n', 'Claude AI', 'Gemini', 'GPT-4o', '영업 ERP', '회계 장부', 'SNS 자동화'].map((item, i) => (
              <span key={`${item}-${i}`} className="inline-flex items-center gap-2 px-6 text-[12px] text-gray-500 font-medium">
                <span className="w-1 h-1 bg-indigo-300 rounded-full" />
                {item}
              </span>
            ))
          )}
        </div>
      </div>

      {/* ── 데모 영상 섹션 ───────────────────────────────────── */}
      <section id="demo" className="py-28 px-6" style={{background:'linear-gradient(135deg,#EEF2FF 0%,#F5F3FF 50%,#FCE7F3 100%)'}}>
        <div className="max-w-5xl mx-auto">
          <Reveal className="text-center mb-14">
            <div className="inline-flex items-center gap-2 mb-5 px-4 py-2 rounded-full bg-white/80 border border-indigo-100 shadow-sm text-[12px] font-semibold text-indigo-700">
              ▶ 실제 데모
            </div>
            <h2 className="text-[44px] font-black tracking-[-0.03em] leading-tight text-gray-900 mb-4">
              직접 보세요.<br />
              <span className="gradient-text">2분이면 충분합니다.</span>
            </h2>
            <p className="text-[17px] text-gray-500">
              AI 직원이 실제로 업무를 처리하는 과정을 확인하세요.
            </p>
          </Reveal>

          <Reveal delay={100}>
            <div
              className="relative rounded-3xl overflow-hidden cursor-pointer group"
              style={{
                background: 'linear-gradient(135deg, #1e1b4b, #312e81, #4c1d95)',
                boxShadow: '0 30px 80px rgba(99,102,241,0.3), 0 0 0 1px rgba(255,255,255,0.1)',
                aspectRatio: '16/9',
              }}
              onClick={() => setVideoOpen(true)}
            >
              {/* 배경 그라디언트 효과 */}
              <div className="absolute inset-0 opacity-50"
                style={{background:'radial-gradient(ellipse at 30% 40%, rgba(139,92,246,0.6), transparent 60%), radial-gradient(ellipse at 70% 60%, rgba(236,72,153,0.4), transparent 60%)'}} />

              {/* 그리드 패턴 */}
              <div className="absolute inset-0 opacity-20" style={{
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.1) 1px,transparent 1px)',
                backgroundSize: '40px 40px',
              }} />

              {/* 스캔 빔 */}
              <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent"
                style={{animation:'scanBeam 4s linear infinite', top:0}} />

              {/* 대시보드 미리보기 UI */}
              <div className="absolute inset-6 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden">
                <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/10">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400 opacity-70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 opacity-70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400 opacity-70" />
                  <div className="flex-1 h-5 bg-white/10 rounded ml-2 max-w-xs text-[10px] text-white/40 flex items-center px-2">app.loov.co.kr/dashboard</div>
                </div>
                <div className="grid grid-cols-4 gap-0 h-full">
                  <div className="border-r border-white/10 p-3 space-y-2">
                    {['🏠','💬','📊','💰','📣','👥'].map((ic,i)=>(<div key={i} className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-sm">{ic}</div>))}
                  </div>
                  <div className="col-span-3 p-4">
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {['₩4,250만','23건','14.2만'].map((v,i)=>(
                        <div key={i} className="bg-white/10 rounded-xl p-2">
                          <div className="text-[9px] text-white/40 mb-1">{['매출','리드','노출'][i]}</div>
                          <div className="text-sm font-black text-white">{v}</div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      {['Fox 팀장 · 제안서 작성 중...','Bear 담당 · 결산 완료 ✓','Rabbit · SNS 3건 예약 ✓'].map((t,i)=>(
                        <div key={i} className="bg-white/10 rounded-lg px-3 py-2 text-[10px] text-white/60">{t}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 재생 버튼 */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-white/20 ripple-ring" />
                  <div className="absolute inset-0 rounded-full bg-white/10 ripple-ring-2" />
                  <button className="video-play-btn relative w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-2xl"
                    style={{boxShadow:'0 0 0 0 rgba(255,255,255,0.4), 0 20px 40px rgba(0,0,0,0.4)'}}>
                    <svg className="w-8 h-8 text-indigo-600 ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* 호버 오버레이 */}
              <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors duration-300" />

              {/* 하단 레이블 */}
              <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                <div className="bg-white/10 backdrop-blur border border-white/20 rounded-full px-5 py-2 text-[12px] text-white/80 font-medium">
                  클릭해서 데모 영상 재생 · 2:34
                </div>
              </div>
            </div>
          </Reveal>

          {/* 영상 하이라이트 */}
          <div className="grid grid-cols-3 gap-4 mt-8">
            {[
              { icon: '💬', title: '채팅으로 업무 지시', desc: '0:15부터' },
              { icon: '📊', title: 'ERP 자동 운영', desc: '0:52부터' },
              { icon: '🌐', title: 'SNS 자동 발행', desc: '1:30부터' },
            ].map((h, i) => (
              <Reveal key={h.title} delay={i * 80}>
                <button
                  onClick={() => setVideoOpen(true)}
                  className="w-full bg-white/80 hover:bg-white border border-white shadow-sm hover:shadow-md rounded-2xl p-4 text-left transition-all group"
                >
                  <div className="text-2xl mb-2">{h.icon}</div>
                  <div className="text-[13px] font-bold text-gray-900 mb-0.5 group-hover:text-indigo-600 transition-colors">{h.title}</div>
                  <div className="text-[11px] text-gray-400">{h.desc}</div>
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 인터랙티브 기능 탭 ──────────────────────────────── */}
      <section id="features" className="py-28 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-14">
            <div className="inline-flex items-center gap-2 mb-5 px-4 py-2 rounded-full bg-indigo-50 border border-indigo-100 text-[12px] font-semibold text-indigo-700">AI 직원 기능</div>
            <h2 className="text-[44px] font-black tracking-[-0.03em] leading-tight text-gray-900 mb-4">
              필요한 모든 기능이<br />하나에.
            </h2>
          </Reveal>

          {/* 탭 */}
          <div className="flex gap-2 justify-center mb-10 overflow-x-auto pb-2">
            {FEATURES.map((f, i) => (
              <button key={i} onClick={() => setActiveFeature(i)} className={`feature-tab px-5 py-2.5 rounded-full text-[13px] font-semibold border ${
                activeFeature === i
                  ? 'text-white border-transparent shadow-lg'
                  : 'text-gray-500 bg-gray-50 border-gray-100 hover:bg-gray-100'
              }`} style={activeFeature === i ? {background:`linear-gradient(135deg,${FEATURES[i].color},${FEATURES[i].color}cc)`,boxShadow:`0 4px 20px ${FEATURES[i].color}40`} : {}}>
                {f.tab}
              </button>
            ))}
          </div>

          {/* 탭 콘텐츠 */}
          <div className="grid lg:grid-cols-2 gap-8 items-center" key={activeFeature}>
            <div style={{animation:'fadeUp 0.4s ease both'}}>
              <h3 className="text-[30px] font-black text-gray-900 mb-3 leading-tight">{FEATURES[activeFeature].title}</h3>
              <p className="text-[16px] text-gray-500 leading-relaxed mb-6">{FEATURES[activeFeature].desc}</p>
              <div className="space-y-3 mb-8">
                {FEATURES[activeFeature].items.map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{background:`${FEATURES[activeFeature].color}20`}}>
                      <svg className="w-3 h-3" fill="none" stroke={FEATURES[activeFeature].color} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <span className="text-[14px] text-gray-700 font-medium">{item}</span>
                  </div>
                ))}
              </div>
              <Link href="/signup" className="inline-flex items-center gap-2 font-semibold text-[14px] px-6 py-3 rounded-full text-white transition-all hover:opacity-90"
                style={{background:`linear-gradient(135deg,${FEATURES[activeFeature].color},${FEATURES[activeFeature].color}cc)`}}>
                지금 사용해보기 →
              </Link>
            </div>

            <div className={`bg-gradient-to-br ${FEATURES[activeFeature].bg} rounded-3xl p-6 border border-white shadow-xl`}
              style={{animation:'fadeUp 0.4s 0.1s ease both', boxShadow:`0 20px 60px ${FEATURES[activeFeature].color}15`}}>
              {FEATURES[activeFeature].preview}
            </div>
          </div>
        </div>
      </section>

      {/* ── AI 직원 카드 ─────────────────────────────────────── */}
      <section className="py-24 px-6" style={{background:'linear-gradient(180deg,#F9FAFB 0%,#F3F4F6 100%)'}}>
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-14">
            <div className="inline-flex items-center gap-2 mb-5 px-4 py-2 rounded-full bg-white border border-gray-100 shadow-sm text-[12px] font-semibold text-gray-600">AI 직원 라인업</div>
            <h2 className="text-[44px] font-black tracking-[-0.03em] leading-tight text-gray-900 mb-4">
              필요한 팀원만<br />골라서 채용하세요.
            </h2>
          </Reveal>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {EMPLOYEES.map((emp, i) => (
              <Reveal key={emp.dept} delay={i * 60}>
                <div
                  className="card-3d bg-white rounded-3xl p-6 cursor-default border border-gray-100"
                  onMouseEnter={() => setHoveredEmployee(i)}
                  onMouseLeave={() => setHoveredEmployee(null)}
                  style={{boxShadow: hoveredEmployee === i ? `0 20px 60px ${emp.color}20` : '0 2px 12px rgba(0,0,0,0.04)'}}
                >
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-4 transition-transform duration-300"
                    style={{ background: `${emp.color}15`, transform: hoveredEmployee === i ? 'scale(1.1) rotate(-5deg)' : 'none' }}>
                    {emp.icon}
                  </div>
                  <h3 className="text-[17px] font-bold text-gray-900 mb-3">{emp.dept}</h3>
                  <div className="space-y-1.5 mb-4">
                    {emp.tasks.map(t => (
                      <div key={t} className="flex items-center gap-2 text-[13px] text-gray-500">
                        <div className="w-1 h-1 rounded-full flex-shrink-0" style={{background:emp.color}} />
                        {t}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1.5 pt-3 border-t border-gray-50">
                    {['Claude','Gemini','GPT-4o'].map(ai => (
                      <span key={ai} className="text-[10px] px-2 py-0.5 bg-gray-50 rounded-full text-gray-500 border border-gray-100">{ai}</span>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 통합 서비스 ──────────────────────────────────────── */}
      <section id="integrations" className="py-28 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-16">
            <div className="inline-flex items-center gap-2 mb-5 px-4 py-2 rounded-full bg-purple-50 border border-purple-100 text-[12px] font-semibold text-purple-700">통합 서비스</div>
            <h2 className="text-[44px] font-black tracking-[-0.03em] leading-tight text-gray-900 mb-4">모든 채널을<br />하나로.</h2>
          </Reveal>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
            {INTEGRATIONS.map((intg, i) => (
              <Reveal key={intg.name} delay={i * 50}>
                <div className="integration-card rounded-3xl p-5 cursor-default border border-gray-50"
                  style={{background:`linear-gradient(135deg,${intg.bg},white)`, boxShadow:'0 2px 12px rgba(0,0,0,0.04)'}}>
                  <div className="text-2xl mb-3">{intg.icon}</div>
                  <div className="text-[15px] font-bold text-gray-900 mb-1">{intg.name}</div>
                  <div className="text-[12px] text-gray-500 mb-3">{intg.desc}</div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{background:intg.color}} />
                    <span className="text-[11px] text-gray-400">연동 가능</span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────── */}
      <section className="py-28 px-6" style={{background:'linear-gradient(135deg,#EEF2FF 0%,#F0FDFB 100%)'}}>
        <div className="max-w-4xl mx-auto">
          <Reveal className="text-center mb-16">
            <div className="inline-flex items-center gap-2 mb-5 px-4 py-2 rounded-full bg-white/80 border border-indigo-100 text-[12px] font-semibold text-indigo-700">시작하기</div>
            <h2 className="text-[44px] font-black tracking-[-0.03em] text-gray-900">4단계면 충분합니다.</h2>
          </Reveal>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { n:'1', icon:'🏢', t:'회사 등록', d:'회사 정보와 목표를 입력하면 AI가 최적의 팀 구성을 추천합니다', c:'#6366F1' },
              { n:'2', icon:'👤', t:'직원 채용', d:'영업·회계·마케팅 등 필요한 부서의 AI 직원을 채용하세요', c:'#8B5CF6' },
              { n:'3', icon:'💬', t:'지시 내리기', d:'채팅으로 업무를 지시하면 AI 직원이 즉시 수행합니다', c:'#EC4899' },
              { n:'4', icon:'📈', t:'결과 확인', d:'모든 업무 결과가 대시보드에 실시간으로 집약됩니다', c:'#10B981' },
            ].map((step, i) => (
              <Reveal key={step.n} delay={i * 80}>
                <div className="text-center">
                  <div className="relative w-14 h-14 mx-auto mb-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                      style={{background:`${step.c}15`}}>
                      {step.icon}
                    </div>
                    <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white"
                      style={{background:step.c}}>{step.n}</div>
                  </div>
                  <h3 className="text-[15px] font-bold text-gray-900 mb-2">{step.t}</h3>
                  <p className="text-[13px] text-gray-500 leading-relaxed">{step.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI 모델 ──────────────────────────────────────────── */}
      <section className="py-28 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-16">
            <div className="inline-flex items-center gap-2 mb-5 px-4 py-2 rounded-full bg-orange-50 border border-orange-100 text-[12px] font-semibold text-orange-700">AI 모델 선택</div>
            <h2 className="text-[44px] font-black tracking-[-0.03em] text-gray-900 mb-4">원하는 AI로<br />팀을 구성하세요.</h2>
            <p className="text-[17px] text-gray-500">API 키 하나면 됩니다. 직원별로 다른 AI를 배치할 수 있습니다.</p>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {[
              { name:'Claude', sub:'by Anthropic', icon:'🧠', badge:'추천', feats:['뛰어난 추론 능력','긴 컨텍스트','한국어 최적화','안전한 응답'], accent:'#FF6B35', bg:'from-orange-50 to-red-50' },
              { name:'Gemini', sub:'by Google', icon:'💎', badge:'', feats:['멀티모달 지원','실시간 검색','이미지 분석','빠른 응답'], accent:'#4285F4', bg:'from-blue-50 to-indigo-50' },
              { name:'GPT-4o', sub:'by OpenAI', icon:'⚡', badge:'', feats:['코드 생성 특화','범용 업무','정밀한 지시','플러그인'], accent:'#10a37f', bg:'from-emerald-50 to-teal-50' },
            ].map((ai, i) => (
              <Reveal key={ai.name} delay={i * 80}>
                <div className={`relative bg-gradient-to-br ${ai.bg} rounded-3xl p-6 card-3d border border-white`}>
                  {ai.badge && (
                    <span className="absolute top-5 right-5 text-[11px] font-bold px-2.5 py-1 rounded-full text-white"
                      style={{background:ai.accent}}>{ai.badge}</span>
                  )}
                  <div className="text-3xl mb-4">{ai.icon}</div>
                  <div className="text-[18px] font-black text-gray-900 mb-0.5">{ai.name}</div>
                  <div className="text-[12px] text-gray-400 mb-5">{ai.sub}</div>
                  <div className="space-y-2 mb-5">
                    {ai.feats.map(f => (
                      <div key={f} className="flex items-center gap-2 text-[13px] text-gray-600">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ai.accent }} />
                        {f}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between bg-white/70 rounded-xl px-3 py-2.5 border border-white">
                    <span className="text-[11px] text-gray-400 font-mono">API Key: ••••••</span>
                    <span className="text-[11px] font-semibold text-green-500">연결됨</span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 요금제 ───────────────────────────────────────────── */}
      <section id="pricing" className="py-28 px-6" style={{background:'linear-gradient(180deg,#F3F4F6 0%,#EEF2FF 100%)'}}>
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-16">
            <div className="inline-flex items-center gap-2 mb-5 px-4 py-2 rounded-full bg-white border border-indigo-100 shadow-sm text-[12px] font-semibold text-indigo-700">요금제</div>
            <h2 className="text-[44px] font-black tracking-[-0.03em] text-gray-900 mb-3">성장에 맞게<br />팀을 늘려가세요.</h2>
            <p className="text-[17px] text-gray-500">무료로 시작, 필요할 때 업그레이드</p>
          </Reveal>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map((plan, i) => (
              <Reveal key={plan.name} delay={i * 70}>
                <div className={`relative rounded-3xl p-6 flex flex-col h-full transition-all duration-300 ${
                  plan.highlight
                    ? 'text-white scale-[1.03]'
                    : 'bg-white border border-gray-100 hover:shadow-xl hover:-translate-y-1'
                }`} style={plan.highlight ? {
                  background:'linear-gradient(135deg,#6366f1,#8b5cf6,#7c3aed)',
                  boxShadow:'0 20px 60px rgba(99,102,241,0.35)',
                } : {}}>
                  {(plan as {badge?:string}).badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-indigo-600 text-[11px] font-bold px-3 py-1 rounded-full whitespace-nowrap shadow-md">
                      ⭐ {(plan as {badge?:string}).badge}
                    </div>
                  )}
                  <div className="mb-5 mt-1">
                    <h3 className={`text-[16px] font-bold mb-2 ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>{plan.name}</h3>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-[30px] font-black tracking-tight ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                        {plan.price === 0 ? '무료' : `₩${(plan.price/10000).toFixed(0)}만`}
                      </span>
                      {plan.price > 0 && <span className={`text-[13px] ${plan.highlight ? 'text-white/70' : 'text-gray-400'}`}>/월</span>}
                    </div>
                    <div className={`text-[12px] mt-1.5 ${plan.highlight ? 'text-white/70' : 'text-gray-400'}`}>
                      AI 직원 <strong className={plan.highlight ? 'text-white' : 'text-gray-900'}>{plan.employees}명</strong>
                    </div>
                  </div>
                  <div className="space-y-2 flex-1 mb-6">
                    {plan.features.map(f => (
                      <div key={f} className={`flex items-center gap-2 text-[13px] ${plan.highlight ? 'text-white/85' : 'text-gray-500'}`}>
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${plan.highlight ? 'bg-white/20' : 'bg-indigo-50'}`}>
                          <svg className="w-2.5 h-2.5" fill="none" stroke={plan.highlight ? 'white' : '#6366f1'} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        </div>
                        {f}
                      </div>
                    ))}
                  </div>
                  <Link href="/signup" className={`block text-center py-3 rounded-2xl text-[14px] font-bold transition-all ${
                    plan.highlight
                      ? 'bg-white text-indigo-600 hover:bg-indigo-50'
                      : 'text-white hover:opacity-90'
                  }`} style={!plan.highlight ? {background:`linear-gradient(135deg,${plan.color},${plan.color}cc)`} : {}}>
                    {plan.cta}
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal className="text-center mt-8">
            <p className="text-[13px] text-gray-400">엔터프라이즈 플랜 별도 문의 · 모든 플랜 부가세 별도</p>
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section id="faq" className="py-28 px-6 bg-white">
        <div className="max-w-2xl mx-auto">
          <Reveal className="text-center mb-14">
            <div className="inline-flex items-center gap-2 mb-5 px-4 py-2 rounded-full bg-gray-50 border border-gray-100 text-[12px] font-semibold text-gray-600">FAQ</div>
            <h2 className="text-[44px] font-black tracking-[-0.03em] text-gray-900">자주 묻는 질문</h2>
          </Reveal>
          <div className="space-y-2">
            {FAQS.map((faq, i) => (
              <Reveal key={i} delay={i * 40}>
                <div className={`rounded-2xl overflow-hidden border transition-all ${openFaq===i ? 'border-indigo-200 shadow-md' : 'border-gray-100'}`}>
                  <button
                    className="w-full text-left px-6 py-4 flex items-center justify-between gap-4 bg-white"
                    onClick={() => setOpenFaq(openFaq===i ? null : i)}>
                    <span className="text-[15px] font-semibold text-gray-900">{faq.q}</span>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ${openFaq===i ? 'rotate-45 bg-indigo-100' : 'bg-gray-100'}`}>
                      <svg className={`w-3.5 h-3.5 ${openFaq===i ? 'text-indigo-600' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </div>
                  </button>
                  {openFaq===i && (
                    <div className="px-6 pb-5 text-[14px] text-gray-500 leading-relaxed border-t border-indigo-50 pt-4 bg-indigo-50/30" style={{animation:'fadeUp 0.3s ease'}}>
                      {faq.a}
                    </div>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="py-36 px-6 text-center relative overflow-hidden" style={{background:'linear-gradient(135deg,#6366f1 0%,#8b5cf6 40%,#ec4899 80%,#f59e0b 100%)'}}>
        <div className="absolute inset-0" style={{background:'radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.1), transparent)'}} />
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          {[...Array(6)].map((_,i)=>(
            <div key={i} className="absolute rounded-full bg-white/5"
              style={{width:`${100+i*80}px`,height:`${100+i*80}px`,top:`${10+i*12}%`,left:`${5+i*16}%`,animation:`float ${3+i}s ${i*0.5}s ease-in-out infinite`}} />
          ))}
        </div>
        <Reveal className="relative max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-full bg-white/20 text-[12px] text-white font-semibold backdrop-blur">
            <span className="w-1.5 h-1.5 bg-green-300 rounded-full dot-pulse" />
            지금 2,400+ 1인 기업이 사용 중
          </div>
          <h2 className="text-[56px] md:text-[72px] font-black tracking-[-0.04em] leading-[1.02] text-white mb-5">
            지금 시작하세요.
          </h2>
          <p className="text-[17px] text-white/80 mb-12 leading-relaxed">
            무료로 시작해서 성장에 맞게 팀을 늘려가세요.<br />
            신용카드 없이 30초면 됩니다.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup" className="inline-flex items-center gap-2 bg-white text-indigo-600 text-[16px] font-black px-8 py-4 rounded-full hover:bg-gray-50 transition-all hover:scale-[1.03] active:scale-[0.97] shadow-xl">
              무료로 AI 팀 구성하기 →
            </Link>
            <button onClick={() => setVideoOpen(true)} className="inline-flex items-center gap-2 border-2 border-white/40 text-white text-[15px] font-semibold px-7 py-4 rounded-full hover:bg-white/10 transition-all backdrop-blur">
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">▶</span>
              데모 보기
            </button>
          </div>
          <p className="text-[12px] text-white/50 mt-6">AI 직원 1명 영구 무료 · 언제든 업그레이드</p>
        </Reveal>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="bg-gray-900 py-14 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-5 gap-10 mb-10">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm text-white"
                  style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>L</div>
                <span className="font-black text-white text-[16px]">LOOV</span>
              </div>
              <p className="text-[13px] text-gray-400 leading-relaxed max-w-xs mb-4">
                1인 기업을 위한 AI 직원 플랫폼.<br />
                Leverage · Orchestrate · Own · Venture
              </p>
              <div className="flex gap-2">
                {['💼','📧','💬'].map((ic,i)=>(<button key={i} className="w-8 h-8 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center justify-center text-sm transition-colors">{ic}</button>))}
              </div>
            </div>
            {[
              { title:'제품', links:['기능 소개','통합 서비스','요금제','API 문서'] },
              { title:'지원', links:['도움말','FAQ','문의하기','커뮤니티'] },
              { title:'회사', links:['소개','블로그','채용','파트너십'] },
            ].map(col => (
              <div key={col.title}>
                <h4 className="text-[13px] font-semibold text-gray-400 mb-4">{col.title}</h4>
                <div className="space-y-2.5">
                  {col.links.map(l => (
                    <div key={l} className="text-[13px] text-gray-500 hover:text-gray-300 cursor-pointer transition-colors">{l}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-800 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <span className="text-[12px] text-gray-600">© 2026 LOOV. All rights reserved.</span>
            <div className="flex gap-6">
              {['개인정보처리방침','이용약관'].map(l => (
                <span key={l} className="text-[12px] text-gray-600 hover:text-gray-400 cursor-pointer transition-colors">{l}</span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
