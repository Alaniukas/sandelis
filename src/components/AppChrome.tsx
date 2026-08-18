"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppNav } from "@/components/AppNav";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { WmsAccessProvider } from "@/components/WmsAccessProvider";

const BARE_PATHS = ["/login", "/auth"];

function isBarePath(pathname: string) {
  return BARE_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isBarePath(pathname)) {
    return <>{children}</>;
  }

  return (
    <WmsAccessProvider>
      <AppNav />
      <main className="mx-auto max-w-7xl px-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:px-4 lg:pb-[env(safe-area-inset-bottom)]">
        {children}
      </main>
      <MobileBottomNav />
    </WmsAccessProvider>
  );
}
