'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

// ─── Style Constants ────────────────────────────────────────────────────────
const gradientText: React.CSSProperties = {
  background: 'linear-gradient(135deg, #00D4FF 0%, #8B5CF6 50%, #EC4899 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
};

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '24px',
};

const neonBtn: React.CSSProperties = {
  background: 'linear-gradient(135deg, #00D4FF, #8B5CF6)',
  boxShadow: '0 0 30px rgba(0,212,255,0.4), 0 4px 20px rgba(0,0,0,0.3)',
  border: 'none',
  color: 'white',
  fontWeight: 700,
  padding: '14px 32px',
  borderRadius: '12px',
  cursor: 'pointer',
  transition: 'all 0.3s ease',
  fontSize: '16px',
  letterSpacing: '0.02em',
};

// ─── Hooks ──────────────────────────────────────────────────────────────────
function useScrollReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function useCountUp(target: number, duration = 2000, active = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [active, target, duration]);
  return count;
}

// ─── CSS Keyframes ───────────────────────────────────────────────────────────
const CSS = `
  @keyframes float { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-15px)} }
  @keyframes glow { 0%,100%{box-shadow:0 0 20px rgba(0,212,255,0.5)} 50%{box-shadow:0 0 40px rgba(0,212,255,0.8),0 0 80px rgba(0,212,255,0.3)} }
  @keyframes gradientShift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
  @keyframes marquee { from{transform:translateX(0)} to{transform:translateX(-50%)} }
  @keyframes shimmer { 0%{transform:translateX(-100%) skewX(-15deg)} 100%{transform:translateX(200%) skewX(-15deg)} }
  @keyframes ripple { 0%{transform:scale(0.5);opacity:1} 100%{transform:scale(3);opacity:0} }
  @keyframes fadeInChar { from{opacity:0;transform:translateY(20px) scale(0.8)} to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes typing { from{width:0} to{width:100%} }
  @keyframes cursorBlink { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes countUp { from{transform:translateY(40px);opacity:0} to{transform:translateY(0);opacity:1} }
  @keyframes slideInLeft { from{transform:translateX(-60px);opacity:0} to{transform:translateX(0);opacity:1} }
  @keyframes explodeIn { 0%{transform:scale(0) rotate(-10deg);opacity:0} 70%{transform:scale(1.1) rotate(2deg)} 100%{transform:scale(1) rotate(0);opacity:1} }
  @keyframes rotateBorder { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(0.95)} }
  @keyframes pingRipple { 0%{transform:scale(1);opacity:0.8} 100%{transform:scale(2.5);opacity:0} }
  @keyframes wordCycle { 0%,20%{opacity:1;transform:translateY(0)} 25%,45%{opacity:0;transform:translateY(-30px)} 50%,70%{opacity:0;transform:translateY(30px)} 75%,100%{opacity:1;transform:translateY(0)} }
  @keyframes navGlow { 0%,100%{border-bottom-color:rgba(0,212,255,0.1)} 50%{border-bottom-color:rgba(0,212,255,0.4)} }
  @keyframes heroGradient { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
  @keyframes ctaGrad { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes coinSpin { 0%{transform:rotateY(0deg)} 100%{transform:rotateY(360deg)} }
  @keyframes chartGrow { from{stroke-dashoffset:300} to{stroke-dashoffset:0} }
  @keyframes fadeUp { from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:translateY(0)} }
  @keyframes scaleIn { from{opacity:0;transform:scale(0.8)} to{opacity:1;transform:scale(1)} }
  @keyframes glowPulse { 0%,100%{text-shadow:0 0 10px rgba(0,212,255,0.5)} 50%{text-shadow:0 0 30px rgba(0,212,255,1),0 0 60px rgba(139,92,246,0.5)} }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #000; overflow-x: hidden; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #0A0A0A; }
  ::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #00D4FF, #8B5CF6); border-radius: 2px; }
`;

