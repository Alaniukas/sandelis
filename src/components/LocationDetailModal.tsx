"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { PickInfo } from "@/components/Warehouse3D";
import { OrderEditSection } from "@/components/OrderEditSection";
import { OrderInfoSection } from "@/components/OrderInfoSection";
import {
  deleteFloorArea,
  deleteOrder,
  issueUnitToClient,
  loadState,
  restoreOrderFromArchive,
  unplaceUnit,
  unitsAtLocation,
  unitsOnFloorArea,
} from "@/lib/demo-store";
import { useWms } from "@/lib/use-wms";
import { unitStatusLabel, zoneLabel } from "@/lib/ui-labels";

export function LocationDetailModal({
  pick,
  onClose,
  onCreateOrder,
  onLegacyOrder,
  onMoveUnit,
}: {
  pick: PickInfo | null;
  onClose: () => void;
  onCreateOrder?: (pick: PickInfo) => void;
  onLegacyOrder?: (pick: PickInfo) => void;
  onMoveUnit?: (unitId: string) => void;
}) {
  const state = useWms();
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);

  const units = useMemo(() => {
    if (!pick) return [];
    if (pick.kind === "floor") {
      const onFloor = unitsOnFloorArea(state, pick.code);
      if (pick.unitId) {
        const focused = onFloor.find((u) => u.id === pick.unitId);
        if (focused) return onFloor;
        const extra = state.units.find((u) => u.id === pick.unitId);
        return extra
          ? [extra, ...onFloor.filter((u) => u.id !== extra.id)]
          : onFloor;
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
    ? (units.find((u) => u.id === pick.unitId) ??
      state.units.find((u) => u.id === pick.unitId))
    : null;
  const primaryUnit = focusUnit ?? units[0] ?? null;
  const primaryOrder = primaryUnit
    ? state.orders.find((o) => o.id === primaryUnit.orderId)
    : null;

  function locationTitle() {
    if (!pick) return "Vieta";
    if (pick.kind === "floor") return floor?.label || "Plotas ant grindų";
    if (pick.kind === "rack") return `Stelažas ${pick.rack}`;
    if (loc?.label) return loc.label;
    if (pick.label) return pick.label;
    return pick.code;
  }

  function locationSubtitle() {
    if (!pick) return "";
    if (pick.kind === "floor" && floor) {
      return `Ant grindų · ${floor.w.toFixed(1)} × ${floor.d.toFixed(1)} m`;
    }
    if (pick.kind === "small_shelf") return "Smulkus stelažas";
    if (pick.kind === "rack") return "Visas stelažas užimtas";
    if (loc) {
      const parts = [
        zoneLabel(loc.zone),
        loc.rack != null ? `stelažas ${loc.rack}` : null,
        wholeRack ? "visas stelažas" : null,
      ].filter(Boolean);
      return parts.join(" · ");
    }
    return "";
  }

  return (
    <Modal open={!!pick} title="Vieta" onClose={onClose}>
      {pick && (
        <div className="space-y-4">
          <div className="rounded-xl bg-stone-900 px-4 py-3 text-white">
            <p className="text-lg font-semibold tracking-tight">
              {locationTitle()}
            </p>
            {locationSubtitle() && (
              <p className="mt-1 text-sm text-stone-300">{locationSubtitle()}</p>
            )}
          </div>

          {units.length === 0 ? (
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-900">
              Čia laisva — gali pažymėti prekę šioje vietoje.
            </div>
          ) : (
            <>
              <section>
                <h3 className="section-label">Kas čia stovi</h3>
                <ul className="mt-2 space-y-2">
                  {units.map((u) => {
                    const order = state.orders.find((o) => o.id === u.orderId);
                    const focused = pick?.unitId === u.id;
                    return (
                      <li
                        key={u.id}
                        className={`rounded-xl border px-3.5 py-3 text-sm ${
                          focused
                            ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300"
                            : "border-stone-200 bg-white"
                        }`}
                      >
                        <p className="font-semibold text-stone-900">
                          {u.labelTitle}
                        </p>
                        <p className="mt-1 text-sm text-stone-600">
                          <span className="font-medium text-stone-800">
                            {unitStatusLabel(u.status)}
                          </span>
                          {" · "}
                          {u.indexInSet}/{u.totalInSet} dėžė
                        </p>
                        {order && (
                          <p className="mt-1.5 text-sm text-stone-700">
                            <span className="font-medium">
                              {order.project || order.orderCode || "Užsakymas"}
                            </span>
                            {order.client ? (
                              <span className="text-stone-500">
                                {" "}
                                · {order.client}
                              </span>
                            ) : null}
                          </p>
                        )}
                        {u.footprintW && u.footprintD && (
                          <p className="mt-1 text-xs text-stone-500">
                            Užima {u.footprintW.toFixed(1)} ×{" "}
                            {u.footprintD.toFixed(1)} m
                          </p>
                        )}
                        {u.notes?.trim() && (
                          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-stone-50 px-2.5 py-2 text-xs leading-relaxed text-stone-700">
                            {u.notes}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>

              {primaryOrder && (
                <section>
                  <h3 className="section-label">Pastabos ir komentarai</h3>
                  <div className="mt-2">
                    <OrderInfoSection
                      orderId={primaryOrder.id}
                      compact
                      className="!border-stone-100 !p-3"
                    />
                  </div>
                </section>
              )}

              {primaryOrder && showEdit && (
                <OrderEditSection orderId={primaryOrder.id} />
              )}
            </>
          )}

          <div className="modal-actions mt-2">
            {units.length === 0 && (
              <>
                {onLegacyOrder && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => onLegacyOrder(pick)}
                  >
                    Žymėti čia
                  </button>
                )}
                {onCreateOrder && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => onCreateOrder(pick)}
                  >
                    Naujas atvykimas
                  </button>
                )}
                {pick.kind === "floor" && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      if (!confirm("Ištrinti šį plotą ant grindų?")) return;
                      deleteFloorArea(loadState(), pick.code);
                      onClose();
                    }}
                  >
                    Ištrinti plotą
                  </button>
                )}
              </>
            )}

            {primaryUnit && primaryOrder && (
              <>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    const name =
                      prompt("Kas atsiėmė? (vardas ar įmonė)") || "Klientas";
                    issueUnitToClient(loadState(), primaryUnit.id, name);
                    onClose();
                  }}
                >
                  Klientas atsiėmė
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    onClose();
                    if (onMoveUnit) {
                      onMoveUnit(primaryUnit.id);
                    } else {
                      router.push(
                        `/map?move=${primaryUnit.id}&hint=1&label=${encodeURIComponent(primaryUnit.labelTitle)}`,
                      );
                    }
                  }}
                >
                  Perkelti kitur
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowEdit((v) => !v)}
                >
                  {showEdit ? "Slėpti redagavimą" : "Keisti informaciją"}
                </button>
                <Link
                  href={`/orders/${primaryOrder.id}`}
                  className="btn-secondary"
                  onClick={onClose}
                >
                  Atidaryti užsakymą
                </Link>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    if (
                      !confirm(
                        "Nuimti prekę iš šios vietos? Užsakymas liks — vėliau galėsi padėti kitur.",
                      )
                    )
                      return;
                    unplaceUnit(loadState(), primaryUnit.id);
                  }}
                >
                  Nuimti iš vietos
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => {
                    if (
                      !confirm(
                        "Ištrinti visą užsakymą ir visas dėžes? Atgal neatstatysi.",
                      )
                    )
                      return;
                    deleteOrder(loadState(), primaryOrder.id);
                    onClose();
                  }}
                >
                  Ištrinti užsakymą
                </button>
              </>
            )}

            <button type="button" className="btn-secondary" onClick={onClose}>
              Uždaryti
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
