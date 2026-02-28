'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Html, useGLTF, useFBX } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { Suspense, useRef, useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';

// ── 인사말 ─────────────────────────────────────────
const GREETINGS = [
  '안녕하세요! 오늘도 파이팅! 💪', '좋은 아침이에요, 대표님!', '오늘 업무 준비 완료! 🎯',
  '뭘 도와드릴까요? 😊', '보고서 다 써놨어요! 📋', '미팅 준비됐습니다! 📅',
  '신규 리드 발굴했어요! 🎉', '계약 성사됐습니다! 🎊', '정산 완료했어요 💰',
  '캠페인 성과가 좋아요! 🚀', '트렌드 분석 중이에요 🔍', '디자인 시안 올렸어요! 🎨',
  '1인 기업 최고! 🙌', '같이 성장해요! 🌱', '항상 여기 있어요! 🌟',
  '화이팅입니다 대표님! 💪', '오늘도 대박 나요! 💫', '수익이 늘고 있어요! 📈',
  '광고 ROI 분석 완료! 💡', 'API 연동됐어요! ⚡', '배포 완료! 🚀',
  '버그 수정했어요! 🐛', '커피 한 잔 하셨어요? ☕', '오늘 하루도 수고하셨어요! 🥰',
];
const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

useGLTF.preload('/models/cat-hero.glb');
useGLTF.preload('/models/tiger-hero.glb');
useGLTF.preload('/models/fox-hero.glb');
useFBX.preload('/models/fox-dance.fbx');

// ── A포즈 쿼터니언 ──────────────────────────────────
const AQL = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 4));
const AQR = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0,  Math.PI / 4));

interface BD {
  bone: THREE.Bone;
  iq: THREE.Quaternion; // A포즈 기준 initQ
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

// ── 캐릭터 컴포넌트 ─────────────────────────────────
function Character({
  path, posX, label, role, fp = 0,
}: { path: string; posX: number; label: string; role: string; fp?: number }) {
  const ref = useRef<THREE.Group>(null!);
  const { scene } = useGLTF(path);

  // ★ SkeletonUtils.clone() — skeleton까지 올바르게 클론
  //    scene.clone(true)는 SkinnedMesh가 원본 skeleton 참조 → 본 수정 무효
  const { clone, s, bones } = useMemo(() => {
    const c = SkeletonUtils.clone(scene) as THREE.Group;

    const box = new THREE.Box3().setFromObject(c);
    const cen = new THREE.Vector3(), sz = new THREE.Vector3();
    box.getCenter(cen); box.getSize(sz);
    const scale = 1.4 / (Math.max(sz.x, sz.y, sz.z) || 1);
    c.position.set(-cen.x, -cen.y, -cen.z);

    const bd: BD[] = [];
    c.traverse((o) => {
      if (o.type !== 'Bone') return;
      const bone = o as THREE.Bone;
      const n = bone.name.toLowerCase();
      const h = n.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

      // A포즈 적용
      const isL = /shoulder|upper.?arm/.test(n) && /left|[._]l[._\b]|_l$|\.l$/.test(n);
      const isR = /shoulder|upper.?arm/.test(n) && /right|[._]r[._\b]|_r$|\.r$/.test(n);
      if (isL) { bone.quaternion.multiply(AQL); bone.updateMatrix(); }
      if (isR) { bone.quaternion.multiply(AQR); bone.updateMatrix(); }

      const iq = bone.quaternion.clone();
      const [ax, ay, az] = amp(n);

      bd.push({
        bone, iq, ax, ay, az,
        fx: 0.18 + (h % 8) * 0.05,
        fy: 0.14 + (h % 6) * 0.06,
        fz: 0.22 + (h % 7) * 0.04,
        px: (h % 13) * 0.48,
        py: ((h + 3) % 11) * 0.57,
        pz: ((h + 7) % 9)  * 0.70,
      });
    });

    return { clone: c, s: scale, bones: bd };
  }, [scene]);

  // 말풍선
  const [txt, setTxt] = useState(() => pick(GREETINGS));
  const [fade, setFade] = useState(true);
  useEffect(() => {
    const iv = setInterval(() => {
      setFade(false);
      setTimeout(() => { setTxt(pick(GREETINGS)); setFade(true); }, 280);
    }, 3400 + fp * 700);
    return () => clearInterval(iv);
  }, [fp]);

  const te = useRef(new THREE.Euler());
  const tq = useRef(new THREE.Quaternion());

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.position.y = Math.sin(t * 0.75 + fp) * 0.05;

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
    <group ref={ref} position={[posX, 0, 0]}>
      <group scale={s} rotation={[0, -Math.PI / 2, 0]}>
        <primitive object={clone} />
      </group>

      <Html position={[0, 0.85, 0]} center zIndexRange={[100, 0]}>
        <div style={{
          opacity: fade ? 1 : 0, transition: 'opacity 0.28s',
          background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)',
          borderRadius: '12px', padding: '6px 13px', fontSize: '11px', fontWeight: 700,
          color: '#0f172a', whiteSpace: 'nowrap', boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
          fontFamily: '-apple-system,sans-serif', position: 'relative', textAlign: 'center',
        }}>
          {txt}
          <div style={{
            position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)',
            borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
            borderTop: '6px solid rgba(255,255,255,0.97)',
          }} />
        </div>
      </Html>

      <Html position={[0, -0.85, 0]} center zIndexRange={[50, 0]}>
        <div style={{
          background: 'rgba(10,14,35,0.9)', border: '1px solid rgba(99,102,241,0.45)',
          borderRadius: '8px', padding: '4px 11px', textAlign: 'center',
          fontFamily: '-apple-system,sans-serif', whiteSpace: 'nowrap',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#fff' }}>{label}</div>
          <div style={{ fontSize: '9px', color: '#818cf8', marginTop: 1 }}>{role}</div>
        </div>
      </Html>
    </group>
  );
}

