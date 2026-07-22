"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { IncomingArrivalModal } from "@/components/IncomingArrivalModal";
import { NewShipmentModal } from "@/components/NewShipmentModal";
import { signOut } from "@/lib/supabase/logout";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { PlacementSuggestion } from "@/lib/placement";

const links = [
  { href: "/", label: "Pradžia" },
  { href: "/map", label: "Sandėlis" },
  { href: "/search", label: "Paieška" },
  { href: "/orders", label: "Užsakymai" },
  { href: "/archive", label: "Archyvas" },
];

export function AppNav() {
  const path = usePathname();
  const router = useRouter();
  const [newOpen, setNewOpen] = useState(false);
  const [incomingOpen, setIncomingOpen] = useState(false);

  function onShowPlacement(s: PlacementSuggestion) {
    router.push(
      `/map?rack=${s.rack}&code=${encodeURIComponent(s.code)}&hint=1`,
    );
  }

  async function logout() {
    if (isSupabaseConfigured()) {
      await signOut();
    }
    router.push("/login");
    router.refresh();
  }

  const pageTitle =
    path === "/"
      ? "Sandėlio WMS"
      : links.find(
          (l) =>
            l.href !== "/" &&
            (path === l.href || path.startsWith(`${l.href}/`)),
        )?.label ?? "Sandėlio WMS";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-[#f3efe8]/90 backdrop-blur-md safe-top">
        <div className="mx-auto flex h-12 max-w-7xl items-center gap-3 px-3 sm:h-14 sm:gap-3 sm:px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-900 text-xs font-bold text-white">
              W
            </span>
            <span className="text-sm font-bold tracking-tight md:hidden">
              {pageTitle}
            </span>
            <span className="hidden text-sm font-bold tracking-tight md:block">
              Sandėlio WMS
            </span>
          </Link>

          <nav className="ml-auto hidden items-center gap-0.5 md:flex">
            {links.map((l) => {
              const active =
                l.href === "/"
                  ? path === "/"
                  : path === l.href || path.startsWith(`${l.href}/`);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-stone-900 text-white"
                      : "text-stone-600 hover:bg-stone-200/60"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto hidden items-center gap-2 md:flex">
            <button
              type="button"
              className="btn-secondary !rounded-full !px-3.5 !py-1.5 !text-xs"
              onClick={() => setIncomingOpen(true)}
            >
              + Atkeliauja
            </button>
            <button
              type="button"
              className="btn-primary !rounded-full !px-3.5 !py-1.5 !text-xs"
              onClick={() => {
                if (path === "/map") setNewOpen(true);
                else router.push("/map?new=1");
              }}
            >
              + Atvykimas
            </button>
            {isSupabaseConfigured() && (
              <button
                type="button"
                className="rounded-full px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-200/60"
                onClick={logout}
              >
                Atsijungti
              </button>
            )}
          </div>
        </div>
      </header>

      <IncomingArrivalModal
        open={incomingOpen}
        onClose={() => setIncomingOpen(false)}
      />
      <NewShipmentModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onShowPlacement={onShowPlacement}
      />
    </>
  );
}
