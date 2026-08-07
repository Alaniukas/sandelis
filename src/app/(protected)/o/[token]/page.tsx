"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { issueOrder, loadState } from "@/lib/demo-store";
import { formatOrderQty } from "@/lib/labels";
import { useWms } from "@/lib/use-wms";
import { formatLocationHuman, zoneLabel } from "@/lib/ui-labels";

export default function OrderQrPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const state = useWms();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const order = state.orders.find((o) => o.qrToken === token);
  const units = useMemo(
    () => (order ? state.units.filter((u) => u.orderId === order.id) : []),
    [state.units, order],
  );
  const shipments = useMemo(
    () => (order ? state.shipments.filter((s) => s.orderId === order.id) : []),
    [state.shipments, order],
  );

  const mapUnit = useMemo(() => {
    return (
      units.find(
        (u) =>
          u.locationId &&
          ["stored", "received", "staged"].includes(u.status),
      ) ?? units[0]
    );
  }, [units]);

  const locations = useMemo(() => {
    const codes = new Set<string>();
    for (const u of units) {
      if (u.locationId) {
        const loc = state.locations.find((l) => l.id === u.locationId);
        if (loc?.code) codes.add(formatLocationHuman(loc.code, loc.label));
      }
      if (u.floorAreaId) {
        const f = state.floorAreas.find((fa) => fa.id === u.floorAreaId);
        if (f?.label) codes.add(f.label);
      }
    }
    return [...codes];
  }, [units, state.locations, state.floorAreas]);

  const customFields =
    order?.customFields ??
    shipments[0]?.customFields ??
    shipments[0]?.parsedJson?.customFields ??
    [];

  const active =
    order?.status === "active" &&
    units.some((u) => u.status !== "issued" && u.status !== "archived");

  function handleIssue() {
    if (!order || !active) return;
    setBusy(true);
    issueOrder(loadState(), order.id, "QR atsiėmimas", "");
    setBusy(false);
    setDone(true);
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-8">
        <h1 className="font-display text-xl font-semibold">Užsakymas nerastas</h1>
        <p className="text-sm text-stone-600">
          Šis QR kodas šiuo metu neatpažintas. Pabandyk kitame įrenginyje arba
          atnaujink duomenis.
        </p>
        <Link href="/orders" className="text-sm font-medium underline">
          Į užsakymus
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 py-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Užsakymas
        </p>
        <h1 className="font-display mt-1 text-2xl font-semibold text-stone-900">
          {order.project || order.orderCode || "Be pavadinimo"}
        </h1>
        {order.orderCode && (
          <p className="mt-1 text-sm text-stone-600">{order.orderCode}</p>
        )}

        <dl className="mt-4 space-y-3 text-sm">
          {order.client && (
            <div>
              <dt className="section-label">Klientas</dt>
              <dd className="mt-0.5 font-medium text-stone-900">{order.client}</dd>
            </div>
          )}
          <div>
            <dt className="section-label">Kiekis</dt>
            <dd className="mt-0.5 font-semibold text-stone-900">
              {formatOrderQty(units)}
            </dd>
          </div>
          {locations.length > 0 && (
            <div>
              <dt className="section-label">Kur sandėlyje</dt>
              <dd className="mt-0.5 font-medium text-stone-900">
                {locations.join(" · ")}
              </dd>
            </div>
          )}
          {order.zone && (
            <div>
              <dt className="section-label">Zona</dt>
              <dd className="mt-0.5">{zoneLabel(order.zone)}</dd>
            </div>
          )}
          {customFields.map((f) => (
            <div key={f.id}>
              <dt className="section-label">{f.label || "Papildoma"}</dt>
              <dd className="mt-0.5">{f.value}</dd>
            </div>
          ))}
          {order.notes && (
            <div>
              <dt className="section-label">Pastabos</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-stone-700">
                {order.notes}
              </dd>
            </div>
          )}
        </dl>

        {active && !done && (
          <button
            type="button"
            className="btn-primary mt-5 w-full !py-3.5 !text-base"
            disabled={busy}
            onClick={handleIssue}
          >
            {busy ? "Žymima…" : "Pažymėti: pasiėmė"}
          </button>
        )}
        {done && (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
            Išduota klientui. Vietos sandėlyje laisvos.
          </p>
        )}
        {order.status === "archived" && !done && (
          <p className="mt-4 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
            Šis užsakymas jau išduotas.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link
            href={`/orders/${order.id}`}
            className="font-medium text-stone-800 underline decoration-stone-300 underline-offset-2"
          >
            Atidaryti užsakymą
          </Link>
          {mapUnit && (
            <button
              type="button"
              className="font-medium text-stone-800 underline decoration-stone-300 underline-offset-2"
              onClick={() => {
                const loc = mapUnit.locationId
                  ? state.locations.find((l) => l.id === mapUnit.locationId)
                  : null;
                const params = new URLSearchParams({
                  unit: mapUnit.id,
                  hint: "1",
                });
                if (loc?.rack != null) params.set("rack", String(loc.rack));
                if (loc?.code) params.set("code", loc.code);
                router.push(`/map?${params.toString()}`);
              }}
            >
              Rodyti sandėlyje
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
