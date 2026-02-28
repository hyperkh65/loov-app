'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import { Suspense, useRef, useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';

// ── 인사말 ────────────────────────────────────────────────────
const GREETINGS = [
  '안녕하세요! 오늘도 파이팅! 💪', '좋은 아침이에요, 대표님!', '오늘 업무 준비 완료! 🎯',
  '뭘 도와드릴까요? 😊', '열심히 하겠습니다!', '보고서 다 써놨어요! 📋',
  '미팅 준비됐습니다! 📅', '신규 리드 발굴했어요! 🎉', '계약 성사됐습니다! 🎊',
  '정산 완료했어요 💰', '캠페인 성과가 좋아요! 🚀', '트렌드 분석 중이에요 🔍',
  '버그 수정했어요! 🐛', '디자인 시안 올렸어요! 🎨', '직원 교육 자료 준비했어요! 📚',
  '1인 기업 최고! 🙌', '같이 성장해요! 🌱', '항상 여기 있어요! 🌟',
  '화이팅입니다 대표님! 💪', '오늘도 대박 나요! 💫', '수익이 늘고 있어요! 📈',
  '광고 ROI 분석 완료! 💡', '채용 공고 작성 완료! 📝', 'API 연동됐어요! ⚡',
  '배포 완료! 🚀', '복지 제도 개선안 있어요!', '커피 한 잔 하셨어요? ☕',
];

function pickRandom(arr: string[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

useGLTF.preload('/models/cat-hero.glb');
useGLTF.preload('/models/tiger-hero.glb');

// ── A포즈 Quaternion 상수 ─────────────────────────────────────
const A_POSE_LEFT  = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 4));
const A_POSE_RIGHT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0,  Math.PI / 4));

interface BoneData {
  bone: THREE.Bone;
  restQ: THREE.Quaternion;
  isShoulderL: boolean;
  isShoulderR: boolean;
  ax: number; ay: number; az: number;
  fx: number; fy: number; fz: number;
  px: number; py: number; pz: number;
}

