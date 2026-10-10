'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { Employee, ANIMAL_IMG, ANIMAL_LABEL, ORB_GRADIENT, ORB_SHADOW, ROLE_BADGE, ANIMAL_MODEL, ANIMAL_MODEL_ROTATION } from '@/lib/types';

const Character3DViewer = dynamic(() => import('./Character3DViewer'), { ssr: false });

type IdleState = 'breathe' | 'look-away' | 'yawn' | 'drowsy' | 'alert' | 'fidget' | 'stretch';
type GreetState = 'idle' | 'greeting' | 'greet-out';

interface Props {
  employee: Employee;
  characterImage?: string;
  isGenerating?: boolean;
  isChatOpen?: boolean;
  isSanmu?: boolean;
  sizeOverride?: number; // override default orb size
  onSelect: () => void;
}

const IDLE_POOL: IdleState[] = [
  'breathe', 'breathe', 'breathe', 'breathe',
  'look-away', 'look-away',
  'yawn', 'drowsy', 'drowsy',
  'alert', 'fidget', 'stretch',
];

const IDLE_DURATION: Record<IdleState, [number, number]> = {
  'breathe':   [3000, 5000],
  'look-away': [2500, 4000],
  'yawn':      [2800, 3500],
  'drowsy':    [4000, 7000],
  'alert':     [1200, 2000],
  'fidget':    [2000, 2800],
  'stretch':   [2000, 3000],
};

function pickIdle(current: IdleState): IdleState {
  const pool = IDLE_POOL.filter((s) => s !== current);
  return pool[Math.floor(Math.random() * pool.length)];
}

const GREET_LINES = [
  '안녕하세요! 😊', '어서오세요! 🎉', '부르셨나요! ✨',
  '네, 준비됐어요! 💪', '무엇을 도와드릴까요? 🌟',
];

