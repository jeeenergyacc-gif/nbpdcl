import React, { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { PLANT_TYPE_ORDER, plantColor, TEXT_MUTED } from './theme';

export interface DonutChartDataItem {
  name: string;
  value: number;
}

interface DonutSliceProps {
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  depth: number;
  color: string;
}

const DonutSlice: React.FC<DonutSliceProps> = ({ startAngle, endAngle, innerRadius, outerRadius, depth, color }) => {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, outerRadius, startAngle, endAngle, false);
    shape.absarc(0, 0, innerRadius, endAngle, startAngle, true);
    return new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.07,
      bevelSegments: 6,
      curveSegments: 72,
    });
  }, [startAngle, endAngle, innerRadius, outerRadius, depth]);

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -depth / 2, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.32} metalness={0.2} />
    </mesh>
  );
};

interface SliceDatum extends DonutChartDataItem {
  startAngle: number;
  endAngle: number;
  renderStartAngle: number;
  renderEndAngle: number;
  color: string;
}

// Geometry constants — thicker wall, smaller hole, premium bevel (per reference).
const INNER_RADIUS = 1.85;
const OUTER_RADIUS = 3.95;
const DEPTH = 0.85;
const BASE_GAP = 0.03; // radians (~1.7°) — subtle, premium separation, never exaggerated
// Where the small-slice cluster's bisector should land after rotation: front-right
// quadrant (world x>0, world z>0 given this scene's camera position/orientation).
const TARGET_SMALL_CLUSTER_ANGLE = -Math.PI / 5;

function useSlices(data: DonutChartDataItem[]) {
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  // Fixed visual order (PLANT_TYPE_ORDER) — dataset is never reordered or resorted.
  const ordered = useMemo(
    () => PLANT_TYPE_ORDER.map((name) => data.find((d) => d.name === name)).filter(Boolean) as DonutChartDataItem[],
    [data]
  );

  const slices = useMemo<SliceDatum[]>(() => {
    if (total === 0) return [];
    let angle = Math.PI * 0.5; // start at top, sweep clockwise — unchanged from before
    return ordered.map((item, i) => {
      const sliceAngle = (item.value / total) * Math.PI * 2;
      const startAngle = angle - sliceAngle;
      const endAngle = angle;
      angle = startAngle;
      const isDominant = i === 0; // Thermal, first by the fixed order — stays continuous
      const gap = isDominant ? 0 : Math.min(BASE_GAP, sliceAngle * 0.3);
      return {
        ...item,
        startAngle,
        endAngle,
        renderStartAngle: startAngle + gap / 2,
        renderEndAngle: endAngle - gap / 2,
        color: plantColor(item.name),
      };
    });
  }, [ordered, total]);

  // Rotate the WHOLE assembly only (data/order/values untouched) so the dominant
  // slice's bisector sits in the back half and the small-slice cluster's bisector
  // sits in the front-right quadrant. Computed from the actual live values, so it
  // stays correct even if the underlying proportions shift over time.
  const rotationOffsetY = useMemo(() => {
    if (!slices.length) return 0;
    const dominant = slices[0];
    const smallClusterStart = dominant.startAngle;
    const smallClusterEnd = Math.PI * 0.5 - Math.PI * 2; // the sweep always closes a full circle
    const centroid = (smallClusterStart + smallClusterEnd) / 2;
    return TARGET_SMALL_CLUSTER_ANGLE - centroid;
  }, [slices]);

  return { total, ordered, slices, rotationOffsetY };
}

// Reports the true projected screen-space anchor (in canvas-relative pixels) for
// each non-dominant slice's outer-edge bisector, so the HTML leader lines connect
// to where the slice actually renders — not an approximated position.
function ProjectionReporter({
  slices, rotationOffsetY, onProject,
}: { slices: SliceDatum[]; rotationOffsetY: number; onProject: (pts: Record<string, { x: number; y: number }>) => void }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const pts: Record<string, { x: number; y: number }> = {};
    const toScreen = (v: THREE.Vector3) => ({
      x: (v.x * 0.5 + 0.5) * size.width,
      y: (1 - (v.y * 0.5 + 0.5)) * size.height,
    });
    slices.forEach((s) => {
      if (s.name === 'Thermal') return;
      const mid = (s.startAngle + s.endAngle) / 2 + rotationOffsetY;
      const wx = OUTER_RADIUS * Math.cos(mid);
      const wz = -OUTER_RADIUS * Math.sin(mid);
      pts[s.name] = toScreen(new THREE.Vector3(wx, 0, wz).project(camera));
    });
    // True on-screen centre of the ring hole (world origin of the lifted group),
    // so the centre label tracks the geometry instead of a hardcoded %/px offset.
    pts.__center__ = toScreen(new THREE.Vector3(0, 1.1, 0).project(camera));
    onProject(pts);
  }, [slices, rotationOffsetY, camera, size, onProject]);
  return null;
}

