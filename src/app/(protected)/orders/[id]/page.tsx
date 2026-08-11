"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { loadState, placeUnit, restoreOrderFromArchive } from "@/lib/demo-store";
import { useWms } from "@/lib/use-wms";
import { formatOrderQty } from "@/lib/labels";
import { unitNotesVisibleInOrderInfo } from "@/lib/order-info";
import {
  formatLocationHuman,
  locationOptionLabel,
  unitStatusLabel,
  zoneLabel,
} from "@/lib/ui-labels";
import { suggestPlacementLocal } from "@/lib/placement";
import { OrderInfoSection } from "@/components/OrderInfoSection";
import { OrderEditSection } from "@/components/OrderEditSection";

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
  const canIssue = units.some((u) =>
    ["stored", "received", "staged"].includes(u.status),
  );

  if (!order) {
    return (
      <div className="mx-auto max-w-3xl w-full space-y-2 py-6">
        <p className="text-stone-700">Užsakymas nerastas.</p>
        <Link href="/orders" className="text-sm font-medium underline">
          ← Atgal į užsakymus
        </Link>
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
      let errText = "Nepavyko paruošti lipdukų";
      try {
        const j = (await res.json()) as { error?: string };
        if (res.status === 401) errText = "Sesija pasibaigė — prisijunk iš naujo";
        else if (res.status === 503)
          errText = "Spausdinimas dar nesutvarkytas šiame kompiuteryje";
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
        setMsg("Lipdukai išsaugoti — gali spausdinti.");
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
      "Lipdukai atsisiųsti. Išarchyvuok failą ir paleisk spausdinimą.",
    );
  }

  function showSuggestedPlacement() {
    if (!suggestion) {
      setMsg("Nėra laisvos vietos pagal šį užsakymą");
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
    router.push(`/pick/${order.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl w-full space-y-5 py-4 sm:py-6">
      <div>
        <Link
          href="/orders"
          className="text-sm text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-stone-800"
        >
          ← Užsakymai
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
          Užsakymas
        </p>
        <h1 className="font-display mt-1 text-3xl font-semibold text-stone-900">
          {order.project || order.orderCode || "Be pavadinimo"}
        </h1>
        <p className="mt-1 text-sm text-stone-600">
          {[
            order.orderCode,
            order.client,
            zoneLabel(order.zone),
            order.blockStorage ? "ilgas saugojimas" : null,
            units.length > 0 ? formatOrderQty(units) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {order.qrToken && (
          <Link
            href={`/o/${order.qrToken}`}
            className="mt-2 inline-block text-sm font-medium text-stone-700 underline decoration-stone-300 underline-offset-2"
          >
            Atidaryti QR kortelę
          </Link>
        )}
      </div>

      {msg && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {msg}
        </p>
      )}

      <section className="card-panel space-y-3">
        <h2 className="font-display text-lg font-semibold text-stone-900">
          Ką daryti
        </h2>
        <div className="page-mobile-stack">
          <button type="button" onClick={downloadLabels} className="btn-primary">
            Spausdinti lipdukus
          </button>
          {pendingShipment && (
            <Link href={`/receive/${pendingShipment.id}`} className="btn-secondary">
              Priimti atvykimą
            </Link>
          )}
          <button
            type="button"
            onClick={showSuggestedPlacement}
            className="btn-secondary"
          >
            Kur padėti?
          </button>
          <Link href={`/pick/${order.id}`} className="btn-secondary">
            Atsiėmimas / važtaraštis
          </Link>
        </div>
        {canIssue && (
          <button type="button" onClick={doIssue} className="btn-danger w-full sm:w-auto">
            Klientas pasiėmė…
          </button>
        )}
        {order.status === "archived" && (
          <button
            type="button"
            className="btn-primary w-full sm:w-auto"
            onClick={() => {
              if (
                !confirm(
                  "Grąžinti užsakymą į sandėlį su buvusiomis vietomis (jei žinomos)?",
                )
              )
                return;
              restoreOrderFromArchive(loadState(), order.id);
              setMsg("Užsakymas grąžintas į sandėlį");
            }}
          >
            Grąžinti iš archyvo
          </button>
        )}
      </section>

      <OrderEditSection orderId={order.id} />

      <OrderInfoSection orderId={order.id} id="info" />

      <section className="card-panel">
        <h2 className="font-display text-lg font-semibold text-stone-900">
          Dėžės ir paletės
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Pasirink vietą iš sąrašo arba perkelk per sandėlio žemėlapį
        </p>
        <ul className="mt-3 divide-y divide-stone-100">
          {units.map((u) => {
            const loc = state.locations.find((l) => l.id === u.locationId);
            const floor = u.floorAreaId
              ? state.floorAreas.find((f) => f.id === u.floorAreaId)
              : null;
            const placeLabel = floor
              ? floor.label || "Ant grindų"
              : formatLocationHuman(loc?.code ?? null, loc?.label);
            const showUnitNotes = !unitNotesVisibleInOrderInfo(
              state,
              order.id,
              u.notes,
            );
            return (
              <li key={u.id} className="flex flex-col gap-2 py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <Link
                      href={`/u/${u.qrToken}`}
                      className="font-semibold text-stone-900 underline decoration-stone-300 underline-offset-2"
                    >
                      {u.indexInSet}/{u.totalInSet} — {u.labelTitle}
                    </Link>
                    <p className="mt-0.5 text-sm text-stone-600">
                      <span className="font-medium text-stone-800">
                        {unitStatusLabel(u.status)}
                      </span>
                      {" · "}
                      {placeLabel}
                    </p>
                  </div>
                </div>
                {showUnitNotes && u.notes?.trim() && (
                  <p className="rounded-lg bg-stone-50 px-2.5 py-2 text-xs leading-relaxed text-stone-700 whitespace-pre-wrap">
                    {u.notes}
                  </p>
                )}
                <select
                  className="field !min-h-11 !py-2 text-sm sm:!min-h-0"
                  value={u.locationId ?? ""}
                  onChange={(e) => {
                    if (e.target.value)
                      placeUnit(loadState(), u.id, e.target.value);
                  }}
                >
                  <option value="">— pasirink vietą —</option>
                  {state.locations
                    .filter(
                      (l) =>
                        l.kind === "pallet" ||
                        l.kind === "special" ||
                        l.kind === "small_shelf",
                    )
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {locationOptionLabel(l)}
                      </option>
                    ))}
                </select>
              </li>
            );
          })}
          {units.length === 0 && (
            <li className="py-6 text-sm text-stone-500">
              Dar nėra pažymėtų dėžių
            </li>
          )}
        </ul>
      </section>

      {suggestion && (
        <section className="card-panel">
          <h2 className="font-display text-lg font-semibold text-stone-900">
            Siūloma vieta
          </h2>
          <p className="mt-1 font-semibold text-stone-900">
            {formatLocationHuman(suggestion.code)}
          </p>
          <p className="mt-1 text-sm text-stone-600">{suggestion.reason}</p>
          <button
            type="button"
            className="btn-secondary mt-3"
            onClick={showSuggestedPlacement}
          >
            Rodyti sandėlyje
          </button>
        </section>
      )}
    </div>
  );
}
