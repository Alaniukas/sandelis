"use client";

import { locationLabelForUnit } from "@/lib/demo-store";
import { unitShortLabel } from "@/lib/ui-labels";
import { useWms } from "@/lib/use-wms";
import type { Unit } from "@/lib/types";

export function UnitPicker({
  units,
  value,
  onChange,
}: {
  units: Unit[];
  value: string;
  onChange: (id: string) => void;
}) {
  const state = useWms();

  if (units.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        Šiame užsakyme nėra dėžių, kurias galima perkelti.
      </p>
    );
  }

  return (
    <div
      className="max-h-48 overflow-y-auto rounded-lg border border-stone-200 bg-white"
      role="listbox"
      aria-label="Užsakymo dėžės"
    >
      {units.map((u) => {
        const order = state.orders.find((o) => o.id === u.orderId);
        const loc = locationLabelForUnit(state, u.id);
        const title = unitShortLabel(order, u, 32);
        const where =
          loc.label === "Dar nepadėta"
            ? "Dar nepadėta"
            : loc.label;
        return (
          <label
            key={u.id}
            className={`flex cursor-pointer items-start gap-2 border-b border-stone-100 px-3 py-2.5 text-sm last:border-0 hover:bg-stone-50 ${
              value === u.id ? "bg-amber-50" : ""
            }`}
          >
            <input
              type="radio"
              name="unit-picker"
              className="mt-0.5"
              checked={value === u.id}
              onChange={() => onChange(u.id)}
            />
            <span className="min-w-0 leading-snug">
              <span className="font-medium text-stone-900">{title}</span>
              <span className="mt-0.5 block text-xs text-stone-500">{where}</span>
              {u.notes?.trim() && (
                <span className="mt-0.5 block text-xs text-stone-600">
                  {u.notes.trim()}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
