'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { Suspense, useRef, useMemo } from 'react';
import * as THREE from 'three';

// ── 직원 캐릭터 10명 ─────────────────────────────────
const CHARACTERS = [
  { path: '/models/cat-new.glb'      },
  { path: '/models/tiger-new.glb'    },
  { path: '/models/fox-new.glb'      },
  { path: '/models/dog-new.glb'      },
  { path: '/models/wolf-new.glb'     },
  { path: '/models/penguin-new.glb'  },
  { path: '/models/bunny-new.glb'    },
  { path: '/models/elephant-new.glb' },
  { path: '/models/owl-new.glb'      },
  { path: '/models/otter-new.glb'    },
];

useGLTF.preload('/models/haechi.glb');
CHARACTERS.forEach(c => useGLTF.preload(c.path));

// ── A포즈 쿼터니언 ────────────────────────────────────
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

function buildModel(scene: THREE.Group, targetSize: number) {
  const c = SkeletonUtils.clone(scene) as THREE.Group;
  const box = new THREE.Box3().setFromObject(c);
  const cen = new THREE.Vector3(), sz = new THREE.Vector3();
  box.getCenter(cen); box.getSize(sz);
  const scale = targetSize / (Math.max(sz.x, sz.y, sz.z) || 1);
  // 발(bbox 최솟값)이 로컬 Y=0에 오도록 → 모든 캐릭터 같은 높이로 서게 됨
  c.position.set(-cen.x * scale, -box.min.y * scale, -cen.z * scale);

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
  return { clone: c, scale, bones: bd };
}

// 모델이 +X 방향을 바라보는 경우에 대한 보정값
// atan2(dx,dz)로 카메라 방향을 구한 뒤 -PI/2 오프셋으로 local +X → 카메라
const FACE_FIX = -Math.PI / 2;
const RING_RADIUS = 7.5;
const RING_SPEED  = 0.22; // rad/s

// ── 직원 캐릭터 — 카메라를 항상 정면으로 ─────────────
function Employee({
  path, baseAngle, phase, ringRef,
}: {
  path: string; baseAngle: number; phase: number;
  ringRef: React.MutableRefObject<THREE.Group>;
}) {
  const ref   = useRef<THREE.Group>(null!);
  const te    = useRef(new THREE.Euler());
  const tq    = useRef(new THREE.Quaternion());
  const { scene } = useGLTF(path);

  const { clone, scale, bones } = useMemo(
    () => buildModel(scene as THREE.Group, 3.8),
    [scene],
  );

  useFrame(({ clock, camera }) => {
    if (!ref.current) return;
    const t       = clock.elapsedTime;
    const ringRot = ringRef.current?.rotation.y ?? 0;

    // 현재 월드 위치 계산
    const worldAngle = baseAngle + ringRot;
    const wx = RING_RADIUS * Math.cos(worldAngle);
    const wz = RING_RADIUS * Math.sin(worldAngle);

    // 카메라 방향 → 로컬 Y 회전 (FACE_FIX = +X-facing 모델 보정)
    const dx = camera.position.x - wx;
    const dz = camera.position.z - wz;
    ref.current.rotation.y = Math.atan2(dx, dz) + FACE_FIX - ringRot;

    // 위아래 부유
    ref.current.position.y = Math.sin(t * 0.65 + phase) * 0.09;

    // 뼈대 애니메이션
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

  const bx = RING_RADIUS * Math.cos(baseAngle);
  const bz = RING_RADIUS * Math.sin(baseAngle);

  return (
    <group ref={ref} position={[bx, 0, bz]}>
      <group scale={scale}><primitive object={clone} /></group>
    </group>
  );
}

// ── 중앙 보스 해치 — 천천히 자전 ─────────────────────
function CenterBoss() {
  const ref = useRef<THREE.Group>(null!);
  const te  = useRef(new THREE.Euler());
  const tq  = useRef(new THREE.Quaternion());
  const { scene } = useGLTF('/models/haechi.glb');

  const { clone, scale, bones } = useMemo(
    () => buildModel(scene as THREE.Group, 6.5),
    [scene],
  );

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    // FACE_FIX부터 시작해 천천히 자전 → 정면이 처음에 보임
    ref.current.rotation.y = FACE_FIX + t * 0.35;
    ref.current.position.y = Math.sin(t * 0.5) * 0.12;

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
    <group ref={ref} position={[0, 0, 0]}>
      <group scale={scale}><primitive object={clone} /></group>
    </group>
  );
}

// ── 회전하는 직원 링 ─────────────────────────────────
function SpinningRing() {
  const ringRef = useRef<THREE.Group>(null!);

  useFrame(({ clock }) => {
    if (ringRef.current) {
      ringRef.current.rotation.y = clock.elapsedTime * RING_SPEED;
    }
  });

  return (
    <group ref={ringRef}>
      {CHARACTERS.map((c, i) => {
        const baseAngle = (2 * Math.PI * i) / CHARACTERS.length;
        const bx = RING_RADIUS * Math.cos(baseAngle);
        const bz = RING_RADIUS * Math.sin(baseAngle);
        return (
          <Suspense
            key={c.path}
            fallback={
              <group position={[bx, 0, bz]}>
                <mesh>
                  <octahedronGeometry args={[0.3, 0]} />
                  <meshStandardMaterial color="#4f46e5" wireframe />
                </mesh>
              </group>
            }
          >
            <Employee
              path={c.path}
              baseAngle={baseAngle}
              phase={i * 0.63}
              ringRef={ringRef}
            />
          </Suspense>
        );
      })}
    </group>
  );
}

// ── 메인 ────────────────────────────────────────────
export default function AnimalHero3D() {
  return (
    <Canvas
      camera={{ position: [0, 4, 22], fov: 62 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 1.5]}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={2.2} />
      <directionalLight position={[5, 10, 7]}   intensity={2.2} />
      <directionalLight position={[-5, 3, -3]}  intensity={0.7} color="#ffe4cc" />
      <pointLight position={[0,  6,  8]} intensity={2.5} color="#ffffff" />
      <pointLight position={[0, -3,  6]} intensity={1.0} color="#c7d2fe" />
      <pointLight position={[0,  2, 10]} intensity={1.2} color="#818cf8" />
      <pointLight position={[0, -1,  5]} intensity={0.6} color="#fbbf24" />

      {/* 해치 — 중앙 보스 */}
      <Suspense fallback={null}>
        <CenterBoss />
      </Suspense>

      {/* 직원들 — 궤도 공전 + 정면 자동 추적 */}
      <SpinningRing />
    </Canvas>
  );
}
