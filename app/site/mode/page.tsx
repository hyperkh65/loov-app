'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

const PASSWORD = '7777';
const STORAGE_KEY = 'mode_auth';

const FEATURES = [
  {
    href: '/youtube',
    icon: '📥',
    emoji: '▶',
    title: 'YouTube 다운로드',
    desc: '유튜브 채널 전체를 NAS에 자동 저장',
    color: '#e11d48',
    glow: 'rgba(225,29,72,0.35)',
    bg: 'linear-gradient(135deg, rgba(225,29,72,0.18) 0%, rgba(159,18,57,0.08) 100%)',
    border: 'rgba(225,29,72,0.3)',
  },
  {
    href: '/english',
    icon: '🇺🇸',
    emoji: '📖',
    title: '영어 공부',
    desc: '영어 학습 자료 및 AI 회화 연습',
    color: '#3b82f6',
    glow: 'rgba(59,130,246,0.35)',
    bg: 'linear-gradient(135deg, rgba(59,130,246,0.18) 0%, rgba(30,64,175,0.08) 100%)',
    border: 'rgba(59,130,246,0.3)',
  },
  {
    href: '/market',
    icon: '📊',
    emoji: '🔍',
    title: '시장 조사',
    desc: '트렌드 분석 및 시장 리서치 도구',
    color: '#10b981',
    glow: 'rgba(16,185,129,0.35)',
    bg: 'linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(6,95,70,0.08) 100%)',
    border: 'rgba(16,185,129,0.3)',
  },
];

// ── 파티클 배경 ──────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.5 + 0.3,
      dx: (Math.random() - 0.5) * 0.3,
      dy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.5 + 0.1,
    }));

    let animId: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(168,85,247,${p.alpha})`;
        ctx.fill();
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
      }
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}

// ── PIN 입력 화면 ──────────────────────────────────────
function PinScreen({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const [hint, setHint] = useState('');

  const press = (v: string) => {
    if (pin.length >= 4) return;
    const next = pin + v;
    setPin(next);
    if (next.length === 4) {
      if (next === PASSWORD) {
        localStorage.setItem(STORAGE_KEY, '1');
        onSuccess();
      } else {
        setShake(true);
        setHint('틀렸습니다');
        setTimeout(() => { setShake(false); setPin(''); setHint(''); }, 700);
      }
    }
  };

  const del = () => setPin(p => p.slice(0, -1));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950">
      <ParticleCanvas />
      {/* 배경 글로우 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, #a855f7, transparent)' }} />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 select-none">
        {/* 로고 */}
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-widest text-white mb-1"
            style={{ textShadow: '0 0 30px rgba(168,85,247,0.8)' }}>
            mode
          </h1>
          <p className="text-gray-500 text-sm">PIN을 입력하세요</p>
        </div>

        {/* 점 표시 */}
        <div
          className={`flex gap-4 ${shake ? 'animate-bounce' : ''}`}
          style={shake ? { animation: 'shake 0.4s ease' } : {}}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}
              className="w-4 h-4 rounded-full border-2 transition-all duration-200"
              style={{
                borderColor: pin.length > i ? '#a855f7' : '#374151',
                background: pin.length > i ? '#a855f7' : 'transparent',
                boxShadow: pin.length > i ? '0 0 10px #a855f7' : 'none',
              }}
            />
          ))}
        </div>

        {hint && <p className="text-red-400 text-sm -mt-4">{hint}</p>}

        {/* 키패드 */}
        <div className="grid grid-cols-3 gap-3">
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k) => (
            <button
              key={k}
              onClick={() => k === '⌫' ? del() : k !== '' ? press(k) : undefined}
              disabled={k === ''}
              className="w-20 h-20 rounded-2xl text-xl font-bold transition-all duration-150 disabled:invisible"
              style={{
                background: k === '⌫'
                  ? 'rgba(239,68,68,0.1)'
                  : 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: k === '⌫' ? '#f87171' : '#fff',
              }}
              onMouseEnter={e => {
                if (k !== '') (e.currentTarget as HTMLButtonElement).style.background =
                  k === '⌫' ? 'rgba(239,68,68,0.2)' : 'rgba(168,85,247,0.2)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  k === '⌫' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)';
              }}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)}
          60%{transform:translateX(-5px)}
          80%{transform:translateX(5px)}
        }
      `}</style>
    </div>
  );
}

