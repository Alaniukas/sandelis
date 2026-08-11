"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CustomField, ManufacturerProfile, ParsedDocument, ParsedLine, Zone } from "@/lib/types";
import {
  completeExpectedArrival,
  copyHoldingPhotosToOrder,
  copyIncomingAttachmentToShipment,
  createOrderFromParsed,
  isHoldingShipment,
  loadState,
  setShipmentAttachment,
} from "@/lib/demo-store";
import { holdingPhotoHrefs, mediaViewHref, shipmentAttachmentHref, uploadAttachment } from "@/lib/attachments";
import { pushWmsStateNow } from "@/lib/wms-sync";
import { locationCode, rackLevelDefs, zoneForRack } from "@/lib/locations";
import { formatLocationHuman } from "@/lib/ui-labels";
import { mergeUniqueNotes } from "@/lib/order-info";
import { suggestPlacementLocal, type PlacementSuggestion } from "@/lib/placement";
import { Modal } from "@/components/ui/Modal";
import { NumberField, SuggestField } from "@/components/ui/FormFields";
import { HintLabel } from "@/components/ui/HintLabel";
import { getFormSuggestions } from "@/lib/demo-store";
import { useWms } from "@/lib/use-wms";
import {
  loadManufacturerProfiles,
  newCustomField,
  upsertManufacturerProfile,
} from "@/lib/manufacturer-profiles";

export type PrefillLocation = {
  locationId: string;
  code: string;
  label: string;
  zone?: Zone | null;
  rack?: number;
  footprintW?: number | null;
  footprintD?: number | null;
  footprintOffsetX?: number | null;
  footprintOffsetZ?: number | null;
};

function emptyDoc(zone?: Zone | null): ParsedDocument {
  return {
    source: "manual",
    orderCode: "",
    project: "",
    client: "",
    lines: [],
    colliHint: 1,
    notes: "",
    confidence: 1,
    zone: zone ?? undefined,
  };
}

