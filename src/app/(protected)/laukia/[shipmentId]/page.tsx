"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useWms } from "@/lib/use-wms";

export default function IncomingPage() {
  const { shipmentId } = useParams<{ shipmentId: string }>();
  const router = useRouter();
  const state = useWms();
  const shipment = state.shipments.find((s) => s.id === shipmentId);

  if (!shipment) {
    return (
      <div className="space-y-2 py-6">
        <p>Įrašas nerastas.</p>
        <Link href="/" className="underline">
          Pradžia
        </Link>
      </div>
    );
  }

  const title =
    shipment.parsedJson?.project ||
    shipment.notes.split("\n")[0] ||
    "Atkeliauja";
  const bodyNotes =
    shipment.parsedJson?.notes ||
    shipment.notes.split("\n").slice(1).join("\n") ||
    "";

  return (
    <div className="mx-auto max-w-lg space-y-4 py-4">
      <Link href="/" className="text-sm text-stone-600 underline">
        ← Pradžia
      </Link>
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
          Atkeliauja
        </p>
        <h1 className="font-display mt-1 text-2xl font-semibold text-stone-900">
          {title}
        </h1>
        {shipment.carrier && (
          <p className="mt-1 text-sm text-stone-600">Vežėjas: {shipment.carrier}</p>
        )}
        {shipment.expectedAt && (
          <p className="text-sm text-stone-600">
            Tikėtina:{" "}
            {new Date(shipment.expectedAt).toLocaleDateString("lt-LT")}
          </p>
        )}
      </div>

      {bodyNotes && (
        <div className="rounded-xl border bg-white p-4 text-sm whitespace-pre-wrap text-stone-700">
          {bodyNotes}
        </div>
      )}

      {shipment.attachmentDataUrl && (
        <a
          href={shipment.attachmentDataUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary inline-flex"
        >
          Atidaryti priedą ({shipment.documentName || "dokumentas"})
        </a>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          className="btn-primary w-full sm:w-auto"
          onClick={() =>
            router.push(`/map?new=1&fromIncoming=${shipmentId}`)
          }
        >
          Atvyko — registruoti sandėlyje
        </button>
        <Link href="/map?legacy=1" className="btn-secondary w-full sm:w-auto">
          Tik žymėti vietą (senas užsakymas)
        </Link>
      </div>

      <p className="text-xs text-stone-500">
        Fiziškai vis tiek gali klijuoti lapą prie lentos — čia tas pats, tik
        skaitmeninė kopija.
      </p>
    </div>
  );
}