// ── 메인 카드 ──────────────────────────────────────
function FeatureCard({ f, index }: { f: typeof FEATURES[0]; index: number }) {
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLAnchorElement>(null);

  const onMouseMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      x: ((e.clientX - rect.left) / rect.width - 0.5) * 15,
      y: ((e.clientY - rect.top) / rect.height - 0.5) * -15,
    });
  };

  return (
    <Link
      ref={ref}
      href={f.href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPos({ x: 0, y: 0 }); }}
      onMouseMove={onMouseMove}
      className="block rounded-2xl overflow-hidden cursor-pointer"
      style={{
        background: f.bg,
        border: `1px solid ${hovered ? f.color : f.border}`,
        transform: hovered
          ? `perspective(800px) rotateX(${pos.y}deg) rotateY(${pos.x}deg) scale(1.03)`
          : 'perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)',
        boxShadow: hovered ? `0 20px 60px ${f.glow}, 0 0 0 1px ${f.color}40` : '0 4px 20px rgba(0,0,0,0.3)',
        transition: 'transform 0.15s ease, box-shadow 0.3s ease, border-color 0.3s ease',
        animationDelay: `${index * 0.1}s`,
      }}
    >
      <div className="p-8 relative overflow-hidden">
        {/* 글로우 효과 */}
        <div className="absolute inset-0 opacity-0 transition-opacity duration-300 pointer-events-none"
          style={{
            background: `radial-gradient(circle at ${50 + pos.x * 2}% ${50 - pos.y * 2}%, ${f.glow} 0%, transparent 70%)`,
            opacity: hovered ? 1 : 0,
          }}
        />

        <div className="relative z-10">
          <div className="text-5xl mb-4" style={{ filter: hovered ? `drop-shadow(0 0 12px ${f.color})` : 'none', transition: 'filter 0.3s' }}>
            {f.icon}
          </div>
          <h2 className="text-xl font-bold text-white mb-2" style={{ textShadow: hovered ? `0 0 20px ${f.color}` : 'none', transition: 'text-shadow 0.3s' }}>
            {f.title}
          </h2>
          <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>

          <div className="mt-5 flex items-center gap-2 text-sm font-medium transition-all duration-300"
            style={{ color: hovered ? f.color : '#6b7280' }}>
            <span>바로가기</span>
            <span style={{ transform: hovered ? 'translateX(4px)' : 'translateX(0)', transition: 'transform 0.2s', display: 'inline-block' }}>→</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── 메인 페이지 ──────────────────────────────────────
export default function ModePage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const ok = localStorage.getItem(STORAGE_KEY) === '1';
    setAuthed(ok);
    if (ok) setTimeout(() => setVisible(true), 50);
  }, []);

  const onSuccess = () => {
    setAuthed(true);
    setTimeout(() => setVisible(true), 50);
  };

  if (authed === null) return null;
  if (!authed) return <PinScreen onSuccess={onSuccess} />;

  return (
    <div className="relative min-h-screen">
      <ParticleCanvas />

      {/* 중앙 글로우 */}
      <div className="fixed inset-0 pointer-events-none flex items-center justify-center" style={{ zIndex: 0 }}>
        <div className="w-[600px] h-[600px] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.06), transparent 70%)' }} />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-16"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}>

        {/* 헤더 */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-6"
            style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', color: '#c084fc' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse inline-block" />
            개인 생산성 도구
          </div>
          <h1 className="text-6xl font-black tracking-widest text-white mb-4"
            style={{ textShadow: '0 0 60px rgba(168,85,247,0.5), 0 0 120px rgba(168,85,247,0.2)' }}>
            mode
          </h1>
          <p className="text-gray-500 text-lg">무엇을 시작할까요?</p>
        </div>

        {/* 카드 그리드 */}
        <div className="grid md:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.href} f={f} index={i} />
          ))}
        </div>

        {/* 잠금 버튼 */}
        <div className="mt-12 text-center">
          <button
            onClick={() => { localStorage.removeItem(STORAGE_KEY); setAuthed(false); setVisible(false); }}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            🔒 잠금
          </button>
        </div>
      </div>
    </div>
  );
}