function Scene({ slices, rotationOffsetY, total }: { slices: SliceDatum[]; rotationOffsetY: number; total: number }) {
  const dominant = slices.find((s) => s.name === 'Thermal');
  const midRadius = (INNER_RADIUS + OUTER_RADIUS) / 2;

  return (
    // lifted a touch: the lower rim and its shadow were clipping the card edge
    <group rotation={[0, rotationOffsetY, 0]} position={[0, 1.1, 0]}>
      <ambientLight intensity={1.45} />
      {/* key light — top/front, soft highlight + defined bevel */}
      <directionalLight position={[3, 10, 6]} intensity={2.2} castShadow />
      {/* fill light — opposite side, keeps shadows soft, not flat */}
      <directionalLight position={[-6, 3, 4]} intensity={0.5} />
      {/* warm rim light aimed at the (now back) Thermal mass — same base color,
          just a premium glow accent, per the brief */}
      <pointLight position={[-4, 3, -6]} intensity={0.55} color="#FF8A50" />

      {slices.map((slice) => (
        <DonutSlice
          key={slice.name}
          startAngle={slice.renderStartAngle}
          endAngle={slice.renderEndAngle}
          innerRadius={INNER_RADIUS}
          outerRadius={OUTER_RADIUS}
          depth={DEPTH}
          color={slice.color}
        />
      ))}

      {dominant && (
        <Html
          position={[
            midRadius * Math.cos((dominant.startAngle + dominant.endAngle) / 2),
            DEPTH / 2 + 0.06,
            -midRadius * Math.sin((dominant.startAngle + dominant.endAngle) / 2),
          ]}
          center
          occlude={false}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{ textAlign: 'center', fontFamily: "'Inter', system-ui, sans-serif", textShadow: '0 2px 8px rgba(0,0,0,0.6)', whiteSpace: 'nowrap' }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>{dominant.name}</div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 20, marginTop: 1 }}>
              {dominant.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.88)', fontWeight: 700, fontSize: 12, marginTop: 1 }}>
              ({total ? ((dominant.value / total) * 100).toFixed(1) : '0.0'}%)
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

interface DonutChart3DFixedProps {
  data: DonutChartDataItem[];
}

function DonutChart3DFixed({ data }: DonutChart3DFixedProps) {
  const { total, ordered, slices, rotationOffsetY } = useSlices(data);
  const calloutItems = useMemo(() => ordered.filter((item) => item.name !== 'Thermal'), [ordered]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [anchors, setAnchors] = useState<Record<string, { x: number; y: number }>>({});

  const handleProject = useCallback((pts: Record<string, { x: number; y: number }>) => setAnchors(pts), []);
  const calloutKey = calloutItems.map((i) => i.name).join(',');

  if (!data.length) {
    return <div className="flex items-center justify-center h-full text-sm" style={{ color: TEXT_MUTED }}>No data available</div>;
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 360, position: 'relative', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* 3D ring fills the whole card — labels float over it, next to their slices */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <Suspense fallback={<div className="flex items-center justify-center h-full text-sm" style={{ color: TEXT_MUTED }}>Loading 3D chart…</div>}>
          <Canvas camera={{ position: [0, 5.9, 9.6], fov: 36 }} gl={{ antialias: true, logarithmicDepthBuffer: true }} shadows>
            <Scene slices={slices} rotationOffsetY={rotationOffsetY} total={total} />
            <ProjectionReporter slices={slices} rotationOffsetY={rotationOffsetY} onProject={handleProject} />
          </Canvas>
        </Suspense>

        {/* Centred total — anchored to the ring's TRUE projected hole centre.
            No hardcoded %/px offset: the label follows the geometry, so it stays
            perfectly centred at any card size, radius or DPI (FHD → 4K). Title,
            value and unit form one vertically-stacked block, equal padding all
            round via the translate(-50%,-50%). */}
        {(() => {
          const c = anchors.__center__;
          const positioned = c
            ? { left: c.x, top: c.y, transform: 'translate(-50%, -50%)' }
            : { left: '50%', top: '44%', transform: 'translate(-50%, -50%)' };
          return (
            <div
              style={{
                position: 'absolute', ...positioned,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                textAlign: 'center', pointerEvents: 'none', whiteSpace: 'nowrap',
              }}
            >
              <div style={{ color: '#EAF2FF', fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>Total Purchase</div>
              <div style={{ color: '#F2B33D', fontSize: 22, fontWeight: 800, lineHeight: 1.2, marginTop: 2 }}>
                {total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
              <div style={{ color: TEXT_MUTED, fontSize: 11, fontWeight: 600, marginTop: 2 }}>MU</div>
            </div>
          );
        })()}

        {/* Label chips positioned next to their slice edge, with vertical
            collision avoidance so small adjacent slices (Solar/Wind/Sugar/Hydro)
            never overlap. Chips on the same side are pushed apart to a minimum
            row spacing while keeping a short leader line back to the slice. */}
        {(() => {
          const w = containerRef.current?.clientWidth ?? 300;
          const h = containerRef.current?.clientHeight ?? 360;
          const CHIP_H = 36;   // min vertical gap between stacked chips
          const STUB = 14;     // short horizontal segment leaving the slice edge
          const TAIL = 14;     // short horizontal segment entering the chip
          const MARGIN = 12;   // keep the whole label block inside the card

          // Split callouts by side (small slices cluster front-right after rotation).
          const sides: Record<'l' | 'r', { item: typeof calloutItems[number]; ax: number; ay: number; y: number }[]> = { l: [], r: [] };
          calloutItems.forEach((item) => {
            const a = anchors[item.name];
            if (!a) return;
            (a.x >= w / 2 ? sides.r : sides.l).push({ item, ax: a.x, ay: a.y, y: a.y });
          });

          // Per-side: one common chip column (consistent leader length + neat
          // vertical stack) and collision-free rows clamped inside the card.
          const columnFor: Record<'l' | 'r', number> = { l: 0, r: 0 };
          (['l', 'r'] as const).forEach((s) => {
            const list = sides[s];
            if (!list.length) return;
            const right = s === 'r';
            const edge = right ? Math.max(...list.map((p) => p.ax)) : Math.min(...list.map((p) => p.ax));
            columnFor[s] = right
              ? Math.min(w - MARGIN, edge + 40)
              : Math.max(MARGIN, edge - 40);

            // Stack downward from the topmost anchor, then shift the whole stack
            // up if it would overflow the bottom edge — never clips a chip.
            list.sort((p, q) => p.ay - q.ay);
            for (let i = 0; i < list.length; i++) {
              list[i].y = i === 0 ? list[i].ay : Math.max(list[i].ay, list[i - 1].y + CHIP_H);
            }
            const overflow = list.length ? list[list.length - 1].y + CHIP_H / 2 - (h - MARGIN) : 0;
            if (overflow > 0) list.forEach((p) => { p.y -= overflow; });
            list.forEach((p) => { p.y = Math.max(MARGIN + CHIP_H / 2, p.y); });
          });

          return (['l', 'r'] as const).flatMap((s) => {
            const right = s === 'r';
            const dir = right ? 1 : -1;
            const columnX = columnFor[s];
            return sides[s].map(({ item, ax, ay, y }) => {
              const pct = total ? (item.value / total) * 100 : 0;
              const color = plantColor(item.name);
              // Single continuous polyline: slice edge → short stub → elbow at the
              // column → short tail into the chip. No floating/disconnected parts.
              const p1x = ax + dir * STUB;
              const elbowX = columnX - dir * TAIL;
              const d = `M ${ax} ${ay} L ${p1x} ${ay} L ${elbowX} ${y} L ${columnX} ${y}`;
              return (
                <div key={item.name}>
                  <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                    <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.75} />
                    <circle cx={ax} cy={ay} r={2.6} fill={color} />
                  </svg>
                  <div
                    style={{
                      position: 'absolute', left: columnX, top: y,
                      transform: `translate(${right ? '0' : '-100%'}, -50%)`,
                      display: 'flex', alignItems: 'center', gap: 6,
                      pointerEvents: 'none', whiteSpace: 'nowrap',
                      background: 'rgba(8,22,45,0.82)', borderRadius: 7,
                      padding: '3px 7px', border: `1px solid ${color}55`,
                    }}
                  >
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0 }} />
                    <div>
                      <div style={{ color, fontWeight: 700, fontSize: 11, lineHeight: 1.1 }}>{item.name}</div>
                      <div style={{ color: '#E8EEFB', fontWeight: 700, fontSize: 11.5 }}>
                        {item.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        <span style={{ color: TEXT_MUTED, fontWeight: 500, fontSize: 10, marginLeft: 3 }}>({pct.toFixed(1)}%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            });
          });
        })()}
      </div>
    </div>
  );
}

export default React.memo(DonutChart3DFixed);
