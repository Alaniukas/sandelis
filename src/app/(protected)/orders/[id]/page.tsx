"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { issueOrder, loadState, placeUnit } from "@/lib/demo-store";
import { useWms } from "@/lib/use-wms";
import { formatOrderQty } from "@/lib/labels";
import { unitNotesVisibleInOrderInfo } from "@/lib/order-info";
import { unitStatusLabel, zoneLabel } from "@/lib/ui-labels";
import { suggestPlacementLocal } from "@/lib/placement";
import { OrderInfoSection } from "@/components/OrderInfoSection";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const state = useWms();
  const order = state.orders.find((o) => o.id === id);
  const units = state.units.filter((u) => u.orderId === id);
  const shipments = state.shipments.filter((s) => s.orderId === id);
  const [msg, setMsg] = useState("");

  const suggestion = useMemo(() => {
    if (!order) return null;
    const colli = units.reduce((s, u) => s + (u.totalInSet ?? 1), 0) || 1;
    return suggestPlacementLocal(state, {
      zone: order.zone,
      notes: order.notes,
      project: order.project || order.orderCode,
      colli,
    });
  }, [state, order, units]);

  const pendingShipment = shipments.find((s) => s.status === "expected");

  if (!order) {
    return (
      <div className="mx-auto max-w-3xl w-full">
        <p>
          Užsakymas nerastas.{" "}
          <Link href="/orders" className="underline">
            Atgal
          </Link>
        </p>
      </div>
    );
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
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order: order!,
        appUrl,
        units,
        arrivedAt,
      }),
    });
    if (!res.ok) {
      let errText = "Klaida generuojant lipduką";
      try {
        const j = (await res.json()) as { error?: string };
        if (res.status === 401) errText = "Sesija pasibaigė — prisijunk iš naujo";
        else if (res.status === 503) errText = "Serveris nesukonfigūruotas (Supabase)";
        else if (j.error) errText = j.error;
      } catch {
        /* ignore */
      }
      setMsg(errText);
      return;
    }
    const blob = await res.blob();
    const filename = `lipdukai-${order!.orderCode || order!.id.slice(0, 8)}.zip`;

    if (
      typeof navigator !== "undefined" &&
      navigator.share &&
      navigator.canShare?.({
        files: [new File([blob], filename, { type: "application/zip" })],
      })
    ) {
      try {
        const file = new File([blob], filename, { type: "application/zip" });
        await navigator.share({ files: [file], title: filename });
        setMsg("Lipdukų archyvas pasidalintas / išsaugotas.");
        return;
      } catch {
        /* fallback */
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setMsg(
      "Archyvas atsisiųstas. Išarchyvuok → spausdinti.bat → kopijų sk. → spausdinimas.",
    );
  }

  function showSuggestedPlacement() {
    if (!suggestion) {
      setMsg("Nerasta tinkamos laisvos vietos");
      return;
    }
    const params = new URLSearchParams({
      rack: String(suggestion.rack),
      code: suggestion.code,
      hint: "1",
      label: suggestion.reason,
    });
    const unplaced = units.find((u) => !u.locationId || u.status === "received");
    if (unplaced) params.set("unit", unplaced.id);
    router.push(`/map?${params.toString()}`);
  }

  function doIssue() {
    if (!order) return;
    const name = prompt("Gavėjas / kas pasiėmė?") || "Klientas";
    issueOrder(loadState(), order.id, name, "");
    setMsg("Išduota ir archyvuota");
  }

  return (
    <div className="mx-auto max-w-3xl w-full space-y-4">
      <div>
        <Link href="/orders" className="text-sm text-stone-600 underline">
          ← Užsakymai
        </Link>
        <h1 className="font-display mt-1 text-3xl font-semibold">
          {order.project || order.orderCode}
        </h1>
        <p className="text-sm text-stone-600">
          {order.orderCode} · {order.client} · {zoneLabel(order.zone)}
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

      {msg && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {msg}
        </p>
      )}

      <div className="page-mobile-stack">
        <button onClick={downloadLabels} className="btn-primary">
          Lipdukas (spausdinimas)
        </button>
        {pendingShipment && (
          <Link
            href={`/receive/${pendingShipment.id}`}
            className="btn-secondary"
          >
            Priimti atvykimą
          </Link>
        )}
        <button onClick={showSuggestedPlacement} className="btn-secondary">
          Rodyti siūlomą vietą
        </button>
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
            const showUnitNotes = !unitNotesVisibleInOrderInfo(
              state,
              order.id,
              u.notes,
            );
            return (
              <li
                key={u.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
              >
                <div>
                  <Link
                    href={`/u/${u.qrToken}`}
                    className="font-medium underline"
                  >
                    {u.indexInSet}/{u.totalInSet} — {u.labelTitle}
                  </Link>
                  <div className="text-stone-500">
                    {unitStatusLabel(u.status)} ·{" "}
                    {loc?.label ?? loc?.code ?? "dar nepadėta"}
                  </div>
                  {showUnitNotes && u.notes?.trim() && (
                    <p className="mt-1 text-xs text-stone-600 whitespace-pre-wrap">
                      {u.notes}
                    </p>
                  )}
                </div>
                <select
                  className="field !min-h-11 !py-2 text-sm sm:!min-h-0 sm:w-auto"
                  value={u.locationId ?? ""}
                  onChange={(e) => {
                    if (e.target.value)
                      placeUnit(loadState(), u.id, e.target.value);
                  }}
                >
                  <option value="">— vieta —</option>
                  {state.locations
                    .filter(
                      (l) =>
                        l.kind === "pallet" ||
                        l.kind === "special" ||
                        l.kind === "small_shelf",
                    )
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

      {suggestion && (
        <div className="rounded-xl border bg-white p-4 text-sm">
          <h2 className="font-semibold">Siūloma vieta</h2>
          <p className="mt-1 font-mono text-xs text-stone-800">
            {suggestion.code}
          </p>
          <p className="mt-2 text-stone-600">{suggestion.reason}</p>
        </div>
      )}
    </div>
  );
}
