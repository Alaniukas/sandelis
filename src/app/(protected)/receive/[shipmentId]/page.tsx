"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { loadState, receiveShipment } from "@/lib/demo-store";
import { useWms } from "@/lib/use-wms";

export default function ReceivePage() {
  const { shipmentId } = useParams<{ shipmentId: string }>();
  const state = useWms();
  const router = useRouter();
  const shipment = state.shipments.find((s) => s.id === shipmentId);
  const order = state.orders.find((o) => o.id === shipment?.orderId);

  const [palletCount, setPalletCount] = useState(0);
  const [boxCount, setBoxCount] = useState(shipment?.boxCount ?? 1);
  const [extraBoxes, setExtraBoxes] = useState(0);
  const [defectDescription, setDefect] = useState("");
  const [defectPhoto, setPhoto] = useState<string | null>(null);

  if (!shipment) {
    return (
      <div className="mx-auto max-w-lg space-y-2 py-6">
        <p>Atvykimas nerastas.</p>
        <Link href="/orders" className="text-sm underline">
          ← Užsakymai
        </Link>
      </div>
    );
  }

  async function onPhoto(file: File | null) {
    if (!file) return setPhoto(null);
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
  }

  function submit() {
    receiveShipment(loadState(), shipmentId, {
      palletCount,
      boxCount,
      extraBoxes,
      defectDescription: defectDescription || undefined,
      defectPhoto,
    });
    if (order) router.push(`/orders/${order.id}`);
    else router.push("/");
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 py-4 sm:py-6">
      <div>
        <Link
          href={order ? `/orders/${order.id}` : "/orders"}
          className="text-sm text-stone-500 underline decoration-stone-300 underline-offset-2"
        >
          ← Atgal
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
          Atvykimas
        </p>
        <h1 className="font-display mt-1 text-3xl font-semibold text-stone-900">
          Priėmimas
        </h1>
        <p className="mt-1 text-sm text-stone-600">
          {[order?.project, order?.orderCode].filter(Boolean).join(" · ") ||
            "Prekės atvažiavo"}
        </p>
      </div>

      <div className="card-panel space-y-4">
        <p className="text-sm text-stone-500">
          Suskaičiuok ką gavai. Po to galėsi padėti sandėlyje.
        </p>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">
            Palečių skaičius
          </span>
          <input
            type="number"
            className="field"
            min={0}
            value={palletCount}
            onChange={(e) => setPalletCount(Number(e.target.value))}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">
            Dėžių skaičius
          </span>
          <input
            type="number"
            className="field"
            min={0}
            value={boxCount}
            onChange={(e) => setBoxCount(Number(e.target.value))}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">
            Papildomos dėžės
          </span>
          <input
            type="number"
            className="field"
            min={0}
            value={extraBoxes}
            onChange={(e) => setExtraBoxes(Number(e.target.value))}
          />
          <span className="mt-1 block text-xs text-stone-500">
            Jei atvažiavo daugiau, nei tikėjaisi
          </span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">
            Brokas — aprašymas
          </span>
          <textarea
            className="field min-h-[5rem]"
            rows={3}
            placeholder="Kas pažeista, kiek…"
            value={defectDescription}
            onChange={(e) => setDefect(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">
            Broko nuotrauka
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="field text-sm"
            onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
          />
        </label>
        {defectPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={defectPhoto}
            alt="Brokas"
            className="max-h-40 rounded-xl border border-stone-200"
          />
        )}

        <button type="button" onClick={submit} className="btn-primary w-full">
          Pažymėti: atvyko
        </button>
      </div>
    </div>
  );
}
