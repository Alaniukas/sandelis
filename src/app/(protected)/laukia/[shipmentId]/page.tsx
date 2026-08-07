"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { shipmentAttachmentHref } from "@/lib/attachments";
import {
  deleteExpectedArrival,
  loadState,
  markExpectedArrivalReceived,
  normalizeState,
} from "@/lib/demo-store";
import { useWms } from "@/lib/use-wms";
import { pullWmsState } from "@/lib/wms-sync";

export default function IncomingPage() {
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

      {shipmentAttachmentHref(shipment) && (
        <a
          href={shipmentAttachmentHref(shipment)!}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary inline-flex"
        >
          Atidaryti dokumentą
          {shipment.documentName ? ` (${shipment.documentName})` : ""}
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
          Atvyko — padėti sandėlyje
        </button>
        <button
          type="button"
          className="btn-secondary w-full sm:w-auto"
          onClick={() => {
            if (
              window.confirm(
                "Pažymėti, kad atvyko, bet dar nepadėta į vietą?",
              )
            ) {
              markExpectedArrivalReceived(loadState(), shipmentId);
              router.push("/");
            }
          }}
        >
          Atvyko — vėliau padėsiu
        </button>
        <button
          type="button"
          className="btn-danger w-full sm:w-auto"
          onClick={() => {
            if (window.confirm("Pašalinti šį įrašą iš laukiamų atvykimų?")) {
              deleteExpectedArrival(loadState(), shipmentId);
              router.push("/");
            }
          }}
        >
          Pašalinti
        </button>
        <Link href="/map?legacy=1" className="btn-secondary w-full sm:w-auto">
          Tik žymėti vietą
        </Link>
      </div>

      <p className="text-sm text-stone-500">
        Čia ta pati informacija, kurią anksčiau rašydavai ant lapo prie lentos.
      </p>
    </div>
  );
}
