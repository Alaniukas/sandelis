import { BAY_DEPTH_M, getRackLayout, getSmallShelfLayout } from "./locations";
import type { AppState } from "./types";

const CX = 15;
const CZ = 5.5;
const BEAM_Y = [1.08, 2.08, 3.05] as const;

export type FootprintPulse = {
  rack?: number;
  level?: number;
  smallCode?: string;
  offsetX: number;
  offsetZ: number;
  w: number;
  d: number;
};

export type MapFocus = {
  camera: {
    position: [number, number, number];
    target: [number, number, number];
  };
  highlightRack: number | null;
  selectedCode: string | null;
  pulse: FootprintPulse | null;
};

function toLocal(x: number, z: number): [number, number] {
  return [x - CX, z - CZ];
}

function aisleOffset(wall: "top" | "bottom", distance = 1.85): number {
  return wall === "bottom" ? -distance : distance;
}

function cameraAt(
  tx: number,
  ty: number,
  tz: number,
  wall: "top" | "bottom",
  distance = 1.85,
): MapFocus["camera"] {
  const off = aisleOffset(wall, distance);
  return {
    position: [tx, 1.62, tz + off],
    target: [tx, ty, tz],
  };
}

export function resolveRackMapFocus(rack: number): MapFocus | null {
  const box = getRackLayout().find((b) => b.rack === rack);
  if (!box) return null;
  const [lx, lz] = toLocal(box.x, box.z);
  return {
    camera: cameraAt(lx, 1.35, lz, box.wall, 2.0),
    highlightRack: rack,
    selectedCode: null,
    pulse: null,
  };
}

export function resolveLocationMapFocus(
  state: AppState,
  rack: number,
  code?: string | null,
): MapFocus | null {
  if (code) {
    const loc = state.locations.find((l) => l.code === code || l.id === code);
    const unit = loc
      ? state.units.find(
          (u) =>
            u.locationId === loc.id &&
            ["stored", "received", "staged"].includes(u.status),
        )
      : null;
    if (unit) return resolveUnitMapFocus(state, unit.id);
  }
  return resolveRackMapFocus(rack);
}

export function resolveUnitMapFocus(
  state: AppState,
  unitId: string,
): MapFocus | null {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return null;

  if (unit.floorAreaId) {
    const area = state.floorAreas.find((f) => f.id === unit.floorAreaId);
    if (!area) return null;
    const [lx, lz] = toLocal(area.x, area.z);
    return {
      camera: {
        position: [lx, 1.85, lz + area.d * 0.55 + 1.1],
        target: [lx, 0.75, lz],
      },
      highlightRack: null,
      selectedCode: area.id,
      pulse: {
        offsetX: 0,
        offsetZ: 0,
        w: area.w,
        d: area.d,
      },
    };
  }

  if (!unit.locationId) return null;
  const loc = state.locations.find((l) => l.id === unit.locationId);
  if (!loc) return null;

  if (unit.occupiesEntireRack && loc.rack) {
    return resolveRackMapFocus(loc.rack);
  }

  if (loc.kind === "small_shelf") {
    const shelf = getSmallShelfLayout().find((s) => s.code === loc.code);
    if (!shelf) return null;
    const [lx, lz] = toLocal(shelf.x, shelf.z);
    const deckY = shelf.row === "inside1617" ? 0.42 : 1.25;
    const ox = unit.footprintOffsetX ?? 0;
    const oz = unit.footprintOffsetZ ?? 0;
    const w = unit.footprintW ?? 0.55;
    const d = unit.footprintD ?? 0.45;
    const tx = lx + ox;
    const tz = lz + oz;
    const ty = deckY + 0.28;
    const camSide =
      shelf.row === "left"
        ? { position: [lx - 1.5, 1.65, tz] as [number, number, number], target: [tx, ty, tz] as [number, number, number] }
        : shelf.row === "tunnelA"
          ? { position: [lx + 1.5, 1.65, tz] as [number, number, number], target: [tx, ty, tz] as [number, number, number] }
          : { position: [tx, 1.65, tz + 1.4] as [number, number, number], target: [tx, ty, tz] as [number, number, number] };
    return {
      camera: camSide,
      highlightRack: null,
      selectedCode: loc.code,
      pulse: {
        smallCode: loc.code,
        offsetX: ox,
        offsetZ: oz,
        w,
        d,
      },
    };
  }

  if (loc.rack && loc.level) {
    const box = getRackLayout().find((b) => b.rack === loc.rack);
    if (!box) return null;
    const [lx, lz] = toLocal(box.x, box.z);
    const level = loc.level;
    const beamY = BEAM_Y[level - 1] ?? 1.08;
    const ox = unit.footprintOffsetX ?? 0;
    const oz = unit.footprintOffsetZ ?? 0;
    const w = unit.footprintW ?? 1.1;
    const d = unit.footprintD ?? BAY_DEPTH_M;
    const tx = lx + ox;
    const tz = lz + oz;
    const ty = beamY + 0.38;
    return {
      camera: cameraAt(tx, ty, tz, box.wall),
      highlightRack: loc.rack,
      selectedCode: loc.code,
      pulse: {
        rack: loc.rack,
        level,
        offsetX: ox,
        offsetZ: oz,
        w,
        d,
      },
    };
  }

  return null;
}

export function footprintPulseMatches(
  pulse: FootprintPulse | null | undefined,
  ctx: {
    rack?: number;
    level?: number;
    smallCode?: string;
    offsetX: number;
    offsetZ: number;
  },
): boolean {
  if (!pulse) return false;
  if (pulse.smallCode) {
    return (
      pulse.smallCode === ctx.smallCode &&
      Math.abs(pulse.offsetX - ctx.offsetX) < 0.08 &&
      Math.abs(pulse.offsetZ - ctx.offsetZ) < 0.08
    );
  }
  if (pulse.rack == null || pulse.level == null) return false;
  return (
    pulse.rack === ctx.rack &&
    pulse.level === ctx.level &&
    Math.abs(pulse.offsetX - ctx.offsetX) < 0.08 &&
    Math.abs(pulse.offsetZ - ctx.offsetZ) < 0.08
  );
}
