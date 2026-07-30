"use client";

import type { AppState } from "./types";

const SYNC_DEBOUNCE_MS = 400;

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pulling = false;

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
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void pushWmsState(state);
  }, SYNC_DEBOUNCE_MS);
}

export async function pushWmsStateNow(state: AppState) {
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
    if (!res.ok) return;
    await res.json();
  } catch {
    /* offline — localStorage vis tiek veikia */
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
      if (!s.attachmentDataUrl) return s;
      if (s.attachmentUrl) {
        const { attachmentDataUrl: _, ...rest } = s;
        return rest;
      }
      return s;
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
  };
}
