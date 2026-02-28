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

const TARGET_HEIGHT = 2.0; // 전체 바운딩박스 기준 높이

function CatHero() {
  const groupRef = useRef<THREE.Group>(null!);
  const { scene, animations } = useGLTF('/models/cat-hero.glb');

  const { clone, scale } = useMemo(() => {
    const c = scene.clone(true);
    const box = new THREE.Box3().setFromObject(c);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    // 바운딩박스 전체를 원점 기준으로 정렬 (발 아닌 중심 기준)
    c.position.set(-center.x, -center.y, -center.z);
    const s = TARGET_HEIGHT / (Math.max(size.y, size.x, size.z) || 1);
    return { clone: c, scale: s };
  }, [scene]);

  const { actions, names } = useAnimations(animations, groupRef);
  useEffect(() => {
    if (!names.length) return;
    const idleName = names.find((n) => /idle/i.test(n)) ?? names[0];
    actions[idleName]?.reset().fadeIn(0.4).play();
    return () => { actions[idleName]?.fadeOut(0.3); };
  }, [actions, names]);

  // 말풍선
  const [greeting, setGreeting] = useState(() => pickRandom(GREETINGS));
  const [fade, setFade] = useState(true);
  useEffect(() => {
    const iv = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setGreeting(pickRandom(GREETINGS));
        setFade(true);
      }, 300);
    }, 3500);
    return () => clearInterval(iv);
  }, []);

  // 천천히 Y 회전 + 둥실
  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = clock.elapsedTime * 0.35;
      groupRef.current.position.y = Math.sin(clock.elapsedTime * 1.1) * 0.06;
    }
  });

  const halfH = TARGET_HEIGHT * 0.5;

  return (
    <group ref={groupRef}>
      <group scale={[scale, scale, scale]}>
        <primitive object={clone} />
      </group>

      {/* 말풍선 */}
      <Html position={[0, halfH + 0.4, 0]} center zIndexRange={[100, 0]}>
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
      camera={{ position: [0, 0, 4.5], fov: 55 }}
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
