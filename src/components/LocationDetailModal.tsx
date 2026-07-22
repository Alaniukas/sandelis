"use client";

import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import type { PickInfo } from "@/components/Warehouse3D";
import {
  deleteFloorArea,
  loadState,
  removeUnitPlacement,
  unitsAtLocation,
  unitsOnFloorArea,
} from "@/lib/demo-store";
import { useWms } from "@/lib/use-wms";
import { useMemo } from "react";

export function LocationDetailModal({
  pick,
  onClose,
  onCreateOrder,
  onLegacyOrder,
}: {
  pick: PickInfo | null;
  onClose: () => void;
  onCreateOrder?: (pick: PickInfo) => void;
  onLegacyOrder?: (pick: PickInfo) => void;
}) {
  const state = useWms();

  const units = useMemo(() => {
    if (!pick) return [];
    if (pick.kind === "floor") {
      const onFloor = unitsOnFloorArea(state, pick.code);
      if (pick.unitId) {
        const focused = onFloor.find((u) => u.id === pick.unitId);
        if (focused) return onFloor;
        const extra = state.units.find((u) => u.id === pick.unitId);
        return extra ? [extra, ...onFloor.filter((u) => u.id !== extra.id)] : onFloor;
      }
      return onFloor;
    }
    if (pick.kind === "rack" && pick.unitId) {
      const u = state.units.find((unit) => unit.id === pick.unitId);
      return u ? [u] : unitsAtLocation(state, pick.code);
    }
    return unitsAtLocation(state, pick.code);
  }, [state, pick]);

  const loc = state.locations.find(
    (l) => l.code === pick?.code || l.id === pick?.code,
  );
  const floor = state.floorAreas.find((f) => f.id === pick?.code);
  const wholeRack = units.some((u) => u.occupiesEntireRack);
  const focusUnit = pick?.unitId
    ? units.find((u) => u.id === pick.unitId) ?? state.units.find((u) => u.id === pick.unitId)
    : null;
  const primaryUnit = focusUnit ?? units[0] ?? null;
  const primaryOrder = primaryUnit
    ? state.orders.find((o) => o.id === primaryUnit.orderId)
    : null;

  return (
    <Modal
      open={!!pick}
      title={pick?.label || pick?.code || "Vieta"}
      onClose={onClose}
    >
      {pick && (
        <div className="space-y-4">
          <div className="rounded-xl bg-stone-900 px-4 py-3 text-white">
            <p className="font-mono text-lg font-semibold">
              {pick.kind === "floor"
                ? floor?.label || "Ant grindų"
                : pick.code}
            </p>
            <p className="mt-1 text-xs text-stone-300">
              {pick.kind === "floor"
                ? `Plotas ant grindų · ${floor ? `${floor.w.toFixed(1)}×${floor.d.toFixed(1)} m` : ""}`
                : pick.kind === "small_shelf"
                  ? "Smulkus stelažas"
                  : pick.kind === "rack"
                    ? `Stelažas ${pick.rack} (visas)`
                    : `Stelažas ${pick.rack} · ${pick.side} · aukštas ${pick.level}`}
              {loc?.zone ? ` · ${loc.zone}` : ""}
              {wholeRack ? " · visas stelažas" : ""}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Turinys
            </p>
            <ul className="mt-2 space-y-2">
              {units.length === 0 && (
                <li className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  Laisva
                </li>
              )}
              {units.map((u) => {
                const order = state.orders.find((o) => o.id === u.orderId);
                const focused = pick?.unitId === u.id;
                return (
                  <li
                    key={u.id}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      focused
                        ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300"
                        : "border-stone-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/u/${u.qrToken}`}
                          className="font-medium text-stone-900 underline"
                        >
                          {u.labelTitle} ({u.indexInSet}/{u.totalInSet})
                        </Link>
                        <div className="text-xs text-stone-500">
                          {u.status}
                          {u.occupiesEntireRack ? " · visas stelažas" : ""}
                          {u.footprintW && u.footprintD
                            ? ` · ${u.footprintW.toFixed(2)}×${u.footprintD.toFixed(2)} m`
                            : ""}
                          {order ? (
                            <>
                              {" · "}
                              <Link
                                href={`/orders/${order.id}`}
                                className="underline"
                              >
                                {order.project || order.orderCode}
                              </Link>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-full px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 min-h-10"
                        onClick={() => {
                          if (
                            !confirm(
                              "Atšaukti žymėjimą? Prekė bus pašalinta iš šios vietos.",
                            )
                          )
                            return;
                          removeUnitPlacement(loadState(), u.id);
                        }}
                      >
                        Atšaukti
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="modal-actions mt-2">
            {units.length === 0 && onLegacyOrder && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => onLegacyOrder(pick)}
              >
                Žymėti čia (minimaliai)
              </button>
            )}
            {units.length === 0 && onCreateOrder && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onCreateOrder(pick)}
              >
                Pilnas atvykimas
              </button>
            )}
            {primaryUnit && primaryOrder && (
              <Link
                href={`/orders/${primaryOrder.id}`}
                className="btn-primary"
                onClick={onClose}
              >
                Atidaryti užsakymą
              </Link>
            )}
            {pick.kind === "floor" && units.length === 0 && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  if (!confirm("Ištrinti plotą ant grindų?")) return;
                  deleteFloorArea(loadState(), pick.code);
                  onClose();
                }}
              >
                Ištrinti plotą
              </button>
            )}
            <Link href="/orders" className="btn-secondary" onClick={onClose}>
              Užsakymai
            </Link>
          </div>
        </div>
      )}
    </Modal>
  );
}
