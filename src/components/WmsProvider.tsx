"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  loadState,
  normalizeState,
  subscribeWms,
} from "@/lib/demo-store";
import type { AppState } from "@/lib/types";
import { hydrateFromRemote } from "@/lib/wms-sync";

const WmsContext = createContext<AppState | null>(null);

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

export function WmsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    const local = loadState();

    void (async () => {
      const remote = await hydrateFromRemote(local);
      const next = remote ? normalizeState(remote) : local;
      if (remote) {
        localStorage.setItem("sandelio-wms-v1", JSON.stringify(next));
        window.dispatchEvent(new Event("wms-updated"));
      }
      setState(next);
    })();

    return subscribeWms(() => setState(loadState()));
  }, []);

  if (!state) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-4 text-center text-stone-600">
        <p className="text-sm font-medium">Kraunama sandėlio būsena…</p>
        <p className="text-xs text-stone-500">Sinchronizuojama su serveriu</p>
      </div>
    );
  }

  return <WmsContext.Provider value={state}>{children}</WmsContext.Provider>;
}

export function useWms(): AppState {
  return useContext(WmsContext) ?? fallbackState();
}
