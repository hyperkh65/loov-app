'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useRef, useState, useEffect } from 'react';
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

// ── 동물 모델들 ──────────────────────────────────────────────

function FoxModel() {
  const c = '#E8733A';
  const light = '#F5C4A0';
  return (
    <group>
      <mesh position={[0, -0.15, 0]}><sphereGeometry args={[0.4, 14, 14]} /><meshToonMaterial color={c} /></mesh>
      <mesh position={[0, 0.6, 0]}><sphereGeometry args={[0.28, 14, 14]} /><meshToonMaterial color={c} /></mesh>
      <mesh position={[-0.17, 0.95, 0]} rotation={[0, 0, -0.35]}><coneGeometry args={[0.09, 0.22, 4]} /><meshToonMaterial color={c} /></mesh>
      <mesh position={[0.17, 0.95, 0]} rotation={[0, 0, 0.35]}><coneGeometry args={[0.09, 0.22, 4]} /><meshToonMaterial color={c} /></mesh>
      <mesh position={[0, 0.53, 0.24]}><sphereGeometry args={[0.11, 8, 8]} /><meshToonMaterial color={light} /></mesh>
      <mesh position={[-0.1, 0.65, 0.24]}><sphereGeometry args={[0.033, 6, 6]} /><meshToonMaterial color="#111" /></mesh>
      <mesh position={[0.1, 0.65, 0.24]}><sphereGeometry args={[0.033, 6, 6]} /><meshToonMaterial color="#111" /></mesh>
      <mesh position={[0, 0.1, 0.33]}><sphereGeometry args={[0.17, 8, 8]} /><meshToonMaterial color={light} /></mesh>
      <mesh position={[0.1, -0.32, -0.36]} rotation={[0.5, 0.2, 0]}><sphereGeometry args={[0.17, 8, 8]} /><meshToonMaterial color={light} /></mesh>
    </group>
  );
}

function BearModel() {
  const c = '#8B6355';
  const light = '#B89080';
  return (
    <group>
      <mesh position={[0, -0.15, 0]}><sphereGeometry args={[0.44, 14, 14]} /><meshToonMaterial color={c} /></mesh>
      <mesh position={[0, 0.63, 0]}><sphereGeometry args={[0.31, 14, 14]} /><meshToonMaterial color={c} /></mesh>
      <mesh position={[-0.24, 0.93, 0]}><sphereGeometry args={[0.1, 8, 8]} /><meshToonMaterial color={c} /></mesh>
      <mesh position={[0.24, 0.93, 0]}><sphereGeometry args={[0.1, 8, 8]} /><meshToonMaterial color={c} /></mesh>
      <mesh position={[0, 0.54, 0.27]}><sphereGeometry args={[0.13, 8, 8]} /><meshToonMaterial color={light} /></mesh>
      <mesh position={[-0.12, 0.68, 0.26]}><sphereGeometry args={[0.038, 6, 6]} /><meshToonMaterial color="#111" /></mesh>
      <mesh position={[0.12, 0.68, 0.26]}><sphereGeometry args={[0.038, 6, 6]} /><meshToonMaterial color="#111" /></mesh>
      <mesh position={[0, 0.61, 0.4]}><sphereGeometry args={[0.038, 5, 5]} /><meshToonMaterial color="#111" /></mesh>
      <mesh position={[0, -0.1, 0.38]}><sphereGeometry args={[0.21, 8, 8]} /><meshToonMaterial color={light} /></mesh>
    </group>
  );
}

