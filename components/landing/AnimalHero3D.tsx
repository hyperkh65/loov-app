'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { Suspense, useRef, useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';

// ── 전체 캐릭터 목록 (해치 포함) ─────────────────────
const CHARACTERS = [
  { path: '/models/haechi.glb',       label: '해치',       role: 'BOSS.AI 마스코트',        icon: '👑', accent: '#f59e0b' },
  { path: '/models/otter-new.glb',    label: 'AI 홍보팀장', role: '홍보 · PR · 커뮤니티',    icon: '🦦', accent: '#6366f1' },
  { path: '/models/owl-new.glb',      label: 'AI 법무팀장', role: '법무 · 계약 · 규정',      icon: '🦉', accent: '#8b5cf6' },
  { path: '/models/elephant-new.glb', label: 'AI 고객지원', role: 'CS · 상담 · 피드백',      icon: '🐘', accent: '#10b981' },
  { path: '/models/cat-new.glb',      label: 'AI 마케터',   role: '마케팅 · SNS · 콘텐츠',  icon: '🐱', accent: '#f97316' },
  { path: '/models/tiger-new.glb',    label: 'AI 영업팀장', role: '영업 · 전략 · CRM',       icon: '🐯', accent: '#ef4444' },
  { path: '/models/fox-new.glb',      label: 'AI 개발자',   role: '개발 · API · 자동화',     icon: '🦊', accent: '#fbbf24' },
  { path: '/models/dog-new.glb',      label: 'AI 회계팀장', role: '회계 · 세무 · 정산',      icon: '🐶', accent: '#14b8a6' },
  { path: '/models/wolf-new.glb',     label: 'AI 전략가',   role: '전략 · 기획 · 분석',      icon: '🐺', accent: '#a78bfa' },
  { path: '/models/penguin-new.glb',  label: 'AI HR매니저', role: '인사 · 채용 · 교육',      icon: '🐧', accent: '#3b82f6' },
  { path: '/models/bunny-new.glb',    label: 'AI 디자이너', role: '디자인 · 브랜딩 · UI',   icon: '🐰', accent: '#ec4899' },
];

CHARACTERS.forEach(c => useGLTF.preload(c.path));

// ── A포즈 ────────────────────────────────────────────
const AQL = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 4));
const AQR = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0,  Math.PI / 4));

interface BD {
  bone: THREE.Bone; iq: THREE.Quaternion;
  ax: number; ay: number; az: number;
  fx: number; fy: number; fz: number;
  px: number; py: number; pz: number;
}

function ampFor(n: string): [number, number, number] {
  if (/head/.test(n))                                 return [0.12, 0.18, 0.08];
  if (/neck/.test(n))                                 return [0.07, 0.10, 0.05];
  if (/spine|chest|torso/.test(n))                    return [0.05, 0.04, 0.04];
  if (/shoulder|upper.?arm|arm.?upper/.test(n))       return [0.24, 0.12, 0.28];
  if (/forearm|lower.?arm|arm.?lower|elbow/.test(n))  return [0.18, 0.07, 0.22];
  if (/hand|wrist/.test(n))                           return [0.15, 0.18, 0.13];
  if (/finger|thumb|index|middle|ring|pinky/.test(n)) return [0.10, 0.06, 0.09];
  if (/thigh|upleg|upper.?leg/.test(n))               return [0.06, 0.03, 0.04];
  if (/shin|calf|lower.?leg|knee/.test(n))            return [0.03, 0.02, 0.02];
  if (/foot|ankle/.test(n))                           return [0.07, 0.05, 0.06];
  if (/tail/.test(n))                                 return [0.28, 0.44, 0.24];
  if (/ear/.test(n))                                  return [0.11, 0.08, 0.13];
  return [0.02, 0.02, 0.02];
}

// +X 방향 모델 보정값
const FACE_FIX = -Math.PI / 2;

