"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { PickInfo } from "@/components/Warehouse3D";
import { OrderEditSection } from "@/components/OrderEditSection";
import { OrderInfoSection } from "@/components/OrderInfoSection";
import { uploadAttachment } from "@/lib/attachments";
import {
  deleteFloorArea,
  deleteOrder,
  issueUnitToClient,
  loadState,
  unplaceUnit,
  unitsAtLocation,
  unitsOnFloorArea,
} from "@/lib/demo-store";
import { useWms } from "@/lib/use-wms";
import { unitStatusLabel, zoneLabel } from "@/lib/ui-labels";
import { pushWmsStateNow } from "@/lib/wms-sync";
import { useWmsAccess } from "@/components/WmsAccessProvider";

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
  const [showMore, setShowMore] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [issueError, setIssueError] = useState("");
  const [issueBusy, setIssueBusy] = useState(false);
  const { readOnly } = useWmsAccess();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const issueSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setIssueOpen(false);
    setRecipient("");
    setPhotoFile(null);
    setPhotoPreview(null);
    setIssueError("");
    setIssueBusy(false);
    setShowMore(false);
    setShowEdit(false);
  }, [pick]);

  useEffect(() => {
    if (!issueOpen) return;
    issueSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [issueOpen]);

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

  async function confirmIssue() {
    if (!primaryUnit) return;
    const name = recipient.trim();
    if (!name) {
      setIssueError("Įrašyk, kas atsiėmė");
      return;
    }
    if (!photoFile) {
      setIssueError("Nufotografuok atsiėmimą");
      return;
    }
    setIssueBusy(true);
    setIssueError("");
    const uploaded = await uploadAttachment(photoFile);
    if (!uploaded.storageUrl) {
      setIssueBusy(false);
      setIssueError(uploaded.error || "Nepavyko įkelti nuotraukos");
      return;
    }
    const next = issueUnitToClient(loadState(), primaryUnit.id, name, {
      photoUrls: [uploaded.storageUrl],
    });
    if (next) {
      try {
        await pushWmsStateNow(next);
      } catch {
        /* local saved */
      }
    }
    setIssueBusy(false);
    onClose();
  }

  function footer() {
    if (!pick) return null;
    if (readOnly) {
      if (primaryOrder) {
        return (
          <div className="modal-footer-actions">
            <Link
              href={`/orders/${primaryOrder.id}`}
              className="btn-secondary"
              onClick={onClose}
            >
              Užsakymas
            </Link>
          </div>
        );
      }
      return null;
    }
    const moreBtn = (
      <button
        type="button"
        className="btn-secondary"
        onClick={() => setShowMore((v) => !v)}
      >
        {showMore ? "Slėpti" : "Daugiau"}
      </button>
    );

    if (units.length === 0) {
      return (
        <div className="modal-footer-actions">
          {onLegacyOrder && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => onLegacyOrder(pick)}
            >
              Žymėti čia
            </button>
          )}
          {moreBtn}
          {showMore && (
            <>
              {onCreateOrder && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => onCreateOrder(pick)}
                >
                  Registruoti
                </button>
              )}
              {pick.kind === "floor" && (
                <button
                  type="button"
                  className="btn-danger"
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
        </div>
      );
    }

    if (!primaryUnit || !primaryOrder) return null;

    if (issueOpen) {
      return (
        <div className="modal-footer-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setIssueOpen(false)}
          >
            Atšaukti atsiėmimą
          </button>
        </div>
      );
    }

    return (
      <div className="modal-footer-actions">
        <button
          type="button"
          className="btn-primary"
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
          Perkelti
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setIssueOpen(true);
            setShowMore(false);
          }}
        >
          Klientas atsiėmė
        </button>
        <Link
          href={`/orders/${primaryOrder.id}`}
          className="btn-secondary"
          onClick={onClose}
        >
          Užsakymas
        </Link>
        {moreBtn}
      </div>
    );
  }

  return (
    <Modal
      open={!!pick}
      title="Vieta"
      onClose={() => {
        setShowMore(false);
        setShowEdit(false);
        onClose();
      }}
      footer={footer()}
    >
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

              {primaryOrder && showMore && (
                <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <button
                    type="button"
                    className="btn-secondary w-full"
                    onClick={() => setShowEdit((v) => !v)}
                  >
                    {showEdit ? "Slėpti redagavimą" : "Keisti informaciją"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary w-full"
                    onClick={() => {
                      if (
                        !confirm(
                          "Nuimti prekę iš šios vietos? Užsakymas liks — vėliau galėsi padėti kitur.",
                        )
                      )
                        return;
                      unplaceUnit(loadState(), primaryUnit!.id);
                    }}
                  >
                    Nuimti iš vietos
                  </button>
                  <button
                    type="button"
                    className="btn-danger w-full"
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
                </div>
              )}

              {primaryOrder && showEdit && (
                <OrderEditSection orderId={primaryOrder.id} />
              )}

              {issueOpen && primaryUnit && (
                <section
                  ref={issueSectionRef}
                  className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3"
                >
                  <h3 className="section-label">Klientas atsiėmė</h3>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-stone-700">
                      Kas pasiėmė?
                    </span>
                    <input
                      className="field"
                      placeholder="Vardas, įmonė, vežėjas…"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                    />
                  </label>
                  <div>
                    <span className="mb-1 block text-sm font-medium text-stone-700">
                      Nuotrauka
                    </span>
                    <input
                      ref={cameraRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setPhotoFile(file);
                        setPhotoPreview(
                          file ? URL.createObjectURL(file) : null,
                        );
                        e.target.value = "";
                      }}
                    />
                    <input
                      ref={galleryRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setPhotoFile(file);
                        setPhotoPreview(
                          file ? URL.createObjectURL(file) : null,
                        );
                        e.target.value = "";
                      }}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className="flex min-h-12 items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-white px-3 py-3 text-sm font-semibold text-stone-800"
                        onClick={() => cameraRef.current?.click()}
                      >
                        Fotografuoti
                      </button>
                      <button
                        type="button"
                        className="flex min-h-12 items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-white px-3 py-3 text-sm font-semibold text-stone-800"
                        onClick={() => galleryRef.current?.click()}
                      >
                        Iš galerijos
                      </button>
                    </div>
                    {photoPreview && (
                      <div className="mt-2 overflow-hidden rounded-xl border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photoPreview}
                          alt=""
                          className="max-h-40 w-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                  {issueError && (
                    <p className="text-sm text-red-700">{issueError}</p>
                  )}
                  <button
                    type="button"
                    className="btn-primary w-full"
                    disabled={issueBusy}
                    onClick={() => void confirmIssue()}
                  >
                    {issueBusy ? "Saugoma…" : "Pažymėti: pasiėmė"}
                  </button>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
