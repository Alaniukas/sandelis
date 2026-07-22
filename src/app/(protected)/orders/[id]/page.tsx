"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  issueOrder,
  loadState,
  placeUnit,
  stageOrder,
  suggestLocations,
} from "@/lib/demo-store";
import { useWms } from "@/lib/use-wms";
import { formatOrderQty } from "@/lib/labels";
import { unitStatusLabel } from "@/lib/ui-labels";
import { OrderInfoSection } from "@/components/OrderInfoSection";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const state = useWms();
  const order = state.orders.find((o) => o.id === id);
  const units = state.units.filter((u) => u.orderId === id);
  const shipments = state.shipments.filter((s) => s.orderId === id);
  const [msg, setMsg] = useState("");

  const suggestions = useMemo(() => {
    if (!order) return [];
    return suggestLocations(
      state,
      order.zone,
      order.blockStorage,
      units.filter((u) => !u.locationId).length || units.length,
    );
  }, [state, order, units]);

  if (!order) {
    return <p>Užsakymas nerastas. <Link href="/orders">Atgal</Link></p>;
  }

  async function downloadLabels() {
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const arrivedAt =
      shipments.find((s) => s.arrivedAt)?.arrivedAt ??
      shipments[0]?.createdAt ??
      order!.createdAt;
    const res = await fetch("/api/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order: order!,
        appUrl,
        units,
        arrivedAt,
      }),
    });
    if (!res.ok) {
      setMsg("Klaida generuojant lipduką");
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lipdukai-${order!.orderCode || order!.id.slice(0, 8)}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg(
      "ZIP atsisiųstas. Išarchyvuok → spausdinti.bat → kopijų sk. → BarTender spausdina.",
    );
  }

  function autoPlace() {
    let s = loadState();
    let i = 0;
    for (const u of units.filter((x) => !x.locationId || x.status === "received" || x.status === "expected")) {
      const loc = suggestions[i++];
      if (!loc) break;
      s = placeUnit(s, u.id, loc);
    }
    setMsg("Priskirta pasiūlytoms vietoms");
  }

  function doStage() {
    if (!order) return;
    stageOrder(loadState(), order.id);
    setMsg("Paruošta atsiėmimui");
  }

  function doIssue() {
    if (!order) return;
    const name = prompt("Gavėjas / kas pasiėmė?") || "Klientas";
    issueOrder(loadState(), order.id, name, "");
    setMsg("Išduota ir archyvuota");
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/orders" className="text-sm text-stone-600 underline">
          ← Užsakymai
        </Link>
        <h1 className="font-display mt-1 text-3xl font-semibold">
          {order.project || order.orderCode}
        </h1>
        <p className="text-sm text-stone-600">
          {order.orderCode} · {order.client} · {order.zone ?? "zona?"}
          {order.blockStorage ? " · ilgas saugojimas" : ""}
          {units.length > 0 ? ` · ${formatOrderQty(units)}` : ""}
        </p>
        {order.qrToken && (
          <p className="mt-1 text-xs text-stone-500">
            QR:{" "}
            <Link href={`/o/${order.qrToken}`} className="underline">
              /o/{order.qrToken}
            </Link>
          </p>
        )}
      </div>

      {msg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}

      <div className="page-mobile-stack">
        <button onClick={downloadLabels} className="btn-primary">
          Lipdukas (BarTender)
        </button>
        {shipments[0] && (
          <Link
            href={`/receive/${shipments[0].id}`}
            className="btn-secondary"
          >
            Priimti atvykimą
          </Link>
        )}
        <button onClick={autoPlace} className="btn-secondary">
          Pasiūlyti vietą ir padėti
        </button>
        <button onClick={doStage} className="btn-secondary">
          Paruošti atsiėmimui
        </button>
        <Link href={`/pick/${order.id}`} className="btn-secondary">
          Važtaraštis
        </Link>
        <button
          onClick={doIssue}
          className="rounded-lg bg-red-800 px-3 py-2.5 text-sm font-semibold text-white min-h-[2.75rem] w-full sm:w-auto"
        >
          Pažymėti, kad pasiėmė
        </button>
      </div>

      <OrderInfoSection orderId={order.id} id="info" />

      <div className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold">Dėžės ir paletės</h2>
        <ul className="mt-2 divide-y text-sm">
          {units.map((u) => {
            const loc = state.locations.find((l) => l.id === u.locationId);
            return (
              <li key={u.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div>
                  <Link href={`/u/${u.qrToken}`} className="font-medium underline">
                    {u.indexInSet}/{u.totalInSet} — {u.labelTitle}
                  </Link>
                  <div className="text-stone-500">
                    {unitStatusLabel(u.status)} · {loc?.label ?? loc?.code ?? "dar nepadėta"}
                  </div>
                  {u.notes?.trim() && (
                    <p className="mt-1 text-xs text-stone-600 whitespace-pre-wrap">
                      {u.notes}
                    </p>
                  )}
                </div>
                <select
                  className="field !min-h-11 !py-2 text-sm sm:!min-h-0 sm:w-auto"
                  value={u.locationId ?? ""}
                  onChange={(e) => {
                    if (e.target.value) placeUnit(loadState(), u.id, e.target.value);
                  }}
                >
                  <option value="">— vieta —</option>
                  {state.locations
                    .filter((l) => l.kind === "pallet" || l.kind === "special" || l.kind === "small_shelf")
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code}
                      </option>
                    ))}
                </select>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-xl border bg-white p-4 text-sm">
        <h2 className="font-semibold">Putaway pasiūlymai</h2>
        <p className="mt-1 font-mono text-xs text-stone-600">
          {suggestions.slice(0, 12).join(", ") || "—"}
        </p>
      </div>
    </div>
  );
}