export default function AnimatedCharacter({
  employee, characterImage, isGenerating, isSanmu, sizeOverride, onSelect,
}: Props) {
  const [idleAnim, setIdleAnim] = useState<IdleState>('breathe');
  const [greetState, setGreetState] = useState<GreetState>('idle');
  const [greetText] = useState(() => GREET_LINES[Math.floor(Math.random() * GREET_LINES.length)]);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isGreeting = greetState !== 'idle';

  const modelUrl = ANIMAL_MODEL[employee.animal];
  const modelRotY = ANIMAL_MODEL_ROTATION[employee.animal] ?? 0;
  const has3D = !!modelUrl && !isGenerating;

  // Idle animation cycle (2D only)
  useEffect(() => {
    if (has3D || isGreeting) return;
    const [min, max] = IDLE_DURATION[idleAnim];
    const delay = min + Math.random() * (max - min);
    timerRef.current = setTimeout(() => setIdleAnim(pickIdle(idleAnim)), delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [idleAnim, isGreeting, has3D]);

  const handleClick = () => {
    if (isGenerating) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setGreetState('greeting');
    setTimeout(() => {
      setGreetState('greet-out');
      setTimeout(() => { setGreetState('idle'); setIdleAnim('breathe'); onSelect(); }, 300);
    }, 1600);
  };

  const animClass =
    greetState === 'greeting' ? 'anim-greeting' :
    greetState === 'greet-out' ? 'anim-greet-out' :
    `anim-${idleAnim}`;

  const orbSize = sizeOverride ?? (isSanmu ? 86 : 68);
  // pt-28 = 112px headroom above orb in the dock → canvas can be up to 112+orbSize tall
  const canvasW = orbSize * 1.9;          // not too wide → no horizontal overflow
  const canvasH = 112 + orbSize - 8;      // fits within pt-28 (112px) + orb height, with small margin

  return (
    <div className="relative flex flex-col items-center gap-1.5 select-none">

      {/* ── 3D CHARACTER ───────────────────────────────────── */}
      {has3D ? (
        <div
          className="relative cursor-pointer"
          style={{ width: orbSize, height: orbSize, zIndex: isGreeting ? 50 : 1 }}
          onClick={handleClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Glow base — small coloured disc under the character */}
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
            style={{
              width: orbSize,
              height: orbSize * 0.35,
              background: ORB_GRADIENT[employee.animal],
              boxShadow: isSanmu
                ? `0 0 0 2px #fbbf24, ${ORB_SHADOW[employee.animal]}`
                : ORB_SHADOW[employee.animal],
              filter: 'blur(5px)',
              opacity: 0.75,
            }}
          />

          {/* 3D canvas — large, aligned to base, overflows upward */}
          <div
            style={{
              position: 'absolute',
              width:  canvasW,
              height: canvasH,
              bottom: 0,
              left:   '50%',
              transform: 'translateX(-50%)',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <Character3DViewer
              url={modelUrl!}
              hovered={isHovered}
              greeting={isGreeting}
              rotationY={modelRotY}
            />
          </div>

          {/* Online dot */}
          <div
            className="absolute bottom-1 right-1 rounded-full border-2 border-white"
            style={{ width: 10, height: 10, background: '#22c55e', zIndex: 20 }}
          />

          {/* Greeting speech bubble */}
          {greetState === 'greeting' && (
            <div
              className="bubble-appear absolute pointer-events-none whitespace-nowrap"
              style={{ bottom: canvasH * 0.75, left: '50%', transform: 'translateX(-50%)', zIndex: 60 }}
            >
              <div className="bg-white text-gray-800 text-xs font-semibold px-3 py-2 rounded-2xl shadow-xl border border-gray-100 relative">
                {greetText}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-white" />
              </div>
            </div>
          )}
        </div>

      ) : (
        /* ── 2D ORB ────────────────────────────────────────── */
        <div
          className={`relative cursor-pointer ${
            isGenerating ? 'anim-generating' :
            isGreeting   ? '' :
            'transition-transform duration-200 hover:scale-125'
          }`}
          onClick={handleClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{ width: orbSize, height: orbSize, zIndex: isGreeting ? 50 : 1 }}
        >
          <div
            className={`w-full h-full rounded-full overflow-hidden ${!isGenerating ? animClass : ''}`}
            style={{
              background: ORB_GRADIENT[employee.animal],
              boxShadow: isSanmu
                ? `0 0 0 3px #fbbf24, ${ORB_SHADOW[employee.animal]}`
                : ORB_SHADOW[employee.animal],
            }}
          >
            {!characterImage && (
              <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  background: 'radial-gradient(circle at 32% 26%, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.12) 38%, transparent 62%)',
                  zIndex: 2,
                }}
              />
            )}
            {characterImage ? (
              <img
                src={characterImage}
                alt={employee.name}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ zIndex: 1, mixBlendMode: 'multiply' }}
              />
            ) : isGenerating ? (
              <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 3 }}>
                <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 3 }}>
                <Image
                  src={ANIMAL_IMG[employee.animal]}
                  alt={ANIMAL_LABEL[employee.animal]}
                  width={isSanmu ? 52 : 40}
                  height={isSanmu ? 52 : 40}
                  unoptimized
                />
              </div>
            )}
            <div
              className="absolute bottom-1 right-1 rounded-full border-2 border-white"
              style={{ width: 10, height: 10, background: '#22c55e', zIndex: 5 }}
            />
          </div>

          {greetState === 'greeting' && (
            <div
              className="bubble-appear absolute pointer-events-none whitespace-nowrap"
              style={{ bottom: '108%', left: '50%', transform: 'translateX(-50%)', zIndex: 60 }}
            >
              <div className="bg-white text-gray-800 text-xs font-semibold px-3 py-2 rounded-2xl shadow-xl border border-gray-100 relative">
                {greetText}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-white" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Name + role */}
      <div className="text-center">
        <p className={`font-semibold text-gray-800 leading-tight ${isSanmu ? 'text-xs' : 'text-[10px]'}`}>
          {isSanmu && '👑 '}{employee.name}
        </p>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${ROLE_BADGE[employee.role]}`}>
          {employee.role}
        </span>
      </div>
    </div>
  );
}
