'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

// ─── Animation Constants ───────────────────────────────────────────────────
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

// ─── Hooks ─────────────────────────────────────────────────────────────────
function useScrollReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
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

// ─── Reveal Wrapper ────────────────────────────────────────────────────────
function Reveal({
  children,
  delay = 0,
  direction = 'up',
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'scale';
  className?: string;
}) {
  const { ref, visible } = useScrollReveal();

  const getHiddenTransform = () => {
    switch (direction) {
      case 'up': return 'translateY(40px)';
      case 'down': return 'translateY(-40px)';
      case 'left': return 'translateX(-40px)';
      case 'right': return 'translateX(40px)';
      case 'scale': return 'scale(0.85)';
      default: return 'translateY(40px)';
    }
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : getHiddenTransform(),
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ${SPRING} ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ─── Typewriter ────────────────────────────────────────────────────────────
const CYCLE_WORDS = ['영업을', '회계를', '마케팅을', '모든 업무를'];

function Typewriter() {
  const [wordIdx, setWordIdx] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = CYCLE_WORDS[wordIdx];
    let timeout: ReturnType<typeof setTimeout>;

    if (!deleting && displayed.length < word.length) {
      timeout = setTimeout(() => setDisplayed(word.slice(0, displayed.length + 1)), 80);
    } else if (!deleting && displayed.length === word.length) {
      timeout = setTimeout(() => setDeleting(true), 1800);
    } else if (deleting && displayed.length > 0) {
      timeout = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 50);
    } else if (deleting && displayed.length === 0) {
      setDeleting(false);
      setWordIdx((i) => (i + 1) % CYCLE_WORDS.length);
    }

    return () => clearTimeout(timeout);
  }, [displayed, deleting, wordIdx]);

  return (
    <span style={{ borderRight: '3px solid #000', paddingRight: '4px', minWidth: '2ch', display: 'inline-block' }}>
      {displayed}
    </span>
  );
}

