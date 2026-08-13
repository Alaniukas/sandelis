"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useWms } from "@/lib/use-wms";
import type {
  FloorDraft,
  PickInfo,
  ViewPreset,
  Warehouse3DHandle,
} from "@/components/Warehouse3D";
import {
  NewShipmentModal,
  type PrefillLocation,
} from "@/components/NewShipmentModal";
import { LocationDetailModal } from "@/components/LocationDetailModal";
import { FloorAreaModal } from "@/components/FloorAreaModal";
import {
  ShelfFootprintModal,
  type ShelfDraft,
} from "@/components/ShelfFootprintModal";
import type { PlacementSuggestion } from "@/lib/placement";
import {
  footprintConflictsAtLocation,
  loadState,
  moveUnitToLocation,
  rackFullyOccupiedByUnit,
  type FootprintRect,
} from "@/lib/demo-store";
import { BAY_DEPTH_M, locationCode } from "@/lib/locations";
import { formatLocationHuman } from "@/lib/ui-labels";

const Warehouse3D = dynamic(
  () => import("@/components/Warehouse3D").then((m) => m.Warehouse3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[#d8dce2] text-sm text-stone-600">
        Kraunamas 3D…
      </div>
    ),
  },
);

const VIEW_BTNS: { id: ViewPreset; label: string; short: string }[] = [
  { id: "overview", label: "Apžvalga", short: "Apžv." },
  { id: "entrance", label: "Įėjimas", short: "Įėj." },
  { id: "exit", label: "Išėjimas", short: "Išėj." },
  { id: "top", label: "Viršus", short: "Virš." },
  { id: "expo", label: "ExpoDesign", short: "Expo" },
  { id: "diled", label: "Diled", short: "Diled" },
  { id: "tunnel1516", label: "15↔16", short: "15↔16" },
  { id: "tunnel1617", label: "16↔17", short: "16↔17" },
];

type PendingMapFocus = {
  unitId?: string;
  orderId?: string;
  rack?: number | null;
  code?: string | null;
  label?: string | null;
};

