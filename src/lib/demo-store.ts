"use client";

import { v4 as uuid } from "uuid";
import { buildLocations, BAY_DEPTH_M, locationCode, ROOM, zoneAtFloorPoint, zoneForRack } from "./locations";
import type {
  AppState,
  Defect,
  FloorArea,
  Handover,
  Order,
  ParsedDocument,
  Shipment,
  Unit,
  UnitStatus,
  Zone,
} from "./types";

const KEY = "sandelio-wms-v1";

function empty(): AppState {
  return {
    locations: buildLocations(),
    orders: [],
    shipments: [],
    units: [],
    defects: [],
    handovers: [],
    floorAreas: [],
  };
}

function migrateUnit(u: Unit): Unit {
  const span = u.slotSpan ?? "full";
  const half = u.slotHalf ?? null;
  // Migrate old half/full → approximate footprint if missing
  let footprintW = u.footprintW ?? null;
  let footprintD = u.footprintD ?? null;
  let footprintOffsetX = u.footprintOffsetX ?? null;
  let footprintOffsetZ = u.footprintOffsetZ ?? null;
  if (footprintW == null && u.locationId) {
    if (span === "half") {
      footprintW = 0.55;
      footprintD = BAY_DEPTH_M * 0.85;
      footprintOffsetX = half === "R" ? 0.35 : -0.35;
      footprintOffsetZ = 0;
    } else {
      footprintW = 1.1;
      footprintD = BAY_DEPTH_M;
      footprintOffsetX = 0;
      footprintOffsetZ = 0;
    }
  }
  if (footprintD != null && footprintD >= 1.15 && footprintD <= 1.25) {
    footprintD = BAY_DEPTH_M;
  }
  return {
    ...u,
    occupiesEntireRack: u.occupiesEntireRack ?? false,
    floorAreaId: u.floorAreaId ?? null,
    slotSpan: span,
    slotHalf: half,
    footprintW,
    footprintD,
    footprintOffsetX,
    footprintOffsetZ: footprintOffsetZ ?? 0,
    previousLocationId: u.previousLocationId ?? null,
    previousFloorAreaId: u.previousFloorAreaId ?? null,
  };
}

/** Skirtingos vietos tame pačiame aukšte — atskiri unitai (ne sujungti). */
function unitPlacementKey(u: Unit): string {
  const ox = Math.round((u.footprintOffsetX ?? 0) * 20) / 20;
  const oz = Math.round((u.footprintOffsetZ ?? 0) * 20) / 20;
  return `${u.locationId ?? ""}|${u.floorAreaId ?? ""}|${u.status}|${ox}|${oz}`;
}

/** Seniau kiekviena dėžė kūrė atskirą unit — sujungiam tik tikras dublikatus toje pačioje vietoje. */
function consolidateDuplicatePlacedUnits(state: AppState): AppState {
  const byOrder = new Map<string, Unit[]>();
  for (const u of state.units) {
    if (u.status === "archived" || u.status === "issued") continue;
    if (!u.locationId && !u.floorAreaId) continue;
    const list = byOrder.get(u.orderId) ?? [];
    list.push(u);
    byOrder.set(u.orderId, list);
  }

  const removeIds = new Set<string>();
  const patch = new Map<string, Partial<Unit>>();

  for (const [, group] of byOrder) {
    if (group.length <= 1) continue;

    const byLoc = new Map<string, Unit[]>();
    for (const u of group) {
      const key = unitPlacementKey(u);
      const list = byLoc.get(key) ?? [];
      list.push(u);
      byLoc.set(key, list);
    }

    for (const [, locGroup] of byLoc) {
      if (locGroup.length <= 1) continue;
      const sorted = [...locGroup].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      const keep = sorted[0];
      const total = Math.max(
        sorted.reduce((max, u) => Math.max(max, u.totalInSet ?? 1), 0),
        sorted.length,
      );
      patch.set(keep.id, { totalInSet: total, indexInSet: 1 });
      for (let i = 1; i < sorted.length; i++) removeIds.add(sorted[i].id);
    }
  }

  if (removeIds.size === 0 && patch.size === 0) return state;

  return {
    ...state,
    units: state.units
      .filter((u) => !removeIds.has(u.id))
      .map((u) => {
        const p = patch.get(u.id);
        return p ? { ...u, ...p } : u;
      }),
  };
}

const KNOWN_RESTORE_LOCATIONS: Record<string, string> = {
  "BJ-1958": "LONG-12-K-3",
};

function parseLocationCodeFromText(
  state: AppState,
  text: string,
): string | null {
  const upper = text.toUpperCase();
  const codeMatch = upper.match(
    /\b((?:EXPO|LONG|DILED)-\d+-[KD]-\d+)\b/,
  );
  if (codeMatch) {
    const found = state.locations.find((l) => l.code === codeMatch[1]);
    if (found) return found.id;
  }
  const human = upper.match(
    /(?:LONG|EXPO|DILED)\s*(\d+)\s*([KD])\s*(?:AUKŠTAS|AUKSTAS|L)\s*(\d+)/,
  );
  if (human) {
    const zone = upper.includes("LONG")
      ? "LONG"
      : upper.includes("DILED")
        ? "DILED"
        : "EXPO";
    const code = `${zone}-${human[1]}-${human[2]}-${human[3]}`;
    const found = state.locations.find((l) => l.code === code);
    if (found) return found.id;
  }
  return null;
}

function restoreStagedUnits(state: AppState): AppState {
  const stagingIds = new Set(
    state.locations.filter((l) => l.zone === "STAGING").map((l) => l.id),
  );
  if (!stagingIds.size) return state;

  let changed = false;
  const units = state.units.map((u) => {
    if (u.status !== "staged" && !stagingIds.has(u.locationId ?? "")) return u;
    if (!stagingIds.has(u.locationId ?? "") && u.status !== "staged") return u;

    let targetId = u.previousLocationId ?? null;
    if (!targetId) {
      const order = state.orders.find((o) => o.id === u.orderId);
      const blob = [
        order?.notes,
        order?.orderCode,
        u.notes,
        ...(order?.customFields?.map((f) => f.value) ?? []),
      ]
        .filter(Boolean)
        .join("\n");
      targetId = parseLocationCodeFromText(state, blob);
      if (!targetId && order?.orderCode) {
        const code = KNOWN_RESTORE_LOCATIONS[order.orderCode.trim().toUpperCase()];
        if (code) {
          targetId = state.locations.find((l) => l.code === code)?.id ?? null;
        }
      }
    }

    if (!targetId || stagingIds.has(targetId)) return u;
    changed = true;
    return {
      ...u,
      locationId: targetId,
      previousLocationId: null,
      status: "stored" as UnitStatus,
      updatedAt: new Date().toISOString(),
    };
  });

  return changed ? { ...state, units } : state;
}

function purgeSeedFloorAreas(state: AppState): AppState {
  const seedIds = new Set(
    state.floorAreas
      .filter((f) => f.notes?.startsWith("seed"))
      .map((f) => f.id),
  );
  if (seedIds.size === 0) return state;
  return {
    ...state,
    floorAreas: state.floorAreas.filter((f) => !seedIds.has(f.id)),
    units: state.units.map((u) =>
      u.floorAreaId && seedIds.has(u.floorAreaId)
        ? {
            ...u,
            floorAreaId: null,
            updatedAt: new Date().toISOString(),
          }
        : u,
    ),
  };
}

function mergeMissingLocations(state: AppState): AppState {
  const seed = buildLocations();
  const existing = new Set(state.locations.map((l) => l.id));
  const missing = seed.filter((l) => !existing.has(l.id));
  if (missing.length === 0) return state;
  return { ...state, locations: [...state.locations, ...missing] };
}

