"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { CameraControls, Text } from "@react-three/drei";
import {
  Component,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import type CameraControlsImpl from "camera-controls";
import * as THREE from "three";
import {
  getDoorGaps,
  getRackLayout,
  getSmallShelfLayout,
  locationCode,
  ROOM,
  type RackBox,
  type SmallShelfBox,
} from "@/lib/locations";
import type { AppState, FloorArea } from "@/lib/types";
import {
  rackFill,
  rackFullyOccupiedByUnit,
  slotFillAmount,
  slotOccupancy,
  type RackFill,
} from "@/lib/demo-store";
import {
  makeBrickTexture,
  makeCardboardTexture,
  makeConcreteTexture,
  makeWoodTexture,
} from "@/lib/warehouse-textures";
import {
  footprintPulseMatches,
  resolveLocationMapFocus,
  resolveUnitMapFocus,
  type FootprintPulse,
  type MapFocus,
} from "@/lib/map-focus";

export type PickInfo = {
  code: string;
  kind: "pallet" | "small_shelf" | "floor" | "rack";
  rack?: number;
  level?: number;
  side?: "K" | "D";
  /** Pusė vietos ant K/D sijos */
  slotHalf?: "L" | "R";
  /** Preferuojamas plotas: full / half (iš click) */
  slotSpan?: "full" | "half";
  label?: string;
};

export type ViewPreset =
  | "overview"
  | "entrance"
  | "exit"
  | "top"
  | "expo"
  | "diled"
  | "tunnel1516"
  | "tunnel1617";

export type FloorDraft = {
  x: number;
  z: number;
  w: number;
  d: number;
};

export type ShelfDraft = {
  rack?: number;
  level: number;
  /** Smulkioms lentynoms (15/16 A·B, 6/7) */
  locationCode?: string;
  offsetX: number;
  offsetZ: number;
  w: number;
  d: number;
};

type ShelfPointerDownOpts = {
  rack?: number;
  level: number;
  locationCode?: string;
  localX: number;
  localZ: number;
  maxW: number;
  maxD: number;
  rackLx: number;
  rackLz: number;
  deckY: number;
  clientX: number;
  clientY: number;
};

const SHELF_TAP_PX = 14;
const SHELF_MIN_DRAW_M = 0.35;

const CX = ROOM.length / 2;
const CZ = ROOM.width / 2;
const WALL_H = 4.2;
/** Beveik visas bay gylis (~1.5 m) ir plotis — galima žymėti iki krašto */
const DECK_W_FRAC = 0.98;
const DECK_D_FRAC = 0.98;

const PRESETS: Record<
  ViewPreset,
  { position: [number, number, number]; target: [number, number, number] }
> = {
  // All viewpoints INSIDE the room (±15 x, ±5.5 z) — not outside walls
  overview: { position: [0, 3.4, 1.8], target: [0, 1.1, -1.5] },
  entrance: { position: [0, 2.1, 4.2], target: [0, 1.3, 0.5] },
  exit: { position: [0, 2.1, -4.2], target: [0, 1.3, -0.5] },
  top: { position: [0.05, 9.5, 0.05], target: [0, 0, 0] },
  expo: { position: [-5.5, 2.4, 1.2], target: [-3.5, 1.2, -1.5] },
  diled: { position: [5.5, 2.4, 1.2], target: [3.5, 1.2, -1.5] },
  // Įėjimas į 15↔16 tunelį (prie A/B lentynų)
  tunnel1516: { position: [12.6, 1.7, -2.4], target: [14.0, 1.2, 0.3] },
  // Smulkūs 16↔17 viduje (įėjimo dešinė)
  tunnel1617: { position: [0.5, 1.55, 5.2], target: [2.5, 0.55, 9.8] },
};

const COLORS = {
  free: "#4a9e68",
  occupied: "#c43c3c",
  partialBadge: "#e0a800",
  emptyBadge: "#3d9a5f",
  fullBadge: "#c43c3c",
  upright: "#1a4a8a",
  uprightDark: "#143668",
  beam: "#f0c014",
  beamDark: "#d4a00c",
  deck: "#8a7355",
  floorMark: "#3b82f6",
  floorGoods: "#b45309",
  cardboard: "#c4a06a",
  cardboardDark: "#a8844e",
  pallet: "#b8956a",
  palletDark: "#8a6b45",
  brace: "#2a5a9a",
  shelfMetal: "#8a9099",
  footGuard: "#f0d000",
  doorWood: "#5c4030",
  wrapBlack: "#1a1a1a",
  wrapClear: "#d8e8f0",
};

function FocusPulse({ w, d, y = 0.05 }: { w: number; d: number; y?: number }) {
  return (
    <mesh position={[0, y, 0]}>
      <boxGeometry args={[w + 0.16, 0.06, d + 0.16]} />
      <meshBasicMaterial
        color="#f59e0b"
        transparent
        opacity={0.88}
        depthWrite={false}
      />
    </mesh>
  );
}

class CanvasErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center bg-stone-200 p-6 text-center text-sm text-stone-700">
          3D nepavyko paleisti. Perkrauk puslapį.
        </div>
      );
    }
    return this.props.children;
  }
}

function toLocal(x: number, z: number): [number, number] {
  return [x - CX, z - CZ];
}

function fromLocal(lx: number, lz: number): [number, number] {
  return [lx + CX, lz + CZ];
}

function useWarehouseMaps() {
  return useMemo(() => {
    const brickTan = new THREE.CanvasTexture(makeBrickTexture({ base: "#c4b09a" }));
    const brickRed = new THREE.CanvasTexture(
      makeBrickTexture({ base: "#b07a68", mortar: "#8a7a72" }),
    );
    const concrete = new THREE.CanvasTexture(makeConcreteTexture());
    const wood = new THREE.CanvasTexture(makeWoodTexture());
    const cardboard = new THREE.CanvasTexture(makeCardboardTexture());
    for (const t of [brickTan, brickRed, concrete, wood, cardboard]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
    }
    brickTan.repeat.set(8, 3);
    brickRed.repeat.set(3, 3);
    concrete.repeat.set(6, 3);
    wood.repeat.set(4, 1);
    cardboard.repeat.set(1, 1);
    return { brickTan, brickRed, concrete, wood, cardboard };
  }, []);
}

function ShelfDragCapture({
  active,
  rackLx,
  rackLz,
  deckY,
  onDrag,
  onEnd,
}: {
  active: boolean;
  rackLx: number;
  rackLz: number;
  deckY: number;
  onDrag: (localX: number, localZ: number) => void;
  onEnd: (localX: number, localZ: number, clientX: number, clientY: number) => void;
}) {
  const { camera, gl } = useThree();
  const last = useRef({ x: 0, z: 0 });
  const onDragRef = useRef(onDrag);
  const onEndRef = useRef(onEnd);
  onDragRef.current = onDrag;
  onEndRef.current = onEnd;

  useEffect(() => {
    if (!active) return;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -deckY);
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();

    function project(clientX: number, clientY: number) {
      const rect = gl.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(plane, hit)) return null;
      return { x: hit.x - rackLx, z: hit.z - rackLz };
    }

    function onMove(e: PointerEvent) {
      const p = project(e.clientX, e.clientY);
      if (!p) return;
      last.current = p;
      onDragRef.current(p.x, p.z);
    }
    function onUp(e: PointerEvent) {
      const p = project(e.clientX, e.clientY) ?? last.current;
      onEndRef.current(p.x, p.z, e.clientX, e.clientY);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [active, camera, gl, rackLx, rackLz, deckY]);

  return null;
}

type Maps = ReturnType<typeof useWarehouseMaps>;

/** Kai žymim grindis — stelažai neperima pelės */
function useSkipRaycastWhen(active: boolean) {
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const restored: { mesh: THREE.Mesh; fn: typeof THREE.Mesh.prototype.raycast }[] =
      [];
    if (active) {
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        restored.push({ mesh, fn: mesh.raycast });
        mesh.raycast = () => {};
      });
    }
    return () => {
      for (const { mesh, fn } of restored) mesh.raycast = fn;
    };
  }, [active]);
  return ref;
}