// ─── Floating Dots Background ──────────────────────────────────────────────
function FloatingDots() {
  const dots = Array.from({ length: 64 }, (_, i) => i);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {dots.map((i) => {
        const col = i % 8;
        const row = Math.floor(i / 8);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: 4,
              height: 4,
              borderRadius: '50%',
              background: '#000',
              opacity: 0.07,
              left: `${(col + 1) * 12}%`,
              top: `${(row + 1) * 12}%`,
              animation: `floatDot 3s ease-in-out ${(i * 120) % 2400}ms infinite`,
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Chat Demo ─────────────────────────────────────────────────────────────
const chatMessages = [
  { role: 'user', text: '이번 주 인스타그램 콘텐츠 3개 만들어줘' },
  { role: 'ai', text: '피드·스토리·릴스 각 1편 준비했습니다 ✅' },
  { role: 'user', text: '제안서도 같이' },
  { role: 'ai', text: '즉시 작성 시작합니다 →' },
];

function ChatDemo({ active }: { active: boolean }) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (!active) return;
    setVisibleCount(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    chatMessages.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleCount(i + 1), i * 800 + 300));
    });
    return () => timers.forEach(clearTimeout);
  }, [active]);

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #E5E5E5',
        borderRadius: 16,
        padding: '24px',
        maxWidth: 380,
        width: '100%',
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, borderBottom: '1px solid #E5E5E5', paddingBottom: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#000', animation: 'pulse 2s infinite' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#000' }}>AI 직원</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 160 }}>
        {chatMessages.slice(0, visibleCount).map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              animation: `slideRight 0.4s ${SPRING}`,
            }}
          >
            <div
              style={{
                maxWidth: '78%',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: msg.role === 'user' ? '#000' : '#F9F9F9',
                color: msg.role === 'user' ? '#fff' : '#000',
                border: msg.role === 'ai' ? '1px solid #E5E5E5' : 'none',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {visibleCount > 0 && visibleCount < chatMessages.length && (
          <div style={{ display: 'flex', gap: 4, paddingLeft: 4 }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#999',
                  animation: `typingDot 1s ease-in-out ${i * 200}ms infinite`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ERP Demo ──────────────────────────────────────────────────────────────
const erpStats = [
  { label: '이번달 매출', value: '₩4,250만', bar: 85 },
  { label: '진행중 리드', value: '23건', bar: 60 },
  { label: 'SNS 노출', value: '14.2만', bar: 72 },
];

function ERPDemo({ active }: { active: boolean }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #E5E5E5',
        borderRadius: 16,
        padding: '24px',
        maxWidth: 380,
        width: '100%',
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: '#666', marginBottom: 16 }}>실시간 현황</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {erpStats.map((stat, i) => (
          <div
            key={i}
            style={{
              opacity: active ? 1 : 0,
              transform: active ? 'none' : 'translateY(16px)',
              transition: `opacity 0.5s ease ${i * 200 + 200}ms, transform 0.5s ${SPRING} ${i * 200 + 200}ms`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: '#666' }}>{stat.label}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#000' }}>{stat.value}</span>
            </div>
            <div style={{ height: 6, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  background: '#000',
                  borderRadius: 3,
                  width: active ? `${stat.bar}%` : '0%',
                  transition: `width 1s ${SPRING} ${i * 200 + 400}ms`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SNS Demo ──────────────────────────────────────────────────────────────
const platforms = ['Instagram', 'Threads', 'Facebook', 'Twitter', 'LinkedIn', 'YouTube'];

function SNSDemo({ active }: { active: boolean }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #E5E5E5',
        borderRadius: 16,
        padding: '24px',
        maxWidth: 380,
        width: '100%',
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        perspective: '800px',
        transform: active ? 'rotateX(0deg)' : 'rotateX(8deg)',
        transition: `transform 0.8s ${SPRING}`,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: '#666', marginBottom: 16 }}>발행 현황</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {platforms.map((p, i) => (
          <div
            key={p}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              background: '#F9F9F9',
              borderRadius: 8,
              border: '1px solid #E5E5E5',
              opacity: active ? 1 : 0,
              transform: active ? 'none' : 'scale(0.85)',
              transition: `opacity 0.4s ease ${i * 150 + 200}ms, transform 0.4s ${SPRING} ${i * 150 + 200}ms`,
            }}
          >
            <span style={{ fontSize: 11, color: '#000', fontWeight: 600 }}>{p}</span>
            {active && i < 4 && (
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 10,
                  color: '#000',
                  opacity: active ? 1 : 0,
                  transition: `opacity 0.3s ease ${i * 150 + 600}ms`,
                }}
              >
                ✓
              </span>
            )}
          </div>
        ))}
      </div>
      <div style={{ height: 6, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            background: '#000',
            borderRadius: 3,
            width: active ? '66%' : '0%',
            transition: `width 1.2s ${SPRING} 400ms`,
          }}
        />
      </div>
      <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>4/6 플랫폼 발행 완료</div>
    </div>
  );
}

// ─── Coupang Demo ──────────────────────────────────────────────────────────
function CoupangDemo({ active }: { active: boolean }) {
  return (
    <div style={{ maxWidth: 380, width: '100%', position: 'relative' }}>
      <div
        style={{
          background: '#fff',
          border: '1px solid #E5E5E5',
          borderRadius: 16,
          padding: '20px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          opacity: active ? 1 : 0,
          transform: active ? 'none' : 'translateY(20px)',
          transition: `opacity 0.5s ease, transform 0.5s ${SPRING}`,
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 56, height: 56, background: '#F0F0F0', borderRadius: 10, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>프리미엄 블루투스 이어폰</div>
            <div style={{ color: '#666', fontSize: 13, marginTop: 2 }}>₩89,000</div>
            <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>파트너스 수수료 3%</div>
          </div>
        </div>
      </div>
      <div style={{ position: 'relative', marginTop: 16, height: 100 }}>
        {[0, 1, 2].map((i) => {
          const angles = [-35, 0, 35];
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                width: 120,
                height: 60,
                background: '#fff',
                border: '1px solid #E5E5E5',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 600,
                color: '#000',
                boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                transformOrigin: 'center bottom',
                transform: active
                  ? `translateX(-50%) rotate(${angles[i]}deg) translateY(${i === 1 ? 20 : 0}px)`
                  : 'translateX(-50%) rotate(0deg)',
                opacity: active ? 0.9 : 0,
                transition: `all 0.6s ${SPRING} ${(i + 1) * 200}ms`,
              }}
            >
              {['인스타', '블로그', '트위터'][i]}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Blog Demo ─────────────────────────────────────────────────────────────
const blogText = 'AI가 자동으로 작성하는 SEO 최적화 블로그 포스트입니다. 키워드 분석부터 내용 구성, 이미지 생성까지 모두 자동화됩니다...';

function BlogDemo({ active }: { active: boolean }) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!active) { setTyped(''); return; }
    let i = 0;
    const interval = setInterval(() => {
      if (i < blogText.length) {
        setTyped(blogText.slice(0, ++i));
      } else {
        clearInterval(interval);
      }
    }, 30);
    return () => clearInterval(interval);
  }, [active]);

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #E5E5E5',
        borderRadius: 16,
        padding: '24px',
        maxWidth: 380,
        width: '100%',
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['#', 'B', 'I'].map((b) => (
          <div key={b} style={{ width: 28, height: 28, background: '#F0F0F0', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{b}</div>
        ))}
        <div style={{ flex: 1, height: 28, background: '#F0F0F0', borderRadius: 6 }} />
      </div>
      <div
        style={{
          background: '#F9F9F9',
          borderRadius: 10,
          padding: '16px',
          minHeight: 100,
          border: '1px solid #E5E5E5',
        }}
      >
        <div style={{ width: '60%', height: 12, background: '#E5E5E5', borderRadius: 4, marginBottom: 10 }} />
        <div style={{ fontSize: 13, lineHeight: 1.7, color: '#333' }}>
          {typed}
          {active && typed.length < blogText.length && (
            <span style={{ borderRight: '2px solid #000', animation: 'pulse 1s infinite' }}>&nbsp;</span>
          )}
        </div>
      </div>
      <div
        style={{
          marginTop: 12,
          height: 60,
          background: '#F0F0F0',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          color: '#999',
          opacity: active && typed.length > 40 ? 1 : 0,
          transition: 'opacity 0.5s ease',
        }}
      >
        AI 이미지 생성중...
      </div>
    </div>
  );
}

// ─── CCTV Demo ─────────────────────────────────────────────────────────────
function CCTVDemo({ active }: { active: boolean }) {
  return (
    <div
      style={{
        background: '#000',
        borderRadius: 32,
        padding: '32px 24px',
        maxWidth: 200,
        width: '100%',
        aspectRatio: '9/16',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        border: '3px solid #333',
        position: 'relative',
        boxShadow: '0 4px 32px rgba(0,0,0,0.2)',
        opacity: active ? 1 : 0,
        transform: active ? 'none' : 'scale(0.9)',
        transition: `opacity 0.5s ease, transform 0.5s ${SPRING}`,
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
      <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>잠금 화면</div>
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          border: '2px solid #333',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 16,
        }}
      >
        <span style={{ fontSize: 22 }}>📷</span>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          opacity: active ? 1 : 0,
          transition: 'opacity 0.5s ease 0.8s',
        }}
      >
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#fff',
            animation: active ? 'pulse 1.5s infinite' : 'none',
          }}
        />
        <span style={{ color: '#fff', fontSize: 9 }}>REC</span>
      </div>
    </div>
  );
}