function extractAttachmentStoragePath(url: string): string | null {
  const bucket = "wms-attachments";
  const marker = `/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx >= 0) return url.slice(idx + marker.length).split("?")[0] ?? null;
  const publicMarker = `/object/public/${bucket}/`;
  const pubIdx = url.indexOf(publicMarker);
  if (pubIdx >= 0)
    return url.slice(pubIdx + publicMarker.length).split("?")[0] ?? null;
  return null;
}

function migrateRackLevelUnits(state: AppState): AppState {
  const noLevel3 = new Set([1, 9, 10]);
  let changed = false;
  let units = state.units.map((u) => {
    if (!u.locationId) return u;
    const loc = state.locations.find((l) => l.id === u.locationId);
    if (!loc?.rack || !noLevel3.has(loc.rack) || loc.level !== 3) return u;
    const side = loc.side ?? "K";
    const newCode = locationCode(loc.rack, side, 2);
    const newLoc = state.locations.find(
      (l) => l.code === newCode || l.id === newCode,
    );
    if (!newLoc) return u;
    changed = true;
    return {
      ...u,
      locationId: newLoc.id,
      updatedAt: new Date().toISOString(),
    };
  });

  units = units.map((u) => {
    if (!u.locationId) return u;
    const loc = state.locations.find((l) => l.id === u.locationId);
    if (loc?.rack !== 13 || loc.level !== 3) return u;
    const side = loc.side ?? "K";
    const zone = zoneForRack(13);
    const newCode = `${zone}-13-${side}-2`;
    const newLoc = state.locations.find(
      (l) => l.code === newCode || l.id === newCode,
    );
    if (!newLoc) return u;
    changed = true;
    return {
      ...u,
      locationId: newLoc.id,
      updatedAt: new Date().toISOString(),
    };
  });

  units = units.map((u) => {
    if (!u.locationId) return u;
    const loc = state.locations.find((l) => l.id === u.locationId);
    if (loc?.rack !== 12 || loc.level !== 2) return u;
    const order = state.orders.find((o) => o.id === u.orderId);
    const blob = `${order?.project ?? ""} ${order?.client ?? ""} ${u.labelTitle ?? ""}`.toLowerCase();
    if (!/donatas|sira|sofa/.test(blob)) return u;
    const side = loc.side ?? "K";
    const l3Code = locationCode(12, side, 3);
    const l3Loc = state.locations.find(
      (l) => l.code === l3Code || l.id === l3Code,
    );
    if (!l3Loc) return u;
    const occupied = state.units.some(
      (other) =>
        other.id !== u.id &&
        other.locationId === l3Loc.id &&
        !["issued", "archived"].includes(other.status),
    );
    if (occupied) return u;
    changed = true;
    return {
      ...u,
      locationId: l3Loc.id,
      updatedAt: new Date().toISOString(),
    };
  });

  if (!changed) return state;
  return { ...state, units };
}

function migrateShipmentAttachments(state: AppState): AppState {
  const shipments = state.shipments.map((s) => {
    if (s.attachmentStoragePath || !s.attachmentUrl) return s;
    const path = extractAttachmentStoragePath(s.attachmentUrl);
    if (!path) return s;
    return { ...s, attachmentStoragePath: path };
  });
  if (shipments === state.shipments) return state;
  return { ...state, shipments };
}

function pruneEmptyFloorAreas(state: AppState): AppState {
  const occupied = new Set(
    state.units
      .filter(
        (u) =>
          u.floorAreaId &&
          ["stored", "received", "staged"].includes(u.status),
      )
      .map((u) => u.floorAreaId as string),
  );
  const floorAreas = state.floorAreas.filter((f) => occupied.has(f.id));
  if (floorAreas.length === state.floorAreas.length) return state;
  return { ...state, floorAreas };
}

function applyDataMigrations(state: AppState): AppState {
  let s = state;
  s = mergeMissingLocations(s);
  s = restoreStagedUnits(s);
  s = consolidateDuplicatePlacedUnits(s);
  s = purgeSeedFloorAreas(s);
  s = migrateShipmentAttachments(s);
  s = migrateRackLevelUnits(s);
  s = pruneEmptyFloorAreas(s);
  return s;
}

/** Nenaudojamos demo grindų zonos — tik tuščias sąrašas. */
export function defaultFloorAreas(): FloorArea[] {
  return [];
}

export function normalizeState(state: AppState): AppState {
  const parsed: AppState = {
    ...state,
    locations: state.locations?.length ? state.locations : buildLocations(),
    orders: state.orders ?? [],
    shipments: state.shipments ?? [],
    units: (state.units ?? []).map(migrateUnit),
    defects: state.defects ?? [],
    handovers: state.handovers ?? [],
    floorAreas: state.floorAreas ?? [],
  };
  return applyDataMigrations(parsed);
}

export function loadState(): AppState {
  if (typeof window === "undefined") return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return empty();
    }
    let parsed = JSON.parse(raw) as AppState;
    parsed = normalizeState(parsed);
    parsed.orders = parsed.orders.map((o) => ({
      ...o,
      qrToken:
        o.qrToken ??
        uuid().replace(/-/g, "").slice(0, 16),
    }));
    try {
      localStorage.setItem(KEY, JSON.stringify(parsed));
    } catch {
      /* ignore */
    }
    return parsed;
  } catch {
    return empty();
  }
}

export function saveState(state: AppState) {
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new Event("wms-updated"));
  if (typeof window !== "undefined") {
    void import("./wms-sync").then((m) => {
      m.markLocalDirty();
      m.scheduleWmsSync(state);
    });
  }
}

export function subscribeWms(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener("wms-updated", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("wms-updated", handler);
    window.removeEventListener("storage", handler);
  };
}

export type PlaceOpts = {
  locationId?: string | null;
  occupiesEntireRack?: boolean;
  floorAreaId?: string | null;
  slotSpan?: "full" | "half";
  slotHalf?: "L" | "R" | null;
  footprintW?: number | null;
  footprintD?: number | null;
  footprintOffsetX?: number | null;
  footprintOffsetZ?: number | null;
  /** Jei true — statusas stored ir vieta priskiriama iškart */
  placeNow?: boolean;
};

export function createOrderFromParsed(
  state: AppState,
  doc: ParsedDocument,
  colli: number,
  documentName: string,
  place?: PlaceOpts,
): AppState {
  const now = new Date().toISOString();
  const order: Order = {
    id: uuid(),
    orderCode: doc.orderCode || "",
    project: doc.project || "",
    client: doc.client || "",
    zone: doc.zone ?? null,
    notes: doc.notes || "",
    blockStorage: /dubai/i.test(doc.project || "") || !!place?.occupiesEntireRack,
    status: "active",
    customFields: doc.customFields?.length ? doc.customFields : undefined,
    qrToken: uuid().replace(/-/g, "").slice(0, 16),
    createdAt: now,
    updatedAt: now,
  };

  const shipment: Shipment = {
    id: uuid(),
    orderId: order.id,
    status: place?.placeNow ? "arrived" : "expected",
    carrier: "",
    expectedAt: null,
    arrivedAt: place?.placeNow ? now : null,
    palletCount: null,
    boxCount: colli,
    notes: "",
    documentName,
    parsedJson: doc,
    customFields: doc.customFields?.length ? doc.customFields : undefined,
    createdAt: now,
  };

  const locId = place?.locationId ?? null;
  const floorId = place?.floorAreaId ?? null;
  const placeNow = !!(place?.placeNow && (locId || floorId));
  const occupyAll = !!place?.occupiesEntireRack;
  const span = place?.slotSpan ?? "full";
  const half = span === "half" ? (place?.slotHalf ?? "L") : null;
  const fpW =
    place?.footprintW ??
    (occupyAll ? null : span === "half" ? 0.55 : 1.1);
  const fpD = place?.footprintD ?? (occupyAll ? null : BAY_DEPTH_M);
  const fpX =
    place?.footprintOffsetX ??
    (occupyAll ? null : span === "half" ? (half === "R" ? 0.35 : -0.35) : 0);
  const fpZ = place?.footprintOffsetZ ?? (occupyAll ? null : 0);

  const units: Unit[] = [
    {
      id: uuid(),
      orderId: order.id,
      shipmentId: shipment.id,
      locationId: placeNow && locId ? locId : null,
      occupiesEntireRack: occupyAll,
      slotSpan: occupyAll ? "full" : span,
      slotHalf: occupyAll ? null : half,
      footprintW: occupyAll ? null : fpW,
      footprintD: occupyAll ? null : fpD,
      footprintOffsetX: occupyAll ? null : fpX,
      footprintOffsetZ: occupyAll ? null : fpZ,
      floorAreaId: placeNow && floorId ? floorId : null,
      kind: "box" as const,
      indexInSet: 1,
      totalInSet: Math.max(1, colli),
      qrToken: uuid().replace(/-/g, "").slice(0, 16),
      labelTitle: doc.project || doc.orderCode || doc.client || "Siunta",
      status: (placeNow ? "stored" : "expected") as UnitStatus,
      notes: doc.lines.map((l) => `${l.name} ×${l.qty}`).join("; "),
      createdAt: now,
      updatedAt: now,
    },
  ];

  let floorAreas = state.floorAreas;
  if (placeNow && floorId) {
    floorAreas = floorAreas.map((f) =>
      f.id === floorId ? { ...f, orderId: order.id } : f,
    );
  }

  const next = {
    ...state,
    orders: [order, ...state.orders],
    shipments: [shipment, ...state.shipments],
    units: [...units, ...state.units],
    floorAreas,
  };
  saveState(next);
  return next;
}

/** Laukiamas atvykimas — be užsakymo, tik užrašas + optional PDF (prie lenta) */
export function createExpectedArrival(
  state: AppState,
  data: {
    title: string;
    notes?: string;
    expectedAt?: string | null;
    carrier?: string;
    attachmentName?: string | null;
    attachmentDataUrl?: string | null;
    attachmentUrl?: string | null;
    attachmentStoragePath?: string | null;
  },
): AppState {
  const now = new Date().toISOString();
  const shipment: Shipment = {
    id: uuid(),
    orderId: null,
    status: "expected",
    carrier: data.carrier?.trim() || "",
    expectedAt: data.expectedAt || null,
    arrivedAt: null,
    palletCount: null,
    boxCount: null,
    notes: [data.title.trim(), data.notes?.trim()].filter(Boolean).join("\n"),
    documentName: data.attachmentName || null,
    parsedJson: {
      source: "incoming",
      orderCode: "",
      project: data.title.trim(),
      client: "",
      lines: [],
      colliHint: null,
      notes: data.notes?.trim() || "",
      confidence: 1,
    },
    attachmentDataUrl: data.attachmentDataUrl || null,
    attachmentUrl: data.attachmentUrl || null,
    attachmentStoragePath: data.attachmentStoragePath || null,
    createdAt: now,
  };
  const next = {
    ...state,
    shipments: [shipment, ...state.shipments],
  };
  saveState(next);
  return next;
}

/** Pašalinti laukiamą atvykimą (be susietų dėžių) */
export function deleteExpectedArrival(
  state: AppState,
  shipmentId: string,
): AppState {
  const shipment = state.shipments.find((s) => s.id === shipmentId);
  if (!shipment || shipment.status !== "expected") return state;
  const hasUnits = state.units.some((u) => u.shipmentId === shipmentId);
  if (hasUnits) return state;
  const next = {
    ...state,
    shipments: state.shipments.filter((s) => s.id !== shipmentId),
  };
  saveState(next);
  return next;
}

/** Pažymėti, kad atvyko, bet niekur nepriskirta (be pilnos registracijos) */
export function markExpectedArrivalReceived(
  state: AppState,
  shipmentId: string,
): AppState {
  const shipment = state.shipments.find((s) => s.id === shipmentId);
  if (!shipment || shipment.status !== "expected") return state;
  const now = new Date().toISOString();
  const next = {
    ...state,
    shipments: state.shipments.map((s) =>
      s.id === shipmentId
        ? { ...s, status: "arrived" as const, arrivedAt: now }
        : s,
    ),
  };
  saveState(next);
  return next;
}

/** Uždaryti laukiamą „Atkeliauja“ įrašą po pilnos registracijos */
export function completeExpectedArrival(
  state: AppState,
  expectedShipmentId: string,
): AppState {
  const now = new Date().toISOString();
  const next = {
    ...state,
    shipments: state.shipments.map((s) =>
      s.id === expectedShipmentId
        ? {
            ...s,
            status: "closed" as const,
            arrivedAt: now,
          }
        : s,
    ),
  };
  saveState(next);
  return next;
}

/** Perkelti priedą iš laukiamo atvykimo į naują siuntą */
export function copyIncomingAttachmentToShipment(
  state: AppState,
  fromShipmentId: string,
  toShipmentId: string,
): AppState {
  const src = state.shipments.find((s) => s.id === fromShipmentId);
  if (
    !src?.attachmentDataUrl &&
    !src?.attachmentUrl &&
    !src?.attachmentStoragePath
  )
    return state;
  const next = {
    ...state,
    shipments: state.shipments.map((s) =>
      s.id === toShipmentId
        ? {
            ...s,
            attachmentDataUrl: src.attachmentDataUrl,
            attachmentUrl: src.attachmentUrl,
            attachmentStoragePath: src.attachmentStoragePath,
            documentName: s.documentName || src.documentName,
          }
        : s,
    ),
  };
  saveState(next);
  return next;
}

export function setShipmentAttachment(
  state: AppState,
  shipmentId: string,
  data: {
    attachmentUrl?: string | null;
    attachmentStoragePath?: string | null;
    attachmentDataUrl?: string | null;
    documentName?: string | null;
  },
): AppState {
  const next = {
    ...state,
    shipments: state.shipments.map((s) =>
      s.id === shipmentId
        ? {
            ...s,
            attachmentUrl: data.attachmentUrl ?? s.attachmentUrl,
            attachmentStoragePath:
              data.attachmentStoragePath ?? s.attachmentStoragePath,
            attachmentDataUrl: data.attachmentDataUrl ?? s.attachmentDataUrl,
            documentName: data.documentName ?? s.documentName,
          }
        : s,
    ),
  };
  saveState(next);
  return next;
}

export function updateOrder(
  state: AppState,
  orderId: string,
  patch: Partial<
    Pick<
      Order,
      | "orderCode"
      | "project"
      | "client"
      | "zone"
      | "notes"
      | "blockStorage"
      | "customFields"
      | "notePhotoUrls"
    >
  >,
): AppState {
  const now = new Date().toISOString();
  const next = {
    ...state,
    orders: state.orders.map((o) =>
      o.id === orderId ? { ...o, ...patch, updatedAt: now } : o,
    ),
  };
  saveState(next);
  return next;
}

export function updateUnit(
  state: AppState,
  unitId: string,
  patch: Partial<Pick<Unit, "labelTitle" | "notes">>,
): AppState {
  const now = new Date().toISOString();
  const next = {
    ...state,
    units: state.units.map((u) =>
      u.id === unitId ? { ...u, ...patch, updatedAt: now } : u,
    ),
  };
  saveState(next);
  return next;
}

/** Greitas užsakymas be dokumento — iš stelažo / grindų */
export function createQuickOrder(
  state: AppState,
  data: {
    project: string;
    client?: string;
    orderCode?: string;
    notes?: string;
    zone?: Zone | null;
    locationId?: string | null;
    occupiesEntireRack?: boolean;
    floorAreaId?: string | null;
    slotSpan?: "full" | "half";
    slotHalf?: "L" | "R" | null;
    footprintW?: number | null;
    footprintD?: number | null;
    footprintOffsetX?: number | null;
    footprintOffsetZ?: number | null;
    colli?: number;
  },
): AppState {
  const doc: ParsedDocument = {
    source: "manual",
    orderCode: data.orderCode || "",
    project: data.project || "Be pavadinimo",
    client: data.client || "",
    lines: [],
    colliHint: data.colli ?? 1,
    notes: data.notes || "",
    confidence: 1,
    zone: data.zone ?? undefined,
  };
  return createOrderFromParsed(state, doc, data.colli ?? 1, "rankinis", {
    locationId: data.locationId,
    occupiesEntireRack: data.occupiesEntireRack,
    floorAreaId: data.floorAreaId,
    slotSpan: data.slotSpan,
    slotHalf: data.slotHalf,
    footprintW: data.footprintW,
    footprintD: data.footprintD,
    footprintOffsetX: data.footprintOffsetX,
    footprintOffsetZ: data.footprintOffsetZ,
    placeNow: !!(data.locationId || data.floorAreaId),
  });
}

function floorRectOverlap(
  ax: number,
  az: number,
  aw: number,
  ad: number,
  bx: number,
  bz: number,
  bw: number,
  bd: number,
): number {
  const overlapW =
    Math.min(ax + aw / 2, bx + bw / 2) - Math.max(ax - aw / 2, bx - bw / 2);
  const overlapD =
    Math.min(az + ad / 2, bz + bd / 2) - Math.max(az - ad / 2, bz - bd / 2);
  if (overlapW <= 0 || overlapD <= 0) return 0;
  return overlapW * overlapD;
}

/** Randa esamą grindų plotą, jei naujas stačiakampis daugiausia sutampa su senu. */
export function findOverlappingFloorArea(
  state: AppState,
  x: number,
  z: number,
  w: number,
  d: number,
): FloorArea | null {
  const draftArea = Math.max(0.01, w * d);
  let best: FloorArea | null = null;
  let bestRatio = 0;
  for (const f of state.floorAreas) {
    const overlap = floorRectOverlap(x, z, w, d, f.x, f.z, f.w, f.d);
    const ratio = overlap / Math.min(draftArea, f.w * f.d);
    if (ratio > 0.45 && ratio > bestRatio) {
      best = f;
      bestRatio = ratio;
    }
  }
  return best;
}

export function getOrCreateFloorAreaForDraft(
  state: AppState,
  draft: {
    x: number;
    z: number;
    w: number;
    d: number;
    label?: string;
    notes?: string;
  },
): { state: AppState; area: FloorArea } {
  const existing = findOverlappingFloorArea(
    state,
    draft.x,
    draft.z,
    draft.w,
    draft.d,
  );
  if (existing) {
    const label = draft.label?.trim();
    const notes = draft.notes?.trim();
    if (
      (label && label !== existing.label) ||
      (notes && notes !== existing.notes)
    ) {
      const next = updateFloorArea(state, existing.id, {
        label: label || existing.label,
        notes: notes || existing.notes,
      });
      const area = next.floorAreas.find((f) => f.id === existing.id)!;
      return { state: next, area };
    }
    return { state, area: existing };
  }

  const next = createFloorArea(state, {
    label: draft.label || "Ant grindų",
    x: draft.x,
    z: draft.z,
    w: draft.w,
    d: draft.d,
    notes: draft.notes || "",
  });
  return { state: next, area: next.floorAreas[0] };
}

export function createFloorArea(
  state: AppState,
  area: Omit<FloorArea, "id" | "createdAt" | "orderId"> & {
    orderId?: string | null;
  },
): AppState {
  const fa: FloorArea = {
    id: uuid(),
    label: area.label || "Ant grindų",
    x: area.x,
    z: area.z,
    w: Math.max(0.4, area.w),
    d: Math.max(0.4, area.d),
    notes: area.notes || "",
    orderId: area.orderId ?? null,
    createdAt: new Date().toISOString(),
  };
  const next = { ...state, floorAreas: [fa, ...state.floorAreas] };
  saveState(next);
  return next;
}

export function updateFloorArea(
  state: AppState,
  id: string,
  patch: Partial<Pick<FloorArea, "label" | "notes" | "orderId">>,
): AppState {
  const next = {
    ...state,
    floorAreas: state.floorAreas.map((f) =>
      f.id === id ? { ...f, ...patch } : f,
    ),
  };
  saveState(next);
  return next;
}

export function deleteFloorArea(state: AppState, id: string): AppState {
  const next = {
    ...state,
    floorAreas: state.floorAreas.filter((f) => f.id !== id),
    units: state.units.map((u) =>
      u.floorAreaId === id
        ? { ...u, floorAreaId: null, updatedAt: new Date().toISOString() }
        : u,
    ),
  };
  saveState(next);
  return next;
}

export function receiveShipment(
  state: AppState,
  shipmentId: string,
  data: {
    palletCount: number;
    boxCount: number;
    defectDescription?: string;
    defectPhoto?: string | null;
    extraBoxes?: number;
  },
): AppState {
  const now = new Date().toISOString();
  const shipments = state.shipments.map((s) =>
    s.id === shipmentId
      ? {
          ...s,
          status: "arrived" as const,
          arrivedAt: now,
          palletCount: data.palletCount,
          boxCount: data.boxCount,
        }
      : s,
  );

  let units = state.units.map((u) =>
    u.shipmentId === shipmentId && u.status === "expected"
      ? { ...u, status: "received" as UnitStatus, updatedAt: now, totalInSet: data.boxCount }
      : u,
  );

  const shipment = state.shipments.find((s) => s.id === shipmentId);
  const existing = units.filter((u) => u.shipmentId === shipmentId);
  const extra = data.extraBoxes ?? 0;
  if (shipment?.orderId && extra > 0) {
    const base = existing.length;
    const total = base + extra;
    const more: Unit[] = Array.from({ length: extra }, (_, i) => ({
      id: uuid(),
      orderId: shipment.orderId!,
      shipmentId,
      locationId: null,
      occupiesEntireRack: false,
      slotSpan: "full" as const,
      slotHalf: null,
      footprintW: null,
      footprintD: null,
      footprintOffsetX: null,
      footprintOffsetZ: null,
      floorAreaId: null,
      kind: "box" as const,
      indexInSet: base + i + 1,
      totalInSet: total,
      qrToken: uuid().replace(/-/g, "").slice(0, 16),
      labelTitle: existing[0]?.labelTitle || "Papildoma",
      status: "received" as UnitStatus,
      notes: "Papildoma dėžė",
      createdAt: now,
      updatedAt: now,
    }));
    units = [
      ...units.map((u) =>
        u.shipmentId === shipmentId ? { ...u, totalInSet: total } : u,
      ),
      ...more,
    ];
  }

  let defects = state.defects;
  if (data.defectDescription) {
    const d: Defect = {
      id: uuid(),
      unitId: null,
      shipmentId,
      description: data.defectDescription,
      photoDataUrl: data.defectPhoto ?? null,
      createdAt: now,
    };
    defects = [d, ...defects];
  }

  const next = { ...state, shipments, units, defects };
  saveState(next);
  return next;
}

export function placeUnit(
  state: AppState,
  unitId: string,
  locationId: string,
  opts?: {
    occupiesEntireRack?: boolean;
    slotSpan?: "full" | "half";
    slotHalf?: "L" | "R" | null;
    footprintW?: number | null;
    footprintD?: number | null;
    footprintOffsetX?: number | null;
    footprintOffsetZ?: number | null;
    notes?: string | null;
  },
): AppState {
  const now = new Date().toISOString();
  const span = opts?.slotSpan ?? "full";
  const noteText = opts?.notes?.trim();
  const next = {
    ...state,
    units: state.units.map((u) =>
      u.id === unitId
        ? {
            ...u,
            locationId,
            floorAreaId: null,
            occupiesEntireRack: opts?.occupiesEntireRack ?? u.occupiesEntireRack,
            slotSpan: opts?.occupiesEntireRack ? "full" : span,
            slotHalf:
              opts?.occupiesEntireRack || span === "full"
                ? null
                : (opts?.slotHalf ?? "L"),
            footprintW: opts?.footprintW ?? u.footprintW,
            footprintD: opts?.footprintD ?? u.footprintD,
            footprintOffsetX: opts?.footprintOffsetX ?? u.footprintOffsetX,
            footprintOffsetZ: opts?.footprintOffsetZ ?? u.footprintOffsetZ,
            notes: noteText || u.notes,
            status: "stored" as UnitStatus,
            updatedAt: now,
          }
        : u,
    ),
  };
  saveState(next);
  return next;
}

export function placeUnitOnFloor(
  state: AppState,
  unitId: string,
  floorAreaId: string,
  opts?: { notes?: string | null },
): AppState {
  const now = new Date().toISOString();
  const unit = state.units.find((u) => u.id === unitId);
  const noteText = opts?.notes?.trim();
  const next = {
    ...state,
    units: state.units.map((u) =>
      u.id === unitId
        ? {
            ...u,
            locationId: null,
            floorAreaId,
            occupiesEntireRack: false,
            slotSpan: "full" as const,
            slotHalf: null,
            footprintW: null,
            footprintD: null,
            footprintOffsetX: null,
            footprintOffsetZ: null,
            notes: noteText || u.notes,
            status: "stored" as UnitStatus,
            updatedAt: now,
          }
        : u,
    ),
    floorAreas: state.floorAreas.map((f) =>
      f.id === floorAreaId
        ? { ...f, orderId: unit?.orderId ?? f.orderId }
        : f,
    ),
  };
  saveState(next);
  return next;
}

/** Priskiria esamą užsakymą pažymėtai vietai ant sijos (naujas arba laisvas unitas). */
export function assignOrderToShelf(
  state: AppState,
  orderId: string,
  opts: {
    assignMode: "new" | "move";
    unitId?: string;
    locationId: string;
    footprintW: number;
    footprintD: number;
    footprintOffsetX?: number | null;
    footprintOffsetZ?: number | null;
    notes?: string | null;
  },
): AppState {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return state;
  const now = new Date().toISOString();
  const orderUnits = state.units.filter(
    (u) =>
      u.orderId === orderId &&
      u.status !== "issued" &&
      u.status !== "archived",
  );
  const fw = opts.footprintW;
  const fd = opts.footprintD;
  const fpX = opts.footprintOffsetX ?? 0;
  const fpZ = opts.footprintOffsetZ ?? 0;
  const span = fw < 0.75 ? ("half" as const) : ("full" as const);
  const noteText = opts.notes?.trim() ?? "";

  if (opts.assignMode === "move") {
    if (!opts.unitId) return state;
    const moving = state.units.find((u) => u.id === opts.unitId);
    if (!moving || moving.orderId !== orderId) return state;
    return placeUnit(state, opts.unitId, opts.locationId, {
      footprintW: fw,
      footprintD: fd,
      footprintOffsetX: fpX,
      footprintOffsetZ: fpZ,
      slotSpan: span,
      slotHalf: span === "half" ? (fpX < 0 ? "L" : "R") : null,
      notes: noteText || null,
    });
  }

  const shipment =
    state.shipments.find((s) => s.orderId === orderId) ?? null;
  const idx = orderUnits.length + 1;
  const unit: Unit = {
    id: uuid(),
    orderId,
    shipmentId: shipment?.id ?? null,
    locationId: opts.locationId,
    occupiesEntireRack: false,
    slotSpan: span,
    slotHalf: span === "half" ? (fpX < 0 ? "L" : "R") : null,
    footprintW: fw,
    footprintD: fd,
    footprintOffsetX: fpX,
    footprintOffsetZ: fpZ,
    floorAreaId: null,
    kind: "box",
    indexInSet: idx,
    totalInSet: idx,
    qrToken: uuid().replace(/-/g, "").slice(0, 16),
    labelTitle: order.project || order.orderCode || "Siunta",
    status: "stored",
    notes: noteText,
    createdAt: now,
    updatedAt: now,
  };
  const next = {
    ...state,
    units: [
      ...state.units.map((u) =>
        u.orderId === orderId ? { ...u, totalInSet: idx } : u,
      ),
      unit,
    ],
  };
  saveState(next);
  return next;
}

/** Priskiria esamą užsakymą plotui ant grindų. */
export function assignOrderToFloor(
  state: AppState,
  orderId: string,
  floorAreaId: string,
  opts: {
    assignMode: "new" | "move";
    unitId?: string;
    notes?: string | null;
  },
): AppState {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return state;
  const now = new Date().toISOString();
  const noteText = opts.notes?.trim() ?? "";
  const orderUnits = state.units.filter(
    (u) =>
      u.orderId === orderId &&
      u.status !== "issued" &&
      u.status !== "archived",
  );

  if (opts.assignMode === "move") {
    if (!opts.unitId) return state;
    const moving = state.units.find((u) => u.id === opts.unitId);
    if (!moving || moving.orderId !== orderId) return state;
    return placeUnitOnFloor(state, opts.unitId, floorAreaId, {
      notes: noteText || null,
    });
  }

  const shipment =
    state.shipments.find((s) => s.orderId === orderId) ?? null;
  const idx = orderUnits.length + 1;
  const unit: Unit = {
    id: uuid(),
    orderId,
    shipmentId: shipment?.id ?? null,
    locationId: null,
    occupiesEntireRack: false,
    slotSpan: "full",
    slotHalf: null,
    footprintW: null,
    footprintD: null,
    footprintOffsetX: null,
    footprintOffsetZ: null,
    floorAreaId,
    kind: "box",
    indexInSet: idx,
    totalInSet: idx,
    qrToken: uuid().replace(/-/g, "").slice(0, 16),
    labelTitle: order.project || order.orderCode || "Siunta",
    status: "stored",
    notes: noteText,
    createdAt: now,
    updatedAt: now,
  };
  const next = {
    ...state,
    units: [
      ...state.units.map((u) =>
        u.orderId === orderId ? { ...u, totalInSet: idx } : u,
      ),
      unit,
    ],
    floorAreas: state.floorAreas.map((f) =>
      f.id === floorAreaId ? { ...f, orderId } : f,
    ),
  };
  saveState(next);
  return next;
}

export function stageOrder(state: AppState, orderId: string): AppState {
  const staging = state.locations.find((l) => l.zone === "STAGING");
  const now = new Date().toISOString();
  const next = {
    ...state,
    units: state.units.map((u) =>
      u.orderId === orderId && (u.status === "stored" || u.status === "received")
        ? {
            ...u,
            previousLocationId: u.locationId,
            locationId: staging?.id ?? u.locationId,
            status: "staged" as UnitStatus,
            updatedAt: now,
          }
        : u,
    ),
  };
  saveState(next);
  return next;
}

export function issueOrder(
  state: AppState,
  orderId: string,
  recipientName: string,
  notes: string,
): AppState {
  const now = new Date().toISOString();
  const orderUnits = state.units.filter(
    (u) =>
      u.orderId === orderId &&
      u.status !== "archived" &&
      u.status !== "issued",
  );
  const unitIds = orderUnits.map((u) => u.id);
  const unitPlacements = orderUnits.map((u) => ({
    unitId: u.id,
    locationId: u.locationId,
    floorAreaId: u.floorAreaId,
  }));

  const handover: Handover = {
    id: uuid(),
    orderId,
    recipientName,
    notes,
    unitIds,
    unitPlacements,
    issuedAt: now,
  };

  const next = pruneEmptyFloorAreas({
    ...state,
    units: state.units.map((u) =>
      unitIds.includes(u.id)
        ? {
            ...u,
            previousLocationId: u.locationId,
            previousFloorAreaId: u.floorAreaId,
            locationId: null,
            floorAreaId: null,
            status: "issued" as UnitStatus,
            updatedAt: now,
          }
        : u,
    ),
    orders: state.orders.map((o) =>
      o.id === orderId
        ? { ...o, status: "archived" as const, updatedAt: now }
        : o,
    ),
    handovers: [handover, ...state.handovers],
  });
  saveState(next);
  return next;
}

/** Viena dėžė — klientas atsiėmė (iš žemėlapio ar QR). */
export function issueUnitToClient(
  state: AppState,
  unitId: string,
  recipientName: string,
): AppState | null {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit || unit.status === "issued" || unit.status === "archived") {
    return null;
  }

  const now = new Date().toISOString();
  const loc = state.locations.find((l) => l.id === unit.locationId);
  const placement = {
    unitId: unit.id,
    locationId: unit.locationId,
    floorAreaId: unit.floorAreaId,
  };

  const handover: Handover = {
    id: uuid(),
    orderId: unit.orderId,
    recipientName,
    notes: loc ? `Vieta ${loc.code}` : "",
    unitIds: [unit.id],
    unitPlacements: [placement],
    issuedAt: now,
  };

  const units = state.units.map((u) =>
    u.id === unit.id
      ? {
          ...u,
          previousLocationId: u.locationId,
          previousFloorAreaId: u.floorAreaId,
          locationId: null,
          floorAreaId: null,
          status: "issued" as UnitStatus,
          updatedAt: now,
        }
      : u,
  );

  const orderStillActive = units.some(
    (u) =>
      u.orderId === unit.orderId &&
      u.id !== unit.id &&
      u.status !== "archived" &&
      u.status !== "issued",
  );

  const next = pruneEmptyFloorAreas({
    ...state,
    units,
    orders: orderStillActive
      ? state.orders
      : state.orders.map((o) =>
          o.id === unit.orderId
            ? { ...o, status: "archived" as const, updatedAt: now }
            : o,
        ),
    handovers: [handover, ...state.handovers],
  });
  saveState(next);
  return next;
}

/** Grąžina archyvuotą užsakymą į sandėlį su buvusiomis vietomis. */
export function restoreOrderFromArchive(
  state: AppState,
  orderId: string,
): AppState {
  const now = new Date().toISOString();
  const handover = state.handovers.find((h) => h.orderId === orderId);
  const placements = new Map(
    (handover?.unitPlacements ?? []).map((p) => [p.unitId, p]),
  );

  const units = state.units.map((u) => {
    if (u.orderId !== orderId) return u;
    if (u.status !== "issued" && u.status !== "archived") return u;
    const snap = placements.get(u.id);
    const locationId =
      snap?.locationId ?? u.previousLocationId ?? u.locationId ?? null;
    const floorAreaId =
      snap?.floorAreaId ?? u.previousFloorAreaId ?? u.floorAreaId ?? null;
    return {
      ...u,
      locationId,
      floorAreaId,
      previousLocationId: null,
      previousFloorAreaId: null,
      status: (locationId || floorAreaId ? "stored" : "received") as UnitStatus,
      updatedAt: now,
    };
  });

  const next = {
    ...state,
    orders: state.orders.map((o) =>
      o.id === orderId ? { ...o, status: "active" as const, updatedAt: now } : o,
    ),
    units,
    handovers: state.handovers.filter((h) => h.orderId !== orderId),
  };
  saveState(next);
  return next;
}

/** Pažymėti vieną dėžę išvykusią per QR — atlaisvina vietą, archyvuoja užsakymą jei paskutinė */
export function issueUnitFromQr(
  state: AppState,
  qrToken: string,
): AppState | null {
  const unit = state.units.find((u) => u.qrToken === qrToken);
  if (!unit || unit.status === "issued" || unit.status === "archived") {
    return null;
  }

  const now = new Date().toISOString();
  const loc = state.locations.find((l) => l.id === unit.locationId);

  const handover: Handover = {
    id: uuid(),
    orderId: unit.orderId,
    recipientName: "QR atsiėmimas",
    notes: loc ? `Vieta ${loc.code}` : "",
    unitIds: [unit.id],
    unitPlacements: [
      {
        unitId: unit.id,
        locationId: unit.locationId,
        floorAreaId: unit.floorAreaId,
      },
    ],
    issuedAt: now,
  };

  const units = state.units.map((u) =>
    u.id === unit.id
      ? {
          ...u,
          previousLocationId: u.locationId,
          previousFloorAreaId: u.floorAreaId,
          locationId: null,
          floorAreaId: null,
          status: "issued" as UnitStatus,
          updatedAt: now,
        }
      : u,
  );

  const orderStillActive = units.some(
    (u) =>
      u.orderId === unit.orderId &&
      u.id !== unit.id &&
      u.status !== "archived" &&
      u.status !== "issued",
  );

  const next = pruneEmptyFloorAreas({
    ...state,
    units,
    orders: orderStillActive
      ? state.orders
      : state.orders.map((o) =>
          o.id === unit.orderId
            ? { ...o, status: "archived" as const, updatedAt: now }
            : o,
        ),
    handovers: [handover, ...state.handovers],
  });
  saveState(next);
  return next;
}

export function searchOrders(state: AppState, q: string): Order[] {
  const s = q.trim().toLowerCase();
  if (!s) return state.orders.filter((o) => o.status === "active");
  return state.orders.filter((o) => {
    const blob = `${o.orderCode} ${o.project} ${o.client} ${o.notes}`.toLowerCase();
    return blob.includes(s);
  });
}

export function occupancyByRack(state: AppState): Record<number, number> {
  const map: Record<number, number> = {};
  for (const u of state.units) {
    if (!u.locationId || u.status === "issued" || u.status === "archived") continue;
    const loc = state.locations.find((l) => l.id === u.locationId);
    if (loc?.rack) map[loc.rack] = (map[loc.rack] || 0) + 1;
  }
  return map;
}

const ACTIVE: UnitStatus[] = ["stored", "received", "staged", "expected"];

/** 0 = free, 0.5 = one half, 1 = full (arba 2 halves / full span) */
export function slotFillAmount(state: AppState): Map<string, number> {
  const map = new Map<string, number>();
  for (const loc of state.locations) {
    map.set(loc.code, 0);
    map.set(loc.id, 0);
  }
  for (const u of state.units) {
    if (!ACTIVE.includes(u.status)) continue;
    if (u.status === "issued" || u.status === "archived") continue;

    if (u.occupiesEntireRack && u.locationId) {
      const anchor = state.locations.find((l) => l.id === u.locationId);
      if (anchor?.rack != null) {
        for (const loc of state.locations) {
          if (loc.rack === anchor.rack && loc.kind === "pallet") {
            map.set(loc.code, 1);
            map.set(loc.id, 1);
          }
        }
      }
      continue;
    }

    if (!u.locationId) continue;
    const loc = state.locations.find((l) => l.id === u.locationId);
    if (!loc) continue;
    const add =
      u.footprintW && u.footprintW > 0
        ? Math.min(1, u.footprintW / 1.1)
        : u.slotSpan === "half"
          ? 0.5
          : 1;
    const cur = map.get(loc.code) ?? 0;
    const next = Math.min(1, cur + add);
    map.set(loc.code, next);
    map.set(loc.id, next);
  }
  return map;
}

/** location code/id → occupied (pilnai arba bent puse) */
export function slotOccupancy(state: AppState): Map<string, boolean> {
  const fill = slotFillAmount(state);
  const map = new Map<string, boolean>();
  for (const [k, v] of fill) map.set(k, v > 0);
  return map;
}

/** Kuri half'ai užimti konkrečioje vietoje */
export function slotHalfOccupancy(
  state: AppState,
  codeOrId: string,
): { L: boolean; R: boolean; full: boolean } {
  const loc = state.locations.find(
    (l) => l.code === codeOrId || l.id === codeOrId,
  );
  if (!loc) return { L: false, R: false, full: false };
  const units = unitsAtLocation(state, loc.id).filter(
    (u) => !u.occupiesEntireRack,
  );
  let L = false;
  let R = false;
  let full = false;
  for (const u of units) {
    if (u.slotSpan !== "half") {
      full = true;
      L = true;
      R = true;
    } else if (u.slotHalf === "R") R = true;
    else L = true;
  }
  if (rackFullyOccupiedByUnit(state).get(loc.rack ?? -1)) {
    return { L: true, R: true, full: true };
  }
  return { L, R, full };
}

export type RackFill = "empty" | "partial" | "full";

/** Ar stelažą pilnai užima vienas (ar daugiau) „visa stelažas“ unitas */
export function rackFullyOccupiedByUnit(state: AppState): Map<number, boolean> {
  const map = new Map<number, boolean>();
  for (const u of state.units) {
    if (!u.occupiesEntireRack || !u.locationId) continue;
    if (!ACTIVE.includes(u.status)) continue;
    const loc = state.locations.find((l) => l.id === u.locationId);
    if (loc?.rack != null) map.set(loc.rack, true);
  }
  return map;
}

export function rackFill(state: AppState): Map<number, RackFill> {
  const fillAmt = slotFillAmount(state);
  const whole = rackFullyOccupiedByUnit(state);
  const result = new Map<number, RackFill>();
  for (let rack = 1; rack <= 18; rack++) {
    if (whole.get(rack)) {
      result.set(rack, "full");
      continue;
    }
    const slots = state.locations.filter(
      (l) => l.rack === rack && l.kind === "pallet",
    );
    if (!slots.length) continue;
    let sum = 0;
    for (const s of slots) sum += fillAmt.get(s.code) ?? 0;
    if (sum === 0) result.set(rack, "empty");
    else if (sum >= slots.length) result.set(rack, "full");
    else result.set(rack, "partial");
  }
  return result;
}

export function unitsAtLocation(state: AppState, codeOrId: string): Unit[] {
  const loc = state.locations.find(
    (l) => l.code === codeOrId || l.id === codeOrId,
  );
  if (!loc) return [];
  return state.units.filter((u) => {
    if (u.status === "issued" || u.status === "archived") return false;
    if (u.locationId === loc.id) return true;
    if (u.occupiesEntireRack && u.locationId && loc.rack != null) {
      const anchor = state.locations.find((l) => l.id === u.locationId);
      return anchor?.rack === loc.rack;
    }
    // Shared deck: same rack + level (K/D share one beam)
    if (
      loc.kind === "pallet" &&
      loc.rack != null &&
      loc.level != null &&
      u.locationId
    ) {
      const anchor = state.locations.find((l) => l.id === u.locationId);
      return (
        anchor?.rack === loc.rack &&
        anchor?.level === loc.level &&
        !!u.footprintW
      );
    }
    return false;
  });
}

export type FootprintRect = {
  w: number;
  d: number;
  offsetX: number;
  offsetZ: number;
};

export function unitFootprintRect(u: Unit): FootprintRect {
  if (u.footprintW && u.footprintD) {
    return {
      w: u.footprintW,
      d: u.footprintD,
      offsetX: u.footprintOffsetX ?? 0,
      offsetZ: u.footprintOffsetZ ?? 0,
    };
  }
  if (u.slotSpan === "half") {
    return {
      w: 0.55,
      d: BAY_DEPTH_M * 0.85,
      offsetX: u.slotHalf === "R" ? 0.35 : -0.35,
      offsetZ: 0,
    };
  }
  return { w: 1.1, d: BAY_DEPTH_M, offsetX: 0, offsetZ: 0 };
}

function footprintsOverlap(a: FootprintRect, b: FootprintRect, gap = 0.08): boolean {
  return (
    Math.abs(a.offsetX - b.offsetX) < (a.w + b.w) / 2 - gap &&
    Math.abs(a.offsetZ - b.offsetZ) < (a.d + b.d) / 2 - gap
  );
}

/** Ar naujas footprint persidengtų su kitomis prekėmis tame pačiame aukšte. */
export function footprintConflictsAtLocation(
  state: AppState,
  locationId: string,
  candidate: FootprintRect,
  ignoreUnitId?: string,
): boolean {
  const loc = state.locations.find((l) => l.id === locationId);
  if (!loc) return true;
  if (loc.rack != null && rackFullyOccupiedByUnit(state).get(loc.rack)) {
    return true;
  }
  for (const u of unitsAtLocation(state, locationId)) {
    if (u.id === ignoreUnitId) continue;
    if (footprintsOverlap(candidate, unitFootprintRect(u))) return true;
  }
  return false;
}

/** Pašalina unitą iš vietos (atšaukia žymėjimą ant sijos / grindų). */
export function removeUnitPlacement(
  state: AppState,
  unitId: string,
): AppState {
  const now = new Date().toISOString();
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return state;

  const units = state.units.map((u) =>
    u.id === unitId
      ? {
          ...u,
          locationId: null,
          floorAreaId: null,
          occupiesEntireRack: false,
          footprintW: null,
          footprintD: null,
          footprintOffsetX: null,
          footprintOffsetZ: null,
          slotSpan: "full" as const,
          slotHalf: null,
          status: "archived" as UnitStatus,
          updatedAt: now,
        }
      : u,
  );

  const orderStillHasUnits = units.some(
    (u) =>
      u.orderId === unit.orderId &&
      u.id !== unitId &&
      u.status !== "archived" &&
      u.status !== "issued",
  );

  const next = pruneEmptyFloorAreas({
    ...state,
    units,
    orders: orderStillHasUnits
      ? state.orders
      : state.orders.map((o) =>
          o.id === unit.orderId
            ? { ...o, status: "archived" as const, updatedAt: now }
            : o,
        ),
  });
  saveState(next);
  return next;
}

/** Nuima prekę iš vietos, bet nearchyvuoja užsakymo. */
export function unplaceUnit(state: AppState, unitId: string): AppState {
  const now = new Date().toISOString();
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return state;

  const next = pruneEmptyFloorAreas({
    ...state,
    units: state.units.map((u) =>
      u.id === unitId
        ? {
            ...u,
            locationId: null,
            floorAreaId: null,
            occupiesEntireRack: false,
            footprintW: null,
            footprintD: null,
            footprintOffsetX: null,
            footprintOffsetZ: null,
            slotSpan: "full" as const,
            slotHalf: null,
            status:
              u.status === "stored" || u.status === "staged"
                ? ("received" as UnitStatus)
                : u.status,
            updatedAt: now,
          }
        : u,
    ),
  });
  saveState(next);
  return next;
}

/** Perkelia prekę į naują vietą arba ant grindų. */
export function moveUnitToLocation(
  state: AppState,
  unitId: string,
  target: {
    locationId?: string;
    floorAreaId?: string;
    footprintW?: number | null;
    footprintD?: number | null;
    footprintOffsetX?: number | null;
    footprintOffsetZ?: number | null;
  },
): AppState {
  if (target.floorAreaId) {
    return placeUnitOnFloor(state, unitId, target.floorAreaId);
  }
  if (target.locationId) {
    return placeUnit(state, unitId, target.locationId, {
      footprintW: target.footprintW,
      footprintD: target.footprintD,
      footprintOffsetX: target.footprintOffsetX,
      footprintOffsetZ: target.footprintOffsetZ,
    });
  }
  return state;
}

/** Ištrina užsakymą ir visas susijusias dėžes (negrįžtama). */
export function deleteOrder(state: AppState, orderId: string): AppState {
  const unitIds = new Set(
    state.units.filter((u) => u.orderId === orderId).map((u) => u.id),
  );
  const next: AppState = {
    ...state,
    orders: state.orders.filter((o) => o.id !== orderId),
    units: state.units.filter((u) => u.orderId !== orderId),
    shipments: state.shipments.filter((s) => s.orderId !== orderId),
    handovers: state.handovers.filter((h) => h.orderId !== orderId),
    floorAreas: state.floorAreas.map((f) =>
      f.orderId === orderId ? { ...f, orderId: null } : f,
    ),
    defects: state.defects.filter((d) => !unitIds.has(d.unitId ?? "")),
  };
  saveState(next);
  return next;
}

export function unitsOnFloorArea(state: AppState, floorAreaId: string): Unit[] {
  return state.units.filter(
    (u) =>
      u.floorAreaId === floorAreaId &&
      u.status !== "issued" &&
      u.status !== "archived",
  );
}


export function suggestLocations(
  state: AppState,
  zone: Zone | null,
  blockStorage: boolean,
  count: number,
  avoidEntranceRacks = false,
): string[] {
  const preferredZone = zone ?? "EXPO";
  const occ = slotOccupancy(state);
  const free = state.locations.filter((l) => {
    if (l.kind !== "pallet") return false;
    if (l.zone !== preferredZone && l.zone !== "LONG") return false;
    if (l.level === 3 && !blockStorage) return false;
    return !(occ.get(l.code) || occ.get(l.id));
  });

  function rackScore(rack: number): number {
    if (!avoidEntranceRacks) return rack;
    if (rack <= 4) return rack + 100;
    if (rack >= 8 && rack <= 14) return rack - 5;
    return rack;
  }

  free.sort((a, b) => {
    const la = a.level ?? 9;
    const lb = b.level ?? 9;
    if (la !== lb) return la - lb;
    return rackScore(a.rack ?? 0) - rackScore(b.rack ?? 0);
  });

  if (blockStorage) {
    const byRack = new Map<number, typeof free>();
    for (const l of free) {
      const r = l.rack ?? -1;
      if (!byRack.has(r)) byRack.set(r, []);
      byRack.get(r)!.push(l);
    }
    const clustered: string[] = [];
    for (const [, locs] of byRack) {
      for (const l of locs) {
        clustered.push(l.id);
        if (clustered.length >= count) return clustered;
      }
    }
    return clustered;
  }

  return free.slice(0, count).map((l) => l.id);
}

export interface DashboardPickup {
  orderId: string;
  project: string;
  client: string;
  unitCount: number;
}

export interface DashboardArrival {
  shipmentId: string;
  orderId: string | null;
  project: string;
  carrier: string;
  expectedAt: string | null;
  hasAttachment: boolean;
}

export interface DashboardSummary {
  pickups: DashboardPickup[];
  arrivals: DashboardArrival[];
  totalUnits: number;
  boxes: number;
  pallets: number;
  occupiedSlots: number;
  totalSlots: number;
  occupancyPct: number;
  expoOccupiedSlots: number;
  expoTotalSlots: number;
  expoOccupancyPct: number;
  diledOccupiedSlots: number;
  diledTotalSlots: number;
  diledOccupancyPct: number;
  floorOccupancyPct: number;
  floorExpoOccupancyPct: number;
  floorDiledOccupancyPct: number;
  floorUnitsCount: number;
  floorAreaCount: number;
  activeOrders: number;
}

/** Prekės užimamas plotas ant grindų (m²) — pagal footprint arba vizualizacijos taisyklę. */
function unitFloorOccupiedAreaM2(
  unit: Unit,
  floorArea: FloorArea,
  siblings: Unit[],
): number {
  if (unit.footprintW && unit.footprintD) {
    return unit.footprintW * unit.footprintD;
  }
  const n = siblings.length || 1;
  if (n === 1) {
    return floorArea.w * 0.9 * floorArea.d * 0.9;
  }
  const cols = Math.ceil(Math.sqrt(n));
  const fillW = floorArea.w * 0.85 / cols;
  const fillD = floorArea.d * 0.85 / Math.ceil(n / cols);
  const bw = Math.max(0.35, fillW);
  const bd = Math.max(0.35, fillD);
  return bw * bd;
}

export function getDashboardSummary(state: AppState): DashboardSummary {
  const activeUnits = state.units.filter(
    (u) => !["issued", "archived"].includes(u.status),
  );
  const stagedOrderIds = new Set(
    state.units
      .filter((u) => u.status === "staged")
      .map((u) => u.orderId),
  );
  const pickups: DashboardPickup[] = [];
  for (const orderId of stagedOrderIds) {
    const order = state.orders.find((o) => o.id === orderId);
    if (!order || order.status !== "active") continue;
    const unitCount = state.units.filter(
      (u) => u.orderId === orderId && u.status === "staged",
    ).length;
    pickups.push({
      orderId,
      project: order.project || "Be pavadinimo",
      client: order.client || "—",
      unitCount,
    });
  }

  const arrivals: DashboardArrival[] = state.shipments
    .filter((s) => s.status === "expected")
    .map((s) => {
      const order = s.orderId
        ? state.orders.find((o) => o.id === s.orderId)
        : null;
      return {
        shipmentId: s.id,
        orderId: s.orderId,
        project:
          order?.project ||
          s.parsedJson?.project ||
          s.notes.split("\n")[0] ||
          "Atkeliauja",
        carrier: s.carrier || "—",
        expectedAt: s.expectedAt,
        hasAttachment: !!(s.attachmentUrl || s.attachmentStoragePath || s.attachmentDataUrl),
      };
    });

  const occ = slotOccupancy(state);
  const palletSlots = state.locations.filter((l) => l.kind === "pallet");
  const occupiedSlots = palletSlots.filter(
    (l) => occ.get(l.code) || occ.get(l.id),
  ).length;

  const expoSlots = palletSlots.filter(
    (l) => l.zone === "EXPO" || l.zone === "LONG",
  );
  const expoOccupied = expoSlots.filter(
    (l) => occ.get(l.code) || occ.get(l.id),
  ).length;

  const diledSlots = palletSlots.filter((l) => l.zone === "DILED");
  const diledOccupied = diledSlots.filter(
    (l) => occ.get(l.code) || occ.get(l.id),
  ).length;

  const warehouseFloorAreaM2 = ROOM.length * ROOM.width;
  const floorUnits = activeUnits.filter((u) => u.floorAreaId);
  let occupiedFloorAreaM2 = 0;
  let floorExpoAreaM2 = 0;
  let floorDiledAreaM2 = 0;
  for (const u of floorUnits) {
    const area = state.floorAreas.find((f) => f.id === u.floorAreaId);
    if (!area) continue;
    const siblings = floorUnits.filter((x) => x.floorAreaId === area.id);
    const m2 = unitFloorOccupiedAreaM2(u, area, siblings);
    occupiedFloorAreaM2 += m2;
    if (zoneAtFloorPoint(area.x, area.z) === "DILED") {
      floorDiledAreaM2 += m2;
    } else {
      floorExpoAreaM2 += m2;
    }
  }
  const floorUnitsCount = floorUnits.length;

  return {
    pickups,
    arrivals,
    totalUnits: activeUnits.length,
    boxes: activeUnits.filter((u) => u.kind === "box").length,
    pallets: activeUnits.filter((u) => u.kind === "pallet").length,
    occupiedSlots,
    totalSlots: palletSlots.length,
    occupancyPct:
      palletSlots.length > 0
        ? Math.round((occupiedSlots / palletSlots.length) * 100)
        : 0,
    expoOccupiedSlots: expoOccupied,
    expoTotalSlots: expoSlots.length,
    expoOccupancyPct:
      palletSlots.length > 0
        ? Math.round((expoOccupied / palletSlots.length) * 100)
        : 0,
    diledOccupiedSlots: diledOccupied,
    diledTotalSlots: diledSlots.length,
    diledOccupancyPct:
      palletSlots.length > 0
        ? Math.round((diledOccupied / palletSlots.length) * 100)
        : 0,
    floorOccupancyPct:
      warehouseFloorAreaM2 > 0
        ? Math.round((occupiedFloorAreaM2 / warehouseFloorAreaM2) * 100)
        : 0,
    floorExpoOccupancyPct:
      warehouseFloorAreaM2 > 0
        ? Math.round((floorExpoAreaM2 / warehouseFloorAreaM2) * 100)
        : 0,
    floorDiledOccupancyPct:
      warehouseFloorAreaM2 > 0
        ? Math.round((floorDiledAreaM2 / warehouseFloorAreaM2) * 100)
        : 0,
    floorUnitsCount,
    floorAreaCount: state.floorAreas.length,
    activeOrders: state.orders.filter((o) => o.status === "active").length,
  };
}

export interface InventorySearchFilters {
  project?: string;
  client?: string;
  orderCode?: string;
  query?: string;
  manufacturer?: string;
  arrivedFrom?: string;
  arrivedTo?: string;
  issuedFrom?: string;
  issuedTo?: string;
}

export interface InventorySearchResult {
  unitId: string;
  orderId: string;
  orderCode: string;
  project: string;
  client: string;
  label: string;
  manufacturer: string;
  locationLabel: string;
  locationCode: string | null;
  rack: number | null;
  status: UnitStatus;
  arrivedAt: string | null;
  issuedAt: string | null;
}


function inDateRange(
  value: string | null,
  from?: string,
  to?: string,
): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  const d = value.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function fieldMatches(blob: string, needle: string | undefined): boolean {
  const q = needle?.trim().toLowerCase();
  if (!q) return true;
  return blob.includes(q);
}

export function searchInventory(
  state: AppState,
  _query: string,
  filters: InventorySearchFilters = {},
): InventorySearchResult[] {
  const results: InventorySearchResult[] = [];

  for (const unit of state.units) {
    if (unit.status === "archived") continue;

    const order = state.orders.find((o) => o.id === unit.orderId);
    if (!order) continue;

    const shipment = unit.shipmentId
      ? state.shipments.find((s) => s.id === unit.shipmentId)
      : state.shipments.find((s) => s.orderId === order.id);

    const manufacturer =
      shipment?.parsedJson?.source ||
      shipment?.documentName?.replace(/\.[^.]+$/, "") ||
      "";

    const loc = unit.locationId
      ? state.locations.find((l) => l.id === unit.locationId)
      : unit.floorAreaId
        ? state.floorAreas.find((f) => f.id === unit.floorAreaId)
        : null;

    const floorLabel =
      unit.floorAreaId &&
      state.floorAreas.find((f) => f.id === unit.floorAreaId)?.label;

    const locationCode =
      loc && "code" in loc
        ? (loc as { code: string }).code
        : unit.floorAreaId || null;

    const locationLabel =
      floorLabel ||
      (loc && "label" in loc ? (loc as { label: string }).label : null) ||
      (unit.locationId
        ? state.locations.find((l) => l.id === unit.locationId)?.label
        : null) ||
      "Dar nepadėta";

    const locForRack = unit.locationId
      ? state.locations.find((l) => l.id === unit.locationId)
      : null;
    const rack = locForRack?.rack ?? null;

    const handover = state.handovers.find((h) =>
      h.unitIds.includes(unit.id),
    );
    const arrivedAt =
      shipment?.arrivedAt ||
      shipment?.expectedAt ||
      shipment?.createdAt ||
      order.createdAt ||
      null;
    const issuedAt = handover?.issuedAt ?? null;

    if (filters.manufacturer) {
      const m = filters.manufacturer.toLowerCase();
      if (!manufacturer.toLowerCase().includes(m)) continue;
    }
    if (!inDateRange(arrivedAt, filters.arrivedFrom, filters.arrivedTo)) continue;
    if (!inDateRange(issuedAt, filters.issuedFrom, filters.issuedTo)) continue;

    const blob = [
      order.orderCode,
      order.project,
      order.client,
      order.notes,
      unit.labelTitle,
      unit.notes,
      manufacturer,
      locationLabel,
      locationCode,
      ...(order.customFields ?? []).map((f) => `${f.label} ${f.value}`),
      ...(shipment?.parsedJson?.customFields ?? []).map(
        (f) => `${f.label} ${f.value}`,
      ),
    ]
      .join(" ")
      .toLowerCase();

    if (!fieldMatches(blob, filters.project)) continue;
    if (!fieldMatches(blob, filters.client)) continue;
    if (!fieldMatches(blob, filters.orderCode)) continue;
    if (!fieldMatches(blob, filters.query)) continue;

    results.push({
      unitId: unit.id,
      orderId: order.id,
      orderCode: order.orderCode,
      project: order.project,
      client: order.client,
      label:
        unit.totalInSet > 1
          ? `${unit.labelTitle} (${unit.totalInSet} dėž.)`
          : unit.labelTitle,
      manufacturer,
      locationLabel,
      locationCode,
      rack: rack ?? null,
      status: unit.status,
      arrivedAt,
      issuedAt,
    });
  }

  results.sort((a, b) => {
    const pa = a.project.localeCompare(b.project, "lt");
    if (pa !== 0) return pa;
    return a.label.localeCompare(b.label, "lt");
  });

  return results;
}

export const KNOWN_MANUFACTURERS = [
  "Iguzzini",
  "DILED",
  "Distyle",
  "ExpoDesign",
  "Philips",
  "Osram",
  "Trilux",
  "RIDI",
] as const;

export function getFormSuggestions(state: AppState) {
  const fromData = {
    projects: new Set<string>(),
    clients: new Set<string>(),
    orderCodes: new Set<string>(),
    manufacturers: new Set<string>(KNOWN_MANUFACTURERS),
  };

  for (const o of state.orders) {
    if (o.project) fromData.projects.add(o.project);
    if (o.client) fromData.clients.add(o.client);
    if (o.orderCode) fromData.orderCodes.add(o.orderCode);
    if (o.notes) {
      for (const m of KNOWN_MANUFACTURERS) {
        if (o.notes.toLowerCase().includes(m.toLowerCase())) {
          fromData.manufacturers.add(m);
        }
      }
    }
  }

  for (const s of state.shipments) {
    const src = s.parsedJson?.source || s.documentName?.replace(/\.[^.]+$/, "");
    if (src) fromData.manufacturers.add(src);
  }

  return {
    projects: [...fromData.projects].sort((a, b) => a.localeCompare(b, "lt")),
    clients: [...fromData.clients].sort((a, b) => a.localeCompare(b, "lt")),
    orderCodes: [...fromData.orderCodes].sort((a, b) => a.localeCompare(b, "lt")),
    manufacturers: [...fromData.manufacturers].sort((a, b) =>
      a.localeCompare(b, "lt"),
    ),
  };
}

export function locationLabelForUnit(
  state: AppState,
  unitId: string,
): { code: string | null; label: string; rack: number | null } {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return { code: null, label: "Nerasta", rack: null };

  if (unit.floorAreaId) {
    const fa = state.floorAreas.find((f) => f.id === unit.floorAreaId);
    return {
      code: unit.floorAreaId,
      label: fa?.label || "Ant grindų",
      rack: null,
    };
  }

  const loc = unit.locationId
    ? state.locations.find((l) => l.id === unit.locationId)
    : null;
  return {
    code: loc?.code ?? null,
    label: loc?.label || "Dar nepadėta",
    rack: loc?.rack ?? null,
  };
}
