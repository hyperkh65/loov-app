'use client';

import { useRef, useEffect, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';

// Preload all models at module load time
useGLTF.preload('/models/pig.glb');
useGLTF.preload('/models/cat.glb');
useGLTF.preload('/models/rabbit.glb');
useGLTF.preload('/models/fox.glb');
useGLTF.preload('/models/otter.glb');
useGLTF.preload('/models/tiger.glb');
useGLTF.preload('/models/deer.glb');
useGLTF.preload('/models/elephant.glb');
useGLTF.preload('/models/monkey.glb');

interface ModelProps {
  url: string;
  hovered: boolean;
  greeting: boolean;
  rotationY: number;
}

function Model({ url, hovered, greeting, rotationY }: ModelProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const { camera } = useThree();
  const { scene, animations } = useGLTF(url);

  // Clone so multiple instances of the same model don't conflict
  const cloned = useMemo(() => scene.clone(true), [scene]);

  // Use animations if the model has rigging (future-proof)
  const { actions, names } = useAnimations(animations, groupRef);

  // Auto-center model and fit camera
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    // Center at origin
    cloned.position.sub(center);

    // Position camera close to fill the canvas with the character
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 1.3;   // closer = bigger character
    camera.position.set(0, size.y * 0.05, dist);
    (camera as THREE.PerspectiveCamera).fov = 55;   // wider FOV = more visible
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    camera.lookAt(0, 0, 0);
  }, [cloned, camera]);

  // Play skeletal animations if available (rigged models)
  useEffect(() => {
    if (names.length === 0) return;
    const idleName =
      names.find((n) => /idle/i.test(n)) ??
      names.find((n) => /wait/i.test(n)) ??
      names[0];
    actions[idleName]?.reset().fadeIn(0.4).play();
    return () => { actions[idleName]?.fadeOut(0.3); };
  }, [actions, names]);

  // Random phase offset so multiple characters don't bob in sync
  const phase = useRef(Math.random() * Math.PI * 2);
  const t = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    t.current += delta;
    const g = groupRef.current;

    const targetScale = greeting ? 1.3 : hovered ? 1.14 : 1.0;
    const targetRotY = rotationY + (hovered ? 0.35 : 0);
    // Float only when not greeting
    const targetY = greeting
      ? size_y.current * 0.05
      : Math.sin(t.current * 1.4 + phase.current) * 0.04;

    g.scale.setScalar(g.scale.x + (targetScale - g.scale.x) * 0.10);
    g.rotation.y += (targetRotY - g.rotation.y) * 0.07;
    g.position.y += (targetY - g.position.y) * 0.06;
  });

  // Store model height for float calc
  const size_y = useRef(1);
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    const s = new THREE.Vector3();
    box.getSize(s);
    size_y.current = s.y;
  }, [cloned]);

  return (
    <group ref={groupRef}>
      <primitive object={cloned} />
    </group>
  );
}

interface Props {
  url: string;
  hovered: boolean;
  greeting: boolean;
  rotationY?: number;
}

export default function Character3DViewer({ url, hovered, greeting, rotationY = 0 }: Props) {
  return (
    <Canvas
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 1, 3], fov: 45 }}
      style={{ width: '100%', height: '100%' }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(0x000000, 0);  // fully transparent background
        scene.background = null;        // no scene background color
      }}
    >
      {/* Lighting: warm studio setup */}
      <ambientLight intensity={1.8} />
      <directionalLight position={[3, 6, 4]} intensity={1.8} />
      <directionalLight position={[-3, 2, -2]} intensity={0.5} color="#ffe4cc" />
      <pointLight position={[0, -1, 3]} intensity={0.4} color="#ffffff" />

      <Suspense fallback={null}>
        <Model url={url} hovered={hovered} greeting={greeting} rotationY={rotationY} />
      </Suspense>
    </Canvas>
  );
}