// ── 캐릭터 컴포넌트 ───────────────────────────────────────────
function Character({
  modelPath, posX, greetings, label, role, floatOffset = 0,
}: {
  modelPath: string; posX: number; greetings: string[];
  label: string; role: string; floatOffset?: number;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const { scene } = useGLTF(modelPath);

  // 스케일·중심 계산
  const { s, cx, cy, cz } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    const size   = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    return { s: 1.5 / maxDim, cx: center.x, cy: center.y, cz: center.z };
  }, [scene]);

  // Bone 수집 — SkinnedMesh.skeleton.bones 를 직접 사용
  // (scene.clone() 하면 SkinnedMesh가 원본 skeleton을 참조 → 작동 안 함)
  const bonesRef = useRef<BoneData[]>([]);
  useEffect(() => {
    const data: BoneData[] = [];
    const seen = new Set<string>();

    scene.traverse((obj) => {
      const sm = obj as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh || !sm.skeleton) return;

      for (const bone of sm.skeleton.bones) {
        if (seen.has(bone.uuid)) continue;
        seen.add(bone.uuid);

        const restQ = bone.quaternion.clone();
        const n = bone.name.toLowerCase();
        const h = n.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

        const isShoulderL = /shoulder|upper.?arm/.test(n) && /left|[._]l[._\b]|_l$|\.l$/.test(n);
        const isShoulderR = /shoulder|upper.?arm/.test(n) && /right|[._]r[._\b]|_r$|\.r$/.test(n);

        // 부위별 진폭 (라디안)
        let ax = 0.02, ay = 0.02, az = 0.02;
        if      (/head/.test(n))                                { ax = 0.14; ay = 0.22; az = 0.09; }
        else if (/neck/.test(n))                                { ax = 0.08; ay = 0.12; az = 0.06; }
        else if (/spine|chest|torso/.test(n))                   { ax = 0.06; ay = 0.05; az = 0.05; }
        else if (/shoulder|upper.?arm|arm.?upper/.test(n))      { ax = 0.30; ay = 0.14; az = 0.35; }
        else if (/forearm|lower.?arm|arm.?lower|elbow/.test(n)) { ax = 0.22; ay = 0.09; az = 0.28; }
        else if (/hand|wrist/.test(n))                          { ax = 0.18; ay = 0.22; az = 0.16; }
        else if (/finger|thumb|index|middle|ring|pinky/.test(n)){ ax = 0.14; ay = 0.07; az = 0.11; }
        else if (/thigh|upleg|upper.?leg/.test(n))              { ax = 0.07; ay = 0.04; az = 0.05; }
        else if (/shin|calf|lower.?leg|knee/.test(n))           { ax = 0.04; ay = 0.02; az = 0.03; }
        else if (/foot|ankle/.test(n))                          { ax = 0.09; ay = 0.06; az = 0.08; }
        else if (/tail/.test(n))                                { ax = 0.32; ay = 0.50; az = 0.28; }
        else if (/ear/.test(n))                                 { ax = 0.13; ay = 0.09; az = 0.16; }

        data.push({
          bone, restQ, isShoulderL, isShoulderR, ax, ay, az,
          fx: 0.18 + (h % 8) * 0.05,
          fy: 0.14 + (h % 6) * 0.06,
          fz: 0.22 + (h % 7) * 0.04,
          px: (h % 13) * 0.48,
          py: ((h + 3) % 11) * 0.57,
          pz: ((h + 7) % 9)  * 0.70,
        });
      }
    });

    bonesRef.current = data;

    // unmount 시 bone을 rest 포즈로 복원
    return () => { for (const d of data) d.bone.quaternion.copy(d.restQ); };
  }, [scene]);

  // 말풍선
  const [greeting, setGreeting] = useState(() => pickRandom(greetings));
  const [fade, setFade]         = useState(true);
  useEffect(() => {
    const iv = setInterval(() => {
      setFade(false);
      setTimeout(() => { setGreeting(pickRandom(greetings)); setFade(true); }, 300);
    }, 3200 + floatOffset * 800);
    return () => clearInterval(iv);
  }, [greetings, floatOffset]);

  // 재사용 객체 (GC 방지)
  const tmpE = useRef(new THREE.Euler());
  const tmpQ = useRef(new THREE.Quaternion());

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;

    // Y 회전 없음 — 둥실
    groupRef.current.position.y = Math.sin(t * 0.75 + floatOffset) * 0.05;

    for (const b of bonesRef.current) {
      tmpE.current.set(
        Math.sin(t * b.fx + b.px) * b.ax,
        Math.sin(t * b.fy + b.py) * b.ay,
        Math.sin(t * b.fz + b.pz) * b.az,
      );
      tmpQ.current.setFromEuler(tmpE.current);

      if (b.isShoulderL) {
        b.bone.quaternion.copy(b.restQ).multiply(A_POSE_LEFT).multiply(tmpQ.current);
      } else if (b.isShoulderR) {
        b.bone.quaternion.copy(b.restQ).multiply(A_POSE_RIGHT).multiply(tmpQ.current);
      } else {
        b.bone.quaternion.copy(b.restQ).multiply(tmpQ.current);
      }
    }
  });

  return (
    <group ref={groupRef} position={[posX, 0, 0]}>
      <group scale={s} rotation={[0, -Math.PI / 2, 0]}>
        <group position={[-cx, -cy, -cz]}>
          <primitive object={scene} />
        </group>
      </group>

      {/* 말풍선 */}
      <Html position={[0, 0.9, 0]} center zIndexRange={[100, 0]}>
        <div style={{
          opacity: fade ? 1 : 0,
          transition: 'opacity 0.3s ease',
          background: 'rgba(255,255,255,0.97)',
          backdropFilter: 'blur(10px)',
          borderRadius: '12px',
          padding: '6px 13px',
          fontSize: '11px',
          fontWeight: 700,
          color: '#0f172a',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          fontFamily: '-apple-system, sans-serif',
          position: 'relative',
          maxWidth: '160px',
          textAlign: 'center',
        }}>
          {greeting}
          <div style={{
            position: 'absolute', bottom: -6, left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid rgba(255,255,255,0.97)',
          }} />
        </div>
      </Html>

      {/* 이름표 */}
      <Html position={[0, -0.9, 0]} center zIndexRange={[50, 0]}>
        <div style={{
          background: 'rgba(10,14,35,0.90)',
          border: '1px solid rgba(99,102,241,0.5)',
          borderRadius: '8px',
          padding: '4px 11px',
          textAlign: 'center',
          fontFamily: '-apple-system, sans-serif',
          whiteSpace: 'nowrap',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#fff' }}>{label}</div>
          <div style={{ fontSize: '9px', color: '#818cf8', marginTop: 1 }}>{role}</div>
        </div>
      </Html>
    </group>
  );
}

function LoadingFallback() {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.y = clock.elapsedTime * 1.5; });
  return (
    <mesh ref={ref} position={[0, 0, 0]}>
      <octahedronGeometry args={[0.5, 0]} />
      <meshStandardMaterial color="#4f46e5" wireframe />
    </mesh>
  );
}

export default function AnimalHero3D() {
  return (
    <Canvas
      camera={{ position: [0, 0, 5.0], fov: 60 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 1.5]}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={2.2} />
      <directionalLight position={[3, 6, 4]} intensity={2.0} />
      <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#ffe4cc" />
      <pointLight position={[0, 3, 4]} intensity={0.8} color="#818cf8" />

      <Suspense fallback={<LoadingFallback />}>
        <Character
          modelPath="/models/cat-hero.glb"
          posX={-1.3}
          greetings={GREETINGS}
          label="AI 마케터"
          role="마케팅 · SNS · 콘텐츠"
          floatOffset={0}
        />
      </Suspense>

      <Suspense fallback={<LoadingFallback />}>
        <Character
          modelPath="/models/tiger-hero.glb"
          posX={1.3}
          greetings={GREETINGS}
          label="AI 영업팀장"
          role="영업 · 전략 · CRM"
          floatOffset={1.5}
        />
      </Suspense>
    </Canvas>
  );
}
