"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  holdingPhotoHrefs,
  shipmentAttachmentHref,
} from "@/lib/attachments";
import {
  deleteHoldingArrival,
  isHoldingShipment,
  loadState,
  normalizeState,
} from "@/lib/demo-store";
import { useWms } from "@/lib/use-wms";
import { pullWmsState, pushWmsStateNow } from "@/lib/wms-sync";

export default function HoldingDetailPage() {
  const { shipmentId } = useParams<{ shipmentId: string }>();
  const router = useRouter();
  const state = useWms();

  useEffect(() => {
    void (async () => {
      const result = await pullWmsState();
      if (!result?.payload) return;
      const next = normalizeState(result.payload);
      localStorage.setItem("sandelio-wms-v1", JSON.stringify(next));
      window.dispatchEvent(new Event("wms-updated"));
    })();
  }, [shipmentId]);

  const shipment = state.shipments.find((s) => s.id === shipmentId);

  if (!shipment) {
    return (
      <div className="mx-auto max-w-lg space-y-2 py-6">
        <p>Įrašas nerastas.</p>
        <Link href="/" className="underline">
          Pradžia
        </Link>
      </div>
    );
  }

  if (!isHoldingShipment(shipment)) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-6">
        <p className="text-stone-700">
          Šis įrašas jau ne laikymo eilėje
          {shipment.orderId ? " — priskirtas užsakymui." : "."}
        </p>
        <div className="flex flex-col gap-2">
          {shipment.orderId ? (
            <Link
              href={`/orders/${shipment.orderId}`}
              className="btn-primary w-full"
            >
              Atidaryti užsakymą
            </Link>
          ) : shipment.status === "expected" ? (
            <Link href={`/laukia/${shipment.id}`} className="btn-primary w-full">
              Atidaryti laukiamą
            </Link>
          ) : null}
          <Link href="/" className="btn-secondary w-full">
            ← Pradžia
          </Link>
        </div>
      </div>
    );
  }

  const title =
    shipment.parsedJson?.project ||
    shipment.notes.split("\n")[0] ||
    "Laikoma";
  const bodyNotes =
    shipment.parsedJson?.notes ||
    shipment.notes.split("\n").slice(1).join("\n") ||
    "";
  const photos = holdingPhotoHrefs(shipment);
  const docHref = shipmentAttachmentHref(shipment);

  async function remove() {
    if (!window.confirm("Pašalinti šį laikymo įrašą?")) return;
    const next = deleteHoldingArrival(loadState(), shipmentId);
    try {
      await pushWmsStateNow(next);
    } catch {
      /* local already saved */
    }
    router.push("/");
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 py-4 pb-28">
      <Link href="/" className="text-sm text-stone-600 underline">
        ← Pradžia
      </Link>

      <div className="rounded-2xl border border-sky-200 bg-sky-50/90 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">
          Laikoma — reikia išsiaiškinti
        </p>
        <h1 className="font-display mt-1 text-2xl font-semibold text-stone-900">
          {title}
        </h1>
        <p className="mt-2 text-sm text-stone-700">
          {[
            shipment.boxCount != null
              ? `${shipment.boxCount} ${shipment.boxCount === 1 ? "dėžė" : "dėžės"}`
              : null,
            shipment.palletCount != null && shipment.palletCount > 0
              ? `${shipment.palletCount} pal.`
              : null,
            shipment.carrier || null,
            shipment.arrivedAt
              ? new Date(shipment.arrivedAt).toLocaleString("lt-LT", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {bodyNotes && (
        <div className="rounded-xl border bg-white p-4 text-sm whitespace-pre-wrap text-stone-700">
          {bodyNotes}
        </div>
      )}

      {photos.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-stone-800">
            Nuotraukos
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((href) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-xl border border-stone-200 bg-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={href}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
              </a>
            ))}
          </div>
        </section>
      )}

      {docHref && (
        <a
          href={docHref}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary inline-flex w-full"
        >
          Atidaryti dokumentą
          {shipment.documentName ? ` (${shipment.documentName})` : ""}
        </a>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="btn-primary w-full"
          onClick={() =>
            router.push(`/map?new=1&fromIncoming=${shipmentId}`)
          }
        >
          Žinau projektą — priskirti
        </button>
        <button
          type="button"
          className="btn-danger w-full"
          onClick={() => void remove()}
        >
          Pašalinti
        </button>
      </div>

      <p className="text-sm text-stone-500">
        Kol neišsiaiškinai — nespėliok ir nedėk į stelažą. Čia lieka įrodymai.
      </p>
    </div>
  );
}
