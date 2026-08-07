"use client";

import { useMemo, useState } from "react";
import {
  NumberField,
  SuggestField,
} from "@/components/ui/FormFields";
import { mediaViewHref, uploadAttachment } from "@/lib/attachments";
import {
  loadState,
  updateOrder,
  updateUnit,
} from "@/lib/demo-store";
import { newCustomField } from "@/lib/manufacturer-profiles";
import { getFormSuggestions } from "@/lib/demo-store";
import type { CustomField, Zone } from "@/lib/types";
import { useWms } from "@/lib/use-wms";
import { zoneLabel } from "@/lib/ui-labels";

export function OrderEditSection({ orderId }: { orderId: string }) {
  const state = useWms();
  const order = state.orders.find((o) => o.id === orderId);
  const units = state.units.filter((u) => u.orderId === orderId);
  const suggestions = useMemo(() => getFormSuggestions(state), [state]);

  const [open, setOpen] = useState(false);
  const [orderCode, setOrderCode] = useState("");
  const [project, setProject] = useState("");
  const [client, setClient] = useState("");
  const [zone, setZone] = useState<Zone | "">("");
  const [notes, setNotes] = useState("");
  const [blockStorage, setBlockStorage] = useState(false);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [notePhotoUrls, setNotePhotoUrls] = useState<string[]>([]);
  const [unitEdits, setUnitEdits] = useState<
    Record<string, { labelTitle: string; notes: string }>
  >({});
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  function startEdit() {
    if (!order) return;
    setOrderCode(order.orderCode);
    setProject(order.project);
    setClient(order.client);
    setZone(order.zone ?? "");
    setNotes(order.notes);
    setBlockStorage(order.blockStorage);
    setCustomFields(order.customFields?.map((f) => ({ ...f })) ?? []);
    setNotePhotoUrls(order.notePhotoUrls ?? []);
    const edits: Record<string, { labelTitle: string; notes: string }> = {};
    for (const u of units) {
      edits[u.id] = { labelTitle: u.labelTitle, notes: u.notes };
    }
    setUnitEdits(edits);
    setMsg("");
    setOpen(true);
  }

  function save() {
    if (!order) return;
    let next = updateOrder(loadState(), order.id, {
      orderCode: orderCode.trim(),
      project: project.trim(),
      client: client.trim(),
      zone: zone || null,
      notes: notes.trim(),
      blockStorage,
      customFields: customFields.filter(
        (f) => f.label.trim() || f.value.trim(),
      ),
      notePhotoUrls,
    });
    for (const u of units) {
      const edit = unitEdits[u.id];
      if (!edit) continue;
      next = updateUnit(next, u.id, {
        labelTitle: edit.labelTitle.trim() || u.labelTitle,
        notes: edit.notes.trim(),
      });
    }
    setMsg("Išsaugota");
    setOpen(false);
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const uploaded = await uploadAttachment(file);
        if (!uploaded.storageUrl) {
          setMsg(uploaded.error || "Nepavyko įkelti nuotraukos");
          continue;
        }
        urls.push(uploaded.storageUrl);
      }
      setNotePhotoUrls((prev) => [...prev, ...urls]);
    } catch {
      setMsg("Nepavyko įkelti nuotraukų");
    } finally {
      setUploading(false);
    }
  }

  if (!order) return null;

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-stone-900">
          Keisti informaciją
        </h2>
        {!open && (
          <button type="button" className="btn-secondary !text-xs" onClick={startEdit}>
            Redaguoti
          </button>
        )}
      </div>

      {msg && !open && (
        <p className="mt-2 text-sm text-emerald-700">{msg}</p>
      )}

      {open && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <SuggestField
              label="Projektas"
              value={project}
              onChange={setProject}
              suggestions={suggestions.projects}
            />
            <SuggestField
              label="Klientas"
              value={client}
              onChange={setClient}
              suggestions={suggestions.clients}
            />
            <SuggestField
              label="Užsakymo kodas"
              value={orderCode}
              onChange={setOrderCode}
              suggestions={suggestions.orderCodes}
            />
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-stone-700">
                Zona
              </span>
              <select
                className="field"
                value={zone}
                onChange={(e) =>
                  setZone((e.target.value as Zone | "") || "")
                }
              >
                <option value="">—</option>
                <option value="EXPO">ExpoDesign</option>
                <option value="DILED">Diled</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-stone-700">
              Pastabos
            </span>
            <textarea
              className="field"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <div className="space-y-2">
            <p className="text-sm font-medium text-stone-700">
              Nuotraukos prie pastabų
            </p>
            {notePhotoUrls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {notePhotoUrls.map((url, i) => (
                  <div key={url} className="relative">
                    <img
                      src={url}
                      alt=""
                      className="h-20 w-20 rounded-lg object-cover ring-1 ring-stone-200"
                    />
                    <button
                      type="button"
                      className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-700 text-xs text-white"
                      onClick={() =>
                        setNotePhotoUrls((p) => p.filter((_, j) => j !== i))
                      }
                      aria-label="Pašalinti"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className="btn-secondary inline-flex cursor-pointer !text-xs">
              {uploading ? "Įkeliama…" : "+ Pridėti nuotrauką"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                multiple
                disabled={uploading}
                onChange={(e) => {
                  addPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={blockStorage}
              onChange={(e) => setBlockStorage(e.target.checked)}
            />
            Ilgas saugojimas — traukti iš priekio, nestatyti giliai
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-stone-700">
                Papildomi laukai
              </p>
              <button
                type="button"
                className="text-xs font-semibold text-stone-600 underline"
                onClick={() =>
                  setCustomFields((f) => [...f, newCustomField()])
                }
              >
                + Pridėti
              </button>
            </div>
            {customFields.map((f) => (
              <div
                key={f.id}
                className="grid grid-cols-1 gap-2 rounded-lg bg-stone-50 p-2 sm:grid-cols-[1fr_1fr_auto]"
              >
                <input
                  className="field"
                  placeholder="Pavadinimas"
                  value={f.label}
                  onChange={(e) =>
                    setCustomFields((fields) =>
                      fields.map((x) =>
                        x.id === f.id ? { ...x, label: e.target.value } : x,
                      ),
                    )
                  }
                />
                <input
                  className="field"
                  placeholder="Reikšmė"
                  value={f.value}
                  onChange={(e) =>
                    setCustomFields((fields) =>
                      fields.map((x) =>
                        x.id === f.id ? { ...x, value: e.target.value } : x,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-sm text-red-700 hover:bg-red-50"
                  onClick={() =>
                    setCustomFields((fields) =>
                      fields.filter((x) => x.id !== f.id),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {units.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-stone-700">
                Dėžės / paletės
              </p>
              {units.map((u) => {
                const edit = unitEdits[u.id];
                if (!edit) return null;
                return (
                  <div
                    key={u.id}
                    className="rounded-lg border border-stone-100 bg-stone-50/80 p-3 space-y-2"
                  >
                    <p className="text-xs font-semibold text-stone-500">
                      Dėžė {u.indexInSet} iš {u.totalInSet}
                    </p>
                    <input
                      className="field"
                      placeholder="Pavadinimas"
                      value={edit.labelTitle}
                      onChange={(e) =>
                        setUnitEdits((ed) => ({
                          ...ed,
                          [u.id]: { ...edit, labelTitle: e.target.value },
                        }))
                      }
                    />
                    <textarea
                      className="field"
                      rows={2}
                      placeholder="Pastabos"
                      value={edit.notes}
                      onChange={(e) =>
                        setUnitEdits((ed) => ({
                          ...ed,
                          [u.id]: { ...edit, notes: e.target.value },
                        }))
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className="btn-primary" onClick={save}>
              Išsaugoti
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setOpen(false)}
            >
              Atšaukti
            </button>
          </div>
        </div>
      )}

      {!open && order.notePhotoUrls?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {order.notePhotoUrls.map((url) => (
            <a
              key={url}
              href={mediaViewHref(url)}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <img
                src={url}
                alt=""
                className="h-16 w-16 rounded-lg object-cover ring-1 ring-stone-200"
              />
            </a>
          ))}
        </div>
      ) : null}

      {!open && (
        <p className="mt-2 text-xs text-stone-500">
          {zoneLabel(order.zone)} · {order.blockStorage ? "ilgas saugojimas" : "standartinis"}
        </p>
      )}
    </div>
  );
}
