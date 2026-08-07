"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  loadState,
  normalizeState,
  subscribeWms,
} from "@/lib/demo-store";
import type { AppState } from "@/lib/types";
import { hydrateFromRemote, pullWmsState, shouldApplyRemotePull, markLocalSynced } from "@/lib/wms-sync";

const WmsContext = createContext<AppState | null>(null);
const SyncErrorContext = createContext<string | null>(null);

const PULL_INTERVAL_MS = 30_000;

function fallbackState(): AppState {
  if (typeof window === "undefined") {
    return {
      locations: [],
      orders: [],
      shipments: [],
      units: [],
      defects: [],
      handovers: [],
      floorAreas: [],
    };
  }
  return loadState();
}

async function applyRemotePayload(payload: AppState) {
  const next = normalizeState(payload);
  localStorage.setItem("sandelio-wms-v1", JSON.stringify(next));
  window.dispatchEvent(new Event("wms-updated"));
  return next;
}

export function WmsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const lastRemoteUpdatedAtRef = useRef<string | null>(null);
  const failCountRef = useRef(0);
  const pullIntervalRef = useRef(PULL_INTERVAL_MS);

  useEffect(() => {
    const local = loadState();

    void (async () => {
      const remoteResult = await pullWmsState();
      if (
        remoteResult?.payload &&
        shouldApplyRemotePull(remoteResult.updatedAt)
      ) {
        const next = await applyRemotePayload(remoteResult.payload);
        if (remoteResult.updatedAt) {
          markLocalSynced(remoteResult.updatedAt);
          lastRemoteUpdatedAtRef.current = remoteResult.updatedAt;
        }
        setState(next);
        return;
      }

      const remote = await hydrateFromRemote(local);
      const next = remote ? await applyRemotePayload(remote) : local;
      setState(next);
    })();

    return subscribeWms(() => setState(loadState()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refreshFromRemote() {
      const result = await pullWmsState();
      if (cancelled) return;

      if (!result?.payload) {
        failCountRef.current += 1;
        pullIntervalRef.current = Math.min(
          120_000,
          PULL_INTERVAL_MS * 2 ** Math.min(failCountRef.current, 3),
        );
        return;
      }

      failCountRef.current = 0;
      pullIntervalRef.current = PULL_INTERVAL_MS;

      if (
        result.updatedAt &&
        result.updatedAt === lastRemoteUpdatedAtRef.current
      ) {
        return;
      }

      if (!shouldApplyRemotePull(result.updatedAt)) {
        return;
      }

      lastRemoteUpdatedAtRef.current = result.updatedAt;

      const next = await applyRemotePayload(result.payload);
      if (result.updatedAt) {
        markLocalSynced(result.updatedAt);
      }
      if (!cancelled) {
        setState(next);
        setSyncError(null);
      }
    }

    function schedulePull() {
      timer = setTimeout(() => {
        void refreshFromRemote().finally(() => {
          if (!cancelled) schedulePull();
        });
      }, pullIntervalRef.current);
    }

    schedulePull();

    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshFromRemote();
    };

    const onSyncError = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) setSyncError(detail);
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("wms-sync-error", onSyncError);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("wms-sync-error", onSyncError);
    };
  }, []);

  if (!state) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-4 text-center text-stone-600">
        <p className="text-sm font-medium">Kraunama…</p>
        <p className="text-xs text-stone-500">Gaunami naujausi duomenys</p>
      </div>
    );
  }

  return (
    <WmsContext.Provider value={state}>
      <SyncErrorContext.Provider value={syncError}>
        {syncError && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-950">
            {syncError}
          </div>
        )}
        {children}
      </SyncErrorContext.Provider>
    </WmsContext.Provider>
  );
}

export function useWms(): AppState {
  return useContext(WmsContext) ?? fallbackState();
}

export function useWmsSyncError(): string | null {
  return useContext(SyncErrorContext);
}
