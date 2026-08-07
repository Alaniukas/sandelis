"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { issueOrder, loadState } from "@/lib/demo-store";
import { useWms } from "@/lib/use-wms";
import {
  formatLocationHuman,
  unitStatusLabel,
  zoneLabel,
} from "@/lib/ui-labels";

export default function PickPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const state = useWms();
  const order = state.orders.find((o) => o.id === orderId);
  const units = state.units.filter(
    (u) => u.orderId === orderId && u.status !== "archived",
  );
  const [recipient, setRecipient] = useState("");
  const [done, setDone] = useState("");

  if (!order) {
    return (
      <div className="mx-auto max-w-xl space-y-2 py-6">
        <p>Užsakymas nerastas.</p>
        <Link href="/orders" className="text-sm underline">
          ← Užsakymai
        </Link>
      </div>
    );
  }

  function printWaybill() {
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = units
      .map((u) => {
        const loc = state.locations.find((l) => l.id === u.locationId);
        const floor = u.floorAreaId
          ? state.floorAreas.find((f) => f.id === u.floorAreaId)
          : null;
        const place = floor
          ? floor.label || "Ant grindų"
          : formatLocationHuman(loc?.code ?? null, loc?.label);
        return `<tr><td>${u.indexInSet}/${u.totalInSet}</td><td>${u.labelTitle}</td><td>${place}</td><td>${unitStatusLabel(u.status)}</td></tr>`;
      })
      .join("");
    w.document.write(`<!doctype html><html><head><title>Važtaraštis</title>
      <style>body{font-family:sans-serif;padding:24px} table{border-collapse:collapse;width:100%}
      td,th{border:1px solid #333;padding:6px;text-align:left}</style></head><body>
      <h1>Prekių priėmimo–perdavimo aktas</h1>
      <p><b>Projektas:</b> ${order!.project}<br/>
      <b>Kodas:</b> ${order!.orderCode}<br/>
      <b>Klientas:</b> ${order!.client}<br/>
      <b>Data:</b> ${new Date().toLocaleString("lt-LT")}</p>
      <table><thead><tr><th>Dėžė</th><th>Pavadinimas</th><th>Kur stovėjo</th><th>Būsena</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p style="margin-top:40px">Išdavė: _________________ &nbsp;&nbsp; Gavo: _________________</p>
      <script>window.print()</script></body></html>`);
    w.document.close();
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 py-4 sm:py-6">
      <div>
        <Link
          href={`/orders/${orderId}`}
          className="text-sm text-stone-500 underline decoration-stone-300 underline-offset-2"
        >
          ← Užsakymas
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
          Išdavimas klientui
        </p>
        <h1 className="font-display mt-1 text-3xl font-semibold text-stone-900">
          Atsiėmimas
        </h1>
        <p className="mt-1 text-sm text-stone-600">
          {[order.project, order.client, zoneLabel(order.zone)]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <section className="card-panel">
        <h2 className="font-display text-lg font-semibold text-stone-900">
          Kas išvežama
        </h2>
        <ul className="mt-3 divide-y divide-stone-100">
          {units.map((u) => {
            const loc = state.locations.find((l) => l.id === u.locationId);
            const floor = u.floorAreaId
              ? state.floorAreas.find((f) => f.id === u.floorAreaId)
              : null;
            const place = floor
              ? floor.label || "Ant grindų"
              : formatLocationHuman(loc?.code ?? null, loc?.label);
            return (
              <li key={u.id} className="py-3">
                <p className="font-semibold text-stone-900">
                  {u.indexInSet}/{u.totalInSet} — {u.labelTitle}
                </p>
                <p className="mt-0.5 text-sm text-stone-600">
                  <span className="font-medium">{unitStatusLabel(u.status)}</span>
                  {" · "}
                  {place}
                </p>
              </li>
            );
          })}
          {units.length === 0 && (
            <li className="py-4 text-sm text-stone-500">Nėra prekių</li>
          )}
        </ul>
      </section>

      <section className="card-panel space-y-4">
        <button type="button" onClick={printWaybill} className="btn-secondary w-full">
          Spausdinti važtaraštį
        </button>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">
            Kas pasiėmė?
          </span>
          <input
            className="field"
            placeholder="Vardas, įmonė, vežėjas…"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />
        </label>

        <button
          type="button"
          onClick={() => {
            issueOrder(loadState(), orderId, recipient || "Klientas", "");
            setDone("Išduota klientui");
            setTimeout(() => router.push("/"), 800);
          }}
          className="btn-primary w-full"
        >
          Pažymėti: pasiėmė
        </button>

        {done && (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {done}
          </p>
        )}
      </section>
    </div>
  );
}
