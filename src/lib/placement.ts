import type { AppState, Zone } from "./types";
import { rackFill, suggestLocations } from "./demo-store";

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
  const floor =
    /ant grind|palaid|floor|netelpa/.test(t);
  return { longStay, manyPallets, block, zone, floor };
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

  if (blockStorage) {
    // Tuščiausias stelažas zonoje
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
      const f = fill.get(r) ?? "empty";
      const score = f === "empty" ? 3 : f === "partial" ? 1 : 0;
      // Ilgam laikymui — DILED / didesni numeriai truputį geriau
      const zoneBonus =
        flags.longStay && zone === "DILED" && r >= 13 ? 0.5 : 0;
      const s = score + zoneBonus;
      if (s > bestScore) {
        bestScore = s;
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
            ? `Ilgam laikymui siūlau laisvą stelažą ${best} (${zone}) — visas stelažas.`
            : `Dėl dydžio / kelių palečių siūlau laisvą stelažą ${best} (${zone}).`,
        };
      }
    }
  }

  // Prefer L1 free; long stay → L2 jei L1 užimta zonoje
  const preferLevel = flags.longStay ? 2 : 1;
  const ids = suggestLocations(state, zone, false, 12);
  const locs = ids
    .map((id) => state.locations.find((l) => l.id === id))
    .filter(Boolean);

  const preferred =
    locs.find((l) => l!.level === preferLevel) ||
    locs.find((l) => l!.level === 1) ||
    locs[0];

  if (!preferred || preferred.rack == null || !preferred.side) return null;

  return {
    locationId: preferred.id,
    code: preferred.code,
    rack: preferred.rack,
    level: preferred.level ?? 1,
    side: preferred.side,
    occupyEntireRack: false,
    zone,
    reason: flags.longStay
      ? `Pagal pastabas (ilgesnis saugojimas) — ${preferred.code}, mažiau judri vieta.`
      : `Laisva vieta pagal užimtumą: ${preferred.code} (${zone}).`,
  };
}
