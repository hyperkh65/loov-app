'use client';

import { useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Html, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { ContainerConfig, PlacedBox } from './page';

const S = 1 / 100;

// Container wireframe + walls
function ContainerFrame({ C, showDoor }: { C: ContainerConfig; showDoor?: boolean }) {
  const W = C.W * S, H = C.H * S, D = C.D * S;

  // Build 12 edge segments
  const pts: [number, number, number][] = [
    // bottom rect
    [-W/2,0,-D/2],[W/2,0,-D/2], [W/2,0,-D/2],[W/2,0,D/2],
    [W/2,0,D/2],[-W/2,0,D/2],  [-W/2,0,D/2],[-W/2,0,-D/2],
    // top rect
    [-W/2,H,-D/2],[W/2,H,-D/2],[W/2,H,-D/2],[W/2,H,D/2],
    [W/2,H,D/2],[-W/2,H,D/2],  [-W/2,H,D/2],[-W/2,H,-D/2],
    // verticals
    [-W/2,0,-D/2],[-W/2,H,-D/2],[W/2,0,-D/2],[W/2,H,-D/2],
    [W/2,0,D/2],[W/2,H,D/2],    [-W/2,0,D/2],[-W/2,H,D/2],
  ];

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const verts: number[] = [];
    for (const p of pts) verts.push(...p);
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    return g;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, D]);

  // floor striping (corrugated steel pattern)
  const stripes = useMemo(() => {
    const lines = [];
    const step = D / 12;
    for (let i = 0; i <= 12; i++) {
      const z = -D/2 + i * step;
      lines.push([[-W/2, 0.005, z], [W/2, 0.005, z]] as [[number,number,number],[number,number,number]]);
    }
    return lines;
  }, [W, D]);

  return (
    <group>
      {/* Frame edges */}
      <lineSegments geometry={geom}>
        <lineBasicMaterial color="#6b7280" />
      </lineSegments>

      {/* Door frame on Z=D/2 face */}
      {showDoor && (
        <group position={[0, H/2, D/2 + 0.01]}>
          <Line
            points={[[-W/2+0.04,H/2-0.04,0],[-W/2+0.04,-H/2+0.04,0],[W/2-0.04,-H/2+0.04,0],[W/2-0.04,H/2-0.04,0],[-W/2+0.04,H/2-0.04,0]]}
            color="#94a3b8" lineWidth={1.5}
          />
          <Line
            points={[[0,H/2-0.04,0],[0,-H/2+0.04,0]]}
            color="#94a3b8" lineWidth={1}
          />
        </group>
      )}

      {/* Transparent walls */}
      {[
        { pos: [0,H/2,-D/2] as [number,number,number], rot: [0,0,0] as [number,number,number], s: [W,H] as [number,number] },
        { pos: [-W/2,H/2,0] as [number,number,number], rot: [0,Math.PI/2,0] as [number,number,number], s: [D,H] as [number,number] },
        { pos: [W/2,H/2,0] as [number,number,number], rot: [0,-Math.PI/2,0] as [number,number,number], s: [D,H] as [number,number] },
        { pos: [0,H,0] as [number,number,number], rot: [-Math.PI/2,0,0] as [number,number,number], s: [W,D] as [number,number] },
      ].map((w, i) => (
        <mesh key={i} position={w.pos} rotation={w.rot}>
          <planeGeometry args={w.s} />
          <meshBasicMaterial color="#1e40af" opacity={0.04} transparent side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}

      {/* Floor */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI/2, 0, 0]}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#111827" roughness={0.9} />
      </mesh>

      {/* Floor stripes */}
      {stripes.map((s, i) => (
        <Line key={i} points={s} color="#1f2937" lineWidth={0.5} />
      ))}
    </group>
  );
}

// Individual box
function BoxMesh({
  p, C, showLabel, showSeq, highlighted, onHover, onClick,
}: {
  p: PlacedBox; C: ContainerConfig;
  showLabel: boolean; showSeq: boolean; highlighted: boolean;
  onHover: (b: PlacedBox | null) => void;
  onClick: (b: PlacedBox) => void;
}) {
  const W = C.W * S, D = C.D * S;
  const x = (p.x + p.w/2) * S - W/2;
  const y = (p.y + p.h/2) * S;
  const z = (p.z + p.d/2) * S - D/2;
  const bw = p.w*S, bh = p.h*S, bd = p.d*S;

  const fragileColor = p.fragile ? '#fef3c7' : p.color;
  const opacity = highlighted ? 1.0 : p.fragile ? 0.7 : 0.88;

  return (
    <group position={[x, y, z]}>
      <mesh
        onPointerOver={e => { e.stopPropagation(); onHover(p); }}
        onPointerOut={() => onHover(null)}
        onClick={e => { e.stopPropagation(); onClick(p); }}
      >
        <boxGeometry args={[bw, bh, bd]} />
        <meshStandardMaterial
          color={fragileColor}
          roughness={p.fragile ? 0.3 : 0.7}
          metalness={p.fragile ? 0.2 : 0.05}
          opacity={opacity}
          transparent
          emissive={highlighted ? fragileColor : '#000000'}
          emissiveIntensity={highlighted ? 0.15 : 0}
        />
        <Edges
          color={highlighted ? '#ffffff' : '#00000044'}
          lineWidth={highlighted ? 1.5 : 0.4}
        />
      </mesh>
      {/* Fragile indicator stripe */}
      {p.fragile && (
        <mesh position={[0, bh/2 - 0.005, 0]}>
          <planeGeometry args={[bw * 0.8, bd * 0.8]} />
          <meshBasicMaterial color="#fbbf24" opacity={0.3} transparent />
        </mesh>
      )}
      {/* Label */}
      {showLabel && bw > 0.2 && (
        <Text
          position={[0, bh/2 + 0.01, 0]}
          rotation={[-Math.PI/2, 0, 0]}
          fontSize={Math.min(bw, bd) * 0.18}
          color="#ffffff"
          anchorX="center"
          anchorY="bottom"
          maxWidth={bw * 0.9}
          textAlign="center"
          outlineWidth={0.005}
          outlineColor="#000000"
        >
          {p.name}
        </Text>
      )}
      {/* Sequence number */}
      {showSeq && (
        <Text
          position={[0, 0, bd/2 + 0.01]}
          fontSize={Math.min(bw, bh) * 0.3}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.01}
          outlineColor="#000000"
        >
          {String(p.idx + 1)}
        </Text>
      )}
    </group>
  );
}

