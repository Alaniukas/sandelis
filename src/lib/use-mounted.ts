"use client";

import { useSyncExternalStore } from "react";

/** Išvengia hydration mismatch — renderina tik po mount */
export function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
