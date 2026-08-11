"use client";

import { useEffect, useRef, useState } from "react";
import { HintLabel } from "@/components/ui/HintLabel";
import { Modal } from "@/components/ui/Modal";
import { uploadAttachment } from "@/lib/attachments";
import {
  createHoldingArrival,
  loadState,
} from "@/lib/demo-store";
import { useWms } from "@/lib/use-wms";
import { pushWmsStateNow } from "@/lib/wms-sync";

const MAX_PHOTOS = 3;

export function HoldingArrivalModal({
  open,
  onClose,
  onCreated,
  fromExpectedShipmentId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (shipmentId: string) => void;
  /** Jei ateina iš „Atkeliauja“ — perkelia tą įrašą į laikymą */
  fromExpectedShipmentId?: string | null;
}) {
  const state = useWms();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [boxCount, setBoxCount] = useState("");
  const [palletCount, setPalletCount] = useState("");
  const [notes, setNotes] = useState("");
  const [carrier, setCarrier] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (!fromExpectedShipmentId) return;
    const s = state.shipments.find((x) => x.id === fromExpectedShipmentId);
    if (!s) return;
    setTitle(s.parsedJson?.project || s.notes.split("\n")[0] || "");
    setNotes(
      s.parsedJson?.notes || s.notes.split("\n").slice(1).join("\n") || "",
    );
    setCarrier(s.carrier || "");
    if (s.boxCount != null) setBoxCount(String(s.boxCount));
    if (s.palletCount != null) setPalletCount(String(s.palletCount));
  }, [open, fromExpectedShipmentId, state.shipments]);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => {
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, [files]);

  function reset() {
    setTitle("");
    setBoxCount("");
    setPalletCount("");
    setNotes("");
    setCarrier("");
    setFiles([]);
    setPreviews([]);
    setBusy(false);
    setError("");
  }

  function onPickFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!f.type.startsWith("image/")) continue;
      if (next.length >= MAX_PHOTOS) break;
      next.push(f);
    }
    setFiles(next);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    const boxes = Number(boxCount);
    const pallets = palletCount.trim() === "" ? null : Number(palletCount);
    if (!Number.isFinite(boxes) || boxes < 1) {
      setError("Įrašyk kiek tiksliai dėžių (bent 1)");
      return;
    }
    if (pallets != null && (!Number.isFinite(pallets) || pallets < 0)) {
      setError("Paletės skaičius turi būti 0 ar daugiau");
      return;
    }
    if (!title.trim()) {
      setError("Trumpai parašyk, kas tai (arba „nežinau — …“)");
      return;
    }
    if (files.length < 1) {
      setError("Pridėk bent 1 nuotrauką (kamera arba galerija)");
      return;
    }

    setBusy(true);
    setError("");
    const photoUrls: string[] = [];
    const photoPaths: string[] = [];
    for (const file of files) {
      const uploaded = await uploadAttachment(file);
      if (!uploaded.storageUrl) {
        setBusy(false);
        setError(
          uploaded.error ||
            "Nepavyko įkelti nuotraukos — patikrink internetą ir bandyk dar kartą",
        );
        return;
      }
      photoUrls.push(uploaded.storageUrl);
      if (uploaded.storagePath) photoPaths.push(uploaded.storagePath);
    }

    const next = createHoldingArrival(loadState(), {
      title: title.trim(),
      boxCount: boxes,
      palletCount: pallets,
      notes: notes.trim() || undefined,
      carrier: carrier.trim() || undefined,
      holdingPhotoUrls: photoUrls,
      holdingPhotoStoragePaths: photoPaths,
      fromExpectedShipmentId: fromExpectedShipmentId || null,
    });
    const shipment = fromExpectedShipmentId
      ? next.shipments.find((s) => s.id === fromExpectedShipmentId)
      : next.shipments[0];
    try {
      await pushWmsStateNow(next);
    } catch {
      setBusy(false);
      setError(
        "Išsaugota šiame telefone, bet nepavyko nusiųsti į serverį — patikrink internetą.",
      );
      return;
    }
    reset();
    onClose();
    onCreated?.(shipment?.id || "");
  }

  const photosFull = files.length >= MAX_PHOTOS;

  return (
    <Modal
      open={open}
      title="Atvyko — laikom"
      onClose={() => {
        if (busy) return;
        reset();
        onClose();
      }}
    >
      <div className="space-y-4">
        <p className="text-sm text-stone-600">
          Greitas įrašas, kai dar nežinai projekto. Vėliau priskirsi ir padėsi.
        </p>

        <div>
          <HintLabel
            label="Kas tai?"
            hint="Jei nežinai — rašyk spėjimą, pvz. „nežinau — Iguzzini, 4 dėžės, Panerių“."
            className="text-sm font-medium text-stone-700"
          />
          <input
            className="field mt-1"
            placeholder="Pvz. Iguzzini / nežinau — 4 dėžės"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">
              Dėžių (tiksliai)
            </span>
            <input
              className="field"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Pvz. 16"
              value={boxCount}
              onChange={(e) => setBoxCount(e.target.value.replace(/[^\d]/g, ""))}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">
              Palečių
            </span>
            <input
              className="field"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Nebūtina"
              value={palletCount}
              onChange={(e) =>
                setPalletCount(e.target.value.replace(/[^\d]/g, ""))
              }
            />
          </label>
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-stone-700">
            Nuotraukos (1–{MAX_PHOTOS})
          </span>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              onPickFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              onPickFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={photosFull}
              className="flex min-h-14 items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-3 py-3 text-sm font-semibold text-stone-800 active:bg-stone-100 disabled:opacity-40"
              onClick={() => cameraInputRef.current?.click()}
            >
              Fotografuoti
            </button>
            <button
              type="button"
              disabled={photosFull}
              className="flex min-h-14 items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-3 py-3 text-sm font-semibold text-stone-800 active:bg-stone-100 disabled:opacity-40"
              onClick={() => galleryInputRef.current?.click()}
            >
              Iš galerijos
            </button>
          </div>
          {previews.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {previews.map((src, i) => (
                <div key={src} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1 rounded-full bg-stone-900/80 px-2 py-0.5 text-xs font-semibold text-white"
                    onClick={() => removeFile(i)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-xs text-stone-500">
            Važtaraštis, lipdukas ar bendras vaizdas — kad vėliau atsimintum.
          </p>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">
            Pastabos (nebūtina)
          </span>
          <textarea
            className="field min-h-[4rem]"
            rows={2}
            placeholder="Kur palikta, kas skambino…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <input
          className="field"
          placeholder="Vežėjas (nebūtina)"
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
        />

        {error && <p className="text-sm text-red-700">{error}</p>}

        <div className="modal-actions">
          <button
            type="button"
            className="btn-secondary w-full sm:w-auto"
            disabled={busy}
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Atšaukti
          </button>
          <button
            type="button"
            className="btn-primary w-full sm:w-auto"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "Saugoma…" : "Įrašyti į laikymą"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