// ─── Nav ─────────────────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
      background: scrolled ? 'rgba(0,0,0,0.92)' : 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(24px)',
      borderBottom: `1px solid ${scrolled ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
      transition: 'all 0.4s ease',
      boxShadow: scrolled ? '0 4px 40px rgba(0,212,255,0.1)' : 'none',
      animation: 'navGlow 3s ease-in-out infinite',
    }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{
            fontSize: '28px', fontWeight: 900, letterSpacing: '-0.02em',
            ...gradientText,
            filter: scrolled ? 'drop-shadow(0 0 12px rgba(0,212,255,0.6))' : 'none',
            transition: 'filter 0.4s ease',
          }}>LOOV</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <Link href="/dashboard" style={{
            color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: '14px',
            fontWeight: 500, letterSpacing: '0.02em', transition: 'color 0.2s',
          }}
            onMouseEnter={e => (e.currentTarget.style.color = '#00D4FF')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
          >로그인</Link>
          <Link href="/dashboard" style={{ textDecoration: 'none' }}>
            <button style={{
              ...neonBtn, padding: '10px 24px', fontSize: '14px',
              animation: 'glow 2s ease-in-out infinite',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px) scale(1.04)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 50px rgba(0,212,255,0.7), 0 8px 30px rgba(0,0,0,0.4)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 30px rgba(0,212,255,0.4), 0 4px 20px rgba(0,0,0,0.3)'; }}
            >무료 시작</button>
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
const HERO_WORDS = ['AI 영업팀장', 'AI 회계담당', 'AI 마케터', 'AI 전략가'];
const MARQUEE_ITEMS = ['AI 채팅', 'ERP', 'SNS 자동화', '쿠팡 파트너스', 'WordPress', 'CCTV', '위치추적', 'Gemini', 'Claude', 'ChatGPT', 'n8n 자동화', 'AI 인사이트'];

function Hero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number }>({ x: -9999, y: -9999 });
  const [wordIndex, setWordIndex] = useState(0);
  const [heroVisible, setHeroVisible] = useState(false);

  useEffect(() => {
    setHeroVisible(true);
    const interval = setInterval(() => setWordIndex(i => (i + 1) % HERO_WORDS.length), 2800);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    type Particle = { x: number; y: number; vx: number; vy: number; size: number; hue: number };
    const particles: Particle[] = [];
    for (let i = 0; i < 90; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        size: Math.random() * 2.5 + 0.5,
        hue: Math.random() > 0.5 ? 195 : 270,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      particles.forEach(p => {
        const dx = mx - p.x;
        const dy = my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150 && dist > 0) {
          const force = (150 - dist) / 150 * 0.8;
          p.vx -= (dx / dist) * force;
          p.vy -= (dy / dist) * force;
        }
        p.vx *= 0.995;
        p.vy *= 0.995;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue},100%,60%,0.7)`;
        ctx.fill();
      });

      particles.forEach((p, i) => {
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const d = Math.sqrt((p.x - q.x) ** 2 + (p.y - q.y) ** 2);
          if (d < 130) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            const alpha = 0.18 * (1 - d / 130);
            ctx.strokeStyle = `rgba(0,212,255,${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      });

      animRef.current = requestAnimationFrame(draw);
    };
    draw();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    const handleMouse = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouse);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouse);
    };
  }, []);

  const word = HERO_WORDS[wordIndex];

  return (
    <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,212,255,0.08) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(139,92,246,0.08) 0%, transparent 70%), #000' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      {/* Ambient orbs */}
      <div style={{ position: 'absolute', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,212,255,0.06) 0%, transparent 70%)', top: '-100px', left: '-100px', animation: 'float 8s ease-in-out infinite', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 70%)', bottom: '-100px', right: '-50px', animation: 'float 10s ease-in-out infinite reverse', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.05) 0%, transparent 70%)', top: '40%', left: '60%', animation: 'float 7s ease-in-out infinite 2s', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: '0 24px', maxWidth: '1000px' }}>
        {/* Badge */}
        <div style={{
          opacity: heroVisible ? 1 : 0,
          transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'all 0.8s cubic-bezier(0.34,1.56,0.64,1)',
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          border: '1px solid rgba(0,212,255,0.4)',
          borderRadius: '100px', padding: '6px 18px', marginBottom: '40px',
          background: 'rgba(0,212,255,0.05)',
          boxShadow: '0 0 20px rgba(0,212,255,0.15)',
          animation: heroVisible ? 'glow 2.5s ease-in-out infinite' : 'none',
        }}>
          <span style={{ color: '#00D4FF', fontSize: '12px', fontWeight: 700, letterSpacing: '0.15em' }}>✦ AI POWERED</span>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#39FF14', boxShadow: '0 0 8px #39FF14', animation: 'pulse 1.5s ease-in-out infinite', display: 'inline-block' }} />
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', letterSpacing: '0.1em' }}>LIVE</span>
        </div>

        {/* Headline */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: 'clamp(32px, 6vw, 72px)', fontWeight: 200, color: 'rgba(255,255,255,0.85)', letterSpacing: '-0.02em', lineHeight: 1.1,
            opacity: heroVisible ? 1 : 0, transform: heroVisible ? 'translateY(0)' : 'translateY(30px)', transition: 'all 1s ease 0.1s' }}>
            당신의 회사에
          </div>

          <div style={{ minHeight: 'clamp(80px, 14vw, 160px)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            opacity: heroVisible ? 1 : 0, transition: 'opacity 0.5s ease 0.3s' }}>
            <span key={wordIndex} style={{
              fontSize: 'clamp(52px, 11vw, 130px)', fontWeight: 900, letterSpacing: '-0.04em',
              ...gradientText,
              display: 'inline-block',
              animation: 'scaleIn 0.5s cubic-bezier(0.34,1.56,0.64,1)',
              filter: 'drop-shadow(0 0 30px rgba(0,212,255,0.5))',
            }}>{word}</span>
          </div>

          <div style={{ fontSize: 'clamp(32px, 6vw, 72px)', fontWeight: 200, color: 'rgba(255,255,255,0.85)', letterSpacing: '-0.02em', lineHeight: 1.1,
            opacity: heroVisible ? 1 : 0, transform: heroVisible ? 'translateY(0)' : 'translateY(30px)', transition: 'all 1s ease 0.4s' }}>
            이 생겼습니다
          </div>
        </div>

        {/* Sub */}
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 'clamp(14px, 2vw, 17px)', letterSpacing: '0.04em', marginBottom: '48px',
          opacity: heroVisible ? 1 : 0, transform: heroVisible ? 'translateY(0)' : 'translateY(20px)', transition: 'all 1s ease 0.6s' }}>
          ChatGPT · Gemini · Claude 기반&nbsp;|&nbsp;6개 모델 · 12개 플랫폼 · 24시간 자동화
        </p>

        {/* CTAs */}
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '80px',
          opacity: heroVisible ? 1 : 0, transform: heroVisible ? 'translateY(0)' : 'translateY(20px)', transition: 'all 1s ease 0.8s' }}>
          <Link href="/dashboard" style={{ textDecoration: 'none' }}>
            <button style={{ ...neonBtn, padding: '16px 40px', fontSize: '17px', animation: 'glow 2s ease-in-out infinite' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-3px) scale(1.05)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 60px rgba(0,212,255,0.7), 0 10px 40px rgba(0,0,0,0.5)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 30px rgba(0,212,255,0.4), 0 4px 20px rgba(0,0,0,0.3)'; }}
            >무료로 시작 →</button>
          </Link>
          <button style={{ ...glassCard, border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '16px 40px', fontSize: '17px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.3s ease', borderRadius: '12px' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,212,255,0.4)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-3px)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.2)'; (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
          >데모 보기 ▶</button>
        </div>
      </div>

      {/* Marquee */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.5)', padding: '14px 0' }}>
        <div style={{ display: 'flex', animation: 'marquee 20s linear infinite', width: 'max-content' }}>
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span key={i} style={{ whiteSpace: 'nowrap', padding: '0 32px', color: 'rgba(255,255,255,0.35)', fontSize: '13px', letterSpacing: '0.1em', fontWeight: 500 }}>
              {item} <span style={{ color: '#00D4FF', opacity: 0.6 }}>✦</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Feature Chat Demo ────────────────────────────────────────────────────────
function ChatDemo({ visible }: { visible: boolean }) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([]);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const seq = [
      { delay: 300, role: 'user' as const, text: '이번 달 매출 분석해줘' },
      { delay: 1200, role: 'ai' as const, text: '분석 중...' },
      { delay: 2400, role: 'ai' as const, text: '📊 이번 달 매출은 전월 대비 **+23%** 상승했습니다. 주요 원인은 SNS 자동화 캠페인 효과입니다.' },
      { delay: 4000, role: 'user' as const, text: '다음 달 예측은?' },
      { delay: 5200, role: 'ai' as const, text: '🔮 현재 트렌드 기반 예측: 월 매출 **+18~31%** 성장 예상. 추가 자동화 설정을 권장합니다.' },
    ];
    seq.forEach(({ delay, role, text }) => {
      setTimeout(() => {
        if (role === 'ai') setTyping(true);
        setTimeout(() => {
          setTyping(false);
          setMessages(prev => [...prev, { role, text }]);
        }, role === 'ai' ? 600 : 0);
      }, delay);
    });
  }, [visible]);

  return (
    <div style={{ ...glassCard, padding: '20px', minHeight: '320px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 0 40px rgba(0,212,255,0.1), inset 0 0 40px rgba(0,212,255,0.02)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#39FF14', boxShadow: '0 0 8px #39FF14', animation: 'pulse 2s ease-in-out infinite' }} />
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', letterSpacing: '0.08em' }}>AI 어시스턴트 · 온라인</span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', animation: 'fadeUp 0.4s ease' }}>
            <div style={{
              maxWidth: '75%', padding: '10px 14px', borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', fontSize: '13px', lineHeight: 1.5,
              background: m.role === 'user' ? 'linear-gradient(135deg, #00D4FF, #8B5CF6)' : 'rgba(255,255,255,0.06)',
              color: 'white', border: m.role === 'ai' ? '1px solid rgba(255,255,255,0.08)' : 'none',
              boxShadow: m.role === 'user' ? '0 0 20px rgba(0,212,255,0.3)' : 'none',
            }}>{m.text}</div>
          </div>
        ))}
        {typing && (
          <div style={{ display: 'flex', gap: '5px', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', borderRadius: '16px 16px 16px 4px', width: 'fit-content', border: '1px solid rgba(255,255,255,0.08)' }}>
            {[0, 1, 2].map(i => <span key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00D4FF', display: 'inline-block', animation: `pulse 1s ease-in-out infinite ${i * 0.2}s` }} />)}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 14px', color: 'rgba(255,255,255,0.2)', fontSize: '13px' }}>메시지를 입력하세요...</div>
        <button style={{ ...neonBtn, padding: '10px 16px', fontSize: '13px', borderRadius: '10px' }}>전송</button>
      </div>
    </div>
  );
}

// ─── ERP Demo ─────────────────────────────────────────────────────────────────
function ERPDemo({ visible }: { visible: boolean }) {
  const kpis = [
    { label: '월 매출', value: '₩84.2M', change: '+23%', color: '#00D4FF' },
    { label: '신규 고객', value: '1,247', change: '+8%', color: '#8B5CF6' },
    { label: '전환율', value: '18.4%', change: '+3.2%', color: '#EC4899' },
    { label: 'ROI', value: '340%', change: '+41%', color: '#39FF14' },
  ];
  const bars = [45, 62, 38, 78, 55, 90, 67];
  return (
    <div style={{ ...glassCard, padding: '20px', transform: 'perspective(800px) rotateY(-6deg) rotateX(3deg)', boxShadow: '0 0 60px rgba(139,92,246,0.15), 30px 30px 60px rgba(0,0,0,0.5), inset 0 0 30px rgba(139,92,246,0.02)', transition: 'transform 0.5s ease' }}
      onMouseEnter={e => (e.currentTarget.style.transform = 'perspective(800px) rotateY(-2deg) rotateX(1deg) scale(1.02)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'perspective(800px) rotateY(-6deg) rotateX(3deg)')}>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', letterSpacing: '0.12em', marginBottom: '16px' }}>📊 ERP DASHBOARD · LIVE</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
        {kpis.map((k, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '12px', border: `1px solid ${k.color}22` }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginBottom: '4px', letterSpacing: '0.08em' }}>{k.label}</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: k.color, lineHeight: 1, animation: visible ? 'countUp 0.8s ease forwards' : 'none', animationDelay: `${i * 0.1}s` }}>{k.value}</div>
            <div style={{ fontSize: '10px', color: '#39FF14', marginTop: '4px' }}>{k.change}</div>
          </div>
        ))}
      </div>
      <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px', marginBottom: '8px', letterSpacing: '0.08em' }}>주간 매출 추이</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '60px' }}>
        {bars.map((h, i) => (
          <div key={i} style={{ flex: 1, background: `linear-gradient(to top, #00D4FF, #8B5CF6)`, borderRadius: '4px 4px 0 0', height: visible ? `${h}%` : '0%', transition: `height 0.8s cubic-bezier(0.34,1.56,0.64,1) ${0.1 + i * 0.08}s`, boxShadow: `0 0 8px rgba(0,212,255,0.4)` }} />
        ))}
      </div>
    </div>
  );
}

