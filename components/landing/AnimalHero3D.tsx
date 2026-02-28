'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import { Suspense, useRef, useState, useEffect, useMemo } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as THREE from 'three';

// ── 50가지 인사말 풀 ──────────────────────────────────────────
const GREETINGS = [
  '안녕하세요! 오늘도 파이팅! 💪',
  '좋은 아침이에요, 대표님!',
  '오늘 업무 준비 완료! 🎯',
  '뭘 도와드릴까요? 😊',
  '열심히 하겠습니다!',
  '오늘도 최선을 다하겠어요!',
  '보고서 다 써놨어요! 📋',
  '미팅 준비됐습니다! 📅',
  '신규 리드 발굴했어요! 🎉',
  '오늘 일정 확인하셨나요?',
  '이번 달 목표 달성 가능해요! 📊',
  '신규 고객 미팅 잡았어요!',
  '계약 성사됐습니다! 🎊',
  '영업 파이프라인 업데이트 완료!',
  '제안서 작성 중이에요 ✍️',
  '정산 완료했어요 💰',
  '세금 신고 준비됐습니다 📑',
  '지출 내역 정리했어요!',
  '수익이 늘고 있어요! 📈',
  '월별 리포트 작성했어요',
  '캠페인 성과가 좋아요! 🚀',
  '바이럴 콘텐츠 기획했어요!',
  '인스타 팔로워 늘었어요! 📱',
  '광고 ROI 분석 완료! 💡',
  '트렌드 분석 중이에요 🔍',
  '버그 수정했어요! 🐛',
  '새 기능 개발 중이에요 💻',
  '배포 완료! 🚀',
  '코드 리뷰 할게요! 🔧',
  'API 연동됐어요! ⚡',
  '디자인 시안 올렸어요! 🎨',
  'UI 개선했어요! ✨',
  '브랜딩 작업 중이에요!',
  '로고 리뉴얼 제안해요! 🖌️',
  '트렌디한 디자인 완성! 💅',
  '직원 교육 자료 준비했어요! 📚',
  '복지 제도 개선안 있어요!',
  '팀 빌딩 기획했어요! 🤝',
  '채용 공고 작성 완료! 📝',
  '성과 리뷰 준비됐어요!',
  '커피 한 잔 하셨어요? ☕',
  '힘내세요! 응원해요 💖',
  '1인 기업 최고! 🙌',
  '오늘도 대박 나요! 💫',
  '같이 성장해요! 🌱',
  '아이디어 있어요? 말씀해 보세요!',
  '뭐든 물어봐요! 😄',
  '항상 여기 있어요! 🌟',
  '화이팅입니다 대표님! 💪',
  '오늘 하루도 수고하셨어요! 🥰',
];

