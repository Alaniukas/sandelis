"use client";

import { useEffect, useState } from "react";
import { loadState, subscribeWms } from "@/lib/demo-store";
import type { AppState } from "@/lib/types";

export function useWms(): AppState {
  // Same empty seed on server + first client paint → no hydration mismatch
  // (localStorage has floorAreas / orders only after mount)
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
    setState(loadState());
    return subscribeWms(() => setState(loadState()));
  }, []);

  return state;
}