// ─── SNS Demo ─────────────────────────────────────────────────────────────────
function SNSDemo({ visible }: { visible: boolean }) {
  const platforms = [
    { name: 'Instagram', color: '#E1306C', icon: '📸' },
    { name: 'YouTube', color: '#FF0000', icon: '▶' },
    { name: 'TikTok', color: '#69C9D0', icon: '♪' },
    { name: 'Twitter X', color: '#1DA1F2', icon: '𝕏' },
    { name: 'Facebook', color: '#1877F2', icon: '𝙛' },
    { name: 'LinkedIn', color: '#0A66C2', icon: 'in' },
  ];
  return (
    <div style={{ ...glassCard, padding: '20px', boxShadow: '0 0 40px rgba(236,72,153,0.1)' }}>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', letterSpacing: '0.12em', marginBottom: '16px' }}>🚀 SNS AUTO-POST · 6 PLATFORMS</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
        {platforms.map((p, i) => (
          <div key={i} style={{
            background: `${p.color}11`, border: `1px solid ${p.color}44`, borderRadius: '14px', padding: '16px 12px', textAlign: 'center',
            boxShadow: visible ? `0 0 20px ${p.color}22` : 'none',
            animation: visible ? `explodeIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards ${0.05 + i * 0.08}s` : 'none',
            opacity: visible ? 1 : 0,
            transform: visible ? 'scale(1)' : 'scale(0)',
            transition: 'box-shadow 0.3s ease',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 30px ${p.color}55`; (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.05)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 20px ${p.color}22`; (e.currentTarget as HTMLDivElement).style.transform = ''; }}
          >
            <div style={{ fontSize: '24px', marginBottom: '6px' }}>{p.icon}</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.05em' }}>{p.name}</div>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#39FF14', margin: '6px auto 0', boxShadow: '0 0 6px #39FF14', animation: 'pulse 2s infinite' }} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '10px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginBottom: '4px' }}>다음 자동 게시</div>
        <div style={{ fontSize: '13px', color: '#00D4FF', fontWeight: 600 }}>오늘 오후 7:00 · AI 생성 컨텐츠 ✦ 6개 채널 동시</div>
      </div>
    </div>
  );
}

// ─── Coupang Demo ─────────────────────────────────────────────────────────────
function CoupangDemo({ visible }: { visible: boolean }) {
  return (
    <div style={{ ...glassCard, padding: '20px', position: 'relative', overflow: 'hidden', boxShadow: '0 0 40px rgba(57,255,20,0.08)' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, transparent 40%, rgba(57,255,20,0.03) 100%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: '-100%', width: '60%', height: '100%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)', animation: visible ? 'shimmer 3s ease-in-out infinite 1s' : 'none', pointerEvents: 'none' }} />
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', letterSpacing: '0.12em', marginBottom: '16px' }}>🛒 쿠팡 파트너스 AI</div>
      <div style={{ display: 'flex', gap: '14px', marginBottom: '16px' }}>
        <div style={{ width: '80px', height: '80px', borderRadius: '14px', background: 'linear-gradient(135deg, #1A1A2E, #16213E)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', flexShrink: 0, animation: 'float 4s ease-in-out infinite' }}>📱</div>
        <div>
          <div style={{ color: 'white', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>갤럭시 S25 Ultra</div>
          <div style={{ color: '#EC4899', fontSize: '18px', fontWeight: 800, marginBottom: '4px' }}>₩1,450,000</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{ background: 'rgba(57,255,20,0.15)', border: '1px solid rgba(57,255,20,0.3)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', color: '#39FF14' }}>커미션 3%</span>
            <span style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', color: '#00D4FF' }}>AI 추천</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(57,255,20,0.05)', border: '1px solid rgba(57,255,20,0.2)', borderRadius: '12px', padding: '12px 16px' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginBottom: '2px' }}>예상 월 수익</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#39FF14', animation: visible ? 'glowPulse 2s ease-in-out infinite' : 'none' }}>₩284,000</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {['↑ 15%', '↑ 8%', '↑ 23%'].map((v, i) => (
            <div key={i} style={{ fontSize: '12px', color: '#39FF14', opacity: visible ? 1 : 0, transform: visible ? 'translateX(0)' : 'translateX(20px)', transition: `all 0.5s ease ${0.5 + i * 0.15}s` }}>{v}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── WordPress Demo ───────────────────────────────────────────────────────────
function WordPressDemo({ visible }: { visible: boolean }) {
  const lines = [
    { text: '# AI가 작성한 SEO 블로그 포스트', color: '#8B5CF6' },
    { text: '', color: '' },
    { text: '## 2026년 마케팅 트렌드 완벽 분석', color: '#00D4FF' },
    { text: '', color: '' },
    { text: '올해 디지털 마케팅의 핵심은...', color: 'rgba(255,255,255,0.7)' },
    { text: '**AI 자동화**와 **개인화**입니다.', color: 'rgba(255,255,255,0.7)' },
    { text: '', color: '' },
    { text: '> 키워드 최적화 완료 ✓', color: '#39FF14' },
    { text: '> SEO 점수: 94/100 ✓', color: '#39FF14' },
  ];

  return (
    <div style={{ ...glassCard, padding: '0', overflow: 'hidden', boxShadow: '0 0 40px rgba(139,92,246,0.1)' }}>
      <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {['#FF5F57', '#FEBC2E', '#28C840'].map((c, i) => <div key={i} style={{ width: '10px', height: '10px', borderRadius: '50%', background: c }} />)}
        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '11px', marginLeft: '8px', fontFamily: 'monospace' }}>ai-blog-generator.ts</span>
      </div>
      <div style={{ padding: '16px', fontFamily: 'monospace', fontSize: '12px', lineHeight: 1.8, minHeight: '200px' }}>
        {lines.map((line, i) => (
          <div key={i} style={{ color: line.color || 'transparent', opacity: visible ? 1 : 0, transition: `opacity 0.3s ease ${0.2 + i * 0.15}s`, minHeight: '20px' }}>
            {line.text}
            {i === lines.length - 1 && visible && <span style={{ display: 'inline-block', width: '2px', height: '14px', background: '#00D4FF', marginLeft: '2px', verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CCTV Demo ────────────────────────────────────────────────────────────────
function CCTVDemo({ visible }: { visible: boolean }) {
  return (
    <div style={{ ...glassCard, padding: '20px', boxShadow: '0 0 40px rgba(255,0,0,0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', letterSpacing: '0.12em' }}>📡 CCTV & 트래커</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FF3333', boxShadow: '0 0 8px #FF3333', animation: 'pulse 1s ease-in-out infinite' }} />
          <span style={{ color: '#FF3333', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em' }}>REC</span>
        </div>
      </div>
      <div style={{ background: '#0A0A0A', borderRadius: '14px', padding: '16px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '14px', position: 'relative', overflow: 'hidden', minHeight: '130px' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 50%, rgba(0,212,255,0.04) 0%, transparent 70%)' }} />
        <div style={{ color: 'rgba(255,255,255,0.15)', fontSize: '10px', marginBottom: '12px', letterSpacing: '0.1em' }}>CAM-01 · 정문 입구</div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80px', position: 'relative' }}>
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#00D4FF', boxShadow: '0 0 20px rgba(0,212,255,0.8)', zIndex: 2 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ position: 'absolute', inset: `-${i * 14}px`, borderRadius: '50%', border: '1px solid rgba(0,212,255,0.4)', animation: visible ? `pingRipple 2s ease-out infinite ${i * 0.5}s` : 'none' }} />
            ))}
          </div>
        </div>
        <div style={{ color: '#00D4FF', fontSize: '10px', textAlign: 'center', marginTop: '8px' }}>위치 추적 활성 · GPS 정확도 99.8%</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {[{ label: '활성 카메라', value: '12', color: '#00D4FF' }, { label: '알림', value: '3', color: '#EC4899' }, { label: '추적 기기', value: '7', color: '#8B5CF6' }, { label: '이상 감지', value: '0', color: '#39FF14' }].map((s, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '10px', border: `1px solid ${s.color}22` }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '2px' }}>{s.label}</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Feature Section ──────────────────────────────────────────────────────────
type FeatureConfig = {
  num: string;
  title: string;
  desc: string;
  bullets: string[];
  accentColor: string;
  demo: (visible: boolean) => React.ReactNode;
};

function FeatureSection({ feature, reverse }: { feature: FeatureConfig; reverse?: boolean }) {
  const { ref, visible } = useScrollReveal(0.12);
  return (
    <section ref={ref} style={{ padding: '100px 24px', background: '#000', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', gap: '60px', alignItems: 'center', flexDirection: reverse ? 'row-reverse' : 'row', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 380px', opacity: visible ? 1 : 0, transform: visible ? 'translateX(0)' : `translateX(${reverse ? '60px' : '-60px'})`, transition: 'all 0.9s cubic-bezier(0.34,1.56,0.64,1)' }}>
          <div style={{ fontSize: 'clamp(64px, 10vw, 120px)', fontWeight: 900, lineHeight: 1, marginBottom: '16px', opacity: 0.12, ...gradientText }}>{feature.num}</div>
          <h3 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, color: 'white', marginBottom: '16px', letterSpacing: '-0.02em', marginTop: '-20px' }}>{feature.title}</h3>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '16px', lineHeight: 1.7, marginBottom: '28px' }}>{feature.desc}</p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {feature.bullets.map((b, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', color: 'rgba(255,255,255,0.65)', fontSize: '14px', opacity: visible ? 1 : 0, transform: visible ? 'translateX(0)' : 'translateX(-20px)', transition: `all 0.6s ease ${0.3 + i * 0.1}s` }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: feature.accentColor, boxShadow: `0 0 8px ${feature.accentColor}`, marginTop: '6px', flexShrink: 0 }} />
                {b}
              </li>
            ))}
          </ul>
        </div>
        <div style={{ flex: '1 1 380px', opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(40px)', transition: 'all 0.9s cubic-bezier(0.34,1.56,0.64,1) 0.15s' }}>
          {feature.demo(visible)}
        </div>
      </div>
    </section>
  );
}

// ─── Stats Section ────────────────────────────────────────────────────────────
function StatCounter({ value, suffix, label, color, delay, active }: { value: number; suffix: string; label: string; color: string; delay: number; active: boolean }) {
  const count = useCountUp(value, 2200, active);
  return (
    <div style={{ textAlign: 'center', padding: '20px', opacity: active ? 1 : 0, transform: active ? 'translateY(0)' : 'translateY(40px)', transition: `all 0.8s cubic-bezier(0.34,1.56,0.64,1) ${delay}s` }}>
      <div style={{ fontSize: 'clamp(56px, 9vw, 96px)', fontWeight: 900, lineHeight: 1, color, textShadow: `0 0 40px ${color}80`, letterSpacing: '-0.04em', animation: active ? 'glowPulse 3s ease-in-out infinite' : 'none' }}>
        {count}{suffix}
      </div>
      <div style={{ width: '60px', height: '2px', background: `linear-gradient(90deg, transparent, ${color}, transparent)`, margin: '12px auto', boxShadow: `0 0 10px ${color}` }} />
      <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '14px', letterSpacing: '0.08em' }}>{label}</div>
    </div>
  );
}

function StatsSection() {
  const { ref, visible } = useScrollReveal(0.2);
  const stats = [
    { value: 6, suffix: '', label: 'AI 모델', color: '#00D4FF', delay: 0 },
    { value: 12, suffix: '', label: '통합 플랫폼', color: '#8B5CF6', delay: 0.1 },
    { value: 5, suffix: '분', label: '설정 시간', color: '#EC4899', delay: 0.2 },
    { value: 24, suffix: '/7', label: '자동 운영', color: '#39FF14', delay: 0.3 },
  ];
  return (
    <section ref={ref} style={{ padding: '100px 24px', background: '#000', borderTop: '1px solid rgba(255,255,255,0.04)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 50% at 50% 50%, rgba(0,212,255,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '70px' }}>
          <h2 style={{ fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 900, color: 'white', letterSpacing: '-0.03em', marginBottom: '12px', opacity: visible ? 1 : 0, transition: 'opacity 0.8s ease' }}>숫자로 증명하는 <span style={gradientText}>LOOV</span></h2>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '16px', opacity: visible ? 1 : 0, transition: 'opacity 0.8s ease 0.2s' }}>진짜 성과, 진짜 자동화</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0' }}>
          {stats.map((s, i) => <StatCounter key={i} {...s} active={visible} />)}
        </div>
      </div>
    </section>
  );
}

// ─── Integrations ─────────────────────────────────────────────────────────────
function IntegrationCard({ name, icon, color }: { name: string; icon: string; color: string }) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientY - rect.top - rect.height / 2) / rect.height * 20;
    const y = -(e.clientX - rect.left - rect.width / 2) / rect.width * 20;
    setTilt({ x, y });
  }, []);
  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setTilt({ x: 0, y: 0 }); }}
      style={{
        ...glassCard, padding: '24px', textAlign: 'center', cursor: 'default',
        transform: hovered ? `perspective(600px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.06)` : 'perspective(600px) rotateX(0) rotateY(0) scale(1)',
        border: hovered ? `1px solid ${color}66` : '1px solid rgba(255,255,255,0.07)',
        boxShadow: hovered ? `0 0 30px ${color}33, 0 20px 40px rgba(0,0,0,0.5)` : '0 4px 20px rgba(0,0,0,0.2)',
        transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
      <div style={{ fontSize: '32px', marginBottom: '10px', filter: hovered ? `drop-shadow(0 0 12px ${color})` : 'none', transition: 'filter 0.3s ease' }}>{icon}</div>
      <div style={{ color: hovered ? color : 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: 600, letterSpacing: '0.06em', transition: 'color 0.3s ease' }}>{name}</div>
      {hovered && <div style={{ width: '20px', height: '2px', background: color, boxShadow: `0 0 8px ${color}`, margin: '8px auto 0', borderRadius: '1px' }} />}
    </div>
  );
}

function IntegrationsSection() {
  const { ref, visible } = useScrollReveal(0.12);
  const integrations = [
    { name: 'ChatGPT', icon: '🤖', color: '#10B981' },
    { name: 'Gemini', icon: '✨', color: '#8B5CF6' },
    { name: 'Claude', icon: '🧠', color: '#EC4899' },
    { name: 'n8n', icon: '⚡', color: '#F97316' },
    { name: 'Supabase', icon: '🗄️', color: '#3ECF8E' },
    { name: 'WordPress', icon: '📝', color: '#21759B' },
    { name: 'Instagram', icon: '📸', color: '#E1306C' },
    { name: 'YouTube', icon: '▶', color: '#FF0000' },
    { name: 'Google', icon: '📅', color: '#4285F4' },
    { name: 'Coupang', icon: '🛒', color: '#C0392B' },
  ];
  return (
    <section ref={ref} style={{ padding: '100px 24px', background: 'linear-gradient(180deg, #000 0%, #050508 100%)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '60px', opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.8s ease' }}>
          <h2 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: '12px' }}>
            <span style={{ color: 'white' }}>모든 도구가 </span><span style={gradientText}>하나로</span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '16px' }}>10개 이상의 플랫폼을 단일 대시보드에서</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
          {integrations.map((item, i) => (
            <div key={i} style={{ opacity: visible ? 1 : 0, transform: visible ? 'scale(1)' : 'scale(0.8)', transition: `all 0.5s cubic-bezier(0.34,1.56,0.64,1) ${0.05 + i * 0.05}s` }}>
              <IntegrationCard {...item} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────
type PlanConfig = {
  name: string;
  price: string;
  period: string;
  desc: string;
  features: string[];
  cta: string;
  highlight?: boolean;
  color: string;
};

function PricingCard({ plan, delay, visible }: { plan: PlanConfig; delay: number; visible: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', borderRadius: '24px', padding: plan.highlight ? '2px' : '0',
        background: plan.highlight ? 'linear-gradient(135deg, #00D4FF, #8B5CF6, #EC4899)' : 'transparent',
        animation: plan.highlight ? 'gradientShift 3s ease-in-out infinite' : 'none',
        backgroundSize: plan.highlight ? '200% 200%' : 'auto',
        opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(40px)',
        transition: `all 0.7s cubic-bezier(0.34,1.56,0.64,1) ${delay}s`,
        boxShadow: plan.highlight && hovered ? '0 0 60px rgba(0,212,255,0.3)' : 'none',
      }}>
      {plan.highlight && <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #00D4FF, #8B5CF6)', borderRadius: '100px', padding: '4px 16px', fontSize: '11px', fontWeight: 700, color: 'white', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>⭐ 가장 인기</div>}
      <div style={{ ...glassCard, borderRadius: '22px', padding: '32px', background: plan.highlight ? 'rgba(5,5,15,0.95)' : 'rgba(255,255,255,0.03)', border: plan.highlight ? 'none' : `1px solid rgba(255,255,255,0.08)`, transform: hovered ? 'scale(1.02)' : 'scale(1)', transition: 'transform 0.3s ease' }}>
        <div style={{ color: plan.color, fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', marginBottom: '8px' }}>{plan.name}</div>
        <div style={{ marginBottom: '4px' }}>
          <span style={{ fontSize: '42px', fontWeight: 900, color: 'white', letterSpacing: '-0.03em' }}>{plan.price}</span>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '14px', marginLeft: '4px' }}>{plan.period}</span>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginBottom: '24px', lineHeight: 1.5 }}>{plan.desc}</p>
        <div style={{ width: '100%', height: '1px', background: 'rgba(255,255,255,0.06)', marginBottom: '20px' }} />
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
          {plan.features.map((f, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
              <span style={{ color: plan.color, fontSize: '14px' }}>✓</span> {f}
            </li>
          ))}
        </ul>
        <Link href="/dashboard" style={{ textDecoration: 'none', display: 'block' }}>
          <button style={plan.highlight ? { ...neonBtn, width: '100%', justifyContent: 'center' } : { background: 'rgba(255,255,255,0.06)', border: `1px solid rgba(255,255,255,0.12)`, color: 'white', width: '100%', padding: '14px 24px', borderRadius: '12px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, transition: 'all 0.3s ease' }}
            onMouseEnter={e => { if (!plan.highlight) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.borderColor = plan.color; } }}
            onMouseLeave={e => { if (!plan.highlight) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.12)'; } }}
          >{plan.cta}</button>
        </Link>
      </div>
    </div>
  );
}

function PricingSection() {
  const { ref, visible } = useScrollReveal(0.1);
  const plans: PlanConfig[] = [
    { name: 'FREE', price: '₩0', period: '/월', desc: '소규모 비즈니스 시작용', features: ['AI 채팅 50회/월', 'ERP 기본 기능', '1개 SNS 연동', '커뮤니티 접근'], cta: '무료로 시작', color: '#8B5CF6' },
    { name: 'STARTER', price: '₩29,000', period: '/월', desc: '성장하는 1인 기업을 위한', features: ['AI 채팅 무제한', '모든 ERP 기능', '6개 SNS 자동화', '쿠팡 파트너스', 'WordPress AI 블로그', '우선 지원'], cta: '지금 시작하기', highlight: true, color: '#00D4FF' },
    { name: 'PRO', price: '₩79,000', period: '/월', desc: '팀과 함께 스케일업', features: ['Starter 전체 포함', 'CCTV & 위치추적', 'n8n 고급 자동화', 'Google Calendar', 'AI 인사이트', '전담 매니저'], cta: 'Pro 시작하기', color: '#EC4899' },
    { name: 'ENTERPRISE', price: '문의', period: '', desc: '대규모 조직 맞춤형', features: ['Pro 전체 포함', '커스텀 AI 모델', '온프레미스 배포', 'SLA 보장', '전용 서버', '화이트라벨'], cta: '영업팀 문의', color: '#39FF14' },
  ];
  return (
    <section ref={ref} style={{ padding: '100px 24px', background: '#000', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '70px', opacity: visible ? 1 : 0, transition: 'opacity 0.8s ease' }}>
          <h2 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: '12px' }}>
            <span style={gradientText}>투명한 가격</span><span style={{ color: 'white' }}>으로 시작</span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '16px' }}>약정 없음 · 언제든 변경 · 14일 환불 보장</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', alignItems: 'start' }}>
          {plans.map((p, i) => <PricingCard key={i} plan={p} delay={i * 0.1} visible={visible} />)}
        </div>
      </div>
    </section>
  );
}

