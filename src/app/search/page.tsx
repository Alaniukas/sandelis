"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MobileCardList, MobileCardRow } from "@/components/MobileCardList";
import {
  ComboField,
  DateField,
  SuggestField,
} from "@/components/ui/FormFields";
import { HintLabel } from "@/components/ui/HintLabel";
import { getFormSuggestions, searchInventory } from "@/lib/demo-store";
import { useWms } from "@/lib/use-wms";
import { unitStatusLabel } from "@/lib/ui-labels";

export default function SearchPage() {
  const state = useWms();
  const router = useRouter();
  const suggestions = useMemo(() => getFormSuggestions(state), [state]);

  const [project, setProject] = useState("");
  const [client, setClient] = useState("");
  const [orderCode, setOrderCode] = useState("");
  const [query, setQuery] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [arrivedFrom, setArrivedFrom] = useState("");
  const [arrivedTo, setArrivedTo] = useState("");
  const [issuedFrom, setIssuedFrom] = useState("");
  const [issuedTo, setIssuedTo] = useState("");

  const combinedQuery = useMemo(() => {
    return [project, client, orderCode, query].filter(Boolean).join(" ");
  }, [project, client, orderCode, query]);

  const results = useMemo(
    () =>
      searchInventory(state, combinedQuery, {
        manufacturer: manufacturer || undefined,
        arrivedFrom: arrivedFrom || undefined,
        arrivedTo: arrivedTo || undefined,
        issuedFrom: issuedFrom || undefined,
        issuedTo: issuedTo || undefined,
      }),
    [
      state,
      combinedQuery,
      manufacturer,
      arrivedFrom,
      arrivedTo,
      issuedFrom,
      issuedTo,
    ],
  );

  function showOnMap(
    rack: number | null,
    unitId: string,
    locationCode: string | null,
    label: string,
  ) {
    if (rack != null) {
      const params = new URLSearchParams({
        rack: String(rack),
        unit: unitId,
        hint: "1",
      });
      if (locationCode) params.set("code", locationCode);
      params.set("label", label);
      router.push(`/map?${params.toString()}`);
      return;
    }
    router.push(`/map?unit=${unitId}&hint=1&label=${encodeURIComponent(label)}`);
  }

  return (
    <div className="space-y-5 py-4 sm:py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
          Rask bet ką sandėlyje
        </p>
        <HintLabel
          block
          label="Paieška"
          hint="Ieškok pagal projektą, klientą, kodą ar gamintoją. Radęs — parodys kur stovi ir nuves į sandėlį. Skiriasi nuo Užsakymų: čia ieškai konkrečių dėžių ar palečių, ne užsakymų sąrašo."
          className="mt-1"
        />
      </div>

      <div className="card-panel space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <SuggestField
            className="sm:col-span-2"
            label="Projektas"
            value={project}
            onChange={setProject}
            suggestions={suggestions.projects}
            placeholder="Pvz. Paneriu 56 — rašyk ir pasirink iš sąrašo"
          />
          <SuggestField
            label="Klientas"
            value={client}
            onChange={setClient}
            suggestions={suggestions.clients}
            placeholder="Vardas, įmonė, adresas…"
          />
          <SuggestField
            label="Užsakymo kodas"
            value={orderCode}
            onChange={setOrderCode}
            suggestions={suggestions.orderCodes}
            placeholder="BJ-…, I-1079-01…"
          />
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-stone-700">
              Papildoma paieška
            </span>
            <input
              className="field"
              placeholder="Prekės pavadinimas, pastabos…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <ComboField
            label="Gamintojas"
            value={manufacturer}
            onChange={setManufacturer}
            options={suggestions.manufacturers}
            placeholder="Pasirink arba įrašyk naują"
          />
          <DateField
            label="Atvykimo data nuo"
            value={arrivedFrom}
            onChange={setArrivedFrom}
          />
          <DateField
            label="Atvykimo data iki"
            value={arrivedTo}
            onChange={setArrivedTo}
          />
          <DateField
            label="Išvežimo data nuo"
            value={issuedFrom}
            onChange={setIssuedFrom}
          />
          <DateField
            label="Išvežimo data iki"
            value={issuedTo}
            onChange={setIssuedTo}
          />
        </div>
        {(arrivedFrom || arrivedTo || issuedFrom || issuedTo) && (
          <button
            type="button"
            className="text-sm font-medium text-stone-600 underline hover:text-stone-900"
            onClick={() => {
              setArrivedFrom("");
              setArrivedTo("");
              setIssuedFrom("");
              setIssuedTo("");
            }}
          >
            Išvalyti datas — ieškoti visų
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 bg-stone-50 px-4 py-3 text-sm text-stone-600">
          Rasta: <strong>{results.length}</strong>
        </div>

        <MobileCardList>
          {results.map((r) => (
            <MobileCardRow
              key={r.unitId}
              title={r.label}
              subtitle={[r.project, r.client].filter(Boolean).join(" · ")}
              meta={
                <>
                  <p className="text-xs text-stone-500">
                    {r.orderCode || "—"} · {unitStatusLabel(r.status)}
                  </p>
                  <p className="mt-1 font-medium">
                    {r.locationLabel}
                    {r.rack != null && (
                      <span className="ml-1 text-xs font-normal text-stone-500">
                        (stel. {r.rack})
                      </span>
                    )}
                  </p>
                </>
              }
              actions={
                <>
                  <button
                    type="button"
                    className="btn-primary !text-xs"
                    onClick={() =>
                      showOnMap(
                        r.rack,
                        r.unitId,
                        r.locationCode,
                        r.label,
                      )
                    }
                  >
                    Sandėlyje
                  </button>
                  <Link
                    href={`/orders/${r.orderId}`}
                    className="btn-secondary !text-xs"
                  >
                    Užsakymas
                  </Link>
                </>
              }
            />
          ))}
          {results.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-stone-500">
              Nieko nerasta — pabandyk kitus filtrus
            </p>
          )}
        </MobileCardList>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">Projektas</th>
                <th className="px-4 py-3">Prekė</th>
                <th className="px-4 py-3">Kodas</th>
                <th className="px-4 py-3">Kur stovi</th>
                <th className="px-4 py-3">Būsena</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr
                  key={r.unitId}
                  className="border-t border-stone-100 hover:bg-stone-50/80"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-stone-900">
                      {r.project || "—"}
                    </p>
                    <p className="text-xs text-stone-500">{r.client || "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-stone-800">{r.label}</td>
                  <td className="px-4 py-3 font-mono text-xs text-stone-600">
                    {r.orderCode || "—"}
                  </td>
                  <td className="px-4 py-3 text-stone-700">
                    {r.locationLabel}
                    {r.rack != null && (
                      <span className="ml-1 text-xs text-stone-500">
                        (stel. {r.rack})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {unitStatusLabel(r.status)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-secondary !px-2.5 !py-1.5 !text-xs"
                        onClick={() =>
                          showOnMap(
                            r.rack,
                            r.unitId,
                            r.locationCode,
                            r.label,
                          )
                        }
                      >
                        Rodyti sandėlyje
                      </button>
                      <Link
                        href={`/orders/${r.orderId}`}
                        className="btn-secondary !px-2.5 !py-1.5 !text-xs"
                      >
                        Užsakymas
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {results.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-stone-500"
                  >
                    Nieko nerasta — pabandyk kitą paiešką
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
