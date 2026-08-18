"use client";

import type { AppState } from "./types";
import { isWmsWriteEnabled } from "./wms-write-guard";

const SYNC_DEBOUNCE_MS = 400;
const SYNC_META_KEY = "sandelio-wms-sync-meta";

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pulling = false;

type SyncMeta = { pending: boolean; lastSyncedAt: string | null };

function readSyncMeta(): SyncMeta {
  if (typeof window === "undefined") {
    return { pending: false, lastSyncedAt: null };
  }
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    if (!raw) return { pending: false, lastSyncedAt: null };
    return JSON.parse(raw) as SyncMeta;
  } catch {
    return { pending: false, lastSyncedAt: null };
  }
}

function writeSyncMeta(meta: SyncMeta) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
}

/** Žymi, kad lokali būsena naujesnė už paskutinį sėkmingą serverio pull. */
export function markLocalDirty() {
  const meta = readSyncMeta();
  writeSyncMeta({ ...meta, pending: true });
}

export function markLocalSynced(updatedAt: string) {
  writeSyncMeta({ pending: false, lastSyncedAt: updatedAt });
}

/** Ar saugu perrašyti localStorage senesniu serverio snapshot. */
export function shouldApplyRemotePull(updatedAt: string | null): boolean {
  if (!updatedAt) return false;
  const meta = readSyncMeta();
  if (meta.pending) return false;
  if (!meta.lastSyncedAt) return true;
  return new Date(updatedAt).getTime() > new Date(meta.lastSyncedAt).getTime();
}

function hasInventory(state: AppState): boolean {
  return (
    state.orders.length > 0 ||
    state.units.length > 0 ||
    state.shipments.length > 0
  );
}

export async function pullWmsState(): Promise<{
  payload: AppState | null;
  updatedAt: string | null;
} | null> {
  if (pulling) return null;
  pulling = true;
  try {
    const res = await fetch("/api/wms-state", {
      credentials: "include",
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 503) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as {
      payload: AppState | null;
      updatedAt: string | null;
    };
    if (!data.payload?.locations) return null;
    return data;
  } catch {
    return null;
  } finally {
    pulling = false;
  }
}

export function scheduleWmsSync(state: AppState) {
  if (typeof window === "undefined") return;
  if (!isWmsWriteEnabled()) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void pushWmsState(state);
  }, SYNC_DEBOUNCE_MS);
}

export async function pushWmsStateNow(state: AppState) {
  if (!isWmsWriteEnabled()) return;
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  await pushWmsState(state);
}

async function pushWmsState(state: AppState) {
  try {
    const payload = stripLargeBinaryFromState(state);
    const res = await fetch("/api/wms-state", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    });
    if (!res.ok) {
      const msg =
        "Nepavyko išsaugoti į kitus įrenginius — patikrink internetą.";
      console.warn("[wms-sync]", msg, res.status);
      window.dispatchEvent(new CustomEvent("wms-sync-error", { detail: msg }));
      return;
    }
    const data = (await res.json()) as { updatedAt?: string };
    if (data.updatedAt) markLocalSynced(data.updatedAt);
  } catch {
    const msg =
      "Nėra ryšio su serveriu — darbas tęsiasi šiame įrenginyje.";
    console.warn("[wms-sync]", msg);
    window.dispatchEvent(new CustomEvent("wms-sync-error", { detail: msg }));
  }
}

/** Pirmiausia serveris; lokali kopija tik jei serveris tuščias ir čia yra duomenų. */
export async function hydrateFromRemote(
  local: AppState,
): Promise<AppState | null> {
  const remoteResult = await pullWmsState();
  if (!remoteResult) return null;

  const remote = remoteResult.payload;
  if (!remote) return null;

  const localHasData = hasInventory(local);
  const remoteHasData = hasInventory(remote);

  if (remoteHasData) return remote;

  if (localHasData) {
    void pushWmsStateNow(local);
    return null;
  }

  return remote;
}

/** Nuimti didelius data URL prieš sinchronizaciją — priedai saugomi Storage. */
function stripLargeBinaryFromState(state: AppState): AppState {
  return {
    ...state,
    shipments: state.shipments.map((s) => {
      let next = s;
      if (s.attachmentDataUrl && s.attachmentUrl) {
        const { attachmentDataUrl: _, ...rest } = next;
        next = rest;
      }
      if (next.holdingPhotoUrls?.some((u) => u.startsWith("data:"))) {
        next = {
          ...next,
          holdingPhotoUrls: next.holdingPhotoUrls.filter(
            (u) => !u.startsWith("data:"),
          ),
        };
      }
      return next;
    }),
    defects: state.defects.map((d) => {
      if (!d.photoDataUrl) return d;
      return { ...d, photoDataUrl: null };
    }),
    orders: state.orders.map((o) => {
      if (!o.notePhotoUrls?.length) return o;
      const hasDataUrls = o.notePhotoUrls.some((u) => u.startsWith("data:"));
      if (!hasDataUrls) return o;
      return {
        ...o,
        notePhotoUrls: o.notePhotoUrls.filter((u) => !u.startsWith("data:")),
      };
    }),
    handovers: state.handovers.map((h) => {
      if (!h.photoUrls?.length) return h;
      const hasDataUrls = h.photoUrls.some((u) => u.startsWith("data:"));
      if (!hasDataUrls) return h;
      return {
        ...h,
        photoUrls: h.photoUrls.filter((u) => !u.startsWith("data:")),
      };
    }),
  };
}
