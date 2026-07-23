"use client";

import { useMemo, useState } from "react";
import { formatOrderOption } from "@/lib/ui-labels";
import type { Order } from "@/lib/types";

export function OrderPicker({
  orders,
  value,
  onChange,
}: {
  orders: Order[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      const hay = `${o.orderCode} ${o.project} ${o.client}`.toLowerCase();
      return hay.includes(q);
    });
  }, [orders, query]);

  if (orders.length === 0) {
    return (
      <p className="text-sm text-stone-500">Nėra aktyvių užsakymų</p>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <input
        type="search"
        className="field"
        placeholder="Ieškoti pagal kodą, projektą, klientą…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      <div
        className="max-h-52 overflow-y-auto rounded-lg border border-stone-200 bg-white"
        role="listbox"
        aria-label="Aktyvūs užsakymai"
      >
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-sm text-stone-500">Nieko nerasta</p>
        ) : (
          filtered.map((o) => (
            <label
              key={o.id}
              className={`flex cursor-pointer items-start gap-2 border-b border-stone-100 px-3 py-2.5 text-sm last:border-0 hover:bg-stone-50 ${
                value === o.id ? "bg-amber-50" : ""
              }`}
            >
              <input
                type="radio"
                name="order-picker"
                className="mt-0.5"
                checked={value === o.id}
                onChange={() => onChange(o.id)}
              />
              <span className="min-w-0 leading-snug">{formatOrderOption(o)}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
