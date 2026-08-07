"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { issueUnitFromQr, loadState } from "@/lib/demo-store";
import { useWms } from "@/lib/use-wms";
import {
  formatLocationHuman,
  unitStatusLabel,
} from "@/lib/ui-labels";

export default function UnitPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const state = useWms();
  const [issuing, setIssuing] = useState(false);
  const [done, setDone] = useState(false);

  const unit = state.units.find((u) => u.qrToken === token);
  const order = state.orders.find((o) => o.id === unit?.orderId);
  const shipment = state.shipments.find((s) => s.id === unit?.shipmentId);
  const loc = state.locations.find((l) => l.id === unit?.locationId);
  const floor = unit?.floorAreaId
    ? state.floorAreas.find((f) => f.id === unit.floorAreaId)
    : null;

  const customFields =
    order?.customFields ??
    shipment?.customFields ??
    shipment?.parsedJson?.customFields ??
    [];

  const locationLabel = formatLocationHuman(
    loc?.code ?? null,
    floor?.label ?? loc?.label ?? null,
  );
  const rack = loc?.rack ?? null;
  const canIssue =
    unit &&
    unit.status !== "issued" &&
    unit.status !== "archived" &&
    !done;

  function handleIssue() {
    if (!token || !canIssue) return;
    setIssuing(true);
    const result = issueUnitFromQr(loadState(), token);
    setIssuing(false);
    if (result) setDone(true);
  }

  if (!unit) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-8">
        <h1 className="font-display text-xl font-semibold">Prekė nerasta</h1>
        <p className="text-sm text-stone-600">
          Šis lipdukas šiuo metu neatpažintas. Pabandyk telefone ar kompiuteryje,
          kur jau dirbi su sandėliu.
        </p>
        <Link href="/map" className="text-sm font-medium underline">
          Į sandėlį
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 py-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Lipdukas
        </p>
        <h1 className="font-display mt-1 text-2xl font-semibold text-stone-900">
          {unit.labelTitle}
        </h1>
        <p className="mt-1 text-sm text-stone-600">
          Dėžė {unit.indexInSet} iš {unit.totalInSet} ·{" "}
          <span className="font-medium text-stone-800">
            {unitStatusLabel(unit.status)}
          </span>
        </p>

        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="section-label">Kur stovi</dt>
            <dd className="mt-0.5 font-semibold text-stone-900">
              {locationLabel}
            </dd>
          </div>
          {order?.project && (
            <div>
              <dt className="section-label">Projektas</dt>
              <dd className="mt-0.5 font-medium">{order.project}</dd>
            </div>
          )}
          {(order?.orderCode || order?.client) && (
            <div>
              <dt className="section-label">Kodas · klientas</dt>
              <dd className="mt-0.5">
                {[order.orderCode, order.client].filter(Boolean).join(" · ")}
              </dd>
            </div>
          )}
          {customFields.map((f) => (
            <div key={f.id}>
              <dt className="section-label">{f.label || "Papildoma"}</dt>
              <dd className="mt-0.5">{f.value || "—"}</dd>
            </div>
          ))}
          {unit.notes && (
            <div>
              <dt className="section-label">Pastabos</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-stone-700">
                {unit.notes}
              </dd>
            </div>
          )}
        </dl>

        {canIssue && (
          <button
            type="button"
            className="btn-primary mt-5 w-full touch-manipulation !py-3.5 !text-base"
            disabled={issuing}
            onClick={handleIssue}
          >
            {issuing ? "Žymima…" : "Pažymėti: pasiėmė"}
          </button>
        )}

        {done && (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
            Išduota. Vieta sandėlyje laisva.
          </p>
        )}

        {unit.status === "issued" && !done && (
          <p className="mt-4 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
            Ši prekė jau išduota.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {rack != null &&
            unit.status !== "issued" &&
            unit.status !== "archived" && (
              <button
                type="button"
                className="font-medium text-stone-800 underline decoration-stone-300 underline-offset-2"
                onClick={() =>
                  router.push(
                    `/map?rack=${rack}&unit=${unit.id}&hint=1&code=${encodeURIComponent(loc?.code ?? "")}`,
                  )
                }
              >
                Rodyti sandėlyje
              </button>
            )}
          {order && (
            <Link
              href={`/orders/${order.id}`}
              className="font-medium text-stone-800 underline decoration-stone-300 underline-offset-2"
            >
              Atidaryti užsakymą
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
