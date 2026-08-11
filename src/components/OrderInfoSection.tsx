"use client";

import { useMemo } from "react";
import { collectOrderDetailBlocks } from "@/lib/order-info";
import { mediaViewHref } from "@/lib/attachments";
import { useWms } from "@/lib/use-wms";

export function OrderInfoSection({
  orderId,
  id,
  className = "",
  compact = false,
}: {
  orderId: string;
  id?: string;
  className?: string;
  compact?: boolean;
}) {
  const state = useWms();
  const order = state.orders.find((o) => o.id === orderId);
  const blocks = useMemo(
    () => collectOrderDetailBlocks(state, orderId),
    [state, orderId],
  );
  const photos = order?.notePhotoUrls ?? [];

  if (!blocks.length && !photos.length) {
    return (
      <div
        id={id}
        className={`rounded-xl border border-dashed border-stone-200 bg-stone-50/80 p-4 text-sm text-stone-500 ${className}`}
      >
        Papildomų pastabų nėra.
      </div>
    );
  }

  return (
    <div
      id={id}
      className={`rounded-xl border border-stone-200 bg-white p-4 ${className}`}
    >
      {!compact && (
        <h2 className="font-semibold text-stone-900">Pastabos</h2>
      )}
      <dl
        className={`${compact ? "" : "mt-3"} grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3`}
      >
        {blocks.map((b, i) => (
          <div key={`${b.title}-${i}`}>
            <dt className="section-label">{b.title}</dt>
            <dd
              className={`mt-1 whitespace-pre-wrap text-stone-800 ${
                i === 0 || b.title.toLowerCase().includes("pastab")
                  ? "font-medium"
                  : ""
              }`}
            >
              {b.body}
            </dd>
          </div>
        ))}
        {photos.map((url, i) => (
          <div key={url} className="sm:col-span-2 lg:col-span-3">
            <dt className="section-label">Nuotrauka {i + 1}</dt>
            <dd className="mt-1">
              <a
                href={mediaViewHref(url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaViewHref(url)}
                  alt=""
                  className="max-h-40 rounded-lg object-cover ring-1 ring-stone-200"
                />
              </a>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