// ─── Feature Section ───────────────────────────────────────────────────────
interface FeatureSectionProps {
  index: number;
  title: string;
  subtitle: string;
  description: string;
  demo: React.ReactNode;
  flip?: boolean;
}

function FeatureSection({ index, title, subtitle, description, demo, flip }: FeatureSectionProps) {
  const { ref, visible } = useScrollReveal(0.2);

  return (
    <div
      ref={ref}
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px',
        scrollSnapAlign: 'start',
        background: index % 2 === 0 ? '#fff' : '#FAFAFA',
        borderBottom: '1px solid #E5E5E5',
      }}
    >
      <div
        style={{
          maxWidth: 1000,
          width: '100%',
          display: 'flex',
          flexDirection: flip ? 'row-reverse' : 'row',
          alignItems: 'center',
          gap: 80,
          flexWrap: 'wrap',
        }}
      >
        {/* Text */}
        <div style={{ flex: '1 1 300px' }}>
          <div
            style={{
              display: 'inline-block',
              padding: '4px 12px',
              background: '#000',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 4,
              marginBottom: 20,
              opacity: visible ? 1 : 0,
              transform: visible ? 'none' : 'translateY(16px)',
              transition: `opacity 0.5s ease 100ms, transform 0.5s ${SPRING} 100ms`,
            }}
          >
            {subtitle}
          </div>
          <h2
            style={{
              fontSize: 'clamp(26px, 4vw, 44px)',
              fontWeight: 800,
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
              color: '#000',
              marginBottom: 20,
              opacity: visible ? 1 : 0,
              transform: visible ? 'none' : 'translateY(24px)',
              transition: `opacity 0.6s ease 200ms, transform 0.6s ${SPRING} 200ms`,
            }}
          >
            {title}
          </h2>
          <p
            style={{
              fontSize: 16,
              color: '#555',
              lineHeight: 1.7,
              opacity: visible ? 1 : 0,
              transform: visible ? 'none' : 'translateY(20px)',
              transition: `opacity 0.6s ease 350ms, transform 0.6s ${SPRING} 350ms`,
            }}
          >
            {description}
          </p>
        </div>
        {/* Demo */}
        <div
          style={{
            flex: '1 1 300px',
            display: 'flex',
            justifyContent: 'center',
            opacity: visible ? 1 : 0,
            transform: visible ? 'none' : `translateX(${flip ? '-40px' : '40px'})`,
            transition: `opacity 0.7s ease 300ms, transform 0.7s ${SPRING} 300ms`,
          }}
        >
          {demo}
        </div>
      </div>
    </div>
  );
}

