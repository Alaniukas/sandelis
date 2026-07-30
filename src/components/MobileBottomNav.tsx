"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { IncomingArrivalModal } from "@/components/IncomingArrivalModal";
import { NewShipmentModal } from "@/components/NewShipmentModal";
import { NavTabIcon, type NavTabId } from "@/components/NavTabIcons";
import { signOut } from "@/lib/supabase/logout";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { PlacementSuggestion } from "@/lib/placement";

const tabs: {
  href: string;
  label: string;
  icon: NavTabId;
  match: (p: string) => boolean;
}[] = [
  { href: "/", label: "Pradžia", icon: "home", match: (p) => p === "/" },
  {
    href: "/map",
    label: "Sandėlis",
    icon: "map",
    match: (p) => p === "/map" || p.startsWith("/vizualizacija"),
  },
  { href: "/search", label: "Paieška", icon: "search", match: (p) => p === "/search" },
  {
    href: "/orders",
    label: "Užsakymai",
    icon: "orders",
    match: (p) => p === "/orders" || p.startsWith("/orders/"),
  },
];

function NavTabLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: NavTabId;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] font-semibold transition touch-manipulation ${
        active ? "text-stone-900" : "text-stone-500"
      }`}
    >
      <NavTabIcon id={icon} active={active} />
      {label}
    </Link>
  );
}

export function MobileBottomNav() {
  const path = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [incomingOpen, setIncomingOpen] = useState(false);

  function onShowPlacement(s: PlacementSuggestion) {
    router.push(
      `/map?rack=${s.rack}&code=${encodeURIComponent(s.code)}&hint=1`,
    );
  }

  function go(href: string) {
    setMenuOpen(false);
    router.push(href);
  }

  async function logout() {
    setMenuOpen(false);
    if (isSupabaseConfigured()) {
      await signOut();
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Uždaryti"
            className="absolute inset-0 bg-stone-900/40 backdrop-blur-[1px]"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] rounded-2xl border border-stone-200 bg-white p-2 shadow-2xl">
            <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
              Greiti veiksmai
            </p>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-semibold text-stone-900 active:bg-stone-100"
              onClick={() => {
                setMenuOpen(false);
                if (path === "/map") setNewOpen(true);
                else router.push("/map?new=1");
              }}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-900 text-white">
                +
              </span>
              Naujas atvykimas
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-semibold text-stone-900 active:bg-stone-100"
              onClick={() => {
                setMenuOpen(false);
                setIncomingOpen(true);
              }}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-900">
                →
              </span>
              Atkeliauja (laukiamas)
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-semibold text-stone-900 active:bg-stone-100"
              onClick={() => go("/map?legacy=1")}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-200 text-stone-800">
                #
              </span>
              Žymėti seną užsakymą
            </button>
            <Link
              href="/archive"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-medium text-stone-600 active:bg-stone-100"
              onClick={() => setMenuOpen(false)}
            >
              Archyvas
            </Link>
            {isSupabaseConfigured() && (
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-medium text-red-700 active:bg-red-50"
                onClick={logout}
              >
                Atsijungti
              </button>
            )}
          </div>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200/90 bg-[#f3efe8]/95 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Mobili navigacija"
      >
        <div className="mx-auto flex h-[3.75rem] max-w-lg items-stretch px-1">
          {tabs.slice(0, 2).map((t) => (
            <NavTabLink
              key={t.href}
              href={t.href}
              label={t.label}
              icon={t.icon}
              active={t.match(path)}
            />
          ))}

          <button
            type="button"
            aria-label="Greiti veiksmai"
            className="relative -mt-3 flex w-14 shrink-0 flex-col items-center justify-end pb-1 touch-manipulation"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-900 text-2xl font-light text-white shadow-lg ring-4 ring-[#f3efe8]">
              +
            </span>
          </button>

          {tabs.slice(2).map((t) => (
            <NavTabLink
              key={t.href}
              href={t.href}
              label={t.label}
              icon={t.icon}
              active={t.match(path)}
            />
          ))}
        </div>
      </nav>

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
