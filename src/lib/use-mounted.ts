"use client";

import { useEffect, useState } from "react";

/** Išvengia hydration mismatch — renderina tik po mount */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
