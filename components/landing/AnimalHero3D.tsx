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

// ── 동물 데이터 ───────────────────────────────────────────────
const ANIMAL_DATA = [
  { file: '/models/fox.glb',    name: 'Fox',    role: '영업팀장', accent: '#FF8C42' },
  { file: '/models/cat.glb',    name: 'Cat',    role: '회계팀장', accent: '#A0C4FF' },
  { file: '/models/rabbit.glb', name: 'Rabbit', role: '마케터',   accent: '#FF6B9D' },
  { file: '/models/deer.glb',   name: 'Deer',   role: '개발자',   accent: '#7FD87F' },
  { file: '/models/otter.glb',  name: 'Otter',  role: 'HR팀장',  accent: '#C9A87C' },
];

// 모델 미리 로드
useGLTF.preload('/models/fox.glb');
useGLTF.preload('/models/cat.glb');
useGLTF.preload('/models/rabbit.glb');
useGLTF.preload('/models/deer.glb');
useGLTF.preload('/models/otter.glb');

// ── 동물 카드 (GLB 모델 + 말풍선) ────────────────────────────

const TARGET_HEIGHT = 1.5; // 정규화 목표 높이 (world units)

interface AnimalCardProps {
  file: string;
  name: string;
  role: string;
  accent: string;
  index: number;
}

function AnimalCard({ file, name, role, accent, index }: AnimalCardProps) {
  const floatPhase = (index / ANIMAL_DATA.length) * Math.PI * 2;
  const groupRef = useRef<THREE.Group>(null!);

  const { scene, animations } = useGLTF(file);

  // 클론 + 원점 정렬 + 스케일 계산
  const { clone, scale } = useMemo(() => {
    const c = scene.clone(true);
    const box = new THREE.Box3().setFromObject(c);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    // 발이 y=0에 위치하도록 이동
    c.position.set(-center.x, -box.min.y, -center.z);
    const s = TARGET_HEIGHT / (size.y || 1);
    return { clone: c, scale: s };
  }, [scene]);

  // 스켈레탈 애니메이션 (있으면 자동 재생)
  const { actions, names } = useAnimations(animations, groupRef);
  useEffect(() => {
    if (!names.length) return;
    const idleName = names.find((n) => /idle/i.test(n)) ?? names[0];
    actions[idleName]?.reset().fadeIn(0.4).play();
    return () => { actions[idleName]?.fadeOut(0.3); };
  }, [actions, names]);

  // 말풍선 상태
  const [greeting, setGreeting] = useState(() => pickRandom(GREETINGS));
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const delay = setTimeout(() => {
      const iv = setInterval(() => {
        setFade(false);
        setTimeout(() => {
          setGreeting(pickRandom(GREETINGS));
          setFade(true);
        }, 280);
      }, 3800 + index * 400);
      return () => clearInterval(iv);
    }, index * 900);
    return () => clearTimeout(delay);
  }, [index]);

  // 둥실둥실 애니메이션
  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(clock.elapsedTime * 1.2 + floatPhase) * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      {/* GLB 모델 (스케일 적용) */}
      <group scale={[scale, scale, scale]}>
        <primitive object={clone} />
      </group>

      {/* 말풍선 */}
      <Html position={[0, TARGET_HEIGHT + 0.45, 0]} center zIndexRange={[100, 0]}>
        <div style={{
          opacity: fade ? 1 : 0,
          transition: 'opacity 0.28s ease',
          background: 'rgba(255,255,255,0.96)',
          backdropFilter: 'blur(8px)',
          borderRadius: '12px',
          padding: '6px 12px',
          fontSize: '11px',
          fontWeight: 700,
          color: '#0f172a',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
          fontFamily: '-apple-system, sans-serif',
          position: 'relative',
          maxWidth: '168px',
          textAlign: 'center',
        }}>
          {greeting}
          <div style={{
            position: 'absolute',
            bottom: -6,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid rgba(255,255,255,0.96)',
          }} />
        </div>
      </Html>

      {/* 이름표 */}
      <Html position={[0, -0.2, 0]} center zIndexRange={[50, 0]}>
        <div style={{
          background: 'rgba(10,14,35,0.88)',
          border: `1px solid ${accent}55`,
          borderRadius: '8px',
          padding: '4px 10px',
          textAlign: 'center',
          fontFamily: '-apple-system, sans-serif',
          whiteSpace: 'nowrap',
        }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#fff' }}>{name}</div>
          <div style={{ fontSize: '10px', color: accent, marginTop: 1 }}>{role}</div>
        </div>
      </Html>
    </group>
  );
}

// 로딩 중 와이어프레임 placeholder
function LoadingFallback() {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.elapsedTime * 1.5;
  });
  return (
    <mesh ref={ref} position={[0, 0.75, 0]}>
      <octahedronGeometry args={[0.5, 0]} />
      <meshStandardMaterial color="#4f46e5" wireframe />
    </mesh>
  );
}

// ── 회전 캐러셀 ──────────────────────────────────────────────

const RADIUS = 2.55;

function Carousel() {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = clock.elapsedTime * 0.22;
    }
  });

  return (
    <group ref={groupRef}>
      {ANIMAL_DATA.map((animal, i) => {
        const angle = (i / ANIMAL_DATA.length) * Math.PI * 2;
        const x = Math.sin(angle) * RADIUS;
        const z = Math.cos(angle) * RADIUS;
        return (
          <group key={animal.file} position={[x, 0, z]} rotation={[0, angle, 0]}>
            <Suspense fallback={<LoadingFallback />}>
              <AnimalCard {...animal} index={i} />
            </Suspense>
          </group>
        );
      })}
    </group>
  );
}

// ── 씬 조명 (Character3DViewer 와 동일한 웜 스튜디오 설정) ───

function Lights() {
  return (
    <>
      <ambientLight intensity={1.8} />
      <directionalLight position={[3, 6, 4]} intensity={1.8} />
      <directionalLight position={[-3, 2, -2]} intensity={0.5} color="#ffe4cc" />
      <pointLight position={[0, 2, 3]} intensity={0.5} color="#818cf8" />
    </>
  );
}

// ── 내보내기 ─────────────────────────────────────────────────

export default function AnimalHero3D() {
  return (
    <Canvas
      camera={{ position: [0, 0.8, 7.5], fov: 50 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 1.5]}
      style={{ width: '100%', height: '100%' }}
    >
      <Lights />
      <Carousel />
    </Canvas>
  );
}
