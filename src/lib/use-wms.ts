"use client";

import { useEffect, useState } from "react";
import { loadState, normalizeState, saveState, subscribeWms } from "@/lib/demo-store";
import type { AppState } from "@/lib/types";
import { hydrateFromRemote } from "@/lib/wms-sync";

export function useWms(): AppState {
  const [state, setState] = useState<AppState>(() => ({
    locations: [],
    orders: [],
    shipments: [],
    units: [],
    defects: [],
    handovers: [],
    floorAreas: [],
  }));

  useEffect(() => {
    const local = loadState();
    setState(local);

    void (async () => {
      const remote = await hydrateFromRemote(local);
      if (remote) {
        const normalized = normalizeState(remote);
        saveState(normalized);
        setState(normalized);
      }
    })();

    return subscribeWms(() => setState(loadState()));
  }, []);

  return state;
}
