"use client";

import { useParams } from "next/navigation";
import { useWms } from "@/lib/use-wms";
import { issueOrder, loadState, stageOrder } from "@/lib/demo-store";
import Link from "next/link";
import { useState } from "react";

export default function PickPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const state = useWms();
  const order = state.orders.find((o) => o.id === orderId);
  const units = state.units.filter(
    (u) => u.orderId === orderId && u.status !== "archived",
  );
  const [recipient, setRecipient] = useState("");
  const [done, setDone] = useState("");

  if (!order) return <p>Nerasta</p>;

  function printWaybill() {
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = units
      .map(
        (u) =>
          `<tr><td>${u.indexInSet}/${u.totalInSet}</td><td>${u.labelTitle}</td><td>${u.status}</td></tr>`,
      )
      .join("");
    w.document.write(`<!doctype html><html><head><title>Važtaraštis</title>
      <style>body{font-family:sans-serif;padding:24px} table{border-collapse:collapse;width:100%}
      td,th{border:1px solid #333;padding:6px;text-align:left}</style></head><body>
      <h1>Prekių priėmimo–perdavimo aktas</h1>
      <p><b>Projektas:</b> ${order!.project}<br/>
      <b>Kodas:</b> ${order!.orderCode}<br/>
      <b>Klientas:</b> ${order!.client}<br/>
      <b>Data:</b> ${new Date().toLocaleString("lt-LT")}</p>
      <table><thead><tr><th>Vnt</th><th>Pavadinimas</th><th>Statusas</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p style="margin-top:40px">Išdavė: _________________ &nbsp;&nbsp; Gavo: _________________</p>
      <script>window.print()</script></body></html>`);
    w.document.close();
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href={`/orders/${orderId}`} className="text-sm underline">
        ← Užsakymas
      </Link>
      <h1 className="font-display text-3xl font-semibold">Atsiėmimas</h1>
      <p className="text-sm text-stone-600">
        {order.project} · {order.client}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            stageOrder(loadState(), orderId);
            setDone("Paruošta STAGING");
          }}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          Į STAGING
        </button>
        <button onClick={printWaybill} className="rounded-lg bg-stone-900 px-3 py-2 text-sm text-white">
          Spausdinti važtaraštį
        </button>
      </div>

      <label className="block text-sm">
        Gavėjas
        <input
          className="mt-1 w-full rounded border px-2 py-1.5"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
        />
      </label>

      <button
        className="w-full rounded-lg bg-red-800 py-2.5 text-sm text-white"
        onClick={() => {
          issueOrder(loadState(), orderId, recipient || "Klientas", "");
          setDone("Pasiėmė — archyvuota");
        }}
      >
        Klientas pasiėmė
      </button>

      {done && <p className="text-sm text-emerald-800">{done}</p>}

      <ul className="rounded-xl border bg-white p-3 text-sm">
        {units.map((u) => (
          <li key={u.id}>
            {u.indexInSet}/{u.totalInSet} — {u.labelTitle} ({u.status})
          </li>
        ))}
      </ul>
    </div>
  );
}
