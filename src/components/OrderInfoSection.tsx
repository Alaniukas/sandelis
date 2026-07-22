"use client";

import { useMemo } from "react";
import { collectOrderDetailBlocks } from "@/lib/order-info";
import { useWms } from "@/lib/use-wms";

export function OrderInfoSection({
  orderId,
  id,
  className = "",
}: {
  orderId: string;
  id?: string;
  className?: string;
}) {
  const state = useWms();
  const blocks = useMemo(
    () => collectOrderDetailBlocks(state, orderId),
    [state, orderId],
  );

  if (!blocks.length) {
    return (
      <div
        id={id}
        className={`rounded-xl border border-dashed border-stone-200 bg-stone-50/80 p-4 text-sm text-stone-500 ${className}`}
      >
        Papildomų pastabų ar komentarų nėra.
      </div>
    );
  }

  return (
    <div
      id={id}
      className={`rounded-xl border border-stone-200 bg-white p-4 ${className}`}
    >
      <h2 className="font-semibold text-stone-900">Informacija ir pastabos</h2>
      <dl className="mt-3 space-y-4 text-sm">
        {blocks.map((b, i) => (
          <div key={`${b.title}-${i}`}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              {b.title}
            </dt>
            <dd className="mt-1 whitespace-pre-wrap text-stone-800">{b.body}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
