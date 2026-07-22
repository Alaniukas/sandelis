"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { IncomingArrivalModal } from "@/components/IncomingArrivalModal";
import { getDashboardSummary } from "@/lib/demo-store";
import { useWms } from "@/lib/use-wms";

export function DashboardCards() {
  const state = useWms();
  const router = useRouter();
  const [incomingOpen, setIncomingOpen] = useState(false);
  const summary = useMemo(() => getDashboardSummary(state), [state]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-4 text-center sm:max-w-none sm:py-6 sm:text-left">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:w-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
            Sandėlio suvestinė
          </p>
          <h1 className="font-display mt-1 text-3xl font-semibold md:text-4xl">
            Pradžia
          </h1>
        </div>
        <div className="page-mobile-stack w-full max-w-xs sm:max-w-none">
          <button
            type="button"
            className="btn-primary"
            onClick={() => router.push("/map?new=1")}
          >
            + Naujas atvykimas
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setIncomingOpen(true)}
          >
            + Atkeliauja
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => router.push("/map?legacy=1")}
          >
            Žymėti seną
          </button>
          <Link href="/search" className="btn-secondary">
            Ieškoti prekės
          </Link>
          <Link href="/map" className="btn-secondary">
            Atidaryti sandėlį
          </Link>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="stat-card">
          <h3>Sandėlyje dabar</h3>
          <p className="stat-value">{summary.totalUnits}</p>
          <p className="mt-1 text-sm text-stone-600">
            {summary.boxes} dėžės · {summary.pallets} paletės
          </p>
        </div>
        <div className="stat-card">
          <h3>Užimtumas</h3>
          <p className="stat-value">{summary.occupancyPct}%</p>
          <p className="mt-1 text-sm text-stone-600">
            {summary.occupiedSlots} / {summary.totalSlots} vietų
          </p>
        </div>
        <div className="stat-card">
          <h3>Aktyvūs užsakymai</h3>
          <p className="stat-value">{summary.activeOrders}</p>
          <p className="mt-1 text-sm text-stone-600">
            <Link href="/orders" className="underline">
              Peržiūrėti sąrašą
            </Link>
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card-panel">
          <h2 className="font-display text-lg font-semibold">
            Paruošta atsiėmimui
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Klientai gali atvykti pasiimti šiuos užsakymus
          </p>
          <div className="mt-3">
            {summary.pickups.length === 0 ? (
              <p className="text-sm text-stone-500">Šiuo metu nieko neparuošta</p>
            ) : (
              summary.pickups.map((p) => (
                <div key={p.orderId} className="list-row">
                  <div>
                    <p className="font-medium text-stone-900">{p.project}</p>
                    <p className="text-xs text-stone-500">
                      {p.client} · {p.unitCount} vnt.
                    </p>
                  </div>
                  <Link
                    href={`/orders/${p.orderId}`}
                    className="shrink-0 text-sm font-semibold text-stone-700 underline"
                  >
                    Atidaryti
                  </Link>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="card-panel">
          <h2 className="font-display text-lg font-semibold">
            Laukiami atvykimai
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Prekės, kurios dar neatvyko į sandėlį
          </p>
          <div className="mt-3">
            {summary.arrivals.length === 0 ? (
              <p className="text-sm text-stone-500">Nėra laukiamų atvykimų</p>
            ) : (
              summary.arrivals.map((a) => (
                <div key={a.shipmentId} className="list-row">
                  <div>
                    <p className="font-medium text-stone-900">{a.project}</p>
                    <p className="text-xs text-stone-500">
                      {a.carrier}
                      {a.expectedAt
                        ? ` · ${new Date(a.expectedAt).toLocaleDateString("lt-LT")}`
                        : ""}
                    </p>
                  </div>
                  {a.orderId ? (
                    <Link
                      href={`/orders/${a.orderId}`}
                      className="shrink-0 text-sm font-semibold text-stone-700 underline"
                    >
                      Atidaryti
                    </Link>
                  ) : (
                    <Link
                      href={`/laukia/${a.shipmentId}`}
                      className="shrink-0 text-sm font-semibold text-stone-700 underline"
                    >
                      Peržiūrėti
                    </Link>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      <IncomingArrivalModal
        open={incomingOpen}
        onClose={() => setIncomingOpen(false)}
      />
    </div>
  );
}
