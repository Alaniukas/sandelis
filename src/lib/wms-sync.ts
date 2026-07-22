"use client";

import type { AppState } from "./types";

const SYNC_DEBOUNCE_MS = 800;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let lastPushedAt = 0;
let pulling = false;

export async function pullWmsState(): Promise<AppState | null> {
  if (pulling) return null;
  pulling = true;
  try {
    const res = await fetch("/api/wms-state", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      payload: AppState | null;
      updatedAt: string | null;
    };
    if (!data.payload?.locations) return null;
    if (data.updatedAt) lastPushedAt = new Date(data.updatedAt).getTime();
    return data.payload;
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

async function pushWmsState(state: AppState) {
  try {
    const res = await fetch("/api/wms-state", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: state }),
    });
    if (res.ok) {
      const data = (await res.json()) as { updatedAt?: string };
      if (data.updatedAt) lastPushedAt = new Date(data.updatedAt).getTime();
    }
  } catch {
    /* offline — localStorage vis tiek veikia */
  }
}

export async function hydrateFromRemote(
  local: AppState,
): Promise<AppState | null> {
  const remote = await pullWmsState();
  if (!remote) return null;

  const hasLocalData =
    local.orders.length > 0 ||
    local.units.length > 0 ||
    local.shipments.length > 0;

  const hasRemoteData =
    remote.orders.length > 0 ||
    remote.units.length > 0 ||
    remote.shipments.length > 0;

  if (!hasRemoteData && hasLocalData) {
    scheduleWmsSync(local);
    return null;
  }

  if (hasRemoteData) return remote;
  return null;
}
