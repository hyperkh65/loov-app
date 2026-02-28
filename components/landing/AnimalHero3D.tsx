'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Html, useGLTF, useAnimations } from '@react-three/drei';
import { Suspense, useRef, useState, useEffect, useMemo } from 'react';
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

// 본 이름 패턴 → 애니메이션 설정
interface BoneAnim {
  bone: THREE.Bone;
  initQ: THREE.Quaternion;
  rx: number; ry: number; rz: number; // 진폭 (라디안)
  fx: number; fy: number; fz: number; // 주파수
  px: number; py: number; pz: number; // 위상
}

function matchesBone(name: string, ...keywords: string[]) {
  const n = name.toLowerCase();
  return keywords.some((k) => n.includes(k));
}

function CatHero() {
  const groupRef = useRef<THREE.Group>(null!);
  const { scene, animations } = useGLTF('/models/cat-hero.glb');

  const { clone, scale, boneAnims } = useMemo(() => {
    const c = scene.clone(true);
    const box = new THREE.Box3().setFromObject(c);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    c.position.set(-center.x, -center.y, -center.z);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const s = TARGET_SIZE / maxDim;

    // 본 수집 및 애니메이션 설정 할당
    const anims: BoneAnim[] = [];
    c.traverse((obj) => {
      if (!(obj instanceof THREE.Bone)) return;
      const n = obj.name;
      const initQ = obj.quaternion.clone();
      let cfg: Omit<BoneAnim, 'bone' | 'initQ'> | null = null;

      if (matchesBone(n, 'head')) {
        cfg = { rx: 0.08, ry: 0.12, rz: 0.04, fx: 0.4, fy: 0.3, fz: 0.5, px: 0, py: 1.2, pz: 2.1 };
      } else if (matchesBone(n, 'neck')) {
        cfg = { rx: 0.05, ry: 0.06, rz: 0.02, fx: 0.4, fy: 0.3, fz: 0.5, px: 0.3, py: 1.0, pz: 1.8 };
      } else if (matchesBone(n, 'spine', 'chest', 'torso')) {
        cfg = { rx: 0.04, ry: 0.05, rz: 0.03, fx: 0.35, fy: 0.28, fz: 0.4, px: 0.5, py: 0.8, pz: 1.5 };
      } else if (matchesBone(n, 'shoulder', 'upperarm', 'upper_arm', 'uparm', 'arm_l', 'arm_r', 'leftarm', 'rightarm')) {
        const isLeft = /left|_l\b|\.l\b/i.test(n);
        cfg = { rx: 0.10, ry: 0.08, rz: isLeft ? 0.12 : -0.12, fx: 0.5, fy: 0.4, fz: 0.45, px: isLeft ? 0 : 1.5, py: isLeft ? 0.7 : 2.2, pz: isLeft ? 0.5 : 0.3 };
      } else if (matchesBone(n, 'forearm', 'lowerarm', 'lower_arm', 'elbow')) {
        cfg = { rx: 0.06, ry: 0.04, rz: 0.08, fx: 0.55, fy: 0.35, fz: 0.5, px: 0.8, py: 1.4, pz: 0.6 };
      } else if (matchesBone(n, 'hand', 'wrist')) {
        cfg = { rx: 0.08, ry: 0.10, rz: 0.06, fx: 0.7, fy: 0.6, fz: 0.65, px: 1.0, py: 0.5, pz: 1.8 };
      } else if (matchesBone(n, 'finger', 'thumb', 'index', 'middle', 'ring', 'pinky')) {
        cfg = { rx: 0.06, ry: 0.03, rz: 0.04, fx: 0.9, fy: 0.7, fz: 0.8, px: Math.random() * 3, py: Math.random() * 3, pz: Math.random() * 3 };
      } else if (matchesBone(n, 'thigh', 'upleg', 'upper_leg', 'hip')) {
        cfg = { rx: 0.04, ry: 0.03, rz: 0.02, fx: 0.3, fy: 0.25, fz: 0.35, px: 1.2, py: 0.6, pz: 2.0 };
      } else if (matchesBone(n, 'shin', 'lowerleg', 'lower_leg', 'calf', 'knee')) {
        cfg = { rx: 0.03, ry: 0.02, rz: 0.02, fx: 0.3, fy: 0.25, fz: 0.35, px: 1.5, py: 1.0, pz: 0.8 };
      } else if (matchesBone(n, 'foot', 'ankle')) {
        cfg = { rx: 0.05, ry: 0.03, rz: 0.04, fx: 0.4, fy: 0.3, fz: 0.45, px: 0.4, py: 1.8, pz: 0.9 };
      } else if (matchesBone(n, 'tail')) {
        cfg = { rx: 0.15, ry: 0.20, rz: 0.10, fx: 0.6, fy: 0.5, fz: 0.55, px: 0, py: 0.4, pz: 1.0 };
      } else if (matchesBone(n, 'ear')) {
        cfg = { rx: 0.06, ry: 0.04, rz: 0.08, fx: 0.8, fy: 0.6, fz: 0.7, px: 0.2, py: 1.6, pz: 0.5 };
      }

      if (cfg) anims.push({ bone: obj, initQ, ...cfg });
    });

    return { clone: c, scale: s, boneAnims: anims };
  }, [scene]);

  // 내장 애니메이션 있으면 재생 (없으면 procedural 사용)
  const { actions, names } = useAnimations(animations, groupRef);
  const hasAnimation = names.length > 0;
  useEffect(() => {
    if (!hasAnimation) return;
    const idleName = names.find((n) => /idle/i.test(n)) ?? names[0];
    actions[idleName]?.reset().fadeIn(0.4).play();
    return () => { actions[idleName]?.fadeOut(0.3); };
  }, [actions, names, hasAnimation]);

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

  const euler = useMemo(() => new THREE.Euler(), []);
  const qDelta = useMemo(() => new THREE.Quaternion(), []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;

    // 그룹 전체: 천천히 Y 회전 + 둥실
    groupRef.current.rotation.y = t * 0.3;
    groupRef.current.position.y = Math.sin(t * 1.0) * 0.05;

    // 내장 애니메이션 없을 때 → procedural bone animation
    if (!hasAnimation) {
      for (const a of boneAnims) {
        euler.set(
          Math.sin(t * a.fx + a.px) * a.rx,
          Math.sin(t * a.fy + a.py) * a.ry,
          Math.sin(t * a.fz + a.pz) * a.rz,
        );
        qDelta.setFromEuler(euler);
        a.bone.quaternion.copy(a.initQ).multiply(qDelta);
      }
    }
  });

  const halfH = TARGET_SIZE * 0.5;

  return (
    <group ref={groupRef}>
      <group scale={[scale, scale, scale]}>
        <primitive object={clone} />
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
