"use client";

import { useEffect, useMemo } from "react";
import { OrderPicker } from "@/components/OrderPicker";
import { UnitPicker } from "@/components/UnitPicker";
import type { Order, Unit } from "@/lib/types";

export type ExistingAssignMode = "new" | "move";

export function ExistingOrderAssignFields({
  orders,
  units,
  orderId,
  onOrderIdChange,
  assignMode,
  onAssignModeChange,
  moveUnitId,
  onMoveUnitIdChange,
  unitNotes,
  onUnitNotesChange,
}: {
  orders: Order[];
  units: Unit[];
  orderId: string;
  onOrderIdChange: (id: string) => void;
  assignMode: ExistingAssignMode;
  onAssignModeChange: (mode: ExistingAssignMode) => void;
  moveUnitId: string;
  onMoveUnitIdChange: (id: string) => void;
  unitNotes: string;
  onUnitNotesChange: (notes: string) => void;
}) {
  const orderUnits = useMemo(
    () =>
      units.filter(
        (u) =>
          u.orderId === orderId &&
          u.status !== "issued" &&
          u.status !== "archived",
      ),
    [units, orderId],
  );

  useEffect(() => {
    if (!orderId) return;
    if (assignMode === "move") {
      const pick =
        orderUnits.find((u) => u.id === moveUnitId) ?? orderUnits[0];
      if (pick && pick.id !== moveUnitId) onMoveUnitIdChange(pick.id);
      else if (!pick && moveUnitId) onMoveUnitIdChange("");
    }
  }, [
    orderId,
    assignMode,
    orderUnits,
    moveUnitId,
    onMoveUnitIdChange,
  ]);

  return (
    <div className="space-y-3">
      <OrderPicker orders={orders} value={orderId} onChange={onOrderIdChange} />

      {orderId && (
        <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50/80 p-3">
          <p className="section-label">Ką nori padaryti?</p>
          <label className="flex items-start gap-2 text-sm text-stone-800">
            <input
              type="radio"
              name="assign-mode"
              className="mt-0.5"
              checked={assignMode === "new"}
              onChange={() => onAssignModeChange("new")}
            />
            <span>
              <span className="font-medium">Priskirti naują dėžę</span>
              <span className="mt-0.5 block text-xs text-stone-500">
                Sukuriama papildoma dėžė šiam užsakymui — esamos lieka kur
                stovėjo.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-stone-800">
            <input
              type="radio"
              name="assign-mode"
              className="mt-0.5"
              checked={assignMode === "move"}
              onChange={() => onAssignModeChange("move")}
              disabled={orderUnits.length === 0}
            />
            <span>
              <span className="font-medium">Perkelti esamą dėžę čia</span>
              <span className="mt-0.5 block text-xs text-stone-500">
                Pasirink, kurią dėžę iš šio užsakymo perkelti į pažymėtą
                vietą.
              </span>
            </span>
          </label>
        </div>
      )}

      {orderId && assignMode === "move" && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Kurią dėžę perkelti?
          </p>
          <UnitPicker
            units={orderUnits}
            value={moveUnitId}
            onChange={onMoveUnitIdChange}
          />
        </div>
      )}

      {orderId && (
        <label className="block text-sm">
          <span className="font-medium text-stone-700">
            {assignMode === "move" ? "Pastabos (nebūtina)" : "Prekės pastabos"}
          </span>
          <textarea
            className="field mt-1"
            rows={2}
            placeholder="Pvz. spalva, komplektacija, defektai…"
            value={unitNotes}
            onChange={(e) => onUnitNotesChange(e.target.value)}
          />
        </label>
      )}
    </div>
  );
}