// ── 단일 쇼케이스 캐릭터 ─────────────────────────────
function ShowcaseCharacter({ path }: { path: string }) {
  const ref = useRef<THREE.Group>(null!);
  const te  = useRef(new THREE.Euler());
  const tq  = useRef(new THREE.Quaternion());
  const { scene } = useGLTF(path);

  const { clone, s, bones } = useMemo(() => {
    const c = SkeletonUtils.clone(scene) as THREE.Group;
    const box = new THREE.Box3().setFromObject(c);
    const cen = new THREE.Vector3(), sz = new THREE.Vector3();
    box.getCenter(cen); box.getSize(sz);
    const scale = 8.5 / (Math.max(sz.x, sz.y, sz.z) || 1);
    // 중심 정렬 (카메라가 원점 바라보므로 캐릭터를 원점 중앙에)
    c.position.set(-cen.x * scale, -cen.y * scale, -cen.z * scale);

    const bd: BD[] = [];
    c.traverse((o) => {
      if (o.type !== 'Bone') return;
      const bone = o as THREE.Bone;
      const n = bone.name.toLowerCase();
      const h = n.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
      const isL = /shoulder|upper.?arm/.test(n) && /left|[._]l[._\b]|_l$|\.l$/.test(n);
      const isR = /shoulder|upper.?arm/.test(n) && /right|[._]r[._\b]|_r$|\.r$/.test(n);
      if (isL) { bone.quaternion.multiply(AQL); bone.updateMatrix(); }
      if (isR) { bone.quaternion.multiply(AQR); bone.updateMatrix(); }
      const iq = bone.quaternion.clone();
      const [ax, ay, az] = ampFor(n);
      bd.push({
        bone, iq, ax, ay, az,
        fx: 0.18 + (h % 8) * 0.05, fy: 0.14 + (h % 6) * 0.06, fz: 0.22 + (h % 7) * 0.04,
        px: (h % 13) * 0.48, py: ((h + 3) % 11) * 0.57, pz: ((h + 7) % 9) * 0.70,
      });
    });
    return { clone: c, s: scale, bones: bd };
  }, [scene]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    // 정면 유지하며 좌우 약간 흔들기 (±20°)
    ref.current.rotation.y = FACE_FIX + Math.sin(t * 0.55) * 0.35;
    ref.current.position.y = Math.sin(t * 0.7) * 0.12;

    for (const b of bones) {
      te.current.set(
        Math.sin(t * b.fx + b.px) * b.ax,
        Math.sin(t * b.fy + b.py) * b.ay,
        Math.sin(t * b.fz + b.pz) * b.az,
      );
      tq.current.setFromEuler(te.current);
      b.bone.quaternion.copy(b.iq).multiply(tq.current);
    }
  });

  return (
    <group ref={ref}>
      <group scale={s}><primitive object={clone} /></group>
    </group>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────
export default function AnimalHero3D() {
  const [displayIdx, setDisplayIdx] = useState(0);
  const [show, setShow]             = useState(true);
  const idxRef  = useRef(0);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 페이드 전환
  const goTo = (idx: number) => {
    if (fadeRef.current) clearTimeout(fadeRef.current);
    idxRef.current = idx;
    setShow(false);
    fadeRef.current = setTimeout(() => {
      setDisplayIdx(idx);
      setShow(true);
    }, 220);
  };

  // 2초 자동 전환
  useEffect(() => {
    const id = setInterval(() => {
      goTo((idxRef.current + 1) % CHARACTERS.length);
    }, 2000);
    return () => {
      clearInterval(id);
      if (fadeRef.current) clearTimeout(fadeRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prev = () => goTo((idxRef.current - 1 + CHARACTERS.length) % CHARACTERS.length);
  const next = () => goTo((idxRef.current + 1) % CHARACTERS.length);

  const char = CHARACTERS[displayIdx];

  return (
    <div className="relative w-full h-full flex flex-col select-none">

      {/* ── 3D 쇼케이스 영역 ── */}
      <div
        className="relative flex-1 min-h-0"
        style={{ opacity: show ? 1 : 0, transition: 'opacity 0.22s ease-in-out' }}
      >
        {/* 컬러 글로우 */}
        <div
          className="absolute bottom-10 left-1/2 -translate-x-1/2 w-72 h-20 rounded-full blur-3xl opacity-25 pointer-events-none"
          style={{ background: char.accent }}
        />

        <Canvas
          camera={{ position: [0, 0, 11], fov: 54 }}
          gl={{ antialias: true, alpha: true }}
          dpr={[1, 1.5]}
          style={{ width: '100%', height: '100%' }}
        >
          <ambientLight intensity={2.2} />
          <directionalLight position={[5, 10, 7]}  intensity={2.2} />
          <directionalLight position={[-5, 3, -3]} intensity={0.7} color="#ffe4cc" />
          <pointLight position={[0,  6,  8]} intensity={2.8} color="#ffffff" />
          <pointLight position={[0, -3,  6]} intensity={0.9} color="#c7d2fe" />
          <pointLight position={[0,  1,  9]} intensity={1.2} color="#818cf8" />

          <Suspense fallback={null}>
            <ShowcaseCharacter key={char.path} path={char.path} />
          </Suspense>
        </Canvas>

        {/* 이름 / 역할 */}
        <div className="absolute bottom-3 left-0 right-0 text-center pointer-events-none">
          <p className="text-white font-black text-xl md:text-2xl tracking-tight drop-shadow-lg">
            {char.label}
          </p>
          <p className="text-sm mt-0.5 font-medium drop-shadow" style={{ color: char.accent }}>
            {char.role}
          </p>
        </div>
      </div>

      {/* ── 썸네일 스트립 ── */}
      <div className="flex-shrink-0 h-[52px] flex items-center justify-center gap-2 px-2">

        {/* ← 버튼 */}
        <button
          onClick={prev}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 text-white text-lg font-bold flex items-center justify-center transition-all hover:scale-110"
        >
          ‹
        </button>

        {/* 아이콘 목록 */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {CHARACTERS.map((c, i) => (
            <button
              key={c.path}
              onClick={() => goTo(i)}
              title={c.label}
              className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm transition-all duration-200"
              style={
                i === displayIdx
                  ? {
                      background: `${c.accent}40`,
                      border: `2px solid ${c.accent}`,
                      transform: 'scale(1.3)',
                      boxShadow: `0 0 10px ${c.accent}80`,
                    }
                  : {
                      background: 'rgba(255,255,255,0.08)',
                      border: '2px solid transparent',
                      opacity: 0.55,
                    }
              }
            >
              {c.icon}
            </button>
          ))}
        </div>

        {/* → 버튼 */}
        <button
          onClick={next}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 text-white text-lg font-bold flex items-center justify-center transition-all hover:scale-110"
        >
          ›
        </button>
      </div>
    </div>
  );
}