export function NewShipmentModal({
  open,
  onClose,
  onCreated,
  onShowPlacement,
  prefillLocation,
  prefillFloorAreaId,
  prefillFloorLabel,
  fromIncomingShipmentId,
  variant = "default",
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (orderId: string) => void;
  /** Parodyti žemėlapyje (teleportas + highlight) */
  onShowPlacement?: (s: PlacementSuggestion) => void;
  prefillLocation?: PrefillLocation | null;
  prefillFloorAreaId?: string | null;
  prefillFloorLabel?: string | null;
  /** Užpildyti iš „Atkeliauja“ įrašo ir uždaryti jį po išsaugojimo */
  fromIncomingShipmentId?: string | null;
  /** legacy = senas užsakymas, minimalūs laukai, be DI */
  variant?: "default" | "legacy";
}) {
  const router = useRouter();
  const wmsState = useWms();
  const formSuggestions = useMemo(
    () => getFormSuggestions(wmsState),
    [wmsState],
  );
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [doc, setDoc] = useState<ParsedDocument>(emptyDoc());
  const [colli, setColli] = useState(1);
  const [error, setError] = useState("");
  const [occupyEntireRack, setOccupyEntireRack] = useState(false);
  const [footprintW, setFootprintW] = useState(1.1);
  const [footprintD, setFootprintD] = useState(1.5);
  const [footprintOffsetX, setFootprintOffsetX] = useState(0);
  const [footprintOffsetZ, setFootprintOffsetZ] = useState(0);
  const [placeNow, setPlaceNow] = useState(true);
  const [manualRack, setManualRack] = useState<number | "">("");
  const [manualLevel, setManualLevel] = useState<1 | 2 | 3>(1);

  const manualLevelOptions = useMemo(() => {
    if (manualRack === "") return [1, 2, 3] as const;
    return rackLevelDefs(manualRack)
      .map((d) => d.key)
      .filter((k): k is number => typeof k === "number");
  }, [manualRack]);

  useEffect(() => {
    if (
      manualLevelOptions.length > 0 &&
      !manualLevelOptions.includes(manualLevel)
    ) {
      setManualLevel(manualLevelOptions[0] as 1 | 2 | 3);
    }
  }, [manualLevelOptions, manualLevel]);
  const [manualSide, setManualSide] = useState<"K" | "D">("K");
  const [placementNotes, setPlacementNotes] = useState("");
  const [suggestion, setSuggestion] = useState<PlacementSuggestion | null>(
    null,
  );
  const [profiles, setProfiles] = useState<ManufacturerProfile[]>([]);
  const [profileNotes, setProfileNotes] = useState("");
  const [saveProfile, setSaveProfile] = useState(false);
  const [orderPhotoUrls, setOrderPhotoUrls] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  const galleryPhotoRef = useRef<HTMLInputElement>(null);

  const hasTarget = !!(prefillLocation || prefillFloorAreaId);
  const isLegacy = variant === "legacy";
  const incomingShipment = fromIncomingShipmentId
    ? wmsState.shipments.find((s) => s.id === fromIncomingShipmentId)
    : null;

  const selectedLocationId = useMemo(() => {
    if (prefillLocation?.locationId) return prefillLocation.locationId;
    if (prefillFloorAreaId) return null;
    if (manualRack === "") return null;
    return locationCode(manualRack, manualSide, manualLevel);
  }, [prefillLocation, prefillFloorAreaId, manualRack, manualSide, manualLevel]);

  useEffect(() => {
    if (!open) return;
    setOccupyEntireRack(false);
    setPlaceNow(true);
    setError("");
    setFile(null);
    setPasteText("");
    setLoading(false);
    setSuggesting(false);
    setDoc(emptyDoc(prefillLocation?.zone));
    setColli(1);
    setFootprintW(prefillLocation?.footprintW ?? 1.1);
    setFootprintD(prefillLocation?.footprintD ?? 1.5);
    setFootprintOffsetX(prefillLocation?.footprintOffsetX ?? 0);
    setFootprintOffsetZ(prefillLocation?.footprintOffsetZ ?? 0);
    setManualRack(prefillLocation?.rack ?? "");
    setManualLevel(1);
    setManualSide("K");
    setPlacementNotes("");
    setSuggestion(null);
    setProfiles(loadManufacturerProfiles());
    setProfileNotes("");
    setSaveProfile(false);
    setOrderPhotoUrls([]);
    setPhotoUploading(false);
    if (fromIncomingShipmentId) {
      const inc = wmsState.shipments.find(
        (s) => s.id === fromIncomingShipmentId,
      );
      if (inc?.holdingPhotoUrls?.length) {
        setOrderPhotoUrls([...inc.holdingPhotoUrls]);
      }
      if (inc?.parsedJson) {
        setDoc({
          ...inc.parsedJson,
          zone: inc.parsedJson.zone ?? prefillLocation?.zone ?? undefined,
        });
        const hint =
          (inc.boxCount && inc.boxCount > 0 ? inc.boxCount : null) ||
          (inc.parsedJson.colliHint && inc.parsedJson.colliHint > 0
            ? inc.parsedJson.colliHint
            : null);
        if (hint) setColli(hint);
        const shipNotes = inc.notes?.trim() ?? "";
        const docNotes = inc.parsedJson.notes?.trim() ?? "";
        if (
          shipNotes &&
          mergeUniqueNotes(docNotes, shipNotes).length > docNotes.length
        ) {
          setPlacementNotes(shipNotes);
        }
      } else if (inc?.notes?.trim()) {
        setPlacementNotes(inc.notes.trim());
        if (inc.boxCount && inc.boxCount > 0) setColli(inc.boxCount);
      }
    }
  }, [open, prefillLocation, prefillFloorAreaId, fromIncomingShipmentId, wmsState.shipments]);

  useEffect(() => {
    if (!doc.source) return;
    const match = profiles.find(
      (p) => p.name.toLowerCase() === doc.source.toLowerCase(),
    );
    if (match) setProfileNotes(match.notes);
  }, [doc.source, profiles]);

  function reset() {
    setFile(null);
    setPasteText("");
    setDoc(emptyDoc());
    setColli(1);
    setError("");
    setLoading(false);
    setSuggesting(false);
    setOccupyEntireRack(false);
    setFootprintW(1.1);
    setFootprintD(1.5);
    setFootprintOffsetX(0);
    setFootprintOffsetZ(0);
    setPlaceNow(true);
    setManualRack("");
    setManualLevel(1);
    setManualSide("K");
    setPlacementNotes("");
    setSuggestion(null);
    setProfileNotes("");
    setSaveProfile(false);
    setOrderPhotoUrls([]);
    setPhotoUploading(false);
  }

  async function addOrderPhotos(list: FileList | null) {
    if (!list?.length) return;
    setPhotoUploading(true);
    setError("");
    const next = [...orderPhotoUrls];
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("image/")) continue;
      if (next.length >= 6) break;
      const uploaded = await uploadAttachment(file);
      if (!uploaded.storageUrl) {
        setError(
          uploaded.error || "Nepavyko įkelti nuotraukos — bandyk dar kartą",
        );
        break;
      }
      if (!next.includes(uploaded.storageUrl)) next.push(uploaded.storageUrl);
    }
    setOrderPhotoUrls(next);
    setPhotoUploading(false);
  }

  function parseContext() {
    return {
      manufacturerHint: doc.source || undefined,
      profileNotes: profileNotes.trim() || undefined,
    };
  }

  function applyParsed(parsed: ParsedDocument) {
    if (prefillLocation?.zone && !parsed.zone) {
      parsed = { ...parsed, zone: prefillLocation.zone };
    }
    setDoc({
      ...parsed,
      zone: parsed.zone ?? (prefillLocation?.zone || undefined),
    });
    setColli(parsed.colliHint && parsed.colliHint > 0 ? parsed.colliHint : 1);
  }

  async function parseFromText() {
    if (!pasteText.trim()) {
      setError("Įklijuok aprašymą");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/parse-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText, ...parseContext() }),
      });
      if (!res.ok) throw new Error(await res.text());
      applyParsed((await res.json()) as ParsedDocument);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Klaida");
    } finally {
      setLoading(false);
    }
  }

  async function parseFromFile() {
    if (!file) {
      setError("Pasirink failą");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""),
      );
      const res = await fetch("/api/parse-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mimeType: file.type || "application/pdf",
          base64,
          fileName: file.name,
          ...parseContext(),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      applyParsed((await res.json()) as ParsedDocument);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Klaida");
    } finally {
      setLoading(false);
    }
  }

  async function suggestPlace() {
    setSuggesting(true);
    setError("");
    try {
      const state = loadState();
      const notes = `${placementNotes}\n${doc.notes}\n${pasteText}`.trim();
      const res = await fetch("/api/suggest-placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes,
          project: doc.project,
          zone: doc.zone ?? null,
          colli,
          state,
        }),
      });
      let s: PlacementSuggestion | null = null;
      if (res.ok) {
        s = (await res.json()) as PlacementSuggestion;
      } else {
        s = suggestPlacementLocal(state, {
          notes,
          project: doc.project,
          zone: doc.zone ?? null,
          colli,
        });
      }
      if (!s) {
        setError("Nerasta tinkamos laisvos vietos");
        return;
      }
      setSuggestion(s);
      setManualRack(s.rack);
      setManualLevel(s.level as 1 | 2 | 3);
      setManualSide(s.side);
      setOccupyEntireRack(s.occupyEntireRack);
      if (s.zone) update("zone", s.zone);
      setPlaceNow(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepavyko pasiūlyti vietos");
    } finally {
      setSuggesting(false);
    }
  }

  function placeOpts() {
    const fw = Math.max(0.3, footprintW);
    const fd = Math.max(0.3, footprintD);
    const halfSpan = !occupyEntireRack && fw < 0.75;
    const locId =
      prefillLocation?.locationId ||
      (selectedLocationId && !prefillFloorAreaId ? selectedLocationId : null);
    const shouldPlace =
      placeNow && !!(locId || prefillFloorAreaId);
    return {
      locationId: locId ?? undefined,
      floorAreaId: prefillFloorAreaId ?? undefined,
      occupiesEntireRack: occupyEntireRack && !!locId,
      footprintW: occupyEntireRack ? null : fw,
      footprintD: occupyEntireRack ? null : fd,
      footprintOffsetX: occupyEntireRack ? null : footprintOffsetX,
      footprintOffsetZ: occupyEntireRack ? null : footprintOffsetZ,
      slotSpan: (halfSpan ? "half" : "full") as "half" | "full",
      slotHalf: (halfSpan
        ? footprintOffsetX < 0
          ? "L"
          : "R"
        : null) as "L" | "R" | null,
      placeNow: shouldPlace,
    };
  }

  async function save() {
    if (!doc.project.trim() && !doc.orderCode.trim() && !doc.client.trim()) {
      setError("Įrašyk bent projektą, kodą arba klientą");
      return;
    }
    const extraNotes = mergeUniqueNotes(doc.notes, placementNotes);
    const payload: ParsedDocument = {
      ...doc,
      project: doc.project.trim() || doc.orderCode.trim() || doc.client.trim(),
      notes: extraNotes,
      source: doc.source || (file?.name ?? "manual"),
      customFields: (doc.customFields ?? []).filter(
        (f) => f.label.trim() || f.value.trim(),
      ),
      zone:
        doc.zone ??
        (manualRack !== "" ? zoneForRack(manualRack) : undefined),
    };
    if (saveProfile && doc.source.trim() && profileNotes.trim()) {
      upsertManufacturerProfile(doc.source, profileNotes);
    }
    let state = createOrderFromParsed(
      wmsState,
      payload,
      occupyEntireRack ? 1 : Math.max(1, colli),
      file?.name || incomingShipment?.documentName || "rankinis",
      placeOpts(),
      { notePhotoUrls: orderPhotoUrls },
    );
    const order = state.orders[0];
    if (fromIncomingShipmentId) {
      state = completeExpectedArrival(state, fromIncomingShipmentId);
      const newShipment = state.shipments.find((s) => s.orderId === order.id);
      if (newShipment) {
        state = copyIncomingAttachmentToShipment(
          state,
          fromIncomingShipmentId,
          newShipment.id,
        );
      }
      // Jei kas liko laikymo foto — sujungti (neperdengti jau pridėtų)
      state = copyHoldingPhotosToOrder(
        state,
        fromIncomingShipmentId,
        order.id,
      );
    }
    if (file && !fromIncomingShipmentId) {
      const uploaded = await uploadAttachment(file);
      if (uploaded.storageUrl) {
        const shipment = state.shipments.find((s) => s.orderId === order.id);
        if (shipment) {
          state = setShipmentAttachment(state, shipment.id, {
            attachmentUrl: uploaded.storageUrl,
            attachmentStoragePath: uploaded.storagePath,
            documentName: file.name,
          });
        }
      }
    }
    void pushWmsStateNow(state);
    const show = suggestion;
    const didPlace = placeNow;
    const rackForMap =
      show?.rack ?? (typeof manualRack === "number" ? manualRack : null);
    const codeForMap =
      show?.code ??
      (selectedLocationId ? String(selectedLocationId) : undefined);
    reset();
    onClose();
    onCreated?.(order.id);
    if (show && onShowPlacement) {
      onShowPlacement(show);
      return;
    }
    if (rackForMap != null && didPlace) {
      if (onShowPlacement) {
        const locId =
          selectedLocationId ||
          (typeof manualRack === "number"
            ? locationCode(manualRack, manualSide, manualLevel)
            : "");
        onShowPlacement({
          locationId: locId || String(rackForMap),
          code: codeForMap || locId || String(rackForMap),
          rack: rackForMap,
          level: manualLevel,
          side: manualSide,
          reason: doc.project || doc.orderCode || "Naujas atvykimas",
          occupyEntireRack,
          zone:
            doc.zone ??
            (typeof manualRack === "number"
              ? zoneForRack(manualRack)
              : "EXPO"),
        });
        return;
      }
      router.push(
        `/map?rack=${rackForMap}&code=${encodeURIComponent(codeForMap || "")}&hint=1`,
      );
      return;
    }
    if (onShowPlacement) return;
    router.push(`/orders/${order.id}`);
  }

  const title = fromIncomingShipmentId
    ? `Priskirti · ${incomingShipment?.parsedJson?.project || "iš laikymo"}`
    : isLegacy
    ? hasTarget
      ? `Žymėti seną · ${
          prefillFloorLabel ||
          formatLocationHuman(prefillLocation?.code ?? null, prefillLocation?.label) ||
          "vieta"
        }`
      : "Žymėti seną užsakymą"
    : hasTarget
      ? prefillFloorAreaId
        ? `Ant grindų · ${prefillFloorLabel || "plotas"}`
        : `Vieta · ${formatLocationHuman(prefillLocation?.code ?? null, prefillLocation?.label)}`
      : "Naujas atvykimas";

  function update<K extends keyof ParsedDocument>(
    key: K,
    value: ParsedDocument[K],
  ) {
    setDoc((prev) => ({ ...prev, [key]: value }));
  }

  function updateLine(i: number, patch: Partial<ParsedLine>) {
    setDoc((prev) => ({
      ...prev,
      lines: prev.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    }));
  }

  function addLine() {
    setDoc((prev) => ({
      ...prev,
      lines: [...prev.lines, { name: "", qty: 1, unit: "vnt." }],
    }));
  }

  function removeLine(i: number) {
    setDoc((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, idx) => idx !== i),
    }));
  }

  function addCustomField() {
    setDoc((prev) => ({
      ...prev,
      customFields: [...(prev.customFields ?? []), newCustomField()],
    }));
  }

  function updateCustomField(id: string, patch: Partial<CustomField>) {
    setDoc((prev) => ({
      ...prev,
      customFields: (prev.customFields ?? []).map((f) =>
        f.id === id ? { ...f, ...patch } : f,
      ),
    }));
  }

  function removeCustomField(id: string) {
    setDoc((prev) => ({
      ...prev,
      customFields: (prev.customFields ?? []).filter((f) => f.id !== id),
    }));
  }

  function showOnMap() {
    if (!suggestion) return;
    onClose();
    if (onShowPlacement) {
      onShowPlacement(suggestion);
    } else {
      router.push(
        `/map?rack=${suggestion.rack}&code=${encodeURIComponent(suggestion.code)}&hint=1`,
      );
    }
  }

  return (
    <Modal
      open={open}
      wide
      title={title}
      onClose={() => {
        reset();
        onClose();
      }}
    >
      <div className="space-y-5">
        {hasTarget && (
          <div className="rounded-xl bg-stone-900 px-4 py-3 text-sm text-white">
            <p className="font-semibold tracking-tight">
              {prefillFloorLabel ||
                formatLocationHuman(
                  prefillLocation?.code ?? null,
                  prefillLocation?.label,
                ) ||
                "Ant grindų"}
            </p>
            <p className="mt-1 text-sm text-stone-300">
              Prekė bus padėta šioje vietoje
            </p>
          </div>
        )}

        {isLegacy && !hasTarget && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Pasirink vietą žemėlapyje — spausk ant stelažo ar grindų ploto,
            tada „Žymėti čia“.
          </p>
        )}

        {incomingShipment && (
          <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-950">
            <p className="font-medium">
              {isHoldingShipment(incomingShipment)
                ? "Iš laikymo eilės"
                : "Iš „Atkeliauja“ užrašo"}
            </p>
            {shipmentAttachmentHref(incomingShipment) && (
              <a
                href={shipmentAttachmentHref(incomingShipment)!}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-sm font-semibold underline"
              >
                Atidaryti dokumentą
                {incomingShipment.documentName
                  ? ` (${incomingShipment.documentName})`
                  : ""}
              </a>
            )}
            {holdingPhotoHrefs(incomingShipment).length > 0 && (
              <p className="mt-2 text-xs text-sky-800">
                Laikymo nuotraukos bus perkeltos prie užsakymo
                ({holdingPhotoHrefs(incomingShipment).length}).
              </p>
            )}
          </div>
        )}

        {isLegacy && hasTarget && (
          <p className="rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-600">
            Trumpas įrašas — kas stovi ir kur. Dokumentų nereikia. Vėliau galėsi
            papildyti užsakymo puslapyje.
          </p>
        )}

        {!isLegacy && (
        <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <HintLabel
            label="Iš dokumento"
            hint="Įklijuok tekstą iš el. laiško, sąskaitos ar pakavimo lapo — sistema bandys užpildyti laukus. Visada gali pataisyti ranka."
            className="section-label"
          />
          <Field label="Tekstas ar aprašymas">
            <textarea
              className="field min-h-[6rem]"
              rows={4}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`Pvz.\nDubai projektas, bus 3–4 mėn. sandėlyje, 4 didelės paletės, zona Diled`}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-primary disabled:opacity-40"
              disabled={loading || !pasteText.trim()}
              onClick={parseFromText}
            >
              {loading ? "Skaitoma…" : "Užpildyti iš teksto"}
            </button>
            <label className="btn-secondary cursor-pointer !py-2 !text-xs touch-manipulation">
              Failas
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {file && (
              <button
                type="button"
                className="btn-secondary !py-2 !text-xs disabled:opacity-40"
                disabled={loading}
                onClick={parseFromFile}
              >
                Iš failo
              </button>
            )}
          </div>
        </div>
        )}

        <div className="space-y-3">
          <p className="section-label">
            {isLegacy ? "Kas čia stovi" : "Užsakymas"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <SuggestField
              label={isLegacy ? "Pavadinimas / kas čia *" : "Užsakymo kodas"}
              value={isLegacy ? doc.project : doc.orderCode}
              onChange={(v) =>
                isLegacy ? update("project", v) : update("orderCode", v)
              }
              suggestions={
                isLegacy
                  ? formSuggestions.projects
                  : formSuggestions.orderCodes
              }
              placeholder={isLegacy ? "Pvz. Dubai, Iguzzini likučiai" : "BJ-…"}
            />
            {!isLegacy && (
            <SuggestField
              label="Projektas / prekė *"
              value={doc.project}
              onChange={(v) => update("project", v)}
              suggestions={formSuggestions.projects}
              placeholder="Pvz. Paneriu 56"
            />
            )}
            {!isLegacy && (
            <SuggestField
              label="Klientas"
              value={doc.client}
              onChange={(v) => update("client", v)}
              suggestions={formSuggestions.clients}
              placeholder="Vardas, įmonė…"
            />
            )}
            {!isLegacy && (
            <SuggestField
              label="Gamintojas / šaltinis"
              value={doc.source}
              onChange={(v) => update("source", v)}
              suggestions={formSuggestions.manufacturers}
              placeholder="Iguzzini, Flos…"
            />
            )}
            <Field label="Zona">
              <select
                className="field"
                value={doc.zone ?? ""}
                onChange={(e) =>
                  update(
                    "zone",
                    e.target.value ? (e.target.value as Zone) : undefined,
                  )
                }
              >
                <option value="">—</option>
                <option value="EXPO">ExpoDesign</option>
                <option value="DILED">Diled</option>
              </select>
            </Field>
            {!occupyEntireRack && (
              <NumberField
                label="Kiek dėžių / palečių"
                min={1}
                value={colli}
                onChange={setColli}
              />
            )}
          </div>
          <Field label="Pastabos">
            <textarea
              className="field"
              rows={2}
              value={doc.notes}
              onChange={(e) => update("notes", e.target.value)}
            />
          </Field>

          <div className="space-y-2">
            <p className="text-sm font-medium text-stone-700">
              Nuotraukos prie užsakymo
            </p>
            <p className="text-xs text-stone-500">
              Išliks ir padėjus sandėlyje. Galima iš laikymo arba pridėti naujų.
            </p>
            {orderPhotoUrls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {orderPhotoUrls.map((url) => (
                  <div key={url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mediaViewHref(url)}
                      alt=""
                      className="h-20 w-20 rounded-lg object-cover ring-1 ring-stone-200"
                    />
                    <button
                      type="button"
                      className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-700 text-xs text-white"
                      onClick={() =>
                        setOrderPhotoUrls((p) => p.filter((u) => u !== url))
                      }
                      aria-label="Pašalinti"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={cameraPhotoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                void addOrderPhotos(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={galleryPhotoRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                void addOrderPhotos(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={photoUploading || orderPhotoUrls.length >= 6}
                className="flex min-h-11 items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-800 active:bg-stone-100 disabled:opacity-40"
                onClick={() => cameraPhotoRef.current?.click()}
              >
                {photoUploading ? "Įkeliama…" : "Fotografuoti"}
              </button>
              <button
                type="button"
                disabled={photoUploading || orderPhotoUrls.length >= 6}
                className="flex min-h-11 items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-800 active:bg-stone-100 disabled:opacity-40"
                onClick={() => galleryPhotoRef.current?.click()}
              >
                Iš galerijos
              </button>
            </div>
          </div>

          {!isLegacy && (
          <div className="space-y-3 rounded-xl border border-dashed border-stone-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <HintLabel
                label="Papildoma informacija"
                hint="Bet kokie papildomi laukai iš dokumento — gamintojo ref., adresas, kontaktas. Pažymėk „Rodyti lipduke“ svarbiausiems (iki 2)."
              />
              <button
                type="button"
                className="text-xs font-semibold text-stone-600 underline"
                onClick={addCustomField}
              >
                + Pridėti lauką
              </button>
            </div>
            {(doc.customFields ?? []).length === 0 && (
              <p className="text-xs text-stone-500">
                Laukų nėra — pridėk ranka arba užpildyk iš dokumento.
              </p>
            )}
            {(doc.customFields ?? []).map((f) => (
              <div
                key={f.id}
                className="grid grid-cols-1 gap-2 rounded-lg bg-stone-50 p-2 sm:grid-cols-[1fr_1fr_auto_auto]"
              >
                <input
                  className="field"
                  placeholder="Pavadinimas"
                  value={f.label}
                  onChange={(e) =>
                    updateCustomField(f.id, { label: e.target.value })
                  }
                />
                <input
                  className="field"
                  placeholder="Reikšmė"
                  value={f.value}
                  onChange={(e) =>
                    updateCustomField(f.id, { value: e.target.value })
                  }
                />
                <label className="flex items-center gap-1.5 text-xs text-stone-600">
                  <input
                    type="checkbox"
                    checked={f.showOnLabel}
                    onChange={(e) =>
                      updateCustomField(f.id, {
                        showOnLabel: e.target.checked,
                      })
                    }
                  />
                  Lipduke
                </label>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-sm text-red-700 hover:bg-red-50"
                  onClick={() => removeCustomField(f.id)}
                >
                  ×
                </button>
              </div>
            ))}
            {doc.source && (
              <div className="space-y-2 border-t border-stone-200 pt-3">
                <Field label="Gamintojo formato pastabos">
                  <textarea
                    className="field min-h-[3rem]"
                    rows={2}
                    value={profileNotes}
                    onChange={(e) => setProfileNotes(e.target.value)}
                    placeholder="Kaip šiame dokumente vadinasi kodas, klientas…"
                  />
                </Field>
                <label className="flex items-center gap-2 text-xs text-stone-600">
                  <input
                    type="checkbox"
                    checked={saveProfile}
                    onChange={(e) => setSaveProfile(e.target.checked)}
                  />
                  Įsiminti šį gamintoją kitam kartui
                </label>
              </div>
            )}
          </div>
          )}

          {!isLegacy && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-stone-700">Kas dėžėse</p>
              <button
                type="button"
                className="text-xs font-semibold text-stone-600 underline"
                onClick={addLine}
              >
                + Prekė
              </button>
            </div>
            {doc.lines.map((l, i) => (
              <div
                key={i}
                className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_4.5rem_4.5rem_auto]"
              >
                <input
                  className="field"
                  placeholder="Pavadinimas"
                  value={l.name}
                  onChange={(e) => updateLine(i, { name: e.target.value })}
                />
                <NumberField
                  className="sm:col-span-1"
                  min={0}
                  value={l.qty}
                  onChange={(v) => updateLine(i, { qty: v })}
                />
                <input
                  className="field"
                  placeholder="vnt."
                  value={l.unit}
                  onChange={(e) => updateLine(i, { unit: e.target.value })}
                />
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                  onClick={() => removeLine(i)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          )}
        </div>

        {/* Vieta sandėlyje */}
        {!prefillFloorAreaId && !isLegacy && (
          <div className="space-y-3 rounded-xl border border-stone-200 p-4">
            <p className="section-label">Kur dėti?</p>
            <Field label="Pastabos vietai (laikas, dydis, zona…)">
              <textarea
                className="field min-h-[4.5rem]"
                rows={3}
                value={placementNotes}
                onChange={(e) => setPlacementNotes(e.target.value)}
                placeholder="Pvz. bus 3–4 mėn., 4 didelės paletės, Dubai projektas"
              />
            </Field>
            <button
              type="button"
              className="btn-secondary w-full sm:w-auto disabled:opacity-40"
              disabled={suggesting}
              onClick={suggestPlace}
            >
              {suggesting ? "Galvoju…" : "Pasiūlyk kur statyti"}
            </button>

            {suggestion && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
                <p className="font-semibold">
                  Siūlymas: {formatLocationHuman(suggestion.code)}
                  {suggestion.occupyEntireRack ? " · visas stelažas" : ""}
                </p>
                <p className="mt-1 text-sm text-emerald-900/90">
                  {suggestion.reason}
                </p>
                <button
                  type="button"
                  className="mt-2 text-sm font-semibold underline"
                  onClick={showOnMap}
                >
                  Rodyti sandėlyje
                </button>
              </div>
            )}

            {!prefillLocation && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Field label="Stelažas">
                  <select
                    className="field"
                    value={manualRack}
                    onChange={(e) =>
                      setManualRack(
                        e.target.value ? Number(e.target.value) : "",
                      )
                    }
                  >
                    <option value="">—</option>
                    {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Pusė">
                  <select
                    className="field"
                    value={manualSide}
                    onChange={(e) =>
                      setManualSide(e.target.value as "K" | "D")
                    }
                  >
                    <option value="K">Kairė</option>
                    <option value="D">Dešinė</option>
                  </select>
                </Field>
                <Field label="Aukštas">
                  <select
                    className="field"
                    value={manualLevel}
                    onChange={(e) =>
                      setManualLevel(Number(e.target.value) as 1 | 2 | 3)
                    }
                  >
                    {manualLevelOptions.map((lv) => (
                      <option key={lv} value={lv}>
                        {lv}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}

            {(prefillLocation || manualRack !== "") && (
              <>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={occupyEntireRack}
                    onChange={(e) => setOccupyEntireRack(e.target.checked)}
                  />
                  <span>Visas stelažas</span>
                </label>
                {!occupyEntireRack && (
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField
                      label="Plotis (m)"
                      min={0.3}
                      step={0.05}
                      value={footprintW}
                      onChange={setFootprintW}
                    />
                    <NumberField
                      label="Gylis (m)"
                      min={0.3}
                      max={1.5}
                      step={0.05}
                      value={footprintD}
                      onChange={(v) =>
                        setFootprintD(Math.min(1.5, Math.max(0.3, v)))
                      }
                    />
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={placeNow}
                    onChange={(e) => setPlaceNow(e.target.checked)}
                  />
                  Iš karto padėti šioje vietoje
                </label>
              </>
            )}
          </div>
        )}

        {prefillFloorAreaId && (
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={placeNow}
              onChange={(e) => setPlaceNow(e.target.checked)}
            />
            Iš karto padėti šiame plote
          </label>
        )}

        {error && <p className="text-sm text-red-700">{error}</p>}

        <div className="modal-actions">
          <button
            type="button"
            className="btn-secondary w-full sm:w-auto"
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
            onClick={save}
          >
            {placeNow && (selectedLocationId || prefillFloorAreaId)
              ? isLegacy
                ? "Išsaugoti žymėjimą"
                : "Sukurti ir padėti"
              : isLegacy
                ? "Išsaugoti"
                : "Sukurti užsakymą"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-stone-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
