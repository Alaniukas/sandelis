"use client";

import { useState } from "react";
import { DateField } from "@/components/ui/FormFields";
import { HintLabel } from "@/components/ui/HintLabel";
import { Modal } from "@/components/ui/Modal";
import { uploadAttachment } from "@/lib/attachments";
import { createExpectedArrival, loadState } from "@/lib/demo-store";
import { pushWmsStateNow } from "@/lib/wms-sync";

export function IncomingArrivalModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (shipmentId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [carrier, setCarrier] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  function reset() {
    setTitle("");
    setNotes("");
    setCarrier("");
    setExpectedAt("");
    setFile(null);
    setError("");
  }

  async function save() {
    if (!title.trim()) {
      setError("Įrašyk trumpą pavadinimą (kas atkeliauja)");
      return;
    }
    let attachmentUrl: string | null = null;
    let attachmentStoragePath: string | null = null;
    if (file) {
      const uploaded = await uploadAttachment(file);
      if (!uploaded.storageUrl) {
        setError(
          uploaded.error ||
            "Nepavyko įkelti priedo į serverį — bandyk dar kartą arba be failo",
        );
        return;
      }
      attachmentUrl = uploaded.storageUrl;
      attachmentStoragePath = uploaded.storagePath;
    }
    const state = createExpectedArrival(loadState(), {
      title: title.trim(),
      notes: notes.trim() || undefined,
      carrier: carrier.trim() || undefined,
      expectedAt: expectedAt || null,
      attachmentName: file?.name || null,
      attachmentUrl,
      attachmentStoragePath,
    });
    const shipment = state.shipments[0];
    void pushWmsStateNow(state);
    reset();
    onClose();
    onCreated?.(shipment.id);
  }

  return (
    <Modal
      open={open}
      title="Atkeliauja"
      onClose={() => {
        reset();
        onClose();
      }}
    >
      <div className="space-y-4">
        <HintLabel
          label="Kas atkeliauja?"
          hint="Trumpas aprašymas — kaip ant lapo prie lentos. DI čia nebūtinas; vėliau atvykus užregistruosi pilnai."
          className="text-sm font-medium text-stone-700"
        />
        <input
          className="field"
          placeholder="Pvz. Iguzzini DILED, ~4 dėžės, Paneriu"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">
            Pastabos
          </span>
          <textarea
            className="field min-h-[5rem]"
            rows={3}
            placeholder="Ką žinai: klientas, vežėjas, kas laukia…"
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

        <DateField
          label="Tikėtina data (nebūtina)"
          value={expectedAt}
          onChange={setExpectedAt}
        />

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">
            PDF / el. laiškas (nebūtina)
          </span>
          <input
            type="file"
            accept="application/pdf,image/*"
            className="field text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="mt-1 text-xs text-stone-500">
            Priedas saugomas serveryje — galėsi atsidaryti iš bet kurio įrenginio.
          </p>
        </label>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <div className="modal-actions">
          <button
            type="button"
            className="btn-secondary w-full sm:w-auto"
            onClick={onClose}
          >
            Atšaukti
          </button>
          <button
            type="button"
            className="btn-primary w-full sm:w-auto"
            onClick={save}
          >
            Išsaugoti — rodoma „Laukiami atvykimai“
          </button>
        </div>
      </div>
    </Modal>
  );
}
