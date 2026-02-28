'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { Suspense, useRef, useState, useEffect, useMemo, useCallback } from 'react';
import * as THREE from 'three';

// ── 캐릭터 목록 (나중에 여기만 추가하면 됨) ──────────
const CHARACTERS = [
  { path: '/models/cat-new.glb',   label: 'AI 마케터',   role: '마케팅·SNS·콘텐츠', color: '#6366f1' },
  { path: '/models/tiger-new.glb', label: 'AI 영업팀장', role: '영업·전략·CRM',     color: '#f59e0b' },
  { path: '/models/fox-new.glb',   label: 'AI 개발자',   role: '개발·자동화·API',   color: '#10b981' },
  { path: '/models/dog-new.glb',   label: 'AI 회계팀장', role: '회계·세무·정산',    color: '#3b82f6' },
];

CHARACTERS.forEach(c => useGLTF.preload(c.path));

// ── A포즈 ───────────────────────────────────────────
const AQL = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 4));
const AQR = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0,  Math.PI / 4));

interface BD {
  bone: THREE.Bone; iq: THREE.Quaternion;
  ax: number; ay: number; az: number;
  fx: number; fy: number; fz: number;
  px: number; py: number; pz: number;
}

function amp(n: string): [number, number, number] {
  if (/head/.test(n))                                  return [0.14, 0.22, 0.09];
  if (/neck/.test(n))                                  return [0.08, 0.12, 0.06];
  if (/spine|chest|torso/.test(n))                     return [0.06, 0.05, 0.05];
  if (/shoulder|upper.?arm|arm.?upper/.test(n))        return [0.28, 0.14, 0.34];
  if (/forearm|lower.?arm|arm.?lower|elbow/.test(n))   return [0.22, 0.08, 0.28];
  if (/hand|wrist/.test(n))                            return [0.18, 0.22, 0.16];
  if (/finger|thumb|index|middle|ring|pinky/.test(n))  return [0.14, 0.07, 0.11];
  if (/thigh|upleg|upper.?leg/.test(n))                return [0.07, 0.04, 0.05];
  if (/shin|calf|lower.?leg|knee/.test(n))             return [0.04, 0.02, 0.03];
  if (/foot|ankle/.test(n))                            return [0.09, 0.06, 0.08];
  if (/tail/.test(n))                                  return [0.32, 0.50, 0.28];
  if (/ear/.test(n))                                   return [0.13, 0.09, 0.16];
  return [0.02, 0.02, 0.02];
}

// ── 3D 캐릭터 (크게, 중앙) ──────────────────────────
function BigCharacter({ path }: { path: string }) {
  const ref = useRef<THREE.Group>(null!);
  const { scene } = useGLTF(path);

  const { clone, s, bones } = useMemo(() => {
    const c = SkeletonUtils.clone(scene) as THREE.Group;
    const box = new THREE.Box3().setFromObject(c);
    const cen = new THREE.Vector3(), sz = new THREE.Vector3();
    box.getCenter(cen); box.getSize(sz);
    const scale = 3.6 / (Math.max(sz.x, sz.y, sz.z) || 1);
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
      const [ax, ay, az] = amp(n);
      bd.push({
        bone, iq, ax, ay, az,
        fx: 0.18 + (h % 8) * 0.05, fy: 0.14 + (h % 6) * 0.06, fz: 0.22 + (h % 7) * 0.04,
        px: (h % 13) * 0.48, py: ((h + 3) % 11) * 0.57, pz: ((h + 7) % 9) * 0.70,
      });
    });
    return { clone: c, s: scale, bones: bd };
  }, [scene]);

  const te = useRef(new THREE.Euler());
  const tq = useRef(new THREE.Quaternion());

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.position.y = Math.sin(t * 0.7) * 0.07;
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
      <group scale={s}>
        <primitive object={clone} />
      </group>
    </group>
  );
}

// ── 메인 슬라이더 ────────────────────────────────────
export default function AnimalHero3D() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const autoRef = useRef<ReturnType<typeof setInterval>>();

  const goTo = useCallback((next: number) => {
    setVisible(false);
    setTimeout(() => {
      setIdx(next);
      setVisible(true);
    }, 320);
  }, []);

  const advance = useCallback((dir: number) => {
    goTo((idx + dir + CHARACTERS.length) % CHARACTERS.length);
  }, [idx, goTo]);

  // 자동 슬라이드 (3.5초)
  useEffect(() => {
    autoRef.current = setInterval(() => advance(1), 3500);
    return () => clearInterval(autoRef.current);
  }, [advance]);

  const char = CHARACTERS[idx];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>

      {/* 3D 캔버스 */}
      <div style={{ width: '100%', height: '100%', opacity: visible ? 1 : 0, transition: 'opacity 0.32s ease' }}>
        <Canvas
          camera={{ position: [0, 0.5, 5.5], fov: 52 }}
          gl={{ antialias: true, alpha: true }}
          dpr={[1, 1.5]}
          style={{ width: '100%', height: '100%' }}
        >
          <ambientLight intensity={2.5} />
          <directionalLight position={[4, 8, 6]} intensity={2.2} />
          <directionalLight position={[-4, 3, -3]} intensity={0.7} color="#ffe4cc" />
          <pointLight position={[0, 2, 4]} intensity={0.9} color="#818cf8" />
          <Suspense fallback={null}>
            <BigCharacter key={char.path} path={char.path} />
          </Suspense>
        </Canvas>
      </div>

      {/* 이름 태그 */}
      <div style={{
        position: 'absolute', bottom: 52, left: '50%', transform: 'translateX(-50%)',
        opacity: visible ? 1 : 0, transition: 'opacity 0.32s ease',
        background: `${char.color}dd`, borderRadius: 14,
        padding: '9px 26px', textAlign: 'center', backdropFilter: 'blur(8px)',
        whiteSpace: 'nowrap',
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', fontFamily: '-apple-system,sans-serif' }}>
          {char.label}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.82)', marginTop: 2, fontFamily: '-apple-system,sans-serif' }}>
          {char.role}
        </div>
      </div>

      {/* 왼쪽 화살표 */}
      <button
        onClick={() => { clearInterval(autoRef.current); advance(-1); }}
        style={{
          position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '50%', width: 40, height: 40, cursor: 'pointer',
          color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(6px)', transition: 'background 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.22)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
      >‹</button>

      {/* 오른쪽 화살표 */}
      <button
        onClick={() => { clearInterval(autoRef.current); advance(1); }}
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '50%', width: 40, height: 40, cursor: 'pointer',
          color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(6px)', transition: 'background 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.22)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
      >›</button>

      {/* 점 인디케이터 */}
      <div style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 6, alignItems: 'center',
      }}>
        {CHARACTERS.map((c, i) => (
          <button
            key={i}
            onClick={() => { clearInterval(autoRef.current); goTo(i); }}
            style={{
              width: i === idx ? 22 : 7, height: 7,
              borderRadius: 4, border: 'none', cursor: 'pointer',
              background: i === idx ? char.color : 'rgba(255,255,255,0.28)',
              transition: 'all 0.3s ease', padding: 0,
            }}
          />
        ))}
      </div>

    </div>
  );
}
