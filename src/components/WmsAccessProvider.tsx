"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { normalizeState } from "@/lib/demo-store";
import type { WmsRole } from "@/lib/supabase/username-auth";
import { pullWmsState } from "@/lib/wms-sync";
import { setWmsWriteEnabled } from "@/lib/wms-write-guard";

type Access = { role: WmsRole; readOnly: boolean };

const WmsAccessContext = createContext<Access>({
  role: "editor",
  readOnly: false,
});

export function WmsAccessProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<WmsRole>("editor");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { role?: string };
        const next: WmsRole = data.role === "viewer" ? "viewer" : "editor";
        setRole(next);
        setWmsWriteEnabled(next !== "viewer");
        if (next === "viewer") {
          try {
            localStorage.setItem(
              "sandelio-wms-sync-meta",
              JSON.stringify({ pending: false, lastSyncedAt: null }),
            );
          } catch {
            /* ignore */
          }
          const remote = await pullWmsState();
          if (remote?.payload && !cancelled) {
            const clean = normalizeState(remote.payload);
            localStorage.setItem("sandelio-wms-v1", JSON.stringify(clean));
            window.dispatchEvent(new Event("wms-updated"));
          }
        }
      } catch {
        /* demo / offline */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <WmsAccessContext.Provider
      value={{ role, readOnly: role === "viewer" }}
    >
      {children}
    </WmsAccessContext.Provider>
  );
}

export function useWmsAccess(): Access {
  return useContext(WmsAccessContext);
}