// Center of gravity indicator
function COGIndicator({ cog, C }: { cog: { x: number; y: number; z: number } | null; C: ContainerConfig }) {
  if (!cog) return null;
  const W = C.W * S, H = C.H * S, D = C.D * S;
  const cx = cog.x * S - W/2;
  const cy = cog.y * S;
  const cz = cog.z * S - D/2;

  return (
    <group>
      {/* Vertical pillar */}
      <Line
        points={[[cx, 0, cz], [cx, H, cz]]}
        color="#f43f5e"
        lineWidth={1.5}
        dashed dashSize={0.1} dashScale={50} gapSize={0.05}
      />
      {/* COG sphere */}
      <mesh position={[cx, cy, cz]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial color="#f43f5e" emissive="#f43f5e" emissiveIntensity={0.5} />
      </mesh>
      {/* Shadow cross */}
      <Line points={[[cx-0.3,0.01,cz],[cx+0.3,0.01,cz]]} color="#f43f5e" lineWidth={1.5} />
      <Line points={[[cx,0.01,cz-0.3],[cx,0.01,cz+0.3]]} color="#f43f5e" lineWidth={1.5} />
    </group>
  );
}

export default function Viewer3D({
  container,
  placed,
  highlightId,
  showLabels,
  showSeq,
  showCOG,
  cog,
}: {
  container: ContainerConfig;
  placed: PlacedBox[];
  highlightId?: string | null;
  showLabels: boolean;
  showSeq: boolean;
  showCOG: boolean;
  cog: { x: number; y: number; z: number } | null;
}) {
  const [hovered, setHovered] = useState<PlacedBox | null>(null);
  const [clicked, setClicked] = useState<PlacedBox | null>(null);

  const H = container.H * S;
  const W = container.W * S;
  const D = container.D * S;

  const camPos: [number, number, number] = [W * 0.9 + 2, H * 1.8, D * 0.6 + 4];
  const info = clicked || hovered;

  return (
    <Canvas camera={{ position: camPos, fov: 42, near: 0.01, far: 300 }} style={{ width: '100%', height: '100%' }}>
      <color attach="background" args={['#080c18']} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[10, 15, 8]} intensity={0.9} />
      <directionalLight position={[-8, 6, -10]} intensity={0.35} color="#93c5fd" />
      <pointLight position={[0, H * 2, 0]} intensity={0.2} color="#e0f2fe" />

      <ContainerFrame C={container} showDoor />

      {placed.map((p, i) => (
        <BoxMesh
          key={`${p.boxId}-${p.x}-${p.y}-${p.z}`}
          p={p}
          C={container}
          showLabel={showLabels}
          showSeq={showSeq}
          highlighted={p.boxId === highlightId || p === clicked}
          onHover={setHovered}
          onClick={b => setClicked(prev => prev?.idx === b.idx ? null : b)}
        />
      ))}

      {showCOG && <COGIndicator cog={cog} C={container} />}

      {info && (
        <Html position={[0, H + 0.8, 0]} center style={{ pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(10,15,30,0.95)',
            border: '1px solid #334155',
            borderRadius: 10,
            padding: '10px 14px',
            color: '#f1f5f9',
            fontSize: 12,
            minWidth: 160,
            boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: info.color, marginBottom: 6 }}>{info.name}</div>
            <div style={{ color: '#94a3b8' }}>{info.w} × {info.h} × {info.d} cm</div>
            <div style={{ color: '#94a3b8' }}>{info.weight} kg</div>
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>적재순서 #{info.idx + 1}</div>
            <div style={{ color: '#64748b', fontSize: 11 }}>
              위치: ({info.x}, {info.y}, {info.z}) cm
            </div>
            {info.fragile && <div style={{ color: '#fbbf24', fontSize: 11, marginTop: 2 }}>⚠️ 취급주의</div>}
            {!info.stackable && <div style={{ color: '#f87171', fontSize: 11 }}>🚫 적재불가</div>}
          </div>
        </Html>
      )}

      <OrbitControls
        target={[0, H / 2, 0]}
        minDistance={0.5}
        maxDistance={60}
        enableDamping
        dampingFactor={0.06}
      />
    </Canvas>
  );
}
