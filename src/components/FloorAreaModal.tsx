"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  assignOrderToFloor,
  createFloorArea,
  deleteFloorArea,
  loadState,
} from "@/lib/demo-store";
import { useWms } from "@/lib/use-wms";

export type FloorDraft = {
  x: number;
  z: number;
  w: number;
  d: number;
};

export function FloorAreaModal({
  draft,
  onClose,
  onCreateNew,
}: {
  draft: FloorDraft | null;
  onClose: () => void;
  /** Po ploto sukūrimo — atidaryti Nauja siunta su floorAreaId */
  onCreateNew: (floorAreaId: string, label: string) => void;
}) {
  const state = useWms();
  const [label, setLabel] = useState("Ant grindų");
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [orderId, setOrderId] = useState("");

  const activeOrders = useMemo(
    () => state.orders.filter((o) => o.status === "active"),
    [state.orders],
  );

  useEffect(() => {
    if (!draft) return;
    setLabel("Ant grindų");
    setNotes("");
    setMode("new");
    setOrderId(activeOrders[0]?.id ?? "");
  }, [draft, activeOrders]);

  function reset() {
    setLabel("Ant grindų");
    setNotes("");
    setMode("new");
    setOrderId("");
  }

  function save() {
    if (!draft) return;
    let s = loadState();
    s = createFloorArea(s, {
      label: label.trim() || "Ant grindų",
      x: draft.x,
      z: draft.z,
      w: draft.w,
      d: draft.d,
      notes: notes.trim(),
    });
    const area = s.floorAreas[0];

    if (mode === "new") {
      reset();
      onClose();
      onCreateNew(area.id, area.label);
      return;
    }

    if (!orderId) return;
    assignOrderToFloor(s, orderId, area.id);
    reset();
    onClose();
  }

  return (
    <Modal
      open={!!draft}
      title="Plotas ant grindų"
      onClose={() => {
        reset();
        onClose();
      }}
    >
      {draft && (
        <div className="space-y-4">
          <p className="text-sm text-stone-600">
            Pažymėta {draft.w.toFixed(1)} × {draft.d.toFixed(1)} m. Kam
            priskirti šią vietą?
          </p>
          <label className="block text-sm">
            <span className="font-medium text-stone-700">Pavadinimas</span>
            <input
              className="field mt-1"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-stone-700">Pastabos</span>
            <textarea
              className="field mt-1"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <div className="space-y-2 rounded-lg border border-stone-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Kam priskirti?
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="floor-mode"
                checked={mode === "new"}
                onChange={() => setMode("new")}
              />
              Kurti naują užsakymą / siuntą
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="floor-mode"
                checked={mode === "existing"}
                onChange={() => setMode("existing")}
              />
              Pasirinkti iš jau sukurtų
            </label>
            {mode === "existing" && (
              <select
                className="field mt-1"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
              >
                {activeOrders.length === 0 && (
                  <option value="">Nėra aktyvių užsakymų</option>
                )}
                {activeOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.project || o.orderCode || o.client || o.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Atšaukti
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={save}
              disabled={mode === "existing" && !orderId}
            >
              {mode === "new" ? "Toliau — naujas užsakymas" : "Priskirti siuntai"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function FloorAreaDetailActions({
  areaId,
  onDeleted,
}: {
  areaId: string;
  onDeleted?: () => void;
}) {
  return (
    <button
      type="button"
      className="btn-secondary !text-xs"
      onClick={() => {
        if (!confirm("Ištrinti plotą ant grindų?")) return;
        deleteFloorArea(loadState(), areaId);
        onDeleted?.();
      }}
    >
      Ištrinti plotą
    </button>
  );
}
