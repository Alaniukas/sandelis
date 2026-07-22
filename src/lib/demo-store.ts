"use client";

import { v4 as uuid } from "uuid";
import { buildLocations, BAY_DEPTH_M } from "./locations";
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
  };
}

/** Seniau kiekviena dėžė kūrė atskirą unit — sujungiam į vieną per užsakymą. */
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
      const key = `${u.locationId ?? ""}|${u.floorAreaId ?? ""}|${u.status}`;
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

function purgeNonTodayBjOrders(state: AppState): AppState {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const keepOrderIds = new Set(
    state.orders
      .filter((o) => {
        const created = new Date(o.createdAt);
        return created >= todayStart && /^BJ-/i.test(o.orderCode.trim());
      })
      .map((o) => o.id),
  );

  const units = state.units
    .filter((u) => keepOrderIds.has(u.orderId) && !u.floorAreaId);

  return {
    ...state,
    orders: state.orders.filter((o) => keepOrderIds.has(o.id)),
    shipments: state.shipments.filter(
      (s) => s.orderId && keepOrderIds.has(s.orderId),
    ),
    units,
    defects: state.defects.filter((d) => {
      const ship = state.shipments.find((s) => s.id === d.shipmentId);
      return ship?.orderId && keepOrderIds.has(ship.orderId);
    }),
    handovers: state.handovers.filter((h) => keepOrderIds.has(h.orderId)),
    floorAreas: [],
  };
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

function applyDataMigrations(state: AppState): AppState {
  let s = state;
  s = restoreStagedUnits(s);
  s = consolidateDuplicatePlacedUnits(s);
  s = purgeSeedFloorAreas(s);
  s = purgeNonTodayBjOrders(s);
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
    void import("./wms-sync").then((m) => m.scheduleWmsSync(state));
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
    createdAt: now,
  };
  const next = {
    ...state,
    shipments: [shipment, ...state.shipments],
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
  if (!src?.attachmentDataUrl) return state;
  const next = {
    ...state,
    shipments: state.shipments.map((s) =>
      s.id === toShipmentId
        ? {
            ...s,
            attachmentDataUrl: src.attachmentDataUrl,
            documentName: s.documentName || src.documentName,
          }
        : s,
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
  },
): AppState {
  const now = new Date().toISOString();
  const span = opts?.slotSpan ?? "full";
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
): AppState {
  const now = new Date().toISOString();
  const unit = state.units.find((u) => u.id === unitId);
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
    locationId: string;
    footprintW: number;
    footprintD: number;
    footprintOffsetX?: number | null;
    footprintOffsetZ?: number | null;
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
  const hasPlaced = orderUnits.some((u) => u.locationId || u.floorAreaId);
  const free = orderUnits.find((u) => !u.locationId && !u.floorAreaId);
  const fw = opts.footprintW;
  const fd = opts.footprintD;
  const fpX = opts.footprintOffsetX ?? 0;
  const fpZ = opts.footprintOffsetZ ?? 0;
  const span = fw < 0.75 ? ("half" as const) : ("full" as const);

  if (free && !hasPlaced) {
    return placeUnit(state, free.id, opts.locationId, {
      footprintW: fw,
      footprintD: fd,
      footprintOffsetX: fpX,
      footprintOffsetZ: fpZ,
      slotSpan: span,
      slotHalf: span === "half" ? (fpX < 0 ? "L" : "R") : null,
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
    notes: "",
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
  const hasPlaced = orderUnits.some((u) => u.locationId || u.floorAreaId);
  const free = orderUnits.find((u) => !u.locationId && !u.floorAreaId);
  if (free && !hasPlaced) {
    return placeUnitOnFloor(state, free.id, floorAreaId);
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
    notes: "",
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
  const unitIds = state.units
    .filter((u) => u.orderId === orderId && u.status !== "archived" && u.status !== "issued")
    .map((u) => u.id);

  const handover: Handover = {
    id: uuid(),
    orderId,
    recipientName,
    notes,
    unitIds,
    issuedAt: now,
  };

  const next = {
    ...state,
    units: state.units.map((u) =>
      unitIds.includes(u.id)
        ? {
            ...u,
            locationId: null,
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
  const floorId = unit.floorAreaId;
  const loc = state.locations.find((l) => l.id === unit.locationId);

  const handover: Handover = {
    id: uuid(),
    orderId: unit.orderId,
    recipientName: "QR atsiėmimas",
    notes: loc ? `Vieta ${loc.code}` : "",
    unitIds: [unit.id],
    issuedAt: now,
  };

  const units = state.units.map((u) =>
    u.id === unit.id
      ? {
          ...u,
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

  const next = {
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
    floorAreas: floorId
      ? state.floorAreas.map((f) =>
          f.id === floorId && f.orderId === unit.orderId
            ? { ...f, orderId: null }
            : f,
        )
      : state.floorAreas,
  };
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

/** Pašalina unitą iš vietos (atšaukia žymėjimą ant sijos / grindų). */
export function removeUnitPlacement(
  state: AppState,
  unitId: string,
): AppState {
  const now = new Date().toISOString();
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return state;

  const floorId = unit.floorAreaId;
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

  const next = {
    ...state,
    units,
    orders: orderStillHasUnits
      ? state.orders
      : state.orders.map((o) =>
          o.id === unit.orderId
            ? { ...o, status: "archived" as const, updatedAt: now }
            : o,
        ),
    floorAreas: floorId
      ? state.floorAreas.map((f) =>
          f.id === floorId && f.orderId === unit.orderId
            ? { ...f, orderId: null }
            : f,
        )
      : state.floorAreas,
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
  activeOrders: number;
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
      };
    });

  const occ = slotOccupancy(state);
  const palletSlots = state.locations.filter((l) => l.kind === "pallet");
  const occupiedSlots = palletSlots.filter(
    (l) => occ.get(l.code) || occ.get(l.id),
  ).length;

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
    activeOrders: state.orders.filter((o) => o.status === "active").length,
  };
}

export interface InventorySearchFilters {
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

export function searchInventory(
  state: AppState,
  query: string,
  filters: InventorySearchFilters = {},
): InventorySearchResult[] {
  const q = query.trim().toLowerCase();
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
      shipment?.arrivedAt || shipment?.expectedAt || shipment?.createdAt || null;
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
      manufacturer,
      locationLabel,
      locationCode,
    ]
      .join(" ")
      .toLowerCase();

    if (q && !blob.includes(q)) continue;

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
