"use client";

import Link from "next/link";
import { MobileCardList, MobileCardRow } from "@/components/MobileCardList";
import { loadState, restoreOrderFromArchive } from "@/lib/demo-store";
import { useWms } from "@/lib/use-wms";
import { zoneLabel } from "@/lib/ui-labels";

export default function ArchivePage() {
  const state = useWms();
  const archived = state.orders.filter((o) => o.status === "archived");
  const handovers = state.handovers;

  function handleRestore(orderId: string, title: string) {
    if (
      !confirm(
        `Grąžinti „${title}“ į sandėlį su buvusiomis vietomis (jei žinomos)?`,
      )
    ) {
      return;
    }
    restoreOrderFromArchive(loadState(), orderId);
  }

  return (
    <div className="mx-auto max-w-3xl w-full space-y-5 py-4 sm:py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
          Baigti užsakymai
        </p>
        <h1 className="font-display mt-1 text-3xl font-semibold text-stone-900">
          Archyvas
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Prekės, kurias klientas jau pasiėmė — galima grąžinti atgal į sandėlį
        </p>
      </div>

      <MobileCardList>
        {archived.map((o) => {
          const h = handovers.find((x) => x.orderId === o.id);
          const title = o.project || o.orderCode || "Be pavadinimo";
          return (
            <MobileCardRow
              key={o.id}
              href={`/orders/${o.id}`}
              title={title}
              subtitle={[o.orderCode, o.client, zoneLabel(o.zone)]
                .filter(Boolean)
                .join(" · ")}
              meta={
                <div className="space-y-2">
                  <p className="text-sm text-stone-600">
                    {h
                      ? `Pasiėmė: ${h.recipientName} · ${new Date(h.issuedAt).toLocaleDateString("lt-LT")}`
                      : "Išduota"}
                  </p>
                  <button
                    type="button"
                    className="btn-secondary !px-3 !py-1.5 !text-xs"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleRestore(o.id, title);
                    }}
                  >
                    Grąžinti į sandėlį
                  </button>
                </div>
              }
            />
          );
        })}
        {archived.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-stone-500">
            Archyvas tuščias
          </p>
        )}
      </MobileCardList>

      <div className="hidden overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Projektas</th>
              <th className="px-4 py-3">Kodas</th>
              <th className="px-4 py-3">Klientas</th>
              <th className="px-4 py-3">Kas pasiėmė</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {archived.map((o) => {
              const h = handovers.find((x) => x.orderId === o.id);
              const title = o.project || o.orderCode || "—";
              return (
                <tr
                  key={o.id}
                  className="border-t border-stone-100 hover:bg-stone-50/80"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/orders/${o.id}`}
                      className="font-medium text-stone-900 underline decoration-stone-300 underline-offset-2"
                    >
                      {title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-stone-600">{o.orderCode || "—"}</td>
                  <td className="px-4 py-3 text-stone-600">{o.client || "—"}</td>
                  <td className="px-4 py-3 text-stone-600">
                    {h
                      ? `${h.recipientName} · ${new Date(h.issuedAt).toLocaleDateString("lt-LT")}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="btn-secondary !px-3 !py-1.5 !text-xs"
                      onClick={() => handleRestore(o.id, title)}
                    >
                      Grąžinti į sandėlį
                    </button>
                  </td>
                </tr>
              );
            })}
            {archived.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-stone-500"
                >
                  Archyvas tuščias
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