function MapInner() {
  const state = useWms();
  const params = useSearchParams();
  const router = useRouter();
  const [pick, setPick] = useState<PickInfo | null>(null);
  const [preset, setPreset] = useState<ViewPreset>("overview");
  const [newOpen, setNewOpen] = useState(false);
  const [legacyMode, setLegacyMode] = useState(false);
  const [fromIncomingId, setFromIncomingId] = useState<string | null>(null);
  const [attachToOrderId, setAttachToOrderId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<PrefillLocation | null>(null);
  const [prefillFloorId, setPrefillFloorId] = useState<string | null>(null);
  const [prefillFloorLabel, setPrefillFloorLabel] = useState<string | null>(
    null,
  );
  const [markFloor, setMarkFloor] = useState(false);
  const [floorDraft, setFloorDraft] = useState<FloorDraft | null>(null);
  const [shelfDraft, setShelfDraft] = useState<ShelfDraft | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [focusHighlight, setFocusHighlight] = useState(false);
  const canvasRef = useRef<Warehouse3DHandle>(null);
  const pendingFocusRef = useRef<PendingMapFocus | null>(null);
  const focusAppliedRef = useRef(false);
  const focusRetryTimerRef = useRef<number | null>(null);
  const moveInitRef = useRef<string | null>(null);
  const [moveUnitId, setMoveUnitId] = useState<string | null>(null);
  const [moveIsPlace, setMoveIsPlace] = useState(false);
  const [moveFeedback, setMoveFeedback] = useState<string | null>(null);

  function clearMapFocus() {
    if (focusRetryTimerRef.current) {
      window.clearTimeout(focusRetryTimerRef.current);
      focusRetryTimerRef.current = null;
    }
    setHintText(null);
    setFocusHighlight(false);
    setMoveUnitId(null);
    setMoveIsPlace(false);
    moveInitRef.current = null;
    setMoveFeedback(null);
    canvasRef.current?.clearFocus();
  }

  function finishMove(successMsg: string) {
    const done = moveIsPlace
      ? successMsg.replace("Perkelta", "Padėta")
      : successMsg;
    setMoveUnitId(null);
    setMoveIsPlace(false);
    moveInitRef.current = null;
    setMoveFeedback(null);
    setFocusHighlight(false);
    canvasRef.current?.clearFocus();
    setHintText(done);
    window.setTimeout(() => setHintText(null), 4000);
  }

  function scheduleFocus(
    rack: number,
    code: string | null | undefined,
    unitId?: string | null,
  ) {
    if (focusRetryTimerRef.current) {
      window.clearTimeout(focusRetryTimerRef.current);
    }
    let attempts = 0;
    const tick = () => {
      attempts += 1;
      if (unitId) canvasRef.current?.focusUnit(unitId);
      else canvasRef.current?.focusRack(rack, code);
      if (attempts < 6) {
        focusRetryTimerRef.current = window.setTimeout(tick, 350);
      } else {
        focusRetryTimerRef.current = null;
      }
    };
    focusRetryTimerRef.current = window.setTimeout(tick, 150);
  }

  function applyPlacementHint(
    rack: number,
    code?: string | null,
    reason?: string,
    unitId?: string | null,
  ) {
    if (focusRetryTimerRef.current) {
      window.clearTimeout(focusRetryTimerRef.current);
      focusRetryTimerRef.current = null;
    }
    setHintText(
      reason ||
        (code
          ? `Vieta: ${formatLocationHuman(code)}`
          : `Stelažas ${rack}`),
    );
    setFocusHighlight(true);
    scheduleFocus(rack, code, unitId);
  }

  function applyPendingFocus() {
    const pending = pendingFocusRef.current;
    if (!pending || focusAppliedRef.current) return;
    if (!state.locations.length && !state.units.length) return;

    if (pending.orderId) {
      const orderUnits = state.units.filter(
        (u) =>
          u.orderId === pending.orderId &&
          ["stored", "received", "staged"].includes(u.status),
      );
      const unit = orderUnits.find((u) => u.locationId) ?? orderUnits[0];
      if (!unit) return;
      pending.unitId = unit.id;
    }

    if (pending.unitId) {
      const unit = state.units.find((u) => u.id === pending.unitId);
      if (!unit) return;

      const loc = unit.locationId
        ? state.locations.find((l) => l.id === unit.locationId)
        : null;
      const rack =
        loc?.rack ??
        (pending.rack != null && Number.isFinite(pending.rack)
          ? pending.rack
          : null);

      if (rack != null) {
        applyPlacementHint(
          rack,
          pending.code || loc?.code,
          pending.label || "Radai prekę",
          pending.unitId,
        );
      } else if (unit.floorAreaId) {
        setHintText(pending.label || "Radai prekę (ant grindų)");
        setFocusHighlight(true);
        scheduleFocus(1, null, pending.unitId);
      } else {
        applyPlacementHint(
          pending.rack ?? 1,
          pending.code,
          pending.label || "Radai prekę",
          pending.unitId,
        );
      }

      focusAppliedRef.current = true;
      pendingFocusRef.current = null;
      return;
    }

    if (pending.rack != null && Number.isFinite(pending.rack)) {
      applyPlacementHint(
        pending.rack,
        pending.code,
        pending.label || (pending.code ? `Vieta: ${pending.code}` : undefined),
      );
      focusAppliedRef.current = true;
      pendingFocusRef.current = null;
    }
  }

  useEffect(() => {
    if (params.get("new") === "1") setNewOpen(true);
    if (params.get("legacy") === "1") {
      setLegacyMode(true);
      setNewOpen(true);
    }
    const incoming = params.get("fromIncoming");
    if (incoming) {
      setFromIncomingId(incoming);
      setNewOpen(true);
    }
    const toOrder = params.get("toOrder");
    if (toOrder) {
      setAttachToOrderId(toOrder);
      setNewOpen(true);
    }
  }, [params]);

  useEffect(() => {
    const rackRaw = params.get("rack");
    const unitRaw = params.get("unit");
    const label = params.get("label");
    const hint = params.get("hint") === "1";
    const orderRaw = params.get("order");

    if (!hint) return;

    focusAppliedRef.current = false;

    if (orderRaw) {
      pendingFocusRef.current = {
        orderId: orderRaw,
        label: label || "Užsakymo vieta sandėlyje",
      };
      router.replace("/map", { scroll: false });
      return;
    }

    if (unitRaw) {
      pendingFocusRef.current = {
        unitId: unitRaw,
        rack: rackRaw ? Number(rackRaw) : null,
        code: params.get("code"),
        label: label || "Radai prekę",
      };
      router.replace("/map", { scroll: false });
      return;
    }

    if (rackRaw) {
      const rack = Number(rackRaw);
      if (Number.isFinite(rack) && rack >= 1 && rack <= 18) {
        pendingFocusRef.current = {
          rack,
          code: params.get("code"),
          label: label || undefined,
        };
        router.replace("/map", { scroll: false });
      }
    }
  }, [params, router]);

  useEffect(() => {
    const move = params.get("move");
    if (!move) {
      moveInitRef.current = null;
      return;
    }
    if (moveInitRef.current === move) return;
    moveInitRef.current = move;
    setMoveUnitId(move);
    setMoveFeedback(null);
    focusAppliedRef.current = true;
    pendingFocusRef.current = null;
    const placing = params.get("place") === "1";
    setMoveIsPlace(placing);
    const label = params.get("label");
    const unit = state.units.find((u) => u.id === move);
    const name = label
      ? decodeURIComponent(label)
      : unit?.labelTitle ?? "prekę";
    setHintText(placing ? `Kur padėjai: ${name}` : `Perkeli: ${name}`);
    router.replace("/map", { scroll: false });
  }, [params, router, state.units]);

  useEffect(() => {
    applyPendingFocus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, params]);

  const stats = useMemo(() => {
    const active = state.units.filter((u) =>
      ["stored", "received", "staged"].includes(u.status),
    ).length;
    const orders = state.orders.filter((o) => o.status === "active").length;
    return { active, orders, floors: state.floorAreas?.length ?? 0 };
  }, [state]);

  function openCreateAt(p: PickInfo, legacy = false) {
    setPick(null);
    setLegacyMode(legacy);
    if (p.kind === "floor") {
      const fa = state.floorAreas.find((f) => f.id === p.code);
      setPrefill(null);
      setPrefillFloorId(p.code);
      setPrefillFloorLabel(fa?.label || p.label || "Ant grindų");
      setNewOpen(true);
      return;
    }
    const loc = state.locations.find((l) => l.code === p.code || l.id === p.code);
    if (!loc) return;
    setPrefillFloorId(null);
    setPrefillFloorLabel(null);
    setPrefill({
      locationId: loc.id,
      code: loc.code,
      label: p.label || loc.label,
      zone: loc.zone === "LONG" ? "EXPO" : (loc.zone as "EXPO" | "DILED"),
      rack: loc.rack ?? undefined,
      footprintW: 1.1,
      footprintD: 1.5,
      footprintOffsetX: 0,
    });
    setNewOpen(true);
  }

  function onShowPlacement(s: PlacementSuggestion) {
    applyPlacementHint(s.rack, s.code, s.reason);
  }

  function handlePick(p: PickInfo) {
    if (!moveUnitId) {
      setPick(p);
      return;
    }

    const movingUnit = state.units.find((u) => u.id === moveUnitId);
    if (!movingUnit) return;

    if (p.kind === "floor") {
      if (p.code === movingUnit.floorAreaId) {
        setMoveFeedback("Tai ta pati vieta — pasirink kitą");
        return;
      }
      moveUnitToLocation(loadState(), moveUnitId, { floorAreaId: p.code });
      finishMove("Perkelta ant grindų");
      return;
    }

    const loc = state.locations.find(
      (l) => l.code === p.code || l.id === p.code,
    );
    if (!loc) {
      setMoveFeedback("Pasirink stelažą ar plotą ant grindų");
      return;
    }

    if (loc.id === movingUnit.locationId) {
      setMoveFeedback("Tai dabartinė vieta — spausk kitą (žalia = laisva)");
      return;
    }

    if (loc.rack != null && rackFullyOccupiedByUnit(state).get(loc.rack)) {
      setMoveFeedback("Visas stelažas užimtas — pasirink kitą");
      return;
    }

    const fw = movingUnit.footprintW ?? 1.1;
    const fd = movingUnit.footprintD ?? BAY_DEPTH_M;
    const candidates: FootprintRect[] = [
      {
        w: fw,
        d: fd,
        offsetX: movingUnit.footprintOffsetX ?? 0,
        offsetZ: movingUnit.footprintOffsetZ ?? 0,
      },
      { w: fw, d: fd, offsetX: -0.35, offsetZ: 0 },
      { w: fw, d: fd, offsetX: 0.35, offsetZ: 0 },
      { w: fw, d: fd, offsetX: 0, offsetZ: 0 },
    ];
    const seen = new Set<string>();
    for (const c of candidates) {
      const key = `${c.offsetX}|${c.offsetZ}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!footprintConflictsAtLocation(state, loc.id, c, moveUnitId)) {
        moveUnitToLocation(loadState(), moveUnitId, {
          locationId: loc.id,
          footprintW: c.w,
          footprintD: c.d,
          footprintOffsetX: c.offsetX,
          footprintOffsetZ: c.offsetZ,
        });
        finishMove(`Perkelta: ${formatLocationHuman(loc.code, loc.label)}`);
        return;
      }
    }

    setMoveFeedback("Netelpa — pabrėžk laisvą plotą ant sijos");
  }

  function resolveShelfDraftCode(d: ShelfDraft): string | null {
    return (
      d.locationCode ??
      (d.rack != null
        ? locationCode(d.rack, d.offsetX < 0 ? "K" : "D", d.level)
        : null)
    );
  }

  function handleShelfDraftComplete(d: ShelfDraft) {
    if (!moveUnitId) {
      setShelfDraft(d);
      return;
    }

    const movingUnit = state.units.find((u) => u.id === moveUnitId);
    if (!movingUnit) return;

    const code = resolveShelfDraftCode(d);
    if (!code) {
      setMoveFeedback("Nepavyko nustatyti vietos");
      return;
    }

    const loc = state.locations.find((l) => l.id === code || l.code === code);
    if (!loc) {
      setMoveFeedback("Vieta nerasta");
      return;
    }

    let footprintD = Math.max(0.3, Math.min(BAY_DEPTH_M, d.d));
    if (footprintD >= BAY_DEPTH_M * 0.88) footprintD = BAY_DEPTH_M;
    const footprintW = Math.max(0.3, Math.min(4, d.w));

    if (
      footprintConflictsAtLocation(
        state,
        loc.id,
        {
          w: footprintW,
          d: footprintD,
          offsetX: d.offsetX,
          offsetZ: d.offsetZ,
        },
        moveUnitId,
      )
    ) {
      setMoveFeedback("Čia netelpa — pabrėžk tik laisvą plotą");
      return;
    }

    moveUnitToLocation(loadState(), moveUnitId, {
      locationId: loc.id,
      footprintW,
      footprintD,
      footprintOffsetX: d.offsetX,
      footprintOffsetZ: d.offsetZ,
    });
    finishMove(`Perkelta: ${formatLocationHuman(loc.code, loc.label)}`);
  }

  return (
    <div className="-mx-3 -mb-[calc(4.75rem+env(safe-area-inset-bottom))] flex h-[calc(100dvh-3rem-4.75rem-env(safe-area-inset-bottom))] flex-col gap-1 overflow-hidden sm:mx-0 lg:mb-0 lg:h-[calc(100dvh-3.5rem)] md:gap-2 md:py-2">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-3 sm:gap-2 md:px-0">
        <div className="mr-auto min-w-0 hidden sm:block">
          <h1 className="font-display text-lg font-semibold tracking-tight sm:text-xl md:text-2xl">
            Sandėlis
          </h1>
          <p className="truncate text-[10px] text-stone-500 sm:text-xs">
            <span className="sm:hidden">Spausk stelažą · žalia = laisva</span>
            <span className="hidden sm:inline">
              Spausk vietą — pamatysi kas stovi. Tempk ant sijos — pažymėsi plotą.
            </span>
          </p>
        </div>
        <p className="w-full text-[10px] text-stone-500 sm:hidden">
          Spausk stelažą · 1 pirštu sukti · 2 priartinti
        </p>
        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-stone-600 ring-1 ring-stone-200 sm:px-2.5 sm:text-xs">
          {stats.orders} užsakymai · {stats.active} prekės
          {stats.floors > 0 ? ` · ${stats.floors} ant grindų` : ""}
        </span>
        <button
          type="button"
          className={`min-h-10 !px-3 !py-2 !text-xs sm:!py-1.5 ${
            markFloor ? "btn-primary" : "btn-secondary"
          }`}
          onClick={() => setMarkFloor((v) => !v)}
        >
          {markFloor ? "Baigti" : "Ant grindų"}
        </button>
        <button
          type="button"
          className="btn-secondary min-h-10 !px-3 !py-2 !text-xs sm:!py-1.5"
          onClick={() => canvasRef.current?.enterFullscreen()}
        >
          <span className="sm:hidden">Pilnas ekranas</span>
          <span className="hidden sm:inline">Per visą ekraną</span>
        </button>
      </div>

      {markFloor && (
        <div className="mx-3 shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950 sm:mx-0">
          Nubrėžk stačiakampį ant grindų — ten galėsi padėti prekes. Kol žymi,
          kamera nesisuka.
        </div>
      )}

      {moveUnitId && (
        <div className="mx-3 shrink-0 rounded-xl border-2 border-yellow-400 bg-yellow-50 px-4 py-3 text-sm text-yellow-950 sm:mx-0">
          <p className="font-semibold">{hintText}</p>
          <p className="mt-1.5 leading-relaxed text-yellow-900">
            {moveIsPlace ? (
              <>
                Spausk žalią laisvą vietą{" "}
                <span className="font-semibold">arba nubrėžk plotą</span> ant
                stelažo (tempk pele / pirštu).
              </>
            ) : (
              <>
                <span className="font-medium">2 žingsnis:</span> spausk žalią
                laisvą vietą{" "}
                <span className="font-semibold">arba nubrėžk plotą</span> ant
                stelažo (tempk pele / pirštu). Ne ten, kur stovi dabar.
              </>
            )}
          </p>
          {moveFeedback && (
            <p className="mt-2 rounded-lg bg-white/80 px-2.5 py-1.5 text-sm font-medium text-amber-900">
              {moveFeedback}
            </p>
          )}
          <button
            type="button"
            className="btn-secondary mt-3 !px-3 !py-2 !text-xs"
            onClick={clearMapFocus}
          >
            {moveIsPlace ? "Padėsiu vėliau" : "Atšaukti perkėlimą"}
          </button>
        </div>
      )}

      {hintText && !moveUnitId && (
        <div className="mx-3 flex shrink-0 items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 sm:mx-0">
          <p className="min-w-0 leading-snug">
            <>
              <span className="font-semibold">Rodoma: </span>
              {hintText}
            </>
          </p>
          <button
            type="button"
            className="btn-secondary shrink-0 !px-3 !py-2 !text-xs"
            onClick={clearMapFocus}
          >
            Uždaryti
          </button>
        </div>
      )}

      {focusHighlight && !hintText && (
        <div className="mx-3 flex shrink-0 justify-end sm:mx-0">
          <button
            type="button"
            className="btn-secondary !px-3 !py-2 !text-xs"
            onClick={clearMapFocus}
          >
            Uždaryti
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-stone-200/90 bg-white sm:rounded-xl sm:border sm:shadow-sm md:rounded-2xl">
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-stone-200 bg-stone-50/90 px-2 py-1.5 sm:gap-1.5 sm:px-3 sm:py-2 md:flex-wrap">
          {VIEW_BTNS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setPreset(b.id)}
              className={`shrink-0 rounded-full px-2.5 py-2 text-[11px] font-semibold transition sm:px-3 sm:py-1 sm:text-xs ${
                preset === b.id
                  ? "bg-stone-900 text-white"
                  : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
              }`}
            >
              <span className="sm:hidden">{b.short}</span>
              <span className="hidden sm:inline">{b.label}</span>
            </button>
          ))}
          <Link
            href="/vizualizacija"
            className="ml-auto shrink-0 px-2 py-2 text-xs font-medium text-stone-500 underline underline-offset-2 hover:text-stone-800"
          >
            2D planas
          </Link>
        </div>

        <div className="relative min-h-0 w-full flex-1">
          <Warehouse3D
            ref={canvasRef}
            state={state}
            preset={preset}
            markFloorMode={markFloor}
            moveMode={!!moveUnitId}
            onHighlightChange={setFocusHighlight}
            onPick={handlePick}
            onFloorDraftComplete={(d) => {
              setMarkFloor(false);
              setFloorDraft(d);
            }}
            onShelfDraftComplete={handleShelfDraftComplete}
          />
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 border-t border-stone-200 bg-white px-3 py-1.5 text-[10px] text-stone-600 sm:gap-3 sm:px-4 sm:text-[11px]">
          <span className="inline-flex items-center gap-1">
            <i className="h-2 w-2 rounded-sm bg-[#3d9a5f] sm:h-2.5 sm:w-2.5" /> Laisva
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="h-2 w-2 rounded-sm bg-[#e0a800] sm:h-2.5 sm:w-2.5" /> Dalinai
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="h-2 w-2 rounded-sm bg-[#c43c3c] sm:h-2.5 sm:w-2.5" /> Užimta
          </span>
          <span className="hidden items-center gap-1 sm:inline-flex">
            <i className="h-2.5 w-2.5 rounded-sm bg-[#3b82f6]" /> Plotas ant grindų
          </span>
        </div>
      </div>

      <NewShipmentModal
        open={newOpen}
        variant={legacyMode ? "legacy" : "default"}
        prefillLocation={prefill}
        prefillFloorAreaId={prefillFloorId}
        prefillFloorLabel={prefillFloorLabel}
        onShowPlacement={onShowPlacement}
        fromIncomingShipmentId={fromIncomingId}
        attachToOrderId={attachToOrderId}
        onClose={() => {
          setNewOpen(false);
          setLegacyMode(false);
          setFromIncomingId(null);
          setAttachToOrderId(null);
          setPrefill(null);
          setPrefillFloorId(null);
          setPrefillFloorLabel(null);
          if (
            params.get("fromIncoming") ||
            params.get("legacy") ||
            params.get("new") ||
            params.get("toOrder")
          ) {
            router.replace("/map", { scroll: false });
          }
        }}
      />
      <LocationDetailModal
        pick={pick}
        onClose={() => setPick(null)}
        onCreateOrder={(p) => openCreateAt(p, false)}
        onLegacyOrder={(p) => openCreateAt(p, true)}
        onMoveUnit={(unitId) => {
          const unit = state.units.find((u) => u.id === unitId);
          router.push(
            `/map?move=${unitId}&hint=1&label=${encodeURIComponent(unit?.labelTitle ?? "prekė")}`,
          );
        }}
      />
      <FloorAreaModal
        draft={floorDraft}
        onClose={() => setFloorDraft(null)}
        onCreateNew={(floorAreaId, label) => {
          setFloorDraft(null);
          setPrefill(null);
          setPrefillFloorId(floorAreaId);
          setPrefillFloorLabel(label);
          setNewOpen(true);
        }}
      />
      <ShelfFootprintModal
        draft={shelfDraft}
        onClose={() => setShelfDraft(null)}
        onCreateNew={(p) => {
          setShelfDraft(null);
          setPrefillFloorId(null);
          setPrefillFloorLabel(null);
          setPrefill(p);
          setNewOpen(true);
        }}
      />
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-sm text-stone-500">Kraunama…</div>
      }
    >
      <MapInner />
    </Suspense>
  );
}