// ─── Counter ───────────────────────────────────────────────────────────────
interface StatCounterProps {
  target: number;
  suffix: string;
  label: string;
  active: boolean;
  delay: number;
}

function StatCounter({ target, suffix, label, active, delay }: StatCounterProps) {
  const count = useCountUp(target, 2000, active);

  return (
    <div
      style={{
        textAlign: 'center',
        opacity: active ? 1 : 0,
        transform: active ? 'none' : 'translateY(24px)',
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ${SPRING} ${delay}ms`,
      }}
    >
      <div style={{ fontSize: 'clamp(40px, 7vw, 72px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1 }}>
        {count}{suffix}
      </div>
      <div style={{ fontSize: 14, color: '#666', marginTop: 8 }}>{label}</div>
    </div>
  );
}

// ─── Integration Card ──────────────────────────────────────────────────────
function IntegrationCard({ name, delay }: { name: string; delay: number }) {
  const [hovered, setHovered] = useState(false);
  const { ref, visible } = useScrollReveal(0.1);

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '20px',
        border: `1px solid ${hovered ? '#000' : '#E5E5E5'}`,
        borderRadius: 12,
        textAlign: 'center',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'default',
        background: hovered ? '#000' : '#fff',
        color: hovered ? '#fff' : '#000',
        transform: visible
          ? hovered
            ? 'perspective(400px) rotateX(-4deg) rotateY(4deg) translateY(-4px)'
            : 'none'
          : 'translateY(20px)',
        opacity: visible ? 1 : 0,
        transition: `all 0.3s ${SPRING} ${delay}ms, opacity 0.5s ease ${delay}ms`,
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.15)' : 'none',
      }}
    >
      {name}
    </div>
  );
}

// ─── Pricing Card ──────────────────────────────────────────────────────────
interface PricingCardProps {
  name: string;
  price: string;
  period?: string;
  features: string[];
  highlighted?: boolean;
  delay: number;
}

function PricingCard({ name, price, period = '/월', features, highlighted, delay }: PricingCardProps) {
  const { ref, visible } = useScrollReveal(0.1);

  return (
    <div
      ref={ref}
      style={{
        flex: '1 1 200px',
        maxWidth: 240,
        padding: '32px 24px',
        border: highlighted ? '2px solid #000' : '1px solid #E5E5E5',
        borderRadius: 16,
        background: highlighted ? '#000' : '#fff',
        color: highlighted ? '#fff' : '#000',
        opacity: visible ? 1 : 0,
        transform: visible ? (highlighted ? 'translateY(-8px)' : 'none') : 'translateY(32px)',
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ${SPRING} ${delay}ms`,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: highlighted ? '#999' : '#666', marginBottom: 8 }}>{name}</div>
      <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 4 }}>
        {price}
        <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.6 }}>{period}</span>
      </div>
      <div style={{ height: 1, background: highlighted ? '#333' : '#E5E5E5', margin: '20px 0' }} />
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {features.map((f) => (
          <li key={f} style={{ fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8, opacity: highlighted ? 0.9 : 0.8 }}>
            <span style={{ flexShrink: 0 }}>✓</span>
            {f}
          </li>
        ))}
      </ul>
      <Link
        href="/dashboard"
        style={{
          display: 'block',
          marginTop: 24,
          padding: '12px',
          textAlign: 'center',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          background: highlighted ? '#fff' : '#000',
          color: highlighted ? '#000' : '#fff',
          textDecoration: 'none',
          transition: 'opacity 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
      >
        시작하기
      </Link>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);

  const statsRef = useRef<HTMLDivElement>(null);
  const [statsVisible, setStatsVisible] = useState(false);

  const feat1Ref = useRef<HTMLDivElement>(null);
  const feat2Ref = useRef<HTMLDivElement>(null);
  const feat3Ref = useRef<HTMLDivElement>(null);
  const feat4Ref = useRef<HTMLDivElement>(null);
  const feat5Ref = useRef<HTMLDivElement>(null);
  const feat6Ref = useRef<HTMLDivElement>(null);

  const [feat1Active, setFeat1Active] = useState(false);
  const [feat2Active, setFeat2Active] = useState(false);
  const [feat3Active, setFeat3Active] = useState(false);
  const [feat4Active, setFeat4Active] = useState(false);
  const [feat5Active, setFeat5Active] = useState(false);
  const [feat6Active, setFeat6Active] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const makeObs = useCallback(
    (setter: (v: boolean) => void) =>
      new IntersectionObserver(([e]) => { if (e.isIntersecting) setter(true); }, { threshold: 0.25 }),
    []
  );

  useEffect(() => {
    const pairs: [React.RefObject<HTMLDivElement | null>, (v: boolean) => void][] = [
      [statsRef, setStatsVisible],
      [feat1Ref, setFeat1Active],
      [feat2Ref, setFeat2Active],
      [feat3Ref, setFeat3Active],
      [feat4Ref, setFeat4Active],
      [feat5Ref, setFeat5Active],
      [feat6Ref, setFeat6Active],
    ];
    const observers = pairs.map(([ref, setter]) => {
      const obs = makeObs(setter);
      if (ref.current) obs.observe(ref.current);
      return obs;
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [makeObs]);

  return (
    <>
      {/* Global Styles */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: #fff; color: #000; }
        a { text-decoration: none; color: inherit; }

        @keyframes floatDot {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(32px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes springIn {
          0% { opacity: 0; transform: scale(0.85); }
          70% { transform: scale(1.04); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
        @keyframes slideRight {
          from { transform: translateX(-40px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes countUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes barGrow {
          from { width: 0; }
          to { width: var(--bar-w); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes arrowBounce {
          0%, 100% { transform: translateY(0) translateX(-50%); }
          50% { transform: translateY(8px) translateX(-50%); }
        }

        @media (max-width: 768px) {
          .feat-snap-wrap { scroll-snap-type: none !important; }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          height: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
          background: scrolled ? 'rgba(255,255,255,0.92)' : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
          borderBottom: scrolled ? '1px solid #E5E5E5' : '1px solid transparent',
          transition: 'background 0.3s ease, border-color 0.3s ease, backdrop-filter 0.3s ease',
        }}
      >
        <Link href="/" style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.05em', color: '#000' }}>
          LOOV
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link
            href="/login"
            style={{ fontSize: 14, fontWeight: 500, color: '#000', padding: '8px 14px', borderRadius: 8, transition: 'background 0.2s' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F5F5F5')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            로그인
          </Link>
          <Link
            href="/dashboard"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#fff',
              background: '#000',
              padding: '9px 20px',
              borderRadius: 8,
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            무료 시작
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section
        style={{
          position: 'relative',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          background: '#fff',
          paddingTop: 60,
        }}
      >
        <FloatingDots />
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            textAlign: 'center',
            padding: '40px 24px',
            maxWidth: 820,
            width: '100%',
          }}
        >
          <div style={{ animation: 'fadeUp 0.8s cubic-bezier(0.34,1.56,0.64,1) 0.1s both' }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', color: '#888', marginBottom: 32, textTransform: 'uppercase' }}>
              AI 비즈니스 자동화 플랫폼
            </p>
          </div>

          <h1
            style={{
              fontSize: 'clamp(32px, 8vw, 80px)',
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              color: '#000',
              animation: 'fadeUp 0.8s cubic-bezier(0.34,1.56,0.64,1) 0.25s both',
            }}
          >
            AI 직원팀이
          </h1>

          <h1
            style={{
              fontSize: 'clamp(32px, 8vw, 80px)',
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              color: '#000',
              minHeight: '1.15em',
              animation: 'fadeUp 0.8s cubic-bezier(0.34,1.56,0.64,1) 0.38s both',
            }}
          >
            <Typewriter />
          </h1>

          <h1
            style={{
              fontSize: 'clamp(32px, 8vw, 80px)',
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              color: '#000',
              marginBottom: 36,
              animation: 'fadeUp 0.8s cubic-bezier(0.34,1.56,0.64,1) 0.51s both',
            }}
          >
            처리합니다
          </h1>

          <p
            style={{
              fontSize: 'clamp(14px, 2vw, 18px)',
              color: '#555',
              lineHeight: 1.6,
              marginBottom: 48,
              animation: 'fadeUp 0.8s cubic-bezier(0.34,1.56,0.64,1) 0.66s both',
            }}
          >
            ChatGPT·Gemini·Claude 기반 AI 팀이 대표님 회사를 운영합니다
          </p>

          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              flexWrap: 'wrap',
              animation: 'fadeUp 0.8s cubic-bezier(0.34,1.56,0.64,1) 0.8s both',
            }}
          >
            <Link
              href="/dashboard"
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#fff',
                background: '#000',
                padding: '16px 40px',
                borderRadius: 10,
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              무료로 시작
            </Link>
            <button
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: '#000',
                background: 'transparent',
                padding: '16px 40px',
                borderRadius: 10,
                border: '1.5px solid #000',
                cursor: 'pointer',
                transition: 'background 0.2s, color 0.2s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#000'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#000'; }}
            >
              데모 보기
            </button>
          </div>
        </div>

        {/* Scroll Arrow */}
        <div
          style={{
            position: 'absolute',
            bottom: 32,
            left: '50%',
            animation: 'arrowBounce 2s ease-in-out infinite',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 10, color: '#bbb', letterSpacing: '0.12em', fontWeight: 600 }}>SCROLL</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3L8 13M3 8L8 13L13 8" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <div className="feat-snap-wrap" style={{ scrollSnapType: 'y mandatory' }}>

        <div ref={feat1Ref}>
          <FeatureSection
            index={0}
            subtitle="AI 직원 채팅"
            title="대화 한 줄이 업무가 됩니다"
            description="자연어로 명령하면 AI 직원이 즉시 실행합니다. 콘텐츠 제작, 문서 작성, 일정 관리까지 채팅 한 번으로 처리됩니다."
            demo={<ChatDemo active={feat1Active} />}
          />
        </div>

        <div ref={feat2Ref}>
          <FeatureSection
            index={1}
            subtitle="스마트 ERP"
            title="AI가 운영하는 ERP"
            description="매출, 리드, SNS 성과를 실시간으로 추적하고 분석합니다. AI가 이상 징후를 감지하고 개선 방안을 제안합니다."
            demo={<ERPDemo active={feat2Active} />}
            flip
          />
        </div>

        <div ref={feat3Ref}>
          <FeatureSection
            index={2}
            subtitle="SNS 자동화"
            title="한 번 작성, 6개 플랫폼 동시 발행"
            description="콘텐츠를 한 번 만들면 Instagram, Threads, Facebook, Twitter, LinkedIn, YouTube에 자동으로 최적화하여 발행합니다."
            demo={<SNSDemo active={feat3Active} />}
          />
        </div>

        <div ref={feat4Ref}>
          <FeatureSection
            index={3}
            subtitle="쿠팡 파트너스"
            title="잠자는 동안도 수익링크가 퍼집니다"
            description="AI가 트렌드 상품을 발굴하고 파트너스 링크를 생성하여 SNS 전 채널에 자동 배포합니다. 수익이 자동화됩니다."
            demo={<CoupangDemo active={feat4Active} />}
            flip
          />
        </div>

        <div ref={feat5Ref}>
          <FeatureSection
            index={4}
            subtitle="WordPress / 블로그"
            title="AI가 쓰고, AI가 올립니다"
            description="키워드만 입력하면 SEO 최적화된 블로그 포스트를 자동 작성하고, 이미지 생성 후 WordPress에 직접 업로드합니다."
            demo={<BlogDemo active={feat5Active} />}
          />
        </div>

        <div ref={feat6Ref}>
          <FeatureSection
            index={5}
            subtitle="CCTV & 트래커"
            title="숨겨진 보안 카메라"
            description="스마트폰을 보안 카메라로 전환합니다. 원격 모니터링, 움직임 감지, 실시간 알림까지 비즈니스 보안을 완성합니다."
            demo={<CCTVDemo active={feat6Active} />}
            flip
          />
        </div>

      </div>

      {/* ── STATS ── */}
      <section
        ref={statsRef}
        style={{
          background: '#000',
          padding: '100px 24px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            maxWidth: 900,
            width: '100%',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 48,
          }}
        >
          <StatCounter target={6} suffix="개" label="AI 모델 지원" active={statsVisible} delay={0} />
          <StatCounter target={12} suffix="개" label="플랫폼 연동" active={statsVisible} delay={200} />
          <StatCounter target={5} suffix="분" label="설정 완료" active={statsVisible} delay={400} />
          <StatCounter target={24} suffix="시간" label="자동 운영" active={statsVisible} delay={600} />
        </div>
      </section>

      {/* ── INTEGRATIONS ── */}
      <section style={{ padding: '100px 24px', background: '#fff' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Reveal>
            <h2
              style={{
                fontSize: 'clamp(26px, 4vw, 44px)',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                textAlign: 'center',
                marginBottom: 12,
                color: '#000',
              }}
            >
              연결하면 자동화됩니다
            </h2>
          </Reveal>
          <Reveal delay={150}>
            <p style={{ textAlign: 'center', color: '#666', fontSize: 16, marginBottom: 60 }}>
              익숙한 서비스를 연결하면 AI가 모든 것을 처리합니다
            </p>
          </Reveal>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 12,
            }}
          >
            {[
              '네이버 블로그', 'Instagram', 'YouTube', 'WordPress',
              'Google Calendar', 'Notion', 'Coupang', 'n8n',
              'Threads', 'Facebook',
            ].map((name, i) => (
              <IntegrationCard key={name} name={name} delay={i * 60} />
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section style={{ padding: '100px 24px', background: '#FAFAFA', borderTop: '1px solid #E5E5E5', borderBottom: '1px solid #E5E5E5' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <Reveal>
            <h2
              style={{
                fontSize: 'clamp(26px, 4vw, 44px)',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                textAlign: 'center',
                marginBottom: 12,
                color: '#000',
              }}
            >
              심플한 요금제
            </h2>
          </Reveal>
          <Reveal delay={150}>
            <p style={{ textAlign: 'center', color: '#666', fontSize: 16, marginBottom: 60 }}>
              지금 무료로 시작하고 필요할 때 업그레이드하세요
            </p>
          </Reveal>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start' }}>
            <PricingCard
              name="무료"
              price="₩0"
              period=""
              features={[
                'AI 채팅 월 50회',
                '기본 ERP 대시보드',
                'SNS 월 10건 발행',
                '1개 플랫폼 연동',
              ]}
              delay={0}
            />
            <PricingCard
              name="베이직"
              price="₩29,000"
              features={[
                'AI 채팅 무제한',
                '전체 ERP 기능',
                'SNS 월 100건 발행',
                '3개 플랫폼 연동',
                '이메일 지원',
              ]}
              delay={150}
            />
            <PricingCard
              name="스타터"
              price="₩59,000"
              features={[
                '모든 베이직 기능',
                'SNS 무제한 발행',
                '6개 플랫폼 연동',
                '쿠팡 파트너스 자동화',
                '블로그 자동 발행',
                '우선 지원',
              ]}
              highlighted
              delay={300}
            />
            <PricingCard
              name="프로"
              price="₩99,000"
              features={[
                '모든 스타터 기능',
                'CCTV 트래커 기능',
                '다중 워크스페이스',
                'API 접근 권한',
                'n8n 자동화 연동',
                '전담 매니저',
              ]}
              delay={450}
            />
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section
        style={{
          background: '#000',
          padding: '120px 24px',
          textAlign: 'center',
        }}
      >
        <Reveal>
          <h2
            style={{
              fontSize: 'clamp(28px, 5vw, 56px)',
              fontWeight: 900,
              letterSpacing: '-0.03em',
              color: '#fff',
              lineHeight: 1.15,
              marginBottom: 20,
            }}
          >
            지금 바로 AI 팀을
            <br />
            채용하세요
          </h2>
        </Reveal>
        <Reveal delay={200}>
          <p style={{ color: '#666', fontSize: 16, marginBottom: 48 }}>
            신용카드 없이 5분 안에 시작할 수 있습니다
          </p>
        </Reveal>
        <Reveal delay={360}>
          <Link
            href="/dashboard"
            style={{
              display: 'inline-block',
              fontSize: 16,
              fontWeight: 700,
              color: '#000',
              background: '#fff',
              padding: '18px 52px',
              borderRadius: 10,
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            무료로 시작하기
          </Link>
        </Reveal>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: '#000', borderTop: '1px solid #1a1a1a', padding: '56px 32px 40px' }}>
        <div
          style={{
            maxWidth: 960,
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 40,
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.05em', color: '#fff', marginBottom: 10 }}>
              LOOV
            </div>
            <p style={{ color: '#555', fontSize: 13, lineHeight: 1.7, maxWidth: 220 }}>
              AI 기반 비즈니스 자동화 플랫폼으로<br />대표님의 회사를 운영합니다.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 56, flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: '#fff', fontSize: 12, fontWeight: 700, marginBottom: 16, letterSpacing: '0.06em', textTransform: 'uppercase' }}>서비스</div>
              {['AI 채팅', 'ERP', 'SNS 자동화', '블로그', 'CCTV'].map((l) => (
                <div key={l} style={{ marginBottom: 10 }}>
                  <Link
                    href="/dashboard"
                    style={{ color: '#555', fontSize: 13, transition: 'color 0.2s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
                  >
                    {l}
                  </Link>
                </div>
              ))}
            </div>
            <div>
              <div style={{ color: '#fff', fontSize: 12, fontWeight: 700, marginBottom: 16, letterSpacing: '0.06em', textTransform: 'uppercase' }}>회사</div>
              {['소개', '블로그', '지원', '이용약관', '개인정보처리방침'].map((l) => (
                <div key={l} style={{ marginBottom: 10 }}>
                  <Link
                    href="/"
                    style={{ color: '#555', fontSize: 13, transition: 'color 0.2s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
                  >
                    {l}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          style={{
            maxWidth: 960,
            margin: '40px auto 0',
            paddingTop: 24,
            borderTop: '1px solid #1a1a1a',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <span style={{ color: '#444', fontSize: 12 }}>© 2026 LOOV. All rights reserved.</span>
          <span style={{ color: '#444', fontSize: 12 }}>AI가 만드는 더 나은 비즈니스</span>
        </div>
      </footer>
    </>
  );
}