function Floor({
  markMode,
  draftStart,
  draftCurrent,
  onFloorPointer,
  maps,
}: {
  markMode: boolean;
  draftStart: [number, number] | null;
  draftCurrent: [number, number] | null;
  onFloorPointer: (
    worldX: number,
    worldZ: number,
    kind: "down" | "move" | "up",
  ) => void;
  maps: Maps;
}) {
  const { camera, gl } = useThree();
  const drawing = useRef(false);
  const onFloorRef = useRef(onFloorPointer);
  onFloorRef.current = onFloorPointer;

  useEffect(() => {
    if (!markMode) {
      drawing.current = false;
      document.body.style.cursor = "default";
      return;
    }

    const el = gl.domElement;
    document.body.style.cursor = "crosshair";

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();
    let lastPt: [number, number] | null = null;

    function project(clientX: number, clientY: number): [number, number] | null {
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return null;
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(plane, hit)) return null;
      return fromLocal(hit.x, hit.z);
    }

    function onDown(e: PointerEvent) {
      if (e.button !== 0) return;
      const t = e.target as Node | null;
      if (t !== el && !el.contains(t)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const p = project(e.clientX, e.clientY);
      if (!p) return;
      drawing.current = true;
      lastPt = p;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      onFloorRef.current(p[0], p[1], "down");
    }

    function onMove(e: PointerEvent) {
      if (!drawing.current) return;
      e.preventDefault();
      const p = project(e.clientX, e.clientY);
      if (!p) return;
      lastPt = p;
      onFloorRef.current(p[0], p[1], "move");
    }

    function onUp(e: PointerEvent) {
      if (!drawing.current) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      drawing.current = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const p = project(e.clientX, e.clientY) ?? lastPt;
      if (p) onFloorRef.current(p[0], p[1], "up");
      lastPt = null;
    }

    // Ant window capture — anksčiau už CameraControls / R3F
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);

    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      drawing.current = false;
      document.body.style.cursor = "default";
    };
  }, [markMode, camera, gl]);

  let preview: FloorDraft | null = null;
  if (draftStart && draftCurrent) {
    const x0 = Math.min(draftStart[0], draftCurrent[0]);
    const z0 = Math.min(draftStart[1], draftCurrent[1]);
    const x1 = Math.max(draftStart[0], draftCurrent[0]);
    const z1 = Math.max(draftStart[1], draftCurrent[1]);
    preview = {
      x: (x0 + x1) / 2,
      z: (z0 + z1) / 2,
      w: Math.max(0.4, x1 - x0),
      d: Math.max(0.4, z1 - z0),
    };
  }

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#cfd3d8" roughness={1} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[ROOM.length + 0.4, ROOM.width + 0.4]} />
        <meshStandardMaterial map={maps.concrete} roughness={0.95} metalness={0} />
      </mesh>
      {markMode && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <planeGeometry args={[ROOM.length + 0.4, ROOM.width + 0.4]} />
          <meshBasicMaterial
            color="#3b82f6"
            transparent
            opacity={0.08}
            depthWrite={false}
          />
        </mesh>
      )}
      {preview && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[
            toLocal(preview.x, preview.z)[0],
            0.04,
            toLocal(preview.x, preview.z)[1],
          ]}
        >
          <planeGeometry args={[preview.w, preview.d]} />
          <meshStandardMaterial
            color={COLORS.floorMark}
            transparent
            opacity={0.5}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