function RabbitModel() {
  const c = '#F2F2F2';
  const pink = '#F4A0B8';
  return (
    <group>
      <mesh position={[0, -0.15, 0]}><sphereGeometry args={[0.38, 14, 14]} /><meshToonMaterial color={c} /></mesh>
      <mesh position={[0, 0.57, 0]}><sphereGeometry args={[0.27, 14, 14]} /><meshToonMaterial color={c} /></mesh>
      <mesh position={[-0.13, 1.18, 0]}><capsuleGeometry args={[0.07, 0.38, 4, 8]} /><meshToonMaterial color={c} /></mesh>
      <mesh position={[0.13, 1.18, 0]}><capsuleGeometry args={[0.07, 0.38, 4, 8]} /><meshToonMaterial color={c} /></mesh>
      <mesh position={[-0.13, 1.18, 0.05]}><capsuleGeometry args={[0.03, 0.26, 4, 8]} /><meshToonMaterial color={pink} /></mesh>
      <mesh position={[0.13, 1.18, 0.05]}><capsuleGeometry args={[0.03, 0.26, 4, 8]} /><meshToonMaterial color={pink} /></mesh>
      <mesh position={[0, 0.55, 0.25]}><sphereGeometry args={[0.038, 5, 5]} /><meshToonMaterial color={pink} /></mesh>
      <mesh position={[-0.1, 0.63, 0.23]}><sphereGeometry args={[0.038, 6, 6]} /><meshToonMaterial color="#111" /></mesh>
      <mesh position={[0.1, 0.63, 0.23]}><sphereGeometry args={[0.038, 6, 6]} /><meshToonMaterial color="#111" /></mesh>
      <mesh position={[-0.16, 0.54, 0.2]}><sphereGeometry args={[0.055, 6, 6]} /><meshToonMaterial color={pink} transparent opacity={0.45} /></mesh>
      <mesh position={[0.16, 0.54, 0.2]}><sphereGeometry args={[0.055, 6, 6]} /><meshToonMaterial color={pink} transparent opacity={0.45} /></mesh>
      <mesh position={[0, -0.22, -0.35]}><sphereGeometry args={[0.09, 8, 8]} /><meshToonMaterial color={c} /></mesh>
    </group>
  );
}

function LionModel() {
  const c = '#F4A827';
  const mane = '#C17D16';
  const light = '#E09020';
  return (
    <group>
      <mesh position={[0, -0.15, 0]}><sphereGeometry args={[0.43, 14, 14]} /><meshToonMaterial color={c} /></mesh>
      <mesh position={[0, 0.59, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.36, 0.13, 8, 16]} /><meshToonMaterial color={mane} /></mesh>
      <mesh position={[0, 0.61, 0]}><sphereGeometry args={[0.28, 14, 14]} /><meshToonMaterial color={c} /></mesh>
      <mesh position={[-0.2, 0.87, 0]}><sphereGeometry args={[0.08, 6, 6]} /><meshToonMaterial color={c} /></mesh>
      <mesh position={[0.2, 0.87, 0]}><sphereGeometry args={[0.08, 6, 6]} /><meshToonMaterial color={c} /></mesh>
      <mesh position={[0, 0.52, 0.25]}><sphereGeometry args={[0.12, 8, 8]} /><meshToonMaterial color={light} /></mesh>
      <mesh position={[0, 0.6, 0.38]}><sphereGeometry args={[0.038, 5, 5]} /><meshToonMaterial color="#111" /></mesh>
      <mesh position={[-0.11, 0.68, 0.23]}><sphereGeometry args={[0.038, 6, 6]} /><meshToonMaterial color="#111" /></mesh>
      <mesh position={[0.11, 0.68, 0.23]}><sphereGeometry args={[0.038, 6, 6]} /><meshToonMaterial color="#111" /></mesh>
    </group>
  );
}

function PandaModel() {
  const white = '#F4F4F4';
  const black = '#1a1a1a';
  return (
    <group>
      <mesh position={[0, -0.15, 0]}><sphereGeometry args={[0.44, 14, 14]} /><meshToonMaterial color={white} /></mesh>
      <mesh position={[0, 0.64, 0]}><sphereGeometry args={[0.31, 14, 14]} /><meshToonMaterial color={white} /></mesh>
      <mesh position={[-0.22, 0.95, 0]}><sphereGeometry args={[0.1, 8, 8]} /><meshToonMaterial color={black} /></mesh>
      <mesh position={[0.22, 0.95, 0]}><sphereGeometry args={[0.1, 8, 8]} /><meshToonMaterial color={black} /></mesh>
      <mesh position={[-0.12, 0.7, 0.21]}><sphereGeometry args={[0.08, 8, 8]} /><meshToonMaterial color={black} /></mesh>
      <mesh position={[0.12, 0.7, 0.21]}><sphereGeometry args={[0.08, 8, 8]} /><meshToonMaterial color={black} /></mesh>
      <mesh position={[-0.12, 0.7, 0.27]}><sphereGeometry args={[0.038, 6, 6]} /><meshToonMaterial color={white} /></mesh>
      <mesh position={[0.12, 0.7, 0.27]}><sphereGeometry args={[0.038, 6, 6]} /><meshToonMaterial color={white} /></mesh>
      <mesh position={[-0.12, 0.7, 0.31]}><sphereGeometry args={[0.018, 5, 5]} /><meshToonMaterial color={black} /></mesh>
      <mesh position={[0.12, 0.7, 0.31]}><sphereGeometry args={[0.018, 5, 5]} /><meshToonMaterial color={black} /></mesh>
      <mesh position={[0, 0.57, 0.3]}><sphereGeometry args={[0.038, 5, 5]} /><meshToonMaterial color={black} /></mesh>
      <mesh position={[-0.42, -0.05, 0]} rotation={[0, 0, 0.5]}><capsuleGeometry args={[0.08, 0.22, 4, 8]} /><meshToonMaterial color={black} /></mesh>
      <mesh position={[0.42, -0.05, 0]} rotation={[0, 0, -0.5]}><capsuleGeometry args={[0.08, 0.22, 4, 8]} /><meshToonMaterial color={black} /></mesh>
    </group>
  );
}

