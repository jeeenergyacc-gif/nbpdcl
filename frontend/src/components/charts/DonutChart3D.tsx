import React, { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Data contract
// ---------------------------------------------------------------------------
export interface DonutChartDataItem {
  name: string;
  value: number;
  color: string;
}

interface DonutSliceProps {
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  depth: number;
  color: string;
}

// ---------------------------------------------------------------------------
// 3D Slice — ExtrudeGeometry with smooth bevels (kept from uploaded source)
// ---------------------------------------------------------------------------
const DonutSlice: React.FC<DonutSliceProps> = ({
  startAngle,
  endAngle,
  innerRadius,
  outerRadius,
  depth,
  color,
}) => {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, outerRadius, startAngle, endAngle, false);
    shape.absarc(0, 0, innerRadius, endAngle, startAngle, true);

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.12,
      bevelSize: 0.06,
      bevelSegments: 8,
      curveSegments: 64,
    };

    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
  }, [startAngle, endAngle, innerRadius, outerRadius, depth]);

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -depth / 2, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.25} metalness={0.15} />
    </mesh>
  );
};

function Scene({ data }: { data: DonutChartDataItem[] }) {
  const totalValue = useMemo(() => data.reduce((sum, item) => sum + item.value, 0), [data]);

  // Pixel-to-pixel geometry tuning carried over from the reference implementation.
  const innerRadius = 2.0;
  const outerRadius = 5.2;
  const thickness = 1.6;

  const slices = useMemo(() => {
    if (totalValue === 0) return [];

    // Sort largest-first so the "hero" slice anchors the front of the donut,
    // matching the reference design's Thermal-forward composition.
    const sorted = [...data].sort((a, b) => b.value - a.value);
    let currentAngle = -Math.PI * 0.65;

    return sorted.map((item, idx) => {
      const sliceAngle = (item.value / totalValue) * Math.PI * 2;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      const sampleAngle = startAngle + sliceAngle / 2;
      const percentage = (item.value / totalValue) * 100;

      // Small slices get pushed further out so labels never collide —
      // generic replacement for the reference's per-name hardcoded offsets.
      let labelRadius = outerRadius + 1.2;
      if (percentage < 30) {
        labelRadius += Math.max(0, 4 - idx) * 0.7;
      }

      const lx = Math.cos(sampleAngle) * labelRadius;
      const lz = -Math.sin(sampleAngle) * labelRadius;

      currentAngle += sliceAngle;

      return { ...item, percentage, startAngle, endAngle, lx, lz, isHero: idx === 0 };
    });
  }, [data, totalValue]);

  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 15, 5]} intensity={2.5} castShadow />
      <pointLight position={[-10, 5, -5]} intensity={0.6} />

      {slices.map((slice, index) => {
        const labelPosition: [number, number, number] = slice.isHero
          ? [-0.2, thickness / 2 + 0.1, 2.2]
          : [slice.lx, thickness / 4, slice.lz];

        return (
          <group key={`${slice.name}-${index}`}>
            <DonutSlice
              startAngle={slice.startAngle}
              endAngle={slice.endAngle}
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              depth={thickness}
              color={slice.color}
            />
            <Html position={labelPosition} center distanceFactor={12}>
              <div
                style={{
                  color: '#111111',
                  fontSize: slice.isHero ? '20px' : '13px',
                  fontWeight: 600,
                  lineHeight: 1.3,
                  textAlign: slice.isHero ? 'center' : 'left',
                  whiteSpace: 'nowrap',
                  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                  pointerEvents: 'none',
                  padding: '6px',
                  textShadow: slice.isHero ? 'none' : '1px 1px 2px rgba(255,255,255,0.85)',
                }}
              >
                <div style={{ color: slice.isHero ? '#ffffff' : slice.color, fontWeight: 700, marginBottom: 2 }}>
                  {slice.name}
                </div>
                <div style={{ color: slice.isHero ? '#ffffff' : '#222222', fontWeight: slice.isHero ? 900 : 700, fontSize: slice.isHero ? '22px' : '14px' }}>
                  {slice.value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: slice.isHero ? '14px' : '11px', opacity: 0.8, color: slice.isHero ? '#ffffff' : '#555555' }}>
                  ({slice.percentage.toFixed(1)}%)
                </div>
              </div>
            </Html>
          </group>
        );
      })}

      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={4}
        maxDistance={15}
      />
    </>
  );
}

interface DonutChart3DProps {
  data: DonutChartDataItem[];
}

function DonutChart3D({ data }: DonutChart3DProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-textsecondary">
        No data available
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 320 }}>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full text-sm text-textsecondary">
            Loading 3D chart…
          </div>
        }
      >
        <Canvas camera={{ position: [0, 6.5, 8.0], fov: 42 }} gl={{ antialias: true, logarithmicDepthBuffer: true }} shadows>
          <Scene data={data} />
        </Canvas>
      </Suspense>
    </div>
  );
}

export default React.memo(DonutChart3D);