// ── 여우 캐릭터 (FBX 애니메이션) ────────────────────
function FoxCharacter({
  posX, label, role, fp = 0,
}: { posX: number; label: string; role: string; fp?: number }) {
  const ref = useRef<THREE.Group>(null!);
  const { scene } = useGLTF('/models/fox-hero.glb');
  const fbx = useFBX('/models/fox-dance.fbx');

  const clone = useMemo(() => {
    const c = SkeletonUtils.clone(scene) as THREE.Group;
    const box = new THREE.Box3().setFromObject(c);
    const cen = new THREE.Vector3(), sz = new THREE.Vector3();
    box.getCenter(cen); box.getSize(sz);
    const scale = 1.4 / (Math.max(sz.x, sz.y, sz.z) || 1);
    c.position.set(-cen.x, -cen.y, -cen.z);
    (c as any).__scale = scale;
    return c;
  }, [scene]);

  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  useEffect(() => {
    if (!fbx.animations?.length) return;
    const mixer = new THREE.AnimationMixer(clone);
    mixerRef.current = mixer;
    // FBX 클립의 트랙 이름에서 "mixamorig:" 접두사 제거 (GLB 본 이름과 매칭)
    const clip = fbx.animations[0].clone();
    clip.tracks.forEach((track) => {
      track.name = track.name.replace(/^mixamorig:/i, '');
    });
    const action = mixer.clipAction(clip);
    action.play();
    return () => { mixer.stopAllAction(); mixer.uncacheRoot(clone); };
  }, [clone, fbx]);

  // 말풍선
  const [txt, setTxt] = useState(() => pick(GREETINGS));
  const [fade, setFade] = useState(true);
  useEffect(() => {
    const iv = setInterval(() => {
      setFade(false);
      setTimeout(() => { setTxt(pick(GREETINGS)); setFade(true); }, 280);
    }, 3400 + fp * 700);
    return () => clearInterval(iv);
  }, [fp]);

  useFrame((_, delta) => {
    mixerRef.current?.update(delta);
    if (ref.current) {
      ref.current.position.y = Math.sin(Date.now() * 0.001 * 0.75 + fp) * 0.05;
    }
  });

  const s = (clone as any).__scale ?? 1;

  return (
    <group ref={ref} position={[posX, 0, 0]}>
      <group scale={s} rotation={[0, -Math.PI / 2, 0]}>
        <primitive object={clone} />
      </group>

      <Html position={[0, 0.85, 0]} center zIndexRange={[100, 0]}>
        <div style={{
          opacity: fade ? 1 : 0, transition: 'opacity 0.28s',
          background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)',
          borderRadius: '12px', padding: '6px 13px', fontSize: '11px', fontWeight: 700,
          color: '#0f172a', whiteSpace: 'nowrap', boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
          fontFamily: '-apple-system,sans-serif', position: 'relative', textAlign: 'center',
        }}>
          {txt}
          <div style={{
            position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)',
            borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
            borderTop: '6px solid rgba(255,255,255,0.97)',
          }} />
        </div>
      </Html>

      <Html position={[0, -0.85, 0]} center zIndexRange={[50, 0]}>
        <div style={{
          background: 'rgba(10,14,35,0.9)', border: '1px solid rgba(99,102,241,0.45)',
          borderRadius: '8px', padding: '4px 11px', textAlign: 'center',
          fontFamily: '-apple-system,sans-serif', whiteSpace: 'nowrap',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#fff' }}>{label}</div>
          <div style={{ fontSize: '9px', color: '#818cf8', marginTop: 1 }}>{role}</div>
        </div>
      </Html>
    </group>
  );
}

function Spinner() {
  const r = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => { if (r.current) r.current.rotation.y = clock.elapsedTime * 2; });
  return <mesh ref={r}><octahedronGeometry args={[0.4, 0]} /><meshStandardMaterial color="#4f46e5" wireframe /></mesh>;
}

export default function AnimalHero3D() {
  return (
    <Canvas camera={{ position: [0, 0, 6.0], fov: 62 }} gl={{ antialias: true, alpha: true }} dpr={[1, 1.5]} style={{ width: '100%', height: '100%' }}>
      <ambientLight intensity={2.2} />
      <directionalLight position={[3, 6, 4]} intensity={2.0} />
      <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#ffe4cc" />
      <pointLight position={[0, 2, 4]} intensity={0.7} color="#818cf8" />

      <Suspense fallback={<Spinner />}>
        <Character path="/models/cat-hero.glb"   posX={-2.2} label="AI 마케터"   role="마케팅·SNS·콘텐츠" fp={0}   />
      </Suspense>
      <Suspense fallback={<Spinner />}>
        <Character path="/models/tiger-hero.glb" posX={0}    label="AI 영업팀장" role="영업·전략·CRM"     fp={1.5} />
      </Suspense>
      <Suspense fallback={<Spinner />}>
        <FoxCharacter posX={2.2} label="AI 개발자" role="개발·자동화·API" fp={3.0} />
      </Suspense>
    </Canvas>
  );
}