function pickRandom(arr: string[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

useGLTF.preload('/models/cat-hero.glb');

const TARGET_SIZE = 2.0;

interface BoneAnim {
  bone: THREE.Bone;
  ix: number; iy: number; iz: number; // 초기 Euler 각도
  ax: number; ay: number; az: number; // 진폭
  fx: number; fy: number; fz: number; // 주파수
  px: number; py: number; pz: number; // 위상
}

function CatHero() {
  const groupRef = useRef<THREE.Group>(null!);
  const { scene } = useGLTF('/models/cat-hero.glb');

  // scene을 직접 사용 (clone 없음) — SkinnedMesh.skeleton.bones로 bone 접근
  const { scale, cx, cy, cz, bones } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const s = TARGET_SIZE / maxDim;

    const boneList: BoneAnim[] = [];
    const seen = new Set<string>();

    scene.traverse((obj) => {
      const sm = obj as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh || !sm.skeleton) return;
      sm.skeleton.bones.forEach((bone) => {
        if (seen.has(bone.uuid)) return;
        seen.add(bone.uuid);

        const n = bone.name.toLowerCase();
        const h = n.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

        let ax = 0.02, ay = 0.02, az = 0.02;
        if (/head/.test(n))                                    { ax = 0.12; ay = 0.16; az = 0.08; }
        else if (/neck/.test(n))                               { ax = 0.07; ay = 0.09; az = 0.05; }
        else if (/spine|chest|torso/.test(n))                  { ax = 0.05; ay = 0.04; az = 0.04; }
        else if (/shoulder|upper.?arm|arm.?upper/.test(n))     { ax = 0.18; ay = 0.12; az = 0.20; }
        else if (/forearm|lower.?arm|arm.?lower|elbow/.test(n)){ ax = 0.12; ay = 0.07; az = 0.14; }
        else if (/hand|wrist/.test(n))                         { ax = 0.14; ay = 0.16; az = 0.12; }
        else if (/finger|thumb|index|middle|ring|pinky/.test(n)){ ax = 0.10; ay = 0.05; az = 0.08; }
        else if (/thigh|upleg|upper.?leg/.test(n))             { ax = 0.05; ay = 0.03; az = 0.04; }
        else if (/shin|calf|lower.?leg|knee/.test(n))          { ax = 0.04; ay = 0.02; az = 0.02; }
        else if (/foot|ankle/.test(n))                         { ax = 0.07; ay = 0.05; az = 0.06; }
        else if (/tail/.test(n))                               { ax = 0.22; ay = 0.30; az = 0.16; }
        else if (/ear/.test(n))                                { ax = 0.10; ay = 0.07; az = 0.12; }

        boneList.push({
          bone,
          ix: bone.rotation.x, iy: bone.rotation.y, iz: bone.rotation.z,
          ax, ay, az,
          fx: 0.25 + (h % 8) * 0.055,
          fy: 0.20 + (h % 6) * 0.065,
          fz: 0.30 + (h % 7) * 0.050,
          px: (h % 13) * 0.48,
          py: ((h + 3) % 11) * 0.57,
          pz: ((h + 7) % 9)  * 0.70,
        });
      });
    });

    return { scale: s, cx: center.x, cy: center.y, cz: center.z, bones: boneList };
  }, [scene]);

  // 말풍선
  const [greeting, setGreeting] = useState(() => pickRandom(GREETINGS));
  const [fade, setFade] = useState(true);
  useEffect(() => {
    const iv = setInterval(() => {
      setFade(false);
      setTimeout(() => { setGreeting(pickRandom(GREETINGS)); setFade(true); }, 300);
    }, 3500);
    return () => clearInterval(iv);
  }, []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;

    // Y 회전 없음 — 제자리에서 둥실만
    groupRef.current.position.y = Math.sin(t * 0.8) * 0.04;

    // 모든 bone에 sine wave 회전 직접 적용
    for (const b of bones) {
      b.bone.rotation.x = b.ix + Math.sin(t * b.fx + b.px) * b.ax;
      b.bone.rotation.y = b.iy + Math.sin(t * b.fy + b.py) * b.ay;
      b.bone.rotation.z = b.iz + Math.sin(t * b.fz + b.pz) * b.az;
    }
  });

  const halfH = TARGET_SIZE * 0.5;

  return (
    <group ref={groupRef}>
      {/* rotation-y로 정면 보정 (모델이 -X 방향 향할 때 -π/2 보정) */}
      <group scale={[scale, scale, scale]} rotation={[0, -Math.PI / 2, 0]}>
        <primitive object={scene} position={[-cx, -cy, -cz]} />
      </group>

      {/* 말풍선 */}
      <Html position={[0, halfH + 0.3, 0]} center zIndexRange={[100, 0]}>
        <div style={{
          opacity: fade ? 1 : 0,
          transition: 'opacity 0.3s ease',
          background: 'rgba(255,255,255,0.97)',
          backdropFilter: 'blur(10px)',
          borderRadius: '14px',
          padding: '8px 16px',
          fontSize: '13px',
          fontWeight: 700,
          color: '#0f172a',
          whiteSpace: 'nowrap',
          boxShadow: '0 6px 30px rgba(0,0,0,0.25)',
          fontFamily: '-apple-system, sans-serif',
          position: 'relative',
          maxWidth: '200px',
          textAlign: 'center',
        }}>
          {greeting}
          <div style={{
            position: 'absolute',
            bottom: -7,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '7px solid transparent',
            borderRight: '7px solid transparent',
            borderTop: '7px solid rgba(255,255,255,0.97)',
          }} />
        </div>
      </Html>

      {/* 이름표 */}
      <Html position={[0, -halfH - 0.25, 0]} center zIndexRange={[50, 0]}>
        <div style={{
          background: 'rgba(10,14,35,0.90)',
          border: '1px solid rgba(99,102,241,0.5)',
          borderRadius: '10px',
          padding: '5px 14px',
          textAlign: 'center',
          fontFamily: '-apple-system, sans-serif',
          whiteSpace: 'nowrap',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff' }}>AI 직원</div>
          <div style={{ fontSize: '11px', color: '#818cf8', marginTop: 2 }}>당신의 첫 번째 AI 팀원</div>
        </div>
      </Html>
    </group>
  );
}

function LoadingFallback() {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.elapsedTime * 1.5;
  });
  return (
    <mesh ref={ref} position={[0, 1.2, 0]}>
      <octahedronGeometry args={[0.7, 0]} />
      <meshStandardMaterial color="#4f46e5" wireframe />
    </mesh>
  );
}

function Lights() {
  return (
    <>
      <ambientLight intensity={2.0} />
      <directionalLight position={[3, 6, 4]} intensity={2.0} />
      <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#ffe4cc" />
      <pointLight position={[0, 3, 4]} intensity={0.8} color="#818cf8" />
    </>
  );
}

export default function AnimalHero3D() {
  return (
    <Canvas
      camera={{ position: [0, 0, 3.2], fov: 60 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 1.5]}
      style={{ width: '100%', height: '100%' }}
    >
      <Lights />
      <Suspense fallback={<LoadingFallback />}>
        <CatHero />
      </Suspense>
    </Canvas>
  );
}
