import type { Location, RackSize, Zone } from "./types";

/** Foto/brėžinio tipai */
export const RED_RACKS = new Set([1, 2, 3, 4, 9, 10, 11, 12, 14, 15, 16, 17]);
export const BLUE_RACKS = new Set([5, 6, 7, 8, 13, 18]);

export function rackSize(n: number): RackSize {
  return BLUE_RACKS.has(n) ? "blue_1.9" : "red_2.9";
}

export function rackLengthM(n: number): number {
  return rackSize(n) === "blue_1.9" ? 1.9 : 2.9;
}

/** Bay frame height (m) — blue slightly shorter */
export function rackHeightM(n: number): number {
  return rackSize(n) === "blue_1.9" ? 1.8 : 1.9;
}

export function zoneForRack(n: number): Zone {
  return n <= 12 ? "EXPO" : "DILED";
}

/** Stelažo bay gylis (m) — visi industrial rack */
export const BAY_DEPTH_M = 1.5;

export function locationCode(
  rack: number,
  side: "K" | "D",
  level: number,
): string {
  const zone = zoneForRack(rack);
  if (level === 3 && (rack === 12 || rack === 13)) {
    return `LONG-${rack}-${side}-${level}`;
  }
  return `${zone}-${rack}-${side}-${level}`;
}

function id(code: string) {
  return code;
}

/** Seed lokacijos pagal brėžinį */
export function buildLocations(): Location[] {
  const locs: Location[] = [];

  for (let rack = 1; rack <= 18; rack++) {
    const zone = zoneForRack(rack);
    const size = rackSize(rack);
    for (const side of ["K", "D"] as const) {
      for (let level = 1; level <= 3; level++) {
        const code = locationCode(rack, side, level);
        const isLong = code.startsWith("LONG-");
        locs.push({
          id: id(code),
          code,
          zone: isLong ? "LONG" : zone,
          rack,
          side,
          level,
          kind: "pallet",
          label: `${isLong ? "LONG " : ""}${rack} ${side} aukštas ${level}`,
          rackSize: size,
        });
      }
    }
  }

  for (let n = 1; n <= 4; n++) {
    const code = `EXPO-6/7-S-${n}`;
    locs.push({
      id: code,
      code,
      zone: "EXPO",
      rack: 6,
      side: "K",
      level: n,
      kind: "small_shelf",
      label: `Smulkūs 6/7 prie sienos L${n}`,
    });
  }

  for (const row of ["A", "B"] as const) {
    for (let n = 1; n <= 4; n++) {
      const code = `DILED-15/16-${row}-${n}`;
      locs.push({
        id: code,
        code,
        zone: "DILED",
        rack: 15,
        side: row === "A" ? "D" : "K",
        level: n,
        kind: "small_shelf",
        label: `Smulkūs 15/16 ${row === "A" ? "prie sienos" : "vidus"} ${row}${n}`,
      });
    }
  }

  for (let n = 1; n <= 4; n++) {
    const rack = n <= 2 ? 16 : 17;
    const code = `DILED-16/17-A-${n}`;
    locs.push({
      id: code,
      code,
      zone: "DILED",
      rack,
      side: "D",
      level: 1,
      kind: "small_shelf",
      label: `Smulkūs stelažas ${rack} viduje (prie sienos) ${n <= 2 ? n : n - 2}`,
    });
  }

  locs.push(
    {
      id: "STAGING-0-K-1",
      code: "STAGING-0-K-1",
      zone: "STAGING",
      rack: 0,
      side: "K",
      level: 1,
      kind: "special",
      label: "Išvežimas",
    },
    {
      id: "BROKAS-0-K-1",
      code: "BROKAS-0-K-1",
      zone: "BROKAS",
      rack: 0,
      side: "K",
      level: 1,
      kind: "special",
      label: "Brokas",
    },
  );

  return locs;
}

/** 3D: X = ilgis 0..30, Z = plotis 0..11 (0 = EXIT siena, 11 = IEJIMAS siena) */
export interface RackBox {
  rack: number;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  size: RackSize;
  wall: "top" | "bottom";
}

export interface SmallShelfBox {
  id: string;
  code: string;
  /** Trumpas numeris ant stelažo (kaip 1–18) */
  badge: string;
  x: number;
  z: number;
  w: number;
  d: number;
  level: number;
  row: "left" | "tunnelA" | "tunnelB" | "inside1617";
}

export interface DoorGap {
  id: "entrance" | "exit";
  label: string;
  /** center X of opening */
  x: number;
  /** wall z */
  z: number;
  width: number;
  wall: "top" | "bottom";
}

const DEPTH = BAY_DEPTH_M;
const ROOM_L = 30;
const ROOM_W = 11;
const DOOR_W = 2.4;
const MARGIN = 0.6;
/** Dešinėje (prie 15/16) atvira juosta — galima įeiti iš aisle */
const RIGHT_TUNNEL_RESERVE = 2.85;

