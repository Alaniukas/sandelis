"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  assignOrderToFloor,
  deleteFloorArea,
  getOrCreateFloorAreaForDraft,
  loadState,
} from "@/lib/demo-store";
import {
  ExistingOrderAssignFields,
  type ExistingAssignMode,
} from "@/components/ExistingOrderAssignFields";
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
  /** Po ploto sukūrimo — atidaryti naują atvykimą su floorAreaId */
  onCreateNew: (floorAreaId: string, label: string) => void;
}) {
  const state = useWms();
  const [label, setLabel] = useState("Ant grindų");
  const [areaNotes, setAreaNotes] = useState("");
  const [unitNotes, setUnitNotes] = useState("");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [assignMode, setAssignMode] = useState<ExistingAssignMode>("new");
  const [moveUnitId, setMoveUnitId] = useState("");
  const [orderId, setOrderId] = useState("");

  const activeOrders = useMemo(
    () => state.orders.filter((o) => o.status === "active"),
    [state.orders],
  );

  useEffect(() => {
    if (!draft) return;
    setLabel("Ant grindų");
    setAreaNotes("");
    setUnitNotes("");
    setMode("new");
    setAssignMode("new");
    setMoveUnitId("");
    setOrderId(activeOrders[0]?.id ?? "");
  }, [draft, activeOrders]);

  function reset() {
    setLabel("Ant grindų");
    setAreaNotes("");
    setUnitNotes("");
    setMode("new");
    setAssignMode("new");
    setMoveUnitId("");
    setOrderId("");
  }

  function save() {
    if (!draft) return;
    const { state: next, area } = getOrCreateFloorAreaForDraft(loadState(), {
      x: draft.x,
      z: draft.z,
      w: draft.w,
      d: draft.d,
      label: label.trim() || "Ant grindų",
      notes: areaNotes.trim(),
    });

    if (mode === "new") {
      reset();
      onClose();
      onCreateNew(area.id, area.label);
      return;
    }

    if (!orderId) return;
    if (assignMode === "move" && !moveUnitId) return;
    assignOrderToFloor(next, orderId, area.id, {
      assignMode,
      unitId: assignMode === "move" ? moveUnitId : undefined,
      notes: unitNotes.trim() || null,
    });
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
            <span className="font-medium text-stone-700">
              {mode === "new" ? "Ploto pastabos" : "Ploto pastabos (nebūtina)"}
            </span>
            <textarea
              className="field mt-1"
              rows={2}
              value={areaNotes}
              onChange={(e) => setAreaNotes(e.target.value)}
            />
          </label>

          <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50/80 p-3">
            <p className="section-label">Kam priskirti?</p>
            <label className="flex items-center gap-2 text-sm text-stone-800">
              <input
                type="radio"
                name="floor-mode"
                checked={mode === "new"}
                onChange={() => setMode("new")}
              />
              Naujas užsakymas
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-800">
              <input
                type="radio"
                name="floor-mode"
                checked={mode === "existing"}
                onChange={() => setMode("existing")}
              />
              Jau esamas užsakymas
            </label>
            {mode === "existing" && (
              <ExistingOrderAssignFields
                orders={activeOrders}
                units={state.units}
                orderId={orderId}
                onOrderIdChange={setOrderId}
                assignMode={assignMode}
                onAssignModeChange={setAssignMode}
                moveUnitId={moveUnitId}
                onMoveUnitIdChange={setMoveUnitId}
                unitNotes={unitNotes}
                onUnitNotesChange={setUnitNotes}
              />
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
              disabled={
                mode === "existing" &&
                (!orderId || (assignMode === "move" && !moveUnitId))
              }
            >
              {mode === "new" ? "Toliau" : "Priskirti užsakymui"}
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
