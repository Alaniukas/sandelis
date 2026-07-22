"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { loadState, receiveShipment } from "@/lib/demo-store";
import { useWms } from "@/lib/use-wms";
import Link from "next/link";

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
    return <p>Atvykimas nerastas</p>;
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
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href={order ? `/orders/${order.id}` : "/orders"} className="text-sm underline">
        ← Atgal
      </Link>
      <h1 className="font-display text-3xl font-semibold">Priėmimas</h1>
      <p className="text-sm text-stone-600">
        {order?.project} · {order?.orderCode}
      </p>

      <div className="space-y-3 rounded-xl border bg-white p-4">
        <label className="block text-sm">
          Palečių sk.
          <input
            type="number"
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={palletCount}
            onChange={(e) => setPalletCount(Number(e.target.value))}
          />
        </label>
        <label className="block text-sm">
          Dėžių sk.
          <input
            type="number"
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={boxCount}
            onChange={(e) => setBoxCount(Number(e.target.value))}
          />
        </label>
        <label className="block text-sm">
          Papildomos dėžės (daugiau nei tikėtasi)
          <input
            type="number"
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={extraBoxes}
            onChange={(e) => setExtraBoxes(Number(e.target.value))}
          />
        </label>
        <label className="block text-sm">
          Brokas (aprašymas)
          <textarea
            className="mt-1 w-full rounded border px-2 py-1.5"
            rows={3}
            value={defectDescription}
            onChange={(e) => setDefect(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Broko foto
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="mt-1 block w-full text-sm"
            onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
          />
        </label>
        {defectPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={defectPhoto} alt="Brokas" className="max-h-40 rounded border" />
        )}
        <button
          onClick={submit}
          className="w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white"
        >
          Pažymėti atvyko
        </button>
      </div>
    </div>
  );
}
