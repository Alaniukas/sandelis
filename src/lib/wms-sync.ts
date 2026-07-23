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
    const res = await fetch("/api/wms-state", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: state }),
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
