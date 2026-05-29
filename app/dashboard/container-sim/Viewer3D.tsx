'use client';

import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Grid, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { ContainerConfig, PlacedBox } from './page';

const S = 1 / 100; // cm → Three.js unit

function ContainerFrame({ C }: { C: ContainerConfig }) {
  const W = C.W * S, H = C.H * S, D = C.D * S;
  const halfW = W / 2, halfD = D / 2;

  // 12 edges as line pairs
  const edges: [THREE.Vector3, THREE.Vector3][] = [
    // bottom
    [new THREE.Vector3(-halfW, 0, -halfD), new THREE.Vector3(halfW, 0, -halfD)],
    [new THREE.Vector3(halfW, 0, -halfD), new THREE.Vector3(halfW, 0, halfD)],
    [new THREE.Vector3(halfW, 0, halfD), new THREE.Vector3(-halfW, 0, halfD)],
    [new THREE.Vector3(-halfW, 0, halfD), new THREE.Vector3(-halfW, 0, -halfD)],
    // top
    [new THREE.Vector3(-halfW, H, -halfD), new THREE.Vector3(halfW, H, -halfD)],
    [new THREE.Vector3(halfW, H, -halfD), new THREE.Vector3(halfW, H, halfD)],
    [new THREE.Vector3(halfW, H, halfD), new THREE.Vector3(-halfW, H, halfD)],
    [new THREE.Vector3(-halfW, H, halfD), new THREE.Vector3(-halfW, H, -halfD)],
    // verticals
    [new THREE.Vector3(-halfW, 0, -halfD), new THREE.Vector3(-halfW, H, -halfD)],
    [new THREE.Vector3(halfW, 0, -halfD), new THREE.Vector3(halfW, H, -halfD)],
    [new THREE.Vector3(halfW, 0, halfD), new THREE.Vector3(halfW, H, halfD)],
    [new THREE.Vector3(-halfW, 0, halfD), new THREE.Vector3(-halfW, H, halfD)],
  ];

  return (
    <group>
      {edges.map((e, i) => {
        const dir = new THREE.Vector3().subVectors(e[1], e[0]);
        const len = dir.length();
        const mid = new THREE.Vector3().addVectors(e[0], e[1]).multiplyScalar(0.5);
        dir.normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        return (
          <mesh key={i} position={[mid.x, mid.y, mid.z]} quaternion={q}>
            <cylinderGeometry args={[0.015, 0.015, len, 4]} />
            <meshBasicMaterial color="#94a3b8" />
          </mesh>
        );
      })}
      {/* Semi-transparent walls */}
      {[
        { pos: [0, H / 2, -halfD] as [number, number, number], rot: [0, 0, 0] as [number, number, number], size: [W, H] as [number, number] },
        { pos: [0, H / 2, halfD] as [number, number, number], rot: [0, Math.PI, 0] as [number, number, number], size: [W, H] as [number, number] },
        { pos: [-halfW, H / 2, 0] as [number, number, number], rot: [0, Math.PI / 2, 0] as [number, number, number], size: [D, H] as [number, number] },
        { pos: [halfW, H / 2, 0] as [number, number, number], rot: [0, -Math.PI / 2, 0] as [number, number, number], size: [D, H] as [number, number] },
        { pos: [0, H, 0] as [number, number, number], rot: [-Math.PI / 2, 0, 0] as [number, number, number], size: [W, D] as [number, number] },
      ].map((wall, i) => (
        <mesh key={i} position={wall.pos} rotation={wall.rot}>
          <planeGeometry args={wall.size} />
          <meshBasicMaterial color="#1e3a5f" opacity={0.06} transparent side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* Floor */}
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#0f1e30" opacity={0.8} transparent />
      </mesh>
    </group>
  );
}

function PackedBoxMesh({
  p, C, selected, onHover, onClick,
}: {
  p: PlacedBox;
  C: ContainerConfig;
  selected: boolean;
  onHover: (b: PlacedBox | null) => void;
  onClick: (b: PlacedBox) => void;
}) {
  const W = C.W * S, D = C.D * S;
  const x = (p.x + p.w / 2) * S - W / 2;
  const y = (p.y + p.h / 2) * S;
  const z = (p.z + p.d / 2) * S - D / 2;
  const bw = p.w * S, bh = p.h * S, bd = p.d * S;

  return (
    <mesh
      position={[x, y, z]}
      onPointerOver={e => { e.stopPropagation(); onHover(p); }}
      onPointerOut={() => onHover(null)}
      onClick={e => { e.stopPropagation(); onClick(p); }}
    >
      <boxGeometry args={[bw, bh, bd]} />
      <meshStandardMaterial
        color={p.color}
        roughness={0.6}
        metalness={0.05}
        opacity={selected ? 1 : 0.88}
        transparent
      />
      <Edges color={selected ? '#ffffff' : '#00000055'} lineWidth={selected ? 2 : 0.5} />
    </mesh>
  );
}

export default function Viewer3D({
  container,
  placed,
  highlightId,
}: {
  container: ContainerConfig;
  placed: PlacedBox[];
  highlightId?: string | null;
}) {
  const [hovered, setHovered] = useState<PlacedBox | null>(null);
  const [clicked, setClicked] = useState<PlacedBox | null>(null);

  const H = container.H * S;
  const W = container.W * S;
  const D = container.D * S;

  const camDist = Math.max(W, D) * 1.6 + H;
  const camPos: [number, number, number] = [W * 0.7, H * 1.4, D * 0.9 + camDist * 0.3];

  const info = clicked || hovered;

  return (
    <Canvas
      camera={{ position: camPos, fov: 45, near: 0.01, far: 200 }}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#070d1f']} />
      <fog attach="fog" args={['#070d1f', 30, 80]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[8, 12, 6]} intensity={0.9} />
      <directionalLight position={[-6, 4, -8]} intensity={0.35} color="#a0c4ff" />

      <ContainerFrame C={container} />

      {placed.map((p, i) => (
        <PackedBoxMesh
          key={`${p.boxId}-${p.x}-${p.y}-${p.z}`}
          p={p}
          C={container}
          selected={p.boxId === highlightId || p === clicked}
          onHover={setHovered}
          onClick={b => setClicked(prev => prev === b ? null : b)}
        />
      ))}

      {info && (
        <Html
          position={[0, H + 0.6, 0]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <div className="bg-gray-900/95 border border-gray-600 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap shadow-xl">
            <div className="font-bold text-sm mb-1" style={{ color: info.color }}>{info.name}</div>
            <div className="text-gray-300">{info.w} × {info.h} × {info.d} cm</div>
            <div className="text-gray-400 mt-0.5">{info.weight} kg · #{info.idx + 1}</div>
            <div className="text-gray-500 text-xs mt-0.5">
              위치: ({info.x}, {info.y}, {info.z}) cm
            </div>
          </div>
        </Html>
      )}

      <Grid
        args={[Math.ceil(Math.max(W, D)) + 4, Math.ceil(Math.max(W, D)) + 4]}
        position={[0, -0.02, 0]}
        cellColor="#1a2a3a"
        sectionColor="#0f1e30"
        cellSize={1}
        sectionSize={5}
        fadeDistance={40}
      />

      <OrbitControls
        target={[0, H / 2, 0]}
        minDistance={0.5}
        maxDistance={50}
        enableDamping
        dampingFactor={0.07}
      />
    </Canvas>
  );
}
