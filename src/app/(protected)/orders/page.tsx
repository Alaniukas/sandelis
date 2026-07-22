"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MobileCardList, MobileCardRow } from "@/components/MobileCardList";
import { searchOrders, getFormSuggestions } from "@/lib/demo-store";
import { useWms } from "@/lib/use-wms";
import { SuggestField } from "@/components/ui/FormFields";
import { HintLabel } from "@/components/ui/HintLabel";

export default function OrdersPage() {
  const state = useWms();
  const [q, setQ] = useState("");
  const suggestions = useMemo(() => getFormSuggestions(state), [state]);
  const list = useMemo(() => searchOrders(state, q), [state, q]);

  return (
    <div className="mx-auto max-w-3xl w-full space-y-5 py-4 sm:py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
            Visi užsakymai
          </p>
          <HintLabel
            block
            label="Užsakymai"
            hint="Užsakymų sąrašas — vienas projektas gali turėti kelias dėžes. Konkrečiai prekei ieškok per Paiešką."
            className="mt-1"
          />
        </div>
        <Link href="/map?new=1" className="btn-primary w-full sm:w-auto">
          + Naujas atvykimas
        </Link>
      </div>

      <div className="relative max-w-lg">
        <SuggestField
          label="Ieškoti užsakymo"
          value={q}
          onChange={setQ}
          suggestions={[
            ...suggestions.projects,
            ...suggestions.clients,
            ...suggestions.orderCodes,
          ]}
          placeholder="Projektas, kodas, klientas…"
        />
      </div>

      <MobileCardList>
        {list.map((o) => (
          <MobileCardRow
            key={o.id}
            href={`/orders/${o.id}`}
            title={o.project || o.orderCode || "Be pavadinimo"}
            subtitle={[o.orderCode, o.client].filter(Boolean).join(" · ")}
            meta={
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                  o.zone === "EXPO"
                    ? "bg-emerald-50 text-emerald-800"
                    : o.zone === "DILED"
                      ? "bg-sky-50 text-sky-800"
                      : "bg-stone-100 text-stone-600"
                }`}
              >
                {o.zone || "—"} · {o.status === "active" ? "Aktyvus" : "Archyvuotas"}
              </span>
            }
          />
        ))}
        {list.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-stone-500">
            Nėra užsakymų — registruok naują atvykimą
          </p>
        )}
      </MobileCardList>

      <div className="hidden overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Kodas</th>
              <th className="px-4 py-3">Projektas</th>
              <th className="px-4 py-3">Klientas</th>
              <th className="px-4 py-3">Zona</th>
              <th className="px-4 py-3">Būsena</th>
            </tr>
          </thead>
          <tbody>
            {list.map((o) => (
              <tr
                key={o.id}
                className="border-t border-stone-100 transition hover:bg-stone-50/80"
              >
                <td className="px-4 py-3">
                  <Link
                    className="font-semibold text-stone-900 underline decoration-stone-300 underline-offset-2 hover:decoration-stone-800"
                    href={`/orders/${o.id}`}
                  >
                    {o.orderCode || "—"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-stone-800">{o.project || "—"}</td>
                <td className="px-4 py-3 text-stone-600">{o.client || "—"}</td>
                <td className="px-4 py-3">
                  {o.zone ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        o.zone === "EXPO"
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-sky-50 text-sky-800"
                      }`}
                    >
                      {o.zone}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-stone-600">
                  {o.status === "active" ? "Aktyvus" : "Archyvuotas"}
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-stone-500">
                  Nėra užsakymų — registruok naują atvykimą
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