function WindowWithBars({
  position,
  rotation = [0, 0, 0],
  w = 1.1,
  h = 0.85,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  w?: number;
  h?: number;
}) {
  const barsX = [-0.35, -0.12, 0.12, 0.35].map((f) => f * w);
  const barsY = [-0.28, 0, 0.28].map((f) => f * h);
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          color="#8ab4c8"
          emissive="#3a5060"
          emissiveIntensity={0.15}
          roughness={0.3}
          metalness={0.1}
          transparent
          opacity={0.55}
        />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <boxGeometry args={[w + 0.08, h + 0.08, 0.04]} />
        <meshStandardMaterial color="#3a3530" roughness={0.8} />
      </mesh>
      {barsX.map((x, i) => (
        <mesh key={`vx${i}`} position={[x, 0, 0.03]}>
          <boxGeometry args={[0.03, h * 0.92, 0.03]} />
          <meshStandardMaterial color="#2a2826" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {barsY.map((y, i) => (
        <mesh key={`hy${i}`} position={[0, y, 0.03]}>
          <boxGeometry args={[w * 0.92, 0.03, 0.03]} />
          <meshStandardMaterial color="#2a2826" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function WoodenDoor({
  doorX,
  z,
  width,
}: {
  doorX: number;
  z: number;
  width: number;
}) {
  const leaf = width / 2 - 0.04;
  return (
    <group position={[doorX, 0, z]}>
      {/* frame */}
      <mesh position={[-width / 2, WALL_H / 2, 0]}>
        <boxGeometry args={[0.12, WALL_H, 0.22]} />
        <meshStandardMaterial color="#4a4038" roughness={0.85} />
      </mesh>
      <mesh position={[width / 2, WALL_H / 2, 0]}>
        <boxGeometry args={[0.12, WALL_H, 0.22]} />
        <meshStandardMaterial color="#4a4038" roughness={0.85} />
      </mesh>
      <mesh position={[0, 2.55, 0]}>
        <boxGeometry args={[width, 0.14, 0.22]} />
        <meshStandardMaterial color="#4a4038" roughness={0.85} />
      </mesh>
      {/* leaves (slightly open) */}
      <mesh position={[-leaf / 2 - 0.05, 1.25, 0.05]} rotation={[0, 0.15, 0]} castShadow>
        <boxGeometry args={[leaf, 2.45, 0.08]} />
        <meshStandardMaterial color={COLORS.doorWood} roughness={0.9} />
      </mesh>
      <mesh position={[leaf / 2 + 0.05, 1.25, 0.08]} rotation={[0, -0.35, 0]} castShadow>
        <boxGeometry args={[leaf, 2.45, 0.08]} />
        <meshStandardMaterial color={COLORS.doorWood} roughness={0.9} />
      </mesh>
      {/* diagonal brace hint */}
      <mesh position={[-leaf / 2 - 0.05, 1.25, 0.1]} rotation={[0, 0.15, 0.5]}>
        <boxGeometry args={[0.04, leaf * 0.9, 0.02]} />
        <meshStandardMaterial color="#3a3028" />
      </mesh>
    </group>
  );
}

function Ceiling({ maps }: { maps: Maps }) {
  const y = WALL_H - 0.05;
  const beams: number[] = [];
  for (let x = -CX + 2; x < CX; x += 3.2) beams.push(x);
  return (
    <group>
      <mesh position={[0, y + 0.08, 0]} receiveShadow>
        <boxGeometry args={[ROOM.length + 0.6, 0.12, ROOM.width + 0.6]} />
        <meshStandardMaterial map={maps.wood} roughness={0.95} />
      </mesh>
      {beams.map((x, i) => (
        <mesh key={i} position={[x, y - 0.12, 0]} castShadow>
          <boxGeometry args={[0.22, 0.28, ROOM.width + 0.2]} />
          <meshStandardMaterial color="#6b5340" roughness={0.92} />
        </mesh>
      ))}
      {/* fluorescent strips */}
      {[-3.5, 0, 3.5].map((z, i) => (
        <group key={i} position={[0, y - 0.35, z]}>
          <mesh>
            <boxGeometry args={[ROOM.length * 0.7, 0.06, 0.18]} />
            <meshStandardMaterial color="#e8e6dc" emissive="#f5f2e8" emissiveIntensity={0.65} />
          </mesh>
          <pointLight intensity={0.35} distance={14} decay={2} color="#fff8e8" />
        </group>
      ))}
    </group>
  );
}

function Walls({ doors, maps }: { doors: ReturnType<typeof getDoorGaps>; maps: Maps }) {
  const h = WALL_H;
  const t = 0.2;
  const exit = doors.find((d) => d.id === "exit")!;
  const entrance = doors.find((d) => d.id === "entrance")!;

  function longWall(
    zWorld: number,
    door: { x: number; width: number },
    key: string,
    brick: THREE.Texture,
  ) {
    const [doorX] = toLocal(door.x, 0);
    const z = zWorld - CZ;
    const halfL = ROOM.length / 2;
    const leftEnd = doorX - door.width / 2;
    const rightStart = doorX + door.width / 2;
    const leftW = leftEnd + halfL;
    const rightW = halfL - rightStart;
    const leftCenter = -halfL + leftW / 2;
    const rightCenter = rightStart + rightW / 2;
    const inward = zWorld < ROOM.width / 2 ? 1 : -1;

    return (
      <group key={key}>
        {leftW > 0.1 && (
          <mesh position={[leftCenter, h / 2, z]} receiveShadow>
            <boxGeometry args={[leftW, h, t]} />
            <meshStandardMaterial map={brick} roughness={0.92} />
          </mesh>
        )}
        {rightW > 0.1 && (
          <mesh position={[rightCenter, h / 2, z]} receiveShadow>
            <boxGeometry args={[rightW, h, t]} />
            <meshStandardMaterial map={brick} roughness={0.92} />
          </mesh>
        )}
        <WoodenDoor doorX={doorX} z={z} width={door.width} />
        {/* windows on long walls */}
        {leftW > 4 && (
          <WindowWithBars
            position={[leftCenter - leftW * 0.2, 2.6, z + inward * (t / 2 + 0.02)]}
            rotation={[0, zWorld < 1 ? 0 : Math.PI, 0]}
          />
        )}
        {rightW > 4 && (
          <WindowWithBars
            position={[rightCenter + rightW * 0.15, 2.6, z + inward * (t / 2 + 0.02)]}
            rotation={[0, zWorld < 1 ? 0 : Math.PI, 0]}
          />
        )}
      </group>
    );
  }

  return (
    <group>
      {longWall(0, exit, "exit", maps.brickTan)}
      {longWall(ROOM.width, entrance, "entrance", maps.brickTan)}
      {/* short walls: EXPO left tan, DILED right redder */}
      <mesh position={[-CX - t / 2, h / 2, 0]} receiveShadow>
        <boxGeometry args={[t, h, ROOM.width]} />
        <meshStandardMaterial map={maps.brickTan} roughness={0.92} />
      </mesh>
      <mesh position={[CX + t / 2, h / 2, 0]} receiveShadow>
        <boxGeometry args={[t, h, ROOM.width]} />
        <meshStandardMaterial map={maps.brickRed} roughness={0.92} />
      </mesh>
      <WindowWithBars position={[-CX + 0.12, 2.7, -1.5]} rotation={[0, Math.PI / 2, 0]} w={0.9} h={0.7} />
      <WindowWithBars position={[-CX + 0.12, 2.7, 2.2]} rotation={[0, Math.PI / 2, 0]} w={0.9} h={0.7} />
      <WindowWithBars position={[CX - 0.12, 2.7, 0]} rotation={[0, -Math.PI / 2, 0]} w={1.0} h={0.75} />
      <Ceiling maps={maps} />
    </group>
  );
}

function FloorAreas({
  areas,
  selectedCode,
  onSelect,
  markMode,
  maps,
  focusPulse,
}: {
  areas: FloorArea[];
  selectedCode: string | null;
  onSelect: (info: PickInfo) => void;
  markMode: boolean;
  maps: Maps;
  focusPulse?: FootprintPulse | null;
}) {
  const skipRef = useSkipRaycastWhen(markMode);
  return (
    <group ref={skipRef}>
      {areas.map((a) => {
        const [lx, lz] = toLocal(a.x, a.z);
        const selected = selectedCode === a.id;
        const focused =
          selected &&
          focusPulse &&
          !focusPulse.rack &&
          !focusPulse.smallCode;
        const hasGoods = !!a.orderId || a.notes.includes("seed");
        return (
          <group key={a.id} position={[lx, 0, lz]}>
            {focused && (
              <group position={[0, 0.06, 0]}>
                <FocusPulse w={a.w} d={a.d} y={0.02} />
              </group>
            )}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0.025, 0]}
              onClick={(e) => {
                if (markMode) return;
                e.stopPropagation();
                onSelect({
                  code: a.id,
                  kind: "floor",
                  label: a.label || "Ant grindų",
                });
              }}
              onPointerOver={() => {
                if (!markMode) document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                document.body.style.cursor = "default";
              }}
            >
              <planeGeometry args={[a.w, a.d]} />
              <meshStandardMaterial
                color={selected ? "#f0c14a" : hasGoods ? COLORS.floorGoods : COLORS.floorMark}
                transparent
                opacity={0.5}
                depthWrite={false}
              />
            </mesh>
            {hasGoods && (
              <>
                {/* Deep aisle stacks — multiple piles, tall (8–11 foto) */}
                <mesh position={[-a.w * 0.18, 0.08, -a.d * 0.15]} castShadow>
                  <boxGeometry args={[Math.min(a.w * 0.4, 0.95), 0.1, Math.min(a.d * 0.35, 1.1)]} />
                  <meshStandardMaterial color={COLORS.pallet} roughness={0.9} />
                </mesh>
                <mesh position={[-a.w * 0.18, 0.75, -a.d * 0.15]} castShadow>
                  <boxGeometry args={[Math.min(a.w * 0.36, 0.85), 1.2, Math.min(a.d * 0.3, 0.95)]} />
                  <meshStandardMaterial map={maps.cardboard} roughness={0.9} />
                </mesh>
                <mesh position={[a.w * 0.2, 0.08, a.d * 0.12]} castShadow>
                  <boxGeometry args={[Math.min(a.w * 0.38, 0.9), 0.1, Math.min(a.d * 0.32, 1.0)]} />
                  <meshStandardMaterial color={COLORS.pallet} roughness={0.9} />
                </mesh>
                <mesh position={[a.w * 0.2, 0.7, a.d * 0.12]} castShadow>
                  <boxGeometry
                    args={[
                      Math.min(a.w * 0.34, 0.8),
                      1.1,
                      Math.min(a.d * 0.28, 0.85),
                    ]}
                  />
                  <meshStandardMaterial
                    color={COLORS.wrapBlack}
                    roughness={0.35}
                    metalness={0.1}
                  />
                </mesh>
              </>
            )}
          </group>
        );
      })}
    </group>
  );
}

function PalletCargo({
  w,
  d,
  h = 0.55,
  variant = 0,
  maps,
}: {
  w: number;
  d: number;
  h?: number;
  variant?: number;
  maps: Maps;
}) {
  const wrap = variant % 3;
  return (
    <group>
      <mesh position={[0, 0.06, 0]} castShadow>
        <boxGeometry args={[w, 0.08, d]} />
        <meshStandardMaterial color={COLORS.pallet} roughness={0.95} />
      </mesh>
      {[-0.28, 0, 0.28].map((ox, i) => (
        <mesh key={i} position={[ox * w, 0.03, 0]} castShadow>
          <boxGeometry args={[0.08, 0.06, d * 0.95]} />
          <meshStandardMaterial color={COLORS.palletDark} roughness={0.95} />
        </mesh>
      ))}
      {wrap === 0 && (
        <>
          <mesh position={[0, 0.1 + h / 2, 0]} castShadow>
            <boxGeometry args={[w * 0.88, h, d * 0.82]} />
            <meshStandardMaterial map={maps.cardboard} roughness={0.9} />
          </mesh>
          <mesh position={[w * 0.15, 0.1 + h * 0.55, d * 0.42]}>
            <boxGeometry args={[w * 0.22, h * 0.25, 0.01]} />
            <meshStandardMaterial color="#f5f5f0" />
          </mesh>
        </>
      )}
      {wrap === 1 && (
        <mesh position={[0, 0.1 + h / 2, 0]} castShadow>
          <boxGeometry args={[w * 0.9, h * 1.05, d * 0.88]} />
          <meshStandardMaterial
            color={COLORS.wrapBlack}
            roughness={0.35}
            metalness={0.15}
          />
        </mesh>
      )}
      {wrap === 2 && (
        <mesh position={[0, 0.1 + h / 2, 0]} castShadow>
          <boxGeometry args={[w * 0.9, h, d * 0.85]} />
          <meshStandardMaterial
            color={COLORS.wrapClear}
            roughness={0.25}
            metalness={0.05}
            transparent
            opacity={0.55}
          />
        </mesh>
      )}
    </group>
  );
}

function IndustrialRack({
  box,
  fillAmt,
  footprints,
  fill,
  wholeRack,
  onSelect,
  markMode,
  maps,
  onShelfPointerDown,
  shelfPreview,
  shelfDrawing,
  highlighted,
  pulseFootprint,
}: {
  box: RackBox;
  fillAmt: Map<string, number>;
  footprints: {
    level: number;
    offsetX: number;
    offsetZ: number;
    w: number;
    d: number;
  }[];
  fill: RackFill;
  wholeRack: boolean;
  onSelect: (info: PickInfo) => void;
  markMode: boolean;
  maps: Maps;
  onShelfPointerDown?: (opts: ShelfPointerDownOpts) => void;
  shelfPreview: {
    rack?: number;
    level: number;
    locationCode?: string;
    offsetX: number;
    offsetZ: number;
    w: number;
    d: number;
  } | null;
  shelfDrawing: boolean;
  highlighted?: boolean;
  pulseFootprint?: FootprintPulse | null;
}) {
  const skipRef = useSkipRaycastWhen(markMode);
  const [lx, lz] = toLocal(box.x, box.z);
  const { w, d, rack, wall } = box;
  const uprightH = 3.35;
  // Level 1 = first elevated beam (~chest), not floor — frees aisle
  const beamYs = [1.08, 2.08, 3.05];
  const uw = 0.08;
  const badgeColor = highlighted
    ? "#f59e0b"
    : fill === "full"
      ? COLORS.fullBadge
      : fill === "partial"
        ? COLORS.partialBadge
        : COLORS.emptyBadge;
  // Face aisle; rotate so numbers readable from aisle (entrance wall needs flip)
  const aisleZ = wall === "bottom" ? -d / 2 - 0.04 : d / 2 + 0.04;
  const badgeRotY = wall === "bottom" ? Math.PI : 0;

  const corners: [number, number][] = [
    [-w / 2 + 0.06, -d / 2 + 0.06],
    [w / 2 - 0.06, -d / 2 + 0.06],
    [-w / 2 + 0.06, d / 2 - 0.06],
    [w / 2 - 0.06, d / 2 - 0.06],
  ];

  return (
    <group position={[lx, 0, lz]} ref={skipRef}>
      {highlighted && (
        <mesh position={[0, uprightH / 2, 0]}>
          <boxGeometry args={[w + 0.22, uprightH + 0.15, d + 0.22]} />
          <meshBasicMaterial
            color="#f59e0b"
            transparent
            opacity={0.22}
            depthWrite={false}
          />
        </mesh>
      )}
      {corners.map(([px, pz], i) => (
        <group key={i} position={[px, 0, pz]}>
          {/* yellow foot protector */}
          <mesh position={[0, 0.18, 0]} castShadow>
            <boxGeometry args={[0.16, 0.36, 0.16]} />
            <meshStandardMaterial
              color={COLORS.footGuard}
              metalness={0.35}
              roughness={0.45}
            />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[0.2, 0.04, 0.2]} />
            <meshStandardMaterial color="#333" metalness={0.4} roughness={0.6} />
          </mesh>
          <mesh position={[0, uprightH / 2, 0]} castShadow>
            <boxGeometry args={[uw, uprightH, uw]} />
            <meshStandardMaterial
              color={COLORS.upright}
              metalness={0.55}
              roughness={0.35}
            />
          </mesh>
          {/* perforation hint — dark dots via thin boxes */}
          {[0.4, 0.7, 1.0, 1.3, 1.6, 1.9, 2.2, 2.5, 2.8].map((yy, si) => (
            <mesh key={si} position={[uw * 0.52, yy, 0]}>
              <boxGeometry args={[0.015, 0.04, 0.035]} />
              <meshStandardMaterial color="#0f2a4a" />
            </mesh>
          ))}
          <mesh position={[uw * 0.55, uprightH / 2, 0]}>
            <boxGeometry args={[0.02, uprightH, uw * 0.9]} />
            <meshStandardMaterial
              color={COLORS.uprightDark}
              metalness={0.5}
              roughness={0.4}
            />
          </mesh>
        </group>
      ))}

      {/* Side-frame braces (depth plane) — NOT across bay face / 2nd level */}
      {([-w / 2 + 0.06, w / 2 - 0.06] as const).map((px) => (
        <group key={`br-${px}`}>
          <mesh
            position={[px, uprightH * 0.48, 0]}
            rotation={[Math.PI / 5.5, 0, 0]}
          >
            <boxGeometry args={[0.028, 0.028, d * 0.82]} />
            <meshStandardMaterial
              color={COLORS.brace}
              metalness={0.45}
              roughness={0.45}
            />
          </mesh>
          <mesh
            position={[px, uprightH * 0.55, 0]}
            rotation={[-Math.PI / 5.5, 0, 0]}
          >
            <boxGeometry args={[0.028, 0.028, d * 0.82]} />
            <meshStandardMaterial
              color={COLORS.brace}
              metalness={0.45}
              roughness={0.45}
            />
          </mesh>
        </group>
      ))}

      {wholeRack && (
        <group
          onClick={(e) => {
            if (markMode) return;
            e.stopPropagation();
            onSelect({
              code: locationCode(rack, "K", 1),
              kind: "rack",
              rack,
              label: `Stelažas ${rack} · visas užimtas`,
            });
          }}
        >
          <mesh position={[0, 1.08, 0]} castShadow>
            <boxGeometry args={[w * 0.9, 0.12, d * 0.8]} />
            <meshStandardMaterial color={COLORS.pallet} roughness={0.95} />
          </mesh>
          <mesh position={[0, 2.15, 0]} castShadow>
            <boxGeometry args={[w * 0.78, 1.85, d * 0.62]} />
            <meshStandardMaterial
              color={COLORS.wrapBlack}
              roughness={0.4}
              metalness={0.1}
            />
          </mesh>
        </group>
      )}

      {[1, 2, 3].map((level, li) => {
        const y = beamYs[li];
        return (
          <group key={level}>
            {([-d / 2 + 0.05, d / 2 - 0.05] as const).map((bz, bi) => (
              <group key={bi} position={[0, y, bz]}>
                <mesh castShadow>
                  <boxGeometry args={[w - 0.12, 0.1, 0.065]} />
                  <meshStandardMaterial
                    color={COLORS.beam}
                    metalness={0.4}
                    roughness={0.4}
                  />
                </mesh>
                <mesh
                  position={[
                    0,
                    -0.045,
                    wall === "bottom"
                      ? bi === 0
                        ? 0.03
                        : -0.03
                      : bi === 0
                        ? -0.03
                        : 0.03,
                  ]}
                >
                  <boxGeometry args={[w - 0.14, 0.035, 0.04]} />
                  <meshStandardMaterial
                    color={COLORS.beamDark}
                    metalness={0.35}
                    roughness={0.45}
                  />
                </mesh>
              </group>
            ))}

            {/* wooden deck planks */}
            {[-0.32, -0.16, 0, 0.16, 0.32].map((ox, i) => (
              <mesh key={i} position={[ox * (w * 0.75), y + 0.03, 0]} castShadow>
                <boxGeometry args={[0.1, 0.025, d - 0.18]} />
                <meshStandardMaterial map={maps.wood} roughness={0.88} />
              </mesh>
            ))}

            {/* Drawable deck — beveik visas 1.5 m gylis */}
            {!wholeRack && (
              <mesh
                position={[0, y + 0.055, 0]}
                onPointerDown={(e) => {
                  if (markMode || !onShelfPointerDown) return;
                  e.stopPropagation();
                  onShelfPointerDown({
                    rack,
                    level,
                    localX: e.point.x - lx,
                    localZ: e.point.z - lz,
                    maxW: w * DECK_W_FRAC,
                    maxD: d * DECK_D_FRAC,
                    rackLx: lx,
                    rackLz: lz,
                    deckY: y + 0.055,
                    clientX: e.nativeEvent.clientX,
                    clientY: e.nativeEvent.clientY,
                  });
                }}
                onClick={(e) => {
                  if (markMode) return;
                  if (shelfDrawing) {
                    e.stopPropagation();
                    return;
                  }
                  e.stopPropagation();
                  onSelect({
                    code: locationCode(rack, "K", level),
                    kind: "pallet",
                    rack,
                    level,
                    side: "K",
                    label: `Stelažas ${rack} · aukštas ${level}`,
                  });
                }}
                onPointerOver={() => {
                  if (!markMode) document.body.style.cursor = "crosshair";
                }}
                onPointerOut={() => {
                  if (!shelfDrawing) document.body.style.cursor = "default";
                }}
              >
                <boxGeometry
                  args={[w * DECK_W_FRAC, 0.04, d * DECK_D_FRAC]}
                />
                <meshStandardMaterial
                  color={
                    (fillAmt.get(locationCode(rack, "K", level)) ?? 0) +
                      (fillAmt.get(locationCode(rack, "D", level)) ?? 0) >
                    0.01
                      ? COLORS.occupied
                      : COLORS.free
                  }
                  transparent
                  opacity={0.22}
                />
              </mesh>
            )}

            {/* Existing footprints on this level */}
            {footprints
              .filter((f) => f.level === level)
              .map((f, fi) => {
                const pulsing = footprintPulseMatches(pulseFootprint, {
                  rack,
                  level,
                  offsetX: f.offsetX,
                  offsetZ: f.offsetZ,
                });
                return (
                <group
                  key={fi}
                  position={[f.offsetX, y + 0.08, f.offsetZ]}
                >
                  {pulsing && <FocusPulse w={f.w} d={f.d} y={0.12} />}
                  <mesh position={[0, 0.02, 0]}>
                    <boxGeometry args={[f.w, 0.03, f.d]} />
                    <meshStandardMaterial
                      color={COLORS.occupied}
                      transparent
                      opacity={0.45}
                    />
                  </mesh>
                  <PalletCargo
                    w={Math.max(0.35, f.w * 0.85)}
                    d={Math.max(0.35, f.d * 0.85)}
                    h={0.4}
                    variant={rack + level + fi}
                    maps={maps}
                  />
                </group>
              );
              })}

            {/* Live draw preview */}
            {shelfPreview &&
              !shelfPreview.locationCode &&
              shelfPreview.rack === rack &&
              shelfPreview.level === level && (
                <mesh
                  position={[
                    shelfPreview.offsetX,
                    y + 0.09,
                    shelfPreview.offsetZ,
                  ]}
                >
                  <boxGeometry
                    args={[shelfPreview.w, 0.04, shelfPreview.d]}
                  />
                  <meshStandardMaterial
                    color="#3b82f6"
                    transparent
                    opacity={0.5}
                  />
                </mesh>
              )}
          </group>
        );
      })}

      <group
        position={[0, 2.15, aisleZ]}
        rotation={[0, badgeRotY, 0]}
        onClick={(e) => {
          if (markMode) return;
          e.stopPropagation();
          onSelect({
            code: locationCode(rack, "K", 1),
            kind: "rack",
            rack,
            label: `Stelažas ${rack}`,
          });
        }}
      >
        <mesh position={[0, 0, -0.02]}>
          <planeGeometry args={[1.05, 0.85]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
        {highlighted && (
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[0.72, 0.5]} />
            <meshBasicMaterial color="#fff7ed" />
          </mesh>
        )}
        <mesh>
          <planeGeometry args={highlighted ? [0.58, 0.4] : [0.48, 0.32]} />
          <meshBasicMaterial color={badgeColor} />
        </mesh>
        <Text
          position={[0, 0, 0.01]}
          fontSize={highlighted ? 0.24 : 0.2}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.01}
          outlineColor="#000000"
        >
          {String(rack)}
        </Text>
      </group>
    </group>
  );
}

function SmallShelf({
  box,
  occ,
  fillAmt,
  footprints,
  onSelect,
  markMode,
  maps,
  onShelfPointerDown,
  shelfPreview,
  shelfDrawing,
  pulseFootprint,
}: {
  box: SmallShelfBox;
  occ: Map<string, boolean>;
  fillAmt: Map<string, number>;
  footprints: { offsetX: number; offsetZ: number; w: number; d: number }[];
  onSelect: (info: PickInfo) => void;
  markMode: boolean;
  maps: Maps;
  onShelfPointerDown?: (opts: ShelfPointerDownOpts) => void;
  shelfPreview: {
    rack?: number;
    level: number;
    locationCode?: string;
    offsetX: number;
    offsetZ: number;
    w: number;
    d: number;
  } | null;
  shelfDrawing: boolean;
  pulseFootprint?: FootprintPulse | null;
}) {
  const skipRef = useSkipRaycastWhen(markMode);
  const [lx, lz] = toLocal(box.x, box.z);
  const busy =
    occ.get(box.code) === true || (fillAmt.get(box.code) ?? 0) > 0.01;
  const { w, d, row, badge } = box;
  const isInside = row === "inside1617";
  const h = isInside ? 0.88 : 1.95;
  const levels = isInside
    ? [0.12, 0.42, 0.72]
    : [0.2, 0.55, 0.9, 1.25, 1.6, 1.9];
  const post = 0.025;
  const backX =
    row === "tunnelB"
      ? w / 2 - 0.01
      : row === "inside1617"
        ? 0
        : -w / 2 + 0.01;
  const backZ = row === "inside1617" ? d / 2 - 0.01 : 0;
  const labelX =
    row === "left"
      ? w / 2 + 0.02
      : row === "tunnelA"
        ? -w / 2 - 0.02
        : row === "inside1617"
          ? 0
          : w / 2 + 0.02;
  const labelRotY =
    row === "left"
      ? -Math.PI / 2
      : row === "tunnelA"
        ? Math.PI / 2
        : row === "inside1617"
          ? 0
          : -Math.PI / 2;
  const deckY = isInside ? 0.42 : 1.25;

  return (
    <group position={[lx, 0, lz]} ref={skipRef}>
      {(
        [
          [-w / 2 + post, -d / 2 + post],
          [w / 2 - post, -d / 2 + post],
          [-w / 2 + post, d / 2 - post],
          [w / 2 - post, d / 2 - post],
        ] as const
      ).map(([px, pz], i) => (
        <mesh key={i} position={[px, h / 2, pz]} castShadow>
          <boxGeometry args={[post, h, post]} />
          <meshStandardMaterial
            color={COLORS.shelfMetal}
            metalness={0.55}
            roughness={0.35}
          />
        </mesh>
      ))}
      {levels.map((y, i) => (
        <mesh key={i} position={[0, y, 0]} castShadow>
          <boxGeometry args={[w - 0.02, 0.018, d - 0.02]} />
          <meshStandardMaterial
            color={busy ? "#b0b4ba" : "#c8ccd2"}
            metalness={0.3}
            roughness={0.55}
          />
        </mesh>
      ))}
      <mesh position={[backX, h / 2, backZ]}>
        <boxGeometry args={[row === "inside1617" ? w * 0.98 : 0.012, h * 0.95, row === "inside1617" ? 0.012 : d * 0.98]} />
        <meshStandardMaterial
          color={COLORS.shelfMetal}
          transparent
          opacity={0.25}
          metalness={0.4}
          roughness={0.5}
        />
      </mesh>
      {levels.slice(0, busy ? 5 : 2).map((y, i) => (
        <mesh
          key={`b${i}`}
          position={[
            ((i % 2) - 0.5) * w * 0.15,
            y + 0.08,
            ((i % 3) - 1) * d * 0.22,
          ]}
          castShadow
        >
          <boxGeometry
            args={[
              w * (0.45 + (i % 2) * 0.1),
              0.12 + (i % 2) * 0.04,
              Math.min(0.32, d * 0.22),
            ]}
          />
          <meshStandardMaterial
            map={maps.cardboard}
            roughness={0.9}
            transparent={!busy}
            opacity={busy ? 1 : 0.35}
          />
        </mesh>
      ))}

      {/* Drawable — žymėk plotą ant 15/16 (ar 6/7) lentynos */}
      <mesh
        position={[0, deckY + 0.02, 0]}
        onPointerDown={(e) => {
          if (markMode || !onShelfPointerDown) return;
          e.stopPropagation();
          onShelfPointerDown({
            level: box.level,
            locationCode: box.code,
            localX: e.point.x - lx,
            localZ: e.point.z - lz,
            maxW: w * 0.95,
            maxD: d * 0.95,
            rackLx: lx,
            rackLz: lz,
            deckY: deckY + 0.02,
            clientX: e.nativeEvent.clientX,
            clientY: e.nativeEvent.clientY,
          });
        }}
        onClick={(e) => {
          if (markMode) return;
          if (shelfDrawing) {
            e.stopPropagation();
            return;
          }
          e.stopPropagation();
          onSelect({
            code: box.code,
            kind: "small_shelf",
            level: box.level,
            label: box.code,
          });
        }}
        onPointerOver={() => {
          if (!markMode) document.body.style.cursor = "crosshair";
        }}
        onPointerOut={() => {
          if (!shelfDrawing) document.body.style.cursor = "default";
        }}
      >
        <boxGeometry args={[w * 0.95, 0.035, d * 0.95]} />
        <meshStandardMaterial
          color={busy ? COLORS.occupied : COLORS.free}
          transparent
          opacity={0.28}
        />
      </mesh>

      {footprints.map((f, fi) => {
        const pulsing = footprintPulseMatches(pulseFootprint, {
          smallCode: box.code,
          offsetX: f.offsetX,
          offsetZ: f.offsetZ,
        });
        return (
        <group key={fi} position={[f.offsetX, deckY + 0.06, f.offsetZ]}>
          {pulsing && <FocusPulse w={f.w} d={f.d} y={0.1} />}
          <mesh>
            <boxGeometry args={[f.w, 0.03, f.d]} />
            <meshStandardMaterial
              color={COLORS.occupied}
              transparent
              opacity={0.5}
            />
          </mesh>
        </group>
      );
      })}

      {shelfPreview?.locationCode === box.code && (
        <mesh
          position={[
            shelfPreview.offsetX,
            deckY + 0.07,
            shelfPreview.offsetZ,
          ]}
        >
          <boxGeometry args={[shelfPreview.w, 0.04, shelfPreview.d]} />
          <meshStandardMaterial color="#3b82f6" transparent opacity={0.5} />
        </mesh>
      )}

      <group
        position={[labelX, 1.15, 0]}
        rotation={[0, labelRotY, 0]}
        onClick={(e) => {
          if (markMode) return;
          e.stopPropagation();
          onSelect({
            code: box.code,
            kind: "small_shelf",
            level: box.level,
            label: box.code,
          });
        }}
      >
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[0.72, 0.58]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
        <mesh position={[0, 0, 0.01]}>
          <planeGeometry args={[0.32, 0.28]} />
          <meshBasicMaterial color={busy ? COLORS.occupied : COLORS.free} />
        </mesh>
        <Text
          position={[0, 0, 0.02]}
          fontSize={0.16}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.008}
          outlineColor="#000000"
        >
          {badge}
        </Text>
      </group>
    </group>
  );
}

/** Stelažas VIRŠ durų (EXIT / IEJIMAS) — praėjimas apačioje, sijos ~2.55 m */
function OverDoorBay({
  door,
  maps,
}: {
  door: ReturnType<typeof getDoorGaps>[number];
  maps: Maps;
}) {
  const [lx] = toLocal(door.x, 0);
  const zWall = door.z - CZ;
  const inward = door.wall === "bottom" ? -1 : 1;
  const depth = 1.35;
  const zCenter = zWall + inward * (depth / 2 + 0.05);
  const beamY = 2.55;
  const beamY2 = 3.4;
  const uw = 0.08;
  const halfW = door.width / 2;

  return (
    <group position={[lx, 0, zCenter]}>
      {([-halfW + 0.06, halfW - 0.06] as const).map((px, i) => (
        <group key={i} position={[px, 0, 0]}>
          <mesh position={[0, 0.18, -inward * (depth / 2 - 0.06)]}>
            <boxGeometry args={[0.16, 0.36, 0.16]} />
            <meshStandardMaterial
              color={COLORS.footGuard}
              metalness={0.35}
              roughness={0.45}
            />
          </mesh>
          <mesh
            position={[0, 3.35 / 2, -inward * (depth / 2 - 0.06)]}
            castShadow
          >
            <boxGeometry args={[uw, 3.35, uw]} />
            <meshStandardMaterial
              color={COLORS.upright}
              metalness={0.55}
              roughness={0.35}
            />
          </mesh>
          <mesh
            position={[0, 3.35 / 2, inward * (depth / 2 - 0.06)]}
            castShadow
          >
            <boxGeometry args={[uw, 3.35, uw]} />
            <meshStandardMaterial
              color={COLORS.upright}
              metalness={0.55}
              roughness={0.35}
            />
          </mesh>
        </group>
      ))}

      {[beamY, beamY2].map((y) => (
        <group key={y}>
          {([-depth / 2 + 0.05, depth / 2 - 0.05] as const).map((bz, bi) => (
            <mesh key={bi} position={[0, y, bz]} castShadow>
              <boxGeometry args={[door.width - 0.1, 0.1, 0.065]} />
              <meshStandardMaterial
                color={COLORS.beam}
                metalness={0.4}
                roughness={0.4}
              />
            </mesh>
          ))}
          {[-0.3, -0.1, 0.1, 0.3].map((ox, i) => (
            <mesh key={i} position={[ox * (door.width * 0.7), y + 0.03, 0]}>
              <boxGeometry args={[0.1, 0.025, depth - 0.2]} />
              <meshStandardMaterial map={maps.wood} roughness={0.88} />
            </mesh>
          ))}
        </group>
      ))}

      {([-0.55, 0, 0.55] as const).map((ox, i) => (
        <group key={i} position={[ox * (door.width * 0.55), beamY + 0.05, 0]}>
          <PalletCargo
            w={0.55}
            d={0.7}
            h={0.42}
            variant={i + (door.id === "exit" ? 0 : 2)}
            maps={maps}
          />
        </group>
      ))}

      {door.id === "exit" && (
        <mesh position={[0, beamY - 0.2, -inward * (depth / 2 + 0.02)]}>
          <planeGeometry args={[0.35, 0.18]} />
          <meshBasicMaterial color="#22c55e" />
        </mesh>
      )}
    </group>
  );
}

function CameraRig({
  preset,
  enabled,
  focusCamera,
  focusSeq,
}: {
  preset: ViewPreset;
  enabled: boolean;
  focusCamera?: MapFocus["camera"] | null;
  focusSeq?: number;
}) {
  const ref = useRef<CameraControlsImpl>(null);
  const { gl } = useThree();
  const focusSeqRef = useRef(0);
  focusSeqRef.current = focusSeq ?? 0;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    if (focusSeq && focusSeq > 0 && focusCamera) {
      void c.setLookAt(
        focusCamera.position[0],
        focusCamera.position[1],
        focusCamera.position[2],
        focusCamera.target[0],
        focusCamera.target[1],
        focusCamera.target[2],
        true,
      );
      return;
    }
    const p = PRESETS[preset];
    void c.setLookAt(
      p.position[0],
      p.position[1],
      p.position[2],
      p.target[0],
      p.target[1],
      p.target[2],
      true,
    );
  }, [preset, focusSeq, focusCamera]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const c = ref.current;
      if (!c || focusSeqRef.current > 0) return;
      // Jokios „nematomos sienos“ — galima eiti kiaurai tarp 15↔16
      c.boundaryEnclosesCamera = false;
      c.setBoundary(
        new THREE.Box3(
          new THREE.Vector3(-1e4, -1e4, -1e4),
          new THREE.Vector3(1e4, 1e4, 1e4),
        ),
      );
      const p = PRESETS.overview;
      void c.setLookAt(
        p.position[0],
        p.position[1],
        p.position[2],
        p.target[0],
        p.target[1],
        p.target[2],
        false,
      );
    }, 50);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.enabled = enabled;
    if (enabled) {
      try {
        c.connect(gl.domElement);
      } catch {
        /* already connected */
      }
    } else {
      try {
        c.disconnect();
      } catch {
        /* ignore */
      }
    }
  }, [enabled, gl]);

  // WASD / arrows — walk inside aisle
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const c = ref.current;
      if (!c || !enabled) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const step = e.shiftKey ? 0.85 : 0.38;
      const k = e.key.toLowerCase();
      if (k === "w" || k === "arrowup") {
        e.preventDefault();
        void c.forward(step, true);
      } else if (k === "s" || k === "arrowdown") {
        e.preventDefault();
        void c.forward(-step, true);
      } else if (k === "a" || k === "arrowleft") {
        e.preventDefault();
        void c.truck(-step, 0, true);
      } else if (k === "d" || k === "arrowright") {
        e.preventDefault();
        void c.truck(step, 0, true);
      } else if (k === "q" || k === "pageup") {
        e.preventDefault();
        const pos = new THREE.Vector3();
        const tgt = new THREE.Vector3();
        c.getPosition(pos);
        c.getTarget(tgt);
        const dy = step * 0.65;
        void c.setLookAt(
          pos.x,
          Math.min(WALL_H - 0.5, pos.y + dy),
          pos.z,
          tgt.x,
          Math.min(WALL_H - 0.8, tgt.y + dy * 0.5),
          tgt.z,
          true,
        );
      } else if (k === "e" || k === "pagedown") {
        e.preventDefault();
        const pos = new THREE.Vector3();
        const tgt = new THREE.Vector3();
        c.getPosition(pos);
        c.getTarget(tgt);
        const dy = step * 0.65;
        void c.setLookAt(
          pos.x,
          Math.max(0.5, pos.y - dy),
          pos.z,
          tgt.x,
          Math.max(0.3, tgt.y - dy * 0.5),
          tgt.z,
          true,
        );
      } else if (k === "r") {
        e.preventDefault();
        const pos = new THREE.Vector3();
        const tgt = new THREE.Vector3();
        c.getPosition(pos);
        c.getTarget(tgt);
        void c.setLookAt(pos.x, 1.7, pos.z, tgt.x, 1.2, tgt.z, true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={0.5}
      maxDistance={14}
      maxPolarAngle={Math.PI / 2.02}
      minPolarAngle={0.05}
      dollySpeed={0.75}
      truckSpeed={1.6}
      azimuthRotateSpeed={0.75}
      polarRotateSpeed={0.55}
      smoothTime={0.18}
      draggingSmoothTime={0.1}
      infinityDolly={false}
    />
  );
}

