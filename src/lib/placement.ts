import type { AppState, Zone } from "./types";
import { rackFill, suggestLocations } from "./demo-store";
import { zoneLabel } from "./ui-labels";

export type PlacementSuggestion = {
  locationId: string;
  code: string;
  rack: number;
  level: number;
  side: "K" | "D";
  reason: string;
  occupyEntireRack: boolean;
  zone: Zone;
};

function inferFlags(text: string) {
  const t = text.toLowerCase();
  const longStay =
    /\b(\d+)\s*[-–]?\s*(\d+)?\s*m[eė]n/.test(t) ||
    /ilgai|long.?term|kelis m[eė]n|sand[eė]lyje\s+\d/.test(t);
  const unknownPickup =
    /nežinau|nezinau|nežinia|nezinia|kada atsiims|kada pasiims|kada pristat|neaišku kada/.test(
      t,
    );
  const manyPallets =
    /\b([3-9]|\d{2,})\s*palet/.test(t) ||
    /dideli?a?s?\s+palet/.test(t) ||
    /4\s*palet/.test(t);
  const block =
    /dubai|visas stela[zž]|block|visa vieta|užimti stela/.test(t) ||
    manyPallets;
  const zone: Zone | null = /diled/.test(t)
    ? "DILED"
    : /expo/.test(t)
      ? "EXPO"
      : null;
  const floor = /ant grind|palaid|floor|netelpa/.test(t);
  return { longStay, unknownPickup, manyPallets, block, zone, floor };
}

/** Heuristika + užimtumas — veikia be Gemini */
export function suggestPlacementLocal(
  state: AppState,
  opts: {
    zone?: Zone | null;
    notes?: string;
    project?: string;
    colli?: number;
  },
): PlacementSuggestion | null {
  const blob = `${opts.project || ""} ${opts.notes || ""}`;
  const flags = inferFlags(blob);
  const zone = (opts.zone || flags.zone || "EXPO") as Zone;
  const colli = opts.colli ?? 1;
  const blockStorage = flags.block || colli >= 4;
  const fill = rackFill(state);
  const avoidEntrance = flags.unknownPickup && !flags.longStay;

  if (blockStorage) {
    const racks = state.locations
      .filter(
        (l) =>
          l.kind === "pallet" &&
          (l.zone === zone || l.zone === "LONG") &&
          l.rack != null &&
          l.level === 1 &&
          l.side === "K",
      )
      .map((l) => l.rack!)
      .filter((v, i, a) => a.indexOf(v) === i);

    let best: number | null = null;
    let bestScore = -1;
    for (const r of racks) {
      if (avoidEntrance && r <= 4) continue;
      const f = fill.get(r) ?? "empty";
      let score = f === "empty" ? 3 : f === "partial" ? 1 : 0;
      if (flags.longStay && zone === "DILED" && r >= 13) score += 0.5;
      if (flags.unknownPickup && r >= 8 && r <= 14) score += 0.4;
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    if (best != null && bestScore > 0) {
      const loc = state.locations.find(
        (l) => l.rack === best && l.level === 1 && l.side === "K",
      );
      if (loc) {
        return {
          locationId: loc.id,
          code: loc.code,
          rack: best,
          level: 1,
          side: "K",
          occupyEntireRack: true,
          zone,
          reason: flags.longStay
            ? `Ilgam laikymui siūlau laisvą stelažą ${best} (${zoneLabel(zone)}) — visas stelažas.`
            : `Dėl dydžio / kelių palečių siūlau laisvą stelažą ${best} (${zoneLabel(zone)}).`,
        };
      }
    }
  }

  const preferLevel =
    flags.longStay ? 2 : flags.unknownPickup ? 2 : 1;
  const ids = suggestLocations(state, zone, false, 12, avoidEntrance);
  const locs = ids
    .map((id) => state.locations.find((l) => l.id === id))
    .filter(Boolean);

  const preferred =
    locs.find((l) => l!.level === preferLevel) ||
    locs.find((l) => l!.level === 1) ||
    locs[0];

  if (!preferred || preferred.rack == null || !preferred.side) return null;

  let reason: string;
  if (flags.unknownPickup) {
    reason = `Neaišku kada atsiims — siūlau ramesnę vietą viduryje: ${preferred.code} (${zoneLabel(zone)}).`;
  } else if (flags.longStay) {
    reason = `Pagal pastabas (ilgesnis saugojimas) — ${preferred.code}, mažiau judri vieta.`;
  } else {
    reason = `Laisva vieta pagal užimtumą: ${preferred.code} (${zoneLabel(zone)}).`;
  }

  return {
    locationId: preferred.id,
    code: preferred.code,
    rack: preferred.rack,
    level: preferred.level ?? 1,
    side: preferred.side,
    occupyEntireRack: false,
    zone,
    reason,
  };
}
