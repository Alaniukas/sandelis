"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { IncomingArrivalModal } from "@/components/IncomingArrivalModal";
import { shipmentAttachmentHref } from "@/lib/attachments";
import {
  deleteExpectedArrival,
  getDashboardSummary,
  loadState,
  markExpectedArrivalReceived,
} from "@/lib/demo-store";
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
            Šiandien sandėlyje
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
          <Link href="/map" className="btn-secondary">
            Atidaryti sandėlį
          </Link>
          <Link href="/search" className="btn-secondary">
            Ieškoti prekės
          </Link>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="stat-card">
          <h3>Sandėlyje dabar</h3>
          <p className="stat-value">{summary.totalUnits}</p>
          <p className="mt-1 text-sm text-stone-500">
            {summary.boxes} dėžės · {summary.pallets} paletės
          </p>
        </div>
        <div className="stat-card text-left">
          <h3>Užimtumas</h3>
          <p className="stat-value text-center sm:text-left">
            {summary.occupancyPct}%
          </p>
          <p className="mt-1 text-center text-sm text-stone-500 sm:text-left">
            Visas sandėlis · {summary.occupiedSlots} iš {summary.totalSlots}{" "}
            vietų
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-baseline justify-between gap-3 border-t border-stone-100 pt-2">
              <span className="text-stone-600">ExpoDesign</span>
              <span className="font-semibold tabular-nums text-stone-900">
                {summary.expoOccupancyPct}%
              </span>
            </li>
            <li className="flex items-baseline justify-between gap-3">
              <span className="text-stone-600">Diled</span>
              <span className="font-semibold tabular-nums text-stone-900">
                {summary.diledOccupancyPct}%
              </span>
            </li>
            <li className="flex items-baseline justify-between gap-3">
              <span className="text-stone-600">Ant grindų</span>
              <span className="font-semibold tabular-nums text-stone-900">
                {summary.floorUnitsCount > 0
                  ? summary.floorAreaCount > 0
                    ? `${summary.floorOccupancyPct}% · ${summary.floorUnitsCount} prekės`
                    : `${summary.floorUnitsCount} prekės`
                  : "tuščia"}
              </span>
            </li>
          </ul>
        </div>
        <div className="stat-card">
          <h3>Užsakymai</h3>
          <p className="stat-value">{summary.activeOrders}</p>
          <p className="mt-1 text-sm text-stone-500">
            <Link
              href="/orders"
              className="font-medium text-stone-700 underline decoration-stone-300 underline-offset-2 hover:decoration-stone-700"
            >
              Peržiūrėti sąrašą
            </Link>
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card-panel text-left">
          <h2 className="font-display text-lg font-semibold text-stone-900">
            Paruošta atsiėmimui
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Klientas gali atvažiuoti pasiimti
          </p>
          <div className="mt-3">
            {summary.pickups.length === 0 ? (
              <p className="text-sm text-stone-500">Šiuo metu nieko neparuošta</p>
            ) : (
              summary.pickups.map((p) => (
                <div key={p.orderId} className="list-row">
                  <div className="min-w-0 text-left">
                    <p className="font-semibold text-stone-900">{p.project}</p>
                    <p className="text-sm text-stone-500">
                      {p.client} · {p.unitCount}{" "}
                      {p.unitCount === 1 ? "dėžė" : "dėžės"}
                    </p>
                  </div>
                  <Link
                    href={`/orders/${p.orderId}`}
                    className="shrink-0 text-sm font-semibold text-stone-800 underline decoration-stone-300 underline-offset-2"
                  >
                    Atidaryti
                  </Link>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="card-panel text-left">
          <h2 className="font-display text-lg font-semibold text-stone-900">
            Laukiami atvykimai
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Dar neatvažiavo — galima pasižiūrėti dokumentą
          </p>
          <div className="mt-3">
            {summary.arrivals.length === 0 ? (
              <p className="text-sm text-stone-500">Nėra laukiamų atvykimų</p>
            ) : (
              summary.arrivals.map((a) => {
                const shipment = state.shipments.find(
                  (s) => s.id === a.shipmentId,
                );
                const attachmentHref = shipment
                  ? shipmentAttachmentHref(shipment)
                  : null;
                return (
                  <div key={a.shipmentId} className="list-row">
                    <div className="min-w-0 flex-1 text-left">
                      <p className="font-semibold text-stone-900">{a.project}</p>
                      <p className="text-sm text-stone-500">
                        {[
                          a.carrier !== "—" ? a.carrier : null,
                          a.expectedAt
                            ? new Date(a.expectedAt).toLocaleDateString("lt-LT")
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Data nenurodyta"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                      {a.hasAttachment && attachmentHref && (
                        <a
                          href={attachmentHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold text-stone-800 underline decoration-stone-300 underline-offset-2"
                        >
                          Dokumentas
                        </a>
                      )}
                      <button
                        type="button"
                        className="text-sm font-semibold text-emerald-800 underline decoration-emerald-200 underline-offset-2"
                        onClick={() => {
                          if (
                            window.confirm(
                              "Pažymėti, kad prekės jau atvažiavo? Vėliau jas padėsi sandėlyje.",
                            )
                          ) {
                            markExpectedArrivalReceived(
                              loadState(),
                              a.shipmentId,
                            );
                          }
                        }}
                      >
                        Atvyko
                      </button>
                      <button
                        type="button"
                        className="text-sm font-medium text-stone-500 underline decoration-stone-200 underline-offset-2"
                        onClick={() => {
                          if (
                            window.confirm(
                              "Pašalinti šį laukiamą atvykimą iš sąrašo?",
                            )
                          ) {
                            deleteExpectedArrival(loadState(), a.shipmentId);
                          }
                        }}
                      >
                        Pašalinti
                      </button>
                      {a.orderId ? (
                        <Link
                          href={`/orders/${a.orderId}`}
                          className="text-sm font-semibold text-stone-800 underline decoration-stone-300 underline-offset-2"
                        >
                          Atidaryti
                        </Link>
                      ) : (
                        <Link
                          href={`/laukia/${a.shipmentId}`}
                          className="text-sm font-semibold text-stone-800 underline decoration-stone-300 underline-offset-2"
                        >
                          Plačiau
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })
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
