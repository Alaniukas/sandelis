"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  assignOrderToShelf,
  loadState,
} from "@/lib/demo-store";
import { BAY_DEPTH_M, locationCode, zoneForRack } from "@/lib/locations";
import {
  ExistingOrderAssignFields,
  type ExistingAssignMode,
} from "@/components/ExistingOrderAssignFields";
import { useWms } from "@/lib/use-wms";
import type { PrefillLocation } from "@/components/NewShipmentModal";
import { formatLocationHuman } from "@/lib/ui-labels";

export type ShelfDraft = {
  rack?: number;
  level: number;
  locationCode?: string;
  offsetX: number;
  offsetZ: number;
  w: number;
  d: number;
};

const MAX_DEPTH = BAY_DEPTH_M;
const MAX_WIDTH = 4;

export function ShelfFootprintModal({
  draft,
  onClose,
  onCreateNew,
}: {
  draft: ShelfDraft | null;
  onClose: () => void;
  /** Atidaro naują atvykimą su šia vieta */
  onCreateNew: (prefill: PrefillLocation) => void;
}) {
  const state = useWms();
  const [w, setW] = useState(1.1);
  const [d, setD] = useState(BAY_DEPTH_M);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [orderId, setOrderId] = useState("");
  const [assignMode, setAssignMode] = useState<ExistingAssignMode>("new");
  const [moveUnitId, setMoveUnitId] = useState("");
  const [unitNotes, setUnitNotes] = useState("");

  const activeOrders = useMemo(
    () => state.orders.filter((o) => o.status === "active"),
    [state.orders],
  );

  useEffect(() => {
    if (!draft) return;
    setW(Math.round(Math.min(MAX_WIDTH, draft.w) * 100) / 100);
    setD(Math.round(Math.min(MAX_DEPTH, draft.d) * 100) / 100);
    setMode("new");
    setOrderId(activeOrders[0]?.id ?? "");
    setAssignMode("new");
    setMoveUnitId("");
    setUnitNotes("");
  }, [draft, activeOrders]);

  function resolveCode() {
    if (!draft) return null;
    return (
      draft.locationCode ??
      (draft.rack != null
        ? locationCode(draft.rack, draft.offsetX < 0 ? "K" : "D", draft.level)
        : null)
    );
  }

  function toPrefill(): PrefillLocation | null {
    if (!draft) return null;
    const code = resolveCode();
    if (!code) return null;
    const loc = state.locations.find((l) => l.id === code || l.code === code);
    const zone =
      draft.rack != null
        ? zoneForRack(draft.rack)
        : code.startsWith("LONG")
          ? "LONG"
          : code.startsWith("DILED")
            ? "DILED"
            : "EXPO";
    return {
      locationId: loc?.id ?? code,
      code,
      label:
        loc?.label ||
        (draft.rack != null
          ? `Stelažas ${draft.rack} · aukštas ${draft.level}`
          : code),
      zone: zone === "LONG" ? "EXPO" : (zone as "EXPO" | "DILED"),
      rack: draft.rack ?? loc?.rack ?? undefined,
      footprintW: Math.max(0.3, Math.min(MAX_WIDTH, w)),
      footprintD: Math.max(0.3, Math.min(MAX_DEPTH, d)),
      footprintOffsetX: draft.offsetX,
      footprintOffsetZ: draft.offsetZ,
    };
  }

  function save() {
    if (!draft) return;
    const fw = Math.max(0.3, Math.min(MAX_WIDTH, w));
    const fd = Math.max(0.3, Math.min(MAX_DEPTH, d));
    const code = resolveCode();
    if (!code) return;

    if (mode === "new") {
      const prefill = toPrefill();
      if (!prefill) return;
      prefill.footprintW = fw;
      prefill.footprintD = fd;
      onClose();
      onCreateNew(prefill);
      return;
    }

    if (!orderId) return;
    if (assignMode === "move" && !moveUnitId) return;
    assignOrderToShelf(loadState(), orderId, {
      assignMode,
      unitId: assignMode === "move" ? moveUnitId : undefined,
      locationId: code,
      footprintW: fw,
      footprintD: fd,
      footprintOffsetX: draft.offsetX,
      footprintOffsetZ: draft.offsetZ,
      notes: unitNotes.trim() || null,
    });
    onClose();
  }

  const title =
    draft?.rack != null
      ? `Stelažas ${draft.rack} · ${draft.level === 0 ? "mini" : `${draft.level} aukštas`}`
      : draft?.locationCode
        ? formatLocationHuman(draft.locationCode)
        : "Plotas ant stelažo";

  return (
    <Modal open={!!draft} title={title} onClose={onClose}>
      {draft && (
        <div className="space-y-4">
          <p className="text-sm text-stone-600">
            Pažymėta vieta prekei. Priskirk naujam arba esamam užsakymui.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-medium text-stone-700">Plotis (m)</span>
              <input
                type="number"
                min={0.3}
                max={MAX_WIDTH}
                step={0.05}
                className="field mt-1"
                value={w}
                onChange={(e) =>
                  setW(
                    Math.min(
                      MAX_WIDTH,
                      Math.max(0.3, Number(e.target.value) || 0.3),
                    ),
                  )
                }
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-stone-700">Gylis (m)</span>
              <input
                type="number"
                min={0.3}
                max={MAX_DEPTH}
                step={0.05}
                className="field mt-1"
                value={d}
                onChange={(e) =>
                  setD(
                    Math.min(
                      MAX_DEPTH,
                      Math.max(0.3, Number(e.target.value) || 0.3),
                    ),
                  )
                }
              />
              <span className="mt-0.5 block text-xs text-stone-500">
                Iki {MAX_DEPTH.toFixed(1)} m
              </span>
            </label>
          </div>

          <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50/80 p-3">
            <p className="section-label">Kam priskirti?</p>
            <label className="flex items-center gap-2 text-sm text-stone-800">
              <input
                type="radio"
                name="shelf-mode"
                checked={mode === "new"}
                onChange={() => setMode("new")}
              />
              Naujas užsakymas
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-800">
              <input
                type="radio"
                name="shelf-mode"
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
            <button type="button" className="btn-secondary" onClick={onClose}>
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
