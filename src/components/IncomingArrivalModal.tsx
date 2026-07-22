"use client";

import { useState } from "react";
import { DateField } from "@/components/ui/FormFields";
import { HintLabel } from "@/components/ui/HintLabel";
import { Modal } from "@/components/ui/Modal";
import { createExpectedArrival, loadState } from "@/lib/demo-store";

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
    let attachmentDataUrl: string | null = null;
    if (file) {
      attachmentDataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("Nepavyko skaityti failo"));
        r.readAsDataURL(file);
      });
    }
    const state = createExpectedArrival(loadState(), {
      title: title.trim(),
      notes: notes.trim() || undefined,
      carrier: carrier.trim() || undefined,
      expectedAt: expectedAt || null,
      attachmentName: file?.name || null,
      attachmentDataUrl,
    });
    const shipment = state.shipments[0];
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
            Priedas saugomas sistemoje — galėsi atsidaryti prieš atvykimą.
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