// ─── CTA Section ──────────────────────────────────────────────────────────────
function CTASection() {
  const { ref, visible } = useScrollReveal(0.2);
  return (
    <section ref={ref} style={{ padding: '120px 24px', background: 'linear-gradient(135deg, #0D1117 0%, #1a0533 30%, #0c1a3d 60%, #0D1117 100%)', position: 'relative', overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(0,212,255,0.12), rgba(139,92,246,0.15), rgba(236,72,153,0.1))', backgroundSize: '400% 400%', animation: 'ctaGrad 6s ease-in-out infinite', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '20%', left: '10%', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,212,255,0.1) 0%, transparent 70%)', animation: 'float 8s ease-in-out infinite', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '10%', right: '10%', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.1) 0%, transparent 70%)', animation: 'float 6s ease-in-out infinite reverse', pointerEvents: 'none' }} />
      <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 2 }}>
        <div style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(40px)', transition: 'all 0.9s cubic-bezier(0.34,1.56,0.64,1)' }}>
          <h2 style={{ fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 900, color: 'white', letterSpacing: '-0.03em', marginBottom: '20px', lineHeight: 1.1 }}>
            지금 AI 팀을<br /><span style={gradientText}>채용하세요</span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '18px', marginBottom: '48px', lineHeight: 1.6 }}>
            5분 안에 설정 완료. 신용카드 불필요.<br />AI가 당신의 회사를 24시간 운영합니다.
          </p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/dashboard" style={{ textDecoration: 'none' }}>
              <button style={{ background: 'rgba(255,255,255,0.95)', color: '#000', fontWeight: 800, padding: '18px 48px', borderRadius: '14px', border: 'none', cursor: 'pointer', fontSize: '17px', letterSpacing: '0.02em', transition: 'all 0.3s ease', boxShadow: '0 0 40px rgba(255,255,255,0.3)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-3px) scale(1.04)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 60px rgba(255,255,255,0.5)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 40px rgba(255,255,255,0.3)'; }}
              >무료로 시작하기 →</button>
            </Link>
            <Link href="/dashboard" style={{ textDecoration: 'none' }}>
              <button style={{ background: 'rgba(255,255,255,0.08)', color: 'white', fontWeight: 600, padding: '18px 40px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: '17px', transition: 'all 0.3s ease' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.15)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.4)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.25)'; }}
              >데모 예약</button>
            </Link>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '13px', marginTop: '24px' }}>
            이미 <span style={{ color: '#00D4FF' }}>1,200+</span> 기업이 LOOV로 운영 중
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ background: '#000', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '60px 24px 40px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '40px', marginBottom: '48px' }}>
          <div style={{ maxWidth: '280px' }}>
            <div style={{ fontSize: '28px', fontWeight: 900, ...gradientText, marginBottom: '12px', letterSpacing: '-0.02em' }}>LOOV</div>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', lineHeight: 1.7 }}>AI로 당신의 비즈니스를 자동화합니다. ChatGPT, Gemini, Claude 기반의 올인원 AI 플랫폼.</p>
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              {['📸', '🐦', '📺', '💼'].map((icon, i) => (
                <div key={i} style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '16px', transition: 'all 0.2s ease' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,212,255,0.1)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(0,212,255,0.3)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
                >{icon}</div>
              ))}
            </div>
          </div>
          {[
            { title: '제품', items: ['AI 채팅', 'ERP', 'SNS 자동화', '쿠팡 파트너스', 'WordPress AI'] },
            { title: '지원', items: ['시작 가이드', '문서', 'API', '커뮤니티', '문의하기'] },
            { title: '회사', items: ['소개', '블로그', '채용', '파트너', '법적 고지'] },
          ].map((col, i) => (
            <div key={i}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', marginBottom: '16px' }}>{col.title}</div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {col.items.map((item, j) => (
                  <li key={j}><Link href="#" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '14px', textDecoration: 'none', transition: 'color 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#00D4FF')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                  >{item}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '28px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '12px' }}>© 2026 LOOV Inc. All rights reserved.</span>
          <div style={{ display: 'flex', gap: '24px' }}>
            {['개인정보처리방침', '이용약관', '쿠키 정책'].map((item, i) => (
              <Link key={i} href="#" style={{ color: 'rgba(255,255,255,0.2)', fontSize: '12px', textDecoration: 'none', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}
              >{item}</Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const features: FeatureConfig[] = [
    {
      num: '01',
      title: 'AI 직원 채팅',
      desc: 'ChatGPT, Gemini, Claude 중 원하는 AI를 선택해 업무 지시를 내리세요. 매출 분석, 고객 응대, 콘텐츠 생성을 자동화합니다.',
      bullets: ['6가지 AI 모델 선택', '실시간 스트리밍 응답', '대화 히스토리 저장', 'AI 툴킷 연동'],
      accentColor: '#00D4FF',
      demo: (v) => <ChatDemo visible={v} />,
    },
    {
      num: '02',
      title: 'ERP 대시보드',
      desc: '매출, 고객, 재고, 회계를 하나의 화면에서. AI가 이상 징후를 실시간 감지하고 인사이트를 제공합니다.',
      bullets: ['실시간 KPI 모니터링', 'AI 예측 분석', '칸반/테이블 뷰 전환', '모바일 최적화'],
      accentColor: '#8B5CF6',
      demo: (v) => <ERPDemo visible={v} />,
    },
    {
      num: '03',
      title: 'SNS 자동화',
      desc: 'Instagram, YouTube, TikTok, Twitter, Facebook, LinkedIn — AI가 콘텐츠를 생성하고 최적 시간에 자동 게시합니다.',
      bullets: ['6개 플랫폼 동시 게시', 'AI 콘텐츠 자동 생성', '최적 게시 시간 분석', '해시태그 자동 추천'],
      accentColor: '#EC4899',
      demo: (v) => <SNSDemo visible={v} />,
    },
    {
      num: '04',
      title: '쿠팡 파트너스',
      desc: 'AI가 트렌드 상품을 분석하고 고수익 파트너스 링크를 자동 생성. SNS와 블로그에 자동으로 배포합니다.',
      bullets: ['AI 상품 추천 분석', '자동 링크 생성/배포', '수익 실시간 추적', '카테고리별 최적화'],
      accentColor: '#39FF14',
      demo: (v) => <CoupangDemo visible={v} />,
    },
    {
      num: '05',
      title: 'WordPress AI 블로그',
      desc: 'SEO 최적화 블로그 포스트를 AI가 자동 작성하고 WordPress에 바로 발행. 오가닉 트래픽을 자동으로 키웁니다.',
      bullets: ['SEO 점수 자동 최적화', '키워드 분석 & 적용', '자동 발행 스케줄링', '멀티 언어 지원'],
      accentColor: '#8B5CF6',
      demo: (v) => <WordPressDemo visible={v} />,
    },
    {
      num: '06',
      title: 'CCTV & 트래커',
      desc: '사무소, 매장, 배송 차량을 실시간 모니터링. AI가 이상 상황을 즉시 감지하고 알림을 발송합니다.',
      bullets: ['다중 카메라 실시간', 'GPS 위치 추적', 'AI 이상 감지 알림', '모바일 원격 접근'],
      accentColor: '#FF4444',
      demo: (v) => <CCTVDemo visible={v} />,
    },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div style={{ background: '#000', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: 'white' }}>
        <Nav />
        <Hero />
        {features.map((f, i) => <FeatureSection key={i} feature={f} reverse={i % 2 === 1} />)}
        <StatsSection />
        <IntegrationsSection />
        <PricingSection />
        <CTASection />
        <Footer />
      </div>
    </>
  );
}
