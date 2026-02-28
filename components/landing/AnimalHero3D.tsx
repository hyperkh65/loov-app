'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { Suspense, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';

// ── 캐릭터 목록 ─────────────────────────────────────
const CHARACTERS = [
  { path: '/models/cat-new.glb',   label: 'AI 마케터',   role: '마케팅·SNS·콘텐츠', color: '#6366f1' },
  { path: '/models/tiger-new.glb', label: 'AI 영업팀장', role: '영업·전략·CRM',     color: '#f59e0b' },
  { path: '/models/fox-new.glb',   label: 'AI 개발자',   role: '개발·자동화·API',   color: '#10b981' },
  { path: '/models/dog-new.glb',   label: 'AI 회계팀장', role: '회계·세무·정산',    color: '#3b82f6' },
];

CHARACTERS.forEach(c => useGLTF.preload(c.path));

const N       = CHARACTERS.length;
const SPACING = 3.2;           // 캐릭터 간격
const TOTAL   = N * SPACING;   // 전체 루프 폭
const SPEED   = 1.4;           // 이동 속도 (units/s)

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
  if (/head/.test(n))                                 return [0.14, 0.22, 0.09];
  if (/neck/.test(n))                                 return [0.08, 0.12, 0.06];
  if (/spine|chest|torso/.test(n))                    return [0.06, 0.05, 0.05];
  if (/shoulder|upper.?arm|arm.?upper/.test(n))       return [0.28, 0.14, 0.34];
  if (/forearm|lower.?arm|arm.?lower|elbow/.test(n))  return [0.22, 0.08, 0.28];
  if (/hand|wrist/.test(n))                           return [0.18, 0.22, 0.16];
  if (/finger|thumb|index|middle|ring|pinky/.test(n)) return [0.14, 0.07, 0.11];
  if (/thigh|upleg|upper.?leg/.test(n))               return [0.07, 0.04, 0.05];
  if (/shin|calf|lower.?leg|knee/.test(n))            return [0.04, 0.02, 0.03];
  if (/foot|ankle/.test(n))                           return [0.09, 0.06, 0.08];
  if (/tail/.test(n))                                 return [0.32, 0.50, 0.28];
  if (/ear/.test(n))                                  return [0.13, 0.09, 0.16];
  return [0.02, 0.02, 0.02];
}

// ── 캐릭터 메시 ─────────────────────────────────────
// posRef: 공유 positions 배열 ref, charIdx: 자신의 인덱스
function CharMesh({
  path, charIdx, posRef, phase,
}: {
  path: string; charIdx: number;
  posRef: React.MutableRefObject<number[]>;
  phase: number;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const { scene } = useGLTF(path);

  const { clone, s, bones } = useMemo(() => {
    const c = SkeletonUtils.clone(scene) as THREE.Group;
    const box = new THREE.Box3().setFromObject(c);
    const cen = new THREE.Vector3(), sz = new THREE.Vector3();
    box.getCenter(cen); box.getSize(sz);
    const scale = 2.8 / (Math.max(sz.x, sz.y, sz.z) || 1);
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

  const te = useRef(new THREE.Euler());
  const tq = useRef(new THREE.Quaternion());

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;
    const x = posRef.current[charIdx];

    // 위치
    groupRef.current.position.x = x;
    groupRef.current.position.y = Math.sin(t * 0.7 + phase) * 0.07;

    // 가운데일수록 크게: 가우시안 스케일
    const sigma = SPACING * 0.9;
    const g = Math.exp(-0.5 * (x * x) / (sigma * sigma));
    const sc = 0.70 + g * 0.52;   // 0.70(양쪽) ~ 1.22(중앙)
    groupRef.current.scale.setScalar(sc);

    // 가운데가 앞으로 살짝 튀어나옴
    groupRef.current.position.z = g * 1.0;

    // 본 애니메이션
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
    <group ref={groupRef}>
      <group scale={s}>
        <primitive object={clone} />
      </group>
    </group>
  );
}

// ── 스크롤 컨트롤러 ──────────────────────────────────
function ScrollController({
  posRef,
  onCenter,
}: {
  posRef: React.MutableRefObject<number[]>;
  onCenter: (i: number) => void;
}) {
  const lastCenter = useRef(-1);
  const tick = useRef(0);
  const edge = TOTAL / 2 + SPACING * 0.55;

  useFrame((_, delta) => {
    // 모두 왼쪽으로 이동 + 루프
    for (let i = 0; i < N; i++) {
      posRef.current[i] -= delta * SPEED;
      if (posRef.current[i] < -edge) posRef.current[i] += TOTAL;
    }

    // 10프레임마다 가운데 캐릭터 확인
    if (++tick.current % 10 !== 0) return;
    let minD = Infinity, ci = 0;
    for (let i = 0; i < N; i++) {
      const d = Math.abs(posRef.current[i]);
      if (d < minD) { minD = d; ci = i; }
    }
    if (ci !== lastCenter.current) { lastCenter.current = ci; onCenter(ci); }
  });

  return null;
}

// ── 메인 ────────────────────────────────────────────
export default function AnimalHero3D() {
  // 초기 위치: 화면 중앙 기준으로 퍼뜨림
  const posRef = useRef<number[]>(
    CHARACTERS.map((_, i) => (i - (N - 1) / 2) * SPACING)
  );
  const [centerIdx, setCenterIdx] = useState(0);
  const char = CHARACTERS[centerIdx];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>

      <Canvas
        camera={{ position: [0, 0.6, 10], fov: 64 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 1.5]}
        style={{ width: '100%', height: '100%' }}
      >
        <ambientLight intensity={2.5} />
        <directionalLight position={[4, 8, 6]}  intensity={2.2} />
        <directionalLight position={[-4, 3, -3]} intensity={0.7} color="#ffe4cc" />
        <pointLight position={[0, 2, 5]} intensity={0.9} color="#818cf8" />

        <ScrollController posRef={posRef} onCenter={setCenterIdx} />

        {CHARACTERS.map((c, i) => (
          <Suspense key={c.path} fallback={null}>
            <CharMesh
              path={c.path}
              charIdx={i}
              posRef={posRef}
              phase={i * 1.57}
            />
          </Suspense>
        ))}
      </Canvas>

      {/* 가운데 캐릭터 이름 태그 */}
      <div
        key={centerIdx}
        style={{
          position: 'absolute', bottom: 20, left: '50%',
          transform: 'translateX(-50%)',
          background: `${char.color}e0`,
          borderRadius: 14, padding: '8px 24px', textAlign: 'center',
          backdropFilter: 'blur(8px)', whiteSpace: 'nowrap',
          animation: 'fadeIn 0.4s ease',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', fontFamily: '-apple-system,sans-serif' }}>
          {char.label}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.82)', marginTop: 2, fontFamily: '-apple-system,sans-serif' }}>
          {char.role}
        </div>
      </div>

      <style>{`@keyframes fadeIn { from { opacity:0; transform:translateX(-50%) translateY(6px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
    </div>
  );
}