function layoutWall(
  order: number[],
  zCenter: number,
  wall: "top" | "bottom",
  doorBeforeRack: number,
): { boxes: RackBox[]; door: DoorGap } {
  const lengths = order.map(rackLengthM);
  const totalRacks = lengths.reduce((s, n) => s + n, 0);
  // Paliekam dešinę juostą 15↔16 tuneliui (neužkemšam stelažais iki sienos)
  const usable = ROOM_L - MARGIN - RIGHT_TUNNEL_RESERVE - DOOR_W;
  const scale = usable / totalRacks;

  let x = MARGIN;
  const boxes: RackBox[] = [];
  let doorX = ROOM_L / 2;

  for (let i = 0; i < order.length; i++) {
    const rack = order[i];
    if (rack === doorBeforeRack) {
      doorX = x + DOOR_W / 2;
      x += DOOR_W;
    }
    const w = lengths[i] * scale;
    boxes.push({
      rack,
      x: x + w / 2,
      z: zCenter,
      w,
      d: DEPTH,
      h: rackHeightM(rack),
      size: rackSize(rack),
      wall,
    });
    x += w;
  }

  return {
    boxes,
    door: {
      id: wall === "bottom" ? "entrance" : "exit",
      label: wall === "bottom" ? "Įėjimas" : "Išėjimas",
      x: doorX,
      z: wall === "bottom" ? ROOM_W : 0,
      width: DOOR_W,
      wall,
    },
  };
}

export function getRackLayout(): RackBox[] {
  const top = layoutWall(
    [7, 8, 9, 10, 11, 12, 13, 14, 15],
    DEPTH / 2,
    "top",
    13,
  );
  const bottom = layoutWall(
    [6, 5, 4, 3, 2, 1, 18, 17, 16],
    ROOM_W - DEPTH / 2,
    "bottom",
    18,
  );
  return [...top.boxes, ...bottom.boxes];
}

export function getDoorGaps(): DoorGap[] {
  const top = layoutWall(
    [7, 8, 9, 10, 11, 12, 13, 14, 15],
    DEPTH / 2,
    "top",
    13,
  );
  const bottom = layoutWall(
    [6, 5, 4, 3, 2, 1, 18, 17, 16],
    ROOM_W - DEPTH / 2,
    "bottom",
    18,
  );
  return [top.door, bottom.door];
}

/** Smulkūs: 6↔7 = ilgas stelažas prie kairės sienos;
 *  15↔16 = tunelis su įėjimu iš aisle pusės (prie rack 15 galo).
 *  w = gylis nuo sienos (X), d = ilgis palei sieną (Z). */
export function getSmallShelfLayout(): SmallShelfBox[] {
  const shelves: SmallShelfBox[] = [];
  const z0 = DEPTH + 0.2;
  const z1 = ROOM_W - DEPTH - 0.2;
  const sections = 4;
  const depthFromWall = 0.42;

  // EXPO 6/7 — flush to left wall, full run
  {
    const span = z1 - z0;
    const secLen = span / sections;
    for (let n = 1; n <= sections; n++) {
      const code = `EXPO-6/7-S-${n}`;
      shelves.push({
        id: code,
        code,
        badge: `S${n}`,
        x: depthFromWall / 2 + 0.04,
        z: z0 + (n - 0.5) * secLen,
        w: depthFromWall,
        d: secLen - 0.04,
        level: n,
        row: "left",
      });
    }
  }

  // DILED 15/16 tunelis — A prie sienos, B vidus, praėjimas tarp jų
  {
    const entranceGap = 1.6; // įėjimas iš aisle prie 15
    const zTunnel0 = z0 + entranceGap;
    const span = z1 - zTunnel0;
    const secLen = span / sections;
    const tunnelDepth = 0.45;
    const passage = 1.25;
    const xWall = ROOM_L - tunnelDepth / 2 - 0.05;
    const xInner = xWall - tunnelDepth - passage;

    for (let n = 1; n <= sections; n++) {
      const z = zTunnel0 + (n - 0.5) * secLen;
      const d = secLen - 0.04;
      shelves.push({
        id: `DILED-15/16-A-${n}`,
        code: `DILED-15/16-A-${n}`,
        badge: `A${n}`,
        x: xWall,
        z,
        w: tunnelDepth,
        d,
        level: n,
        row: "tunnelA",
      });
      shelves.push({
        id: `DILED-15/16-B-${n}`,
        code: `DILED-15/16-B-${n}`,
        badge: `B${n}`,
        x: xInner,
        z,
        w: tunnelDepth,
        d,
        level: n,
        row: "tunnelB",
      });
    }
  }

  // DILED 16 & 17 — smulkūs stelažai VIDUJE prie sienos, 1 aukštas (grindys)
  {
    const layout = getRackLayout();
    const slotsPerRack = 2;
    const innerDepth = 0.36;
    let idx = 1;
    for (const rackNum of [16, 17] as const) {
      const box = layout.find((b) => b.rack === rackNum);
      if (!box) continue;
      const slotW = (box.w - 0.14) / slotsPerRack;
      // Apatinė siena: siena už stelažo (+Z), praėjimas į centrą (-Z)
      const backZ = box.z + box.d / 2 - innerDepth / 2 - 0.05;
      for (let s = 0; s < slotsPerRack; s++) {
        const code = `DILED-16/17-A-${idx}`;
        const offsetX = (s - (slotsPerRack - 1) / 2) * slotW;
        shelves.push({
          id: code,
          code,
          badge: `m${idx}`,
          x: box.x + offsetX,
          z: backZ,
          w: slotW - 0.04,
          d: innerDepth,
          level: 1,
          row: "inside1617",
        });
        idx++;
      }
    }
  }

  return shelves;
}

export const ROOM = {
  length: ROOM_L,
  width: ROOM_W,
  depth: DEPTH,
  doorWidth: DOOR_W,
  margin: MARGIN,
  rightTunnelReserve: RIGHT_TUNNEL_RESERVE,
};
