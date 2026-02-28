'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { Suspense, useRef, useMemo } from 'react';
import * as THREE from 'three';

// ── 10명 캐릭터 ─────────────────────────────────────
// 2줄 × 5열 배치
const CHARACTERS = [
  // 윗줄 (row 0)
  { path: '/models/cat-new.glb',      label: 'AI 마케터',   role: '마케팅·SNS·콘텐츠' },
  { path: '/models/tiger-new.glb',    label: 'AI 영업팀장', role: '영업·전략·CRM'     },
  { path: '/models/fox-new.glb',      label: 'AI 개발자',   role: '개발·자동화·API'   },
  { path: '/models/dog-new.glb',      label: 'AI 회계팀장', role: '회계·세무·정산'    },
  { path: '/models/wolf-new.glb',     label: 'AI 전략가',   role: '전략·기획·분석'    },
  // 아랫줄 (row 1)
  { path: '/models/penguin-new.glb',  label: 'AI HR매니저', role: '인사·채용·교육'    },
  { path: '/models/bunny-new.glb',    label: 'AI 디자이너', role: '디자인·브랜딩·UI'  },
  { path: '/models/elephant-new.glb', label: 'AI 고객지원', role: 'CS·상담·피드백'    },
  { path: '/models/owl-new.glb',      label: 'AI 법무팀장', role: '법무·계약·규정'    },
  { path: '/models/otter-new.glb',    label: 'AI 홍보팀장', role: '홍보·PR·커뮤니티'  },
];

CHARACTERS.forEach(c => useGLTF.preload(c.path));

// ── 그리드 파라미터 ──────────────────────────────────
const COLS    = 5;
const X_GAP   = 3.0;   // 열 간격
const Y_GAP   = 3.6;   // 행 간격
const X_START = -((COLS - 1) / 2) * X_GAP;   // -6
const Y_TOP   =  Y_GAP / 2;                   // 상단 행 y
const Y_BOT   = -Y_GAP / 2;                   // 하단 행 y

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

// ── 단일 캐릭터 ──────────────────────────────────────
function Character({
  path, posX, posY, phase,
}: {
  path: string; posX: number; posY: number; phase: number;
}) {
  const ref = useRef<THREE.Group>(null!);
  const { scene } = useGLTF(path);

  const { clone, s, bones } = useMemo(() => {
    const c = SkeletonUtils.clone(scene) as THREE.Group;
    const box = new THREE.Box3().setFromObject(c);
    const cen = new THREE.Vector3(), sz = new THREE.Vector3();
    box.getCenter(cen); box.getSize(sz);
    const scale = 2.6 / (Math.max(sz.x, sz.y, sz.z) || 1);
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
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.position.y = posY + Math.sin(t * 0.65 + phase) * 0.055;
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
    <group ref={ref} position={[posX, posY, 0]}>
      <group scale={s}>
        <primitive object={clone} />
      </group>
    </group>
  );
}

function Spinner() {
  const r = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => { if (r.current) r.current.rotation.y = clock.elapsedTime * 2; });
  return <mesh ref={r}><octahedronGeometry args={[0.3, 0]} /><meshStandardMaterial color="#4f46e5" wireframe /></mesh>;
}

// ── 메인 ────────────────────────────────────────────
export default function AnimalHero3D() {
  return (
    <Canvas
      camera={{ position: [0, 0, 13.5], fov: 68 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 1.5]}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={2.6} />
      <directionalLight position={[5, 10, 7]}  intensity={2.0} />
      <directionalLight position={[-5, 3, -3]} intensity={0.6} color="#ffe4cc" />
      <pointLight position={[0, 3, 6]}  intensity={0.8} color="#818cf8" />
      <pointLight position={[0, -1, 4]} intensity={0.4} color="#fbbf24" />

      {CHARACTERS.map((c, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const posX = X_START + col * X_GAP;
        const posY = row === 0 ? Y_TOP : Y_BOT;
        return (
          <Suspense key={c.path} fallback={<group position={[posX, posY, 0]}><Spinner /></group>}>
            <Character
              path={c.path}
              posX={posX}
              posY={posY}
              phase={i * 0.63}
            />
          </Suspense>
        );
      })}
    </Canvas>
  );
}
