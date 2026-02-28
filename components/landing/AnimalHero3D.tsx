'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { Suspense, useRef, useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';

// ── 캐릭터 데이터 ────────────────────────────────────
const CHARACTERS = [
  { path: '/models/cat-new.glb',   label: 'AI 마케터',   role: '마케팅·SNS·콘텐츠' },
  { path: '/models/tiger-new.glb', label: 'AI 영업팀장', role: '영업·전략·CRM'     },
  { path: '/models/fox-new.glb',   label: 'AI 개발자',   role: '개발·자동화·API'   },
  { path: '/models/dog-new.glb',   label: 'AI 회계팀장', role: '회계·세무·정산'    },
];

const GREETINGS = [
  '안녕하세요! 오늘도 파이팅! 💪', '좋은 아침이에요, 대표님!', '오늘 업무 준비 완료! 🎯',
  '뭘 도와드릴까요? 😊', '보고서 다 써놨어요! 📋', '신규 리드 발굴했어요! 🎉',
  '계약 성사됐습니다! 🎊', '정산 완료했어요 💰', '캠페인 성과가 좋아요! 🚀',
  '화이팅입니다 대표님! 💪', '오늘도 대박 나요! 💫', '수익이 늘고 있어요! 📈',
];
const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

CHARACTERS.forEach(c => useGLTF.preload(c.path));

// ── A포즈 쿼터니언 ──────────────────────────────────
const AQL = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 4));
const AQR = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0,  Math.PI / 4));

interface BD {
  bone: THREE.Bone;
  iq: THREE.Quaternion;
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

// ── 단일 캐릭터 (회전 링 위) ─────────────────────────
function Character({
  path, label, role, angle, ringRadius, active, phase,
}: {
  path: string; label: string; role: string;
  angle: number; ringRadius: number; active: boolean; phase: number;
}) {
  const ref = useRef<THREE.Group>(null!);
  const { scene } = useGLTF(path);

  const { clone, s, bones } = useMemo(() => {
    const c = SkeletonUtils.clone(scene) as THREE.Group;
    const box = new THREE.Box3().setFromObject(c);
    const cen = new THREE.Vector3(), sz = new THREE.Vector3();
    box.getCenter(cen); box.getSize(sz);
    const scale = 2.2 / (Math.max(sz.x, sz.y, sz.z) || 1);
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

  // 말풍선 (active일 때만)
  const [txt, setTxt] = useState(() => pick(GREETINGS));
  const [fade, setFade] = useState(true);
  useEffect(() => {
    if (!active) return;
    const iv = setInterval(() => {
      setFade(false);
      setTimeout(() => { setTxt(pick(GREETINGS)); setFade(true); }, 280);
    }, 3200);
    return () => clearInterval(iv);
  }, [active]);

  const te = useRef(new THREE.Euler());
  const tq = useRef(new THREE.Quaternion());

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;

    // 링 위 위치 (angle은 외부에서 조절)
    const x = Math.sin(angle) * ringRadius;
    const z = Math.cos(angle) * ringRadius;
    ref.current.position.set(x, Math.sin(t * 0.8 + phase) * 0.06, z);

    // 항상 카메라 쪽을 바라봄
    ref.current.rotation.y = angle;

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
    <group ref={ref}>
      <group scale={s}>
        <primitive object={clone} />
      </group>

      {/* 말풍선 — active(앞쪽) 캐릭터만 */}
      {active && (
        <Html position={[0, 2.8 / s * s, 0]} center zIndexRange={[100, 0]}>
          <div style={{
            opacity: fade ? 1 : 0, transition: 'opacity 0.28s',
            background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)',
            borderRadius: '14px', padding: '8px 16px', fontSize: '13px', fontWeight: 700,
            color: '#0f172a', whiteSpace: 'nowrap', boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
            fontFamily: '-apple-system,sans-serif', position: 'relative', textAlign: 'center',
          }}>
            {txt}
            <div style={{
              position: 'absolute', bottom: -7, left: '50%', transform: 'translateX(-50%)',
              borderLeft: '7px solid transparent', borderRight: '7px solid transparent',
              borderTop: '7px solid rgba(255,255,255,0.97)',
            }} />
          </div>
        </Html>
      )}

      {/* 이름 태그 — 항상 표시 */}
      <Html position={[0, -2.0, 0]} center zIndexRange={[50, 0]}>
        <div style={{
          background: active ? 'rgba(99,102,241,0.95)' : 'rgba(10,14,35,0.75)',
          border: `1px solid ${active ? 'rgba(129,140,248,0.8)' : 'rgba(99,102,241,0.3)'}`,
          borderRadius: '10px', padding: '5px 14px', textAlign: 'center',
          fontFamily: '-apple-system,sans-serif', whiteSpace: 'nowrap',
          transition: 'all 0.4s',
          transform: active ? 'scale(1.1)' : 'scale(0.85)',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff' }}>{label}</div>
          <div style={{ fontSize: '10px', color: active ? '#c7d2fe' : '#818cf8', marginTop: 1 }}>{role}</div>
        </div>
      </Html>
    </group>
  );
}

function Spinner() {
  const r = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => { if (r.current) r.current.rotation.y = clock.elapsedTime * 2; });
  return <mesh ref={r}><octahedronGeometry args={[0.5, 0]} /><meshStandardMaterial color="#4f46e5" wireframe /></mesh>;
}

// ── 회전 링 씬 ──────────────────────────────────────
function RotatingRing() {
  const ringAngle = useRef(0);
  const [angles, setAngles] = useState(
    CHARACTERS.map((_, i) => (i / CHARACTERS.length) * Math.PI * 2)
  );
  const SPEED = 0.18; // 회전 속도 (rad/s)
  const RADIUS = 3.2;

  useFrame((_, delta) => {
    ringAngle.current += delta * SPEED;
    setAngles(CHARACTERS.map((_, i) =>
      (i / CHARACTERS.length) * Math.PI * 2 + ringAngle.current
    ));
  });

  // 가장 앞쪽(z가 가장 큰) 캐릭터를 active로
  const activeIdx = angles.reduce((best, a, i) =>
    Math.cos(a) > Math.cos(angles[best]) ? i : best, 0
  );

  return (
    <>
      {CHARACTERS.map((c, i) => (
        <Suspense key={c.path} fallback={<Spinner />}>
          <Character
            path={c.path}
            label={c.label}
            role={c.role}
            angle={angles[i]}
            ringRadius={RADIUS}
            active={i === activeIdx}
            phase={i * 1.57}
          />
        </Suspense>
      ))}
    </>
  );
}

export default function AnimalHero3D() {
  return (
    <Canvas
      camera={{ position: [0, 1.5, 9], fov: 55 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 1.5]}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={2.5} />
      <directionalLight position={[4, 8, 6]} intensity={2.2} />
      <directionalLight position={[-4, 3, -3]} intensity={0.7} color="#ffe4cc" />
      <pointLight position={[0, 3, 5]} intensity={1.0} color="#818cf8" />

      <Suspense fallback={<Spinner />}>
        <RotatingRing />
      </Suspense>
    </Canvas>
  );
}