// ── 동물 메타데이터 ──────────────────────────────────────────

const ANIMAL_DATA = [
  { type: 'fox',    name: 'Fox',    role: '영업팀장', accent: '#FF8C42', Model: FoxModel    },
  { type: 'bear',   name: 'Bear',   role: '회계팀장', accent: '#A07060', Model: BearModel   },
  { type: 'rabbit', name: 'Rabbit', role: '마케터',   accent: '#FF6B9D', Model: RabbitModel },
  { type: 'lion',   name: 'Lion',   role: '개발자',   accent: '#F4A827', Model: LionModel   },
  { type: 'panda',  name: 'Panda',  role: 'HR팀장',  accent: '#7C6CD0', Model: PandaModel  },
];

// ── 단일 동물 + 말풍선 ────────────────────────────────────────

interface AnimalProps {
  animal: typeof ANIMAL_DATA[0];
  index: number;
}

function AnimalCard({ animal, index }: AnimalProps) {
  const groupRef = useRef<THREE.Group>(null);
  const floatPhase = (index / ANIMAL_DATA.length) * Math.PI * 2;

  const [greeting, setGreeting] = useState(() => pickRandom(GREETINGS));
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const delay = index * 900;
    const id = setTimeout(() => {
      const iv = setInterval(() => {
        setFade(false);
        setTimeout(() => {
          setGreeting(pickRandom(GREETINGS));
          setFade(true);
        }, 280);
      }, 3800 + index * 300);
      return () => clearInterval(iv);
    }, delay);
    return () => clearTimeout(id);
  }, [index]);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(clock.elapsedTime * 1.3 + floatPhase) * 0.1;
    }
  });

  const { Model } = animal;

  return (
    <group ref={groupRef}>
      <Model />

      {/* 말풍선 */}
      <Html position={[0, 1.55, 0]} center zIndexRange={[100, 0]}>
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
          boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
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
      <Html position={[0, -0.9, 0]} center zIndexRange={[50, 0]}>
        <div style={{
          background: 'rgba(10, 14, 35, 0.88)',
          border: `1px solid ${animal.accent}55`,
          borderRadius: '8px',
          padding: '4px 10px',
          textAlign: 'center',
          fontFamily: '-apple-system, sans-serif',
          whiteSpace: 'nowrap',
        }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#fff' }}>{animal.name}</div>
          <div style={{ fontSize: '10px', color: animal.accent, marginTop: 1 }}>{animal.role}</div>
        </div>
      </Html>
    </group>
  );
}

// ── 회전 캐러셀 ──────────────────────────────────────────────

const RADIUS = 2.55;

function Carousel() {
  const groupRef = useRef<THREE.Group>(null);

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
          <group key={animal.type} position={[x, 0, z]} rotation={[0, angle, 0]}>
            <AnimalCard animal={animal} index={i} />
          </group>
        );
      })}
    </group>
  );
}

// ── 씬 내부 조명 ─────────────────────────────────────────────

function Lights() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 8, 5]} intensity={1.3} color="#ffffff" castShadow />
      <directionalLight position={[-4, 3, -4]} intensity={0.35} color="#818cf8" />
      <pointLight position={[0, 6, 0]} intensity={0.5} color="#a78bfa" />
      <pointLight position={[0, -2, 3]} intensity={0.3} color="#60a5fa" />
    </>
  );
}

// ── 내보내기 ─────────────────────────────────────────────────

export default function AnimalHero3D() {
  return (
    <Canvas
      camera={{ position: [0, 1.5, 7.5], fov: 48 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 1.5]}
      style={{ width: '100%', height: '100%' }}
    >
      <Lights />
      <Carousel />
    </Canvas>
  );
}
