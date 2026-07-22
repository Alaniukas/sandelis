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
    floor?.label ?? null,
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
        <h1 className="text-xl font-semibold">Prekė nerasta</h1>
        <p className="text-sm text-stone-600">
          QR kodas neatpažintas. Kol duomenys saugomi šiame naršyklės profilyje,
          telefonas turi būti tas pats įrenginys arba vėliau — bendra duomenų bazė.
        </p>
        <Link href="/map" className="text-sm font-medium text-blue-800 underline">
          Į sandėlį
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 py-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Lipduko info
        </p>
        <h1 className="font-display mt-1 text-2xl font-semibold text-stone-900">
          {unit.labelTitle}
        </h1>
        <p className="mt-1 text-sm text-stone-600">
          {unit.indexInSet} iš {unit.totalInSet} ·{" "}
          {unitStatusLabel(unit.status)}
        </p>

        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-stone-500">Vieta sandėlyje</dt>
            <dd className="font-mono font-semibold text-stone-900">
              {locationLabel}
            </dd>
          </div>
          {order?.project && (
            <div>
              <dt className="text-stone-500">Projektas</dt>
              <dd className="font-medium">{order.project}</dd>
            </div>
          )}
          {(order?.orderCode || order?.client) && (
            <div>
              <dt className="text-stone-500">Kodas · klientas</dt>
              <dd>
                {[order.orderCode, order.client].filter(Boolean).join(" · ")}
              </dd>
            </div>
          )}
          {customFields.map((f) => (
            <div key={f.id}>
              <dt className="text-stone-500">{f.label || "Laukas"}</dt>
              <dd>{f.value || "—"}</dd>
            </div>
          ))}
          {unit.notes && (
            <div>
              <dt className="text-stone-500">Prekės eilutės</dt>
              <dd className="text-stone-700">{unit.notes}</dd>
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
            {issuing ? "Žymima…" : "Pažymėti išvykus"}
          </button>
        )}

        {done && (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
            Pažymėta išvykusi. Vieta sandėlyje laisva.
          </p>
        )}

        {unit.status === "issued" && !done && (
          <p className="mt-4 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
            Ši prekė jau pažymėta išvykusi.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {rack != null &&
            unit.status !== "issued" &&
            unit.status !== "archived" && (
            <button
              type="button"
              className="font-medium text-blue-800 underline"
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
              className="font-medium text-blue-800 underline"
            >
              Atidaryti užsakymą
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