function Scene({
  state,
  selectedCode,
  onSelect,
  preset,
  markMode,
  draftStart,
  draftCurrent,
  onFloorPointer,
  onShelfPointerDown,
  onShelfDrag,
  onShelfDragEnd,
  shelfPreview,
  shelfDrawing,
  shelfDragMeta,
  highlightRack,
  focusCamera,
  focusSeq,
  pulseFootprint,
}: {
  state: AppState;
  selectedCode: string | null;
  onSelect: (info: PickInfo) => void;
  preset: ViewPreset;
  markMode: boolean;
  draftStart: [number, number] | null;
  draftCurrent: [number, number] | null;
  onFloorPointer: (wx: number, wz: number, kind: "down" | "move" | "up") => void;
  onShelfPointerDown: (opts: ShelfPointerDownOpts) => void;
  onShelfDrag: (localX: number, localZ: number) => void;
  onShelfDragEnd: (
    localX: number,
    localZ: number,
    clientX: number,
    clientY: number,
  ) => void;
  shelfPreview: {
    rack?: number;
    level: number;
    locationCode?: string;
    offsetX: number;
    offsetZ: number;
    w: number;
    d: number;
  } | null;
  shelfDrawing: boolean;
  shelfDragMeta: {
    rackLx: number;
    rackLz: number;
    deckY: number;
  } | null;
  highlightRack?: number | null;
  focusCamera?: MapFocus["camera"] | null;
  focusSeq?: number;
  pulseFootprint?: FootprintPulse | null;
}) {
  const layout = useMemo(() => getRackLayout(), []);
  const shelves = useMemo(() => getSmallShelfLayout(), []);
  const doors = useMemo(() => getDoorGaps(), []);
  const fillAmt = useMemo(() => slotFillAmount(state), [state]);
  const fill = useMemo(() => rackFill(state), [state]);
  const whole = useMemo(() => rackFullyOccupiedByUnit(state), [state]);
  const footprintsByRack = useMemo(() => {
    const m = new Map<
      number,
      { level: number; offsetX: number; offsetZ: number; w: number; d: number }[]
    >();
    for (const u of state.units) {
      if (!u.locationId || u.occupiesEntireRack) continue;
      if (!["stored", "received", "staged"].includes(u.status)) continue;
      if (!u.footprintW || !u.footprintD) continue;
      const loc = state.locations.find((l) => l.id === u.locationId);
      if (!loc || loc.kind !== "pallet" || !loc.rack || !loc.level) continue;
      const list = m.get(loc.rack) ?? [];
      list.push({
        level: loc.level,
        offsetX: u.footprintOffsetX ?? 0,
        offsetZ: u.footprintOffsetZ ?? 0,
        w: u.footprintW,
        d: u.footprintD,
      });
      m.set(loc.rack, list);
    }
    return m;
  }, [state]);
  const footprintsBySmall = useMemo(() => {
    const m = new Map<
      string,
      { offsetX: number; offsetZ: number; w: number; d: number }[]
    >();
    for (const u of state.units) {
      if (!u.locationId || u.occupiesEntireRack) continue;
      if (!["stored", "received", "staged"].includes(u.status)) continue;
      if (!u.footprintW || !u.footprintD) continue;
      const loc = state.locations.find((l) => l.id === u.locationId);
      if (!loc || loc.kind !== "small_shelf") continue;
      const list = m.get(loc.code) ?? [];
      list.push({
        offsetX: u.footprintOffsetX ?? 0,
        offsetZ: u.footprintOffsetZ ?? 0,
        w: u.footprintW,
        d: u.footprintD,
      });
      m.set(loc.code, list);
    }
    return m;
  }, [state]);
  const maps = useWarehouseMaps();
  const occ = useMemo(() => slotOccupancy(state), [state]);

  return (
    <>
      <color attach="background" args={["#c8ccd2"]} />
      <fog attach="fog" args={["#c8ccd2", 22, 42]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#fff8f0", "#6a655c", 0.45]} />
      <directionalLight
        castShadow
        position={[6, 14, 8]}
        intensity={0.95}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={60}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
      />

      <Floor
        markMode={markMode}
        draftStart={draftStart}
        draftCurrent={draftCurrent}
        onFloorPointer={onFloorPointer}
        maps={maps}
      />
      <Walls doors={doors} maps={maps} />
      {doors.map((door) => (
        <OverDoorBay key={`over-${door.id}`} door={door} maps={maps} />
      ))}
      <FloorAreas
        areas={state.floorAreas ?? []}
        selectedCode={selectedCode}
        onSelect={onSelect}
        markMode={markMode}
        maps={maps}
        focusPulse={pulseFootprint}
      />

      {shelfDragMeta && (
        <ShelfDragCapture
          active={shelfDrawing}
          rackLx={shelfDragMeta.rackLx}
          rackLz={shelfDragMeta.rackLz}
          deckY={shelfDragMeta.deckY}
          onDrag={onShelfDrag}
          onEnd={onShelfDragEnd}
        />
      )}

      {layout.map((box) => (
        <IndustrialRack
          key={box.rack}
          box={box}
          fillAmt={fillAmt}
          footprints={footprintsByRack.get(box.rack) ?? []}
          fill={fill.get(box.rack) ?? "empty"}
          wholeRack={whole.get(box.rack) === true}
          onSelect={onSelect}
          markMode={markMode}
          maps={maps}
          onShelfPointerDown={onShelfPointerDown}
          shelfPreview={shelfPreview}
          shelfDrawing={shelfDrawing}
          highlighted={highlightRack === box.rack}
          pulseFootprint={pulseFootprint}
        />
      ))}

      {shelves.map((s) => (
        <SmallShelf
          key={s.id}
          box={s}
          occ={occ}
          fillAmt={fillAmt}
          footprints={footprintsBySmall.get(s.code) ?? []}
          onSelect={onSelect}
          markMode={markMode}
          maps={maps}
          onShelfPointerDown={onShelfPointerDown}
          shelfPreview={shelfPreview}
          shelfDrawing={shelfDrawing}
          pulseFootprint={pulseFootprint}
        />
      ))}

      <CameraRig
        preset={preset}
        enabled={!markMode && !shelfDrawing}
        focusCamera={focusCamera}
        focusSeq={focusSeq}
      />
    </>
  );
}

export type Warehouse3DHandle = {
  enterFullscreen: () => void;
  focusRack: (rack: number, locationCode?: string | null) => void;
  focusUnit: (unitId: string) => void;
};

export const Warehouse3D = forwardRef<
  Warehouse3DHandle,
  {
    state: AppState;
    onPick?: (info: PickInfo) => void;
    preset: ViewPreset;
    markFloorMode?: boolean;
    onFloorDraftComplete?: (draft: FloorDraft) => void;
    onShelfDraftComplete?: (draft: ShelfDraft) => void;
    highlightRack?: number | null;
  }
>(function Warehouse3D(
  {
    state,
    onPick,
    preset,
    markFloorMode = false,
    onFloorDraftComplete,
    onShelfDraftComplete,
    highlightRack = null,
  },
  ref,
) {
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);
  const [focusSeq, setFocusSeq] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [coarsePointer, setCoarsePointer] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarsePointer(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const [draftStart, setDraftStart] = useState<[number, number] | null>(null);
  const [draftCurrent, setDraftCurrent] = useState<[number, number] | null>(
    null,
  );
  const drawing = useRef(false);
  const draftStartRef = useRef<[number, number] | null>(null);

  const shelfDrawing = useRef(false);
  const shelfStartRef = useRef<{
    rack?: number;
    level: number;
    locationCode?: string;
    x: number;
    z: number;
    maxW: number;
    maxD: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const [shelfPreview, setShelfPreview] = useState<{
    rack?: number;
    level: number;
    locationCode?: string;
    offsetX: number;
    offsetZ: number;
    w: number;
    d: number;
  } | null>(null);
  const [shelfDrawingUi, setShelfDrawingUi] = useState(false);
  const [shelfDragMeta, setShelfDragMeta] = useState<{
    rackLx: number;
    rackLz: number;
    deckY: number;
  } | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!markFloorMode) {
      setDraftStart(null);
      setDraftCurrent(null);
      draftStartRef.current = null;
      drawing.current = false;
    }
  }, [markFloorMode]);

  useImperativeHandle(
    ref,
    () => ({
      enterFullscreen: () => {
        const el = wrapRef.current;
        if (!el) return;
        if (document.fullscreenElement) void document.exitFullscreen();
        else void el.requestFullscreen?.();
      },
      focusRack: (rack: number, locationCode?: string | null) => {
        const f = resolveLocationMapFocus(state, rack, locationCode);
        if (!f) return;
        setMapFocus(f);
        if (f.selectedCode) setSelectedCode(f.selectedCode);
        setFocusSeq((n) => n + 1);
      },
      focusUnit: (unitId: string) => {
        const f = resolveUnitMapFocus(state, unitId);
        if (!f) return;
        setMapFocus(f);
        if (f.selectedCode) setSelectedCode(f.selectedCode);
        setFocusSeq((n) => n + 1);
      },
    }),
    [state],
  );

  useEffect(() => {
    if (!mapFocus) return;
    const t = window.setTimeout(() => setMapFocus(null), 14000);
    return () => window.clearTimeout(t);
  }, [mapFocus, focusSeq]);

  function clampToMax(
    lx: number,
    lz: number,
    maxW: number,
    maxD: number,
  ): { x: number; z: number } {
    return {
      x: Math.max(-maxW / 2, Math.min(maxW / 2, lx)),
      z: Math.max(-maxD / 2, Math.min(maxD / 2, lz)),
    };
  }

  function previewFromEnds(
    start: {
      rack?: number;
      level: number;
      locationCode?: string;
      x: number;
      z: number;
    },
    b: { x: number; z: number },
  ) {
    const x0 = Math.min(start.x, b.x);
    const x1 = Math.max(start.x, b.x);
    const z0 = Math.min(start.z, b.z);
    const z1 = Math.max(start.z, b.z);
    return {
      rack: start.rack,
      level: start.level,
      locationCode: start.locationCode,
      offsetX: (x0 + x1) / 2,
      offsetZ: (z0 + z1) / 2,
      w: Math.max(0.2, x1 - x0),
      d: Math.max(0.2, z1 - z0),
    };
  }

  function onShelfPointerDown(opts: ShelfPointerDownOpts) {
    if (markFloorMode) return;
    const pt = clampToMax(opts.localX, opts.localZ, opts.maxW, opts.maxD);
    shelfDrawing.current = true;
    setShelfDrawingUi(true);
    setShelfDragMeta({
      rackLx: opts.rackLx,
      rackLz: opts.rackLz,
      deckY: opts.deckY,
    });
    shelfStartRef.current = {
      rack: opts.rack,
      level: opts.level,
      locationCode: opts.locationCode,
      x: pt.x,
      z: pt.z,
      maxW: opts.maxW,
      maxD: opts.maxD,
      clientX: opts.clientX,
      clientY: opts.clientY,
    };
    setShelfPreview({
      rack: opts.rack,
      level: opts.level,
      locationCode: opts.locationCode,
      offsetX: pt.x,
      offsetZ: pt.z,
      w: 0.25,
      d: 0.25,
    });
  }

  function onShelfDrag(localX: number, localZ: number) {
    const start = shelfStartRef.current;
    if (!shelfDrawing.current || !start) return;
    const pt = clampToMax(localX, localZ, start.maxW, start.maxD);
    setShelfPreview(previewFromEnds(start, pt));
  }

  function onShelfDragEnd(
    localX: number,
    localZ: number,
    clientX: number,
    clientY: number,
  ) {
    const start = shelfStartRef.current;
    if (!shelfDrawing.current || !start) {
      shelfDrawing.current = false;
      setShelfDrawingUi(false);
      setShelfDragMeta(null);
      shelfStartRef.current = null;
      setShelfPreview(null);
      return;
    }
    shelfDrawing.current = false;
    setShelfDrawingUi(false);
    setShelfDragMeta(null);
    shelfStartRef.current = null;
    const pt = clampToMax(localX, localZ, start.maxW, start.maxD);
    const draft = previewFromEnds(start, pt);
    setShelfPreview(null);
    document.body.style.cursor = "default";
    const movedPx = Math.hypot(
      clientX - start.clientX,
      clientY - start.clientY,
    );
    if (movedPx < SHELF_TAP_PX) return;
    if (draft.w < SHELF_MIN_DRAW_M && draft.d < SHELF_MIN_DRAW_M) return;
    onShelfDraftComplete?.(draft);
  }

  function onFloorPointer(
    wx: number,
    wz: number,
    kind: "down" | "move" | "up",
  ) {
    if (!markFloorMode) return;
    const clamped: [number, number] = [
      Math.min(ROOM.length - 0.2, Math.max(0.2, wx)),
      Math.min(ROOM.width - 0.2, Math.max(0.2, wz)),
    ];
    if (kind === "down") {
      drawing.current = true;
      draftStartRef.current = clamped;
      setDraftStart(clamped);
      setDraftCurrent(clamped);
    } else if (kind === "move" && drawing.current) {
      setDraftCurrent(clamped);
    } else if (kind === "up" && drawing.current && draftStartRef.current) {
      drawing.current = false;
      const start = draftStartRef.current;
      const x0 = Math.min(start[0], clamped[0]);
      const z0 = Math.min(start[1], clamped[1]);
      const x1 = Math.max(start[0], clamped[0]);
      const z1 = Math.max(start[1], clamped[1]);
      const draft: FloorDraft = {
        x: (x0 + x1) / 2,
        z: (z0 + z1) / 2,
        w: Math.max(0.35, x1 - x0),
        d: Math.max(0.35, z1 - z0),
      };
      draftStartRef.current = null;
      setDraftStart(null);
      setDraftCurrent(null);
      onFloorDraftComplete?.(draft);
    }
  }

  if (!mounted) {
    return (
      <div className="flex h-full min-h-[12rem] items-center justify-center bg-[#e4e7ec] text-sm text-stone-600 sm:min-h-[480px]">
        Ruošiamas 3D…
      </div>
    );
  }

  return (
    <CanvasErrorBoundary>
      <div
        ref={wrapRef}
        className="relative h-full w-full bg-[#c8ccd2]"
      >
        <Canvas
          className="!absolute inset-0 h-full w-full touch-none"
          style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
          shadows
          dpr={[1, 1.5]}
          camera={{
            position: PRESETS.overview.position,
            fov: 40,
            near: 0.15,
            far: 200,
          }}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
            toneMappingExposure: 1.08,
          }}
          onCreated={({ camera, gl }) => {
            camera.up.set(0, 1, 0);
            gl.setClearColor("#c8ccd2");
          }}
        >
          <Suspense fallback={null}>
            <Scene
              state={state}
              selectedCode={selectedCode}
              preset={preset}
              markMode={markFloorMode}
              draftStart={draftStart}
              draftCurrent={draftCurrent}
              onFloorPointer={onFloorPointer}
              onShelfPointerDown={onShelfPointerDown}
              onShelfDrag={onShelfDrag}
              onShelfDragEnd={onShelfDragEnd}
              shelfPreview={shelfPreview}
              shelfDrawing={shelfDrawingUi}
              shelfDragMeta={shelfDragMeta}
              highlightRack={highlightRack ?? mapFocus?.highlightRack ?? null}
              focusCamera={mapFocus?.camera ?? null}
              focusSeq={focusSeq}
              pulseFootprint={mapFocus?.pulse ?? null}
              onSelect={(info) => {
                setSelectedCode(info.code);
                onPick?.(info);
              }}
            />
          </Suspense>
        </Canvas>

        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 flex w-[min(100%-1rem,36rem)] -translate-x-1/2 justify-center px-2">
          <span className="rounded-full bg-stone-900/70 px-3 py-1.5 text-center text-[10px] font-medium leading-snug text-white sm:text-[11px]">
            {markFloorMode
              ? "Tempk ant grindų — pažymėk plotą"
              : shelfDrawingUi
                ? coarsePointer
                  ? "Tempk pirštu — atleisk kai baigsi"
                  : "Tempk — paleisk mygtuką kai baigsi"
                : coarsePointer
                  ? "Spausk skaičių ant stelažo · 1 pirštu sukti · 2 pirštais priartinti"
                  : "WASD = eiti · Spausk stelažą = info · Tempk ant sijos = plotas"}
          </span>
        </div>
      </div>
    </CanvasErrorBoundary>
  );
});

export { PRESETS };
