import type { Order, ShipmentStatus, UnitKind, UnitStatus, Zone } from "./types";

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  expected: "Laukiama",
  received: "Priimta",
  stored: "Sandėlyje",
  staged: "Paruošta atsiėmimui",
  issued: "Išduota",
  archived: "Archyvuota",
};

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  expected: "Laukiamas atvykimas",
  arrived: "Atvyko",
  closed: "Užbaigtas",
};

export const UNIT_KIND_LABELS: Record<UnitKind, string> = {
  box: "Dėžė",
  pallet: "Paletė",
};

export const ZONE_LABELS: Record<Zone, string> = {
  EXPO: "ExpoDesign",
  DILED: "Diled",
  STAGING: "Išvežimas",
  BROKAS: "Brokas",
  LONG: "Ilgos prekės",
};

export function zoneLabel(zone: Zone | null | undefined): string {
  if (!zone) return "—";
  return ZONE_LABELS[zone] ?? zone;
}

export function sourceLabel(source: string | null | undefined): string {
  const s = source?.trim().toLowerCase() ?? "";
  if (!s || s === "manual") return "Įvesta rankiniu būdu";
  if (s === "document") return "Iš dokumento";
  return source!.trim();
}

export function unitStatusLabel(status: UnitStatus): string {
  return UNIT_STATUS_LABELS[status] ?? status;
}

export function formatLocationHuman(
  code: string | null | undefined,
  label?: string | null,
): string {
  if (label) {
    if (label === "STAGING") return "Išvežimas";
    if (label === "BROKAS") return "Brokas";
    // Prefer human label unless it's just the raw code
    if (!code || label !== code) return label;
  }
  if (!code) return "Dar nepadėta";

  const m = code.match(
    /^(EXPO|DILED|LONG|STAGING|BROKAS)-(\d+|ENTRANCE|EXIT)?-?([KDMS])?-?([M0-9]+)?$/i,
  );
  if (m) {
    const zone = m[1].toUpperCase();
    const rack = m[2];
    const side = m[3]?.toUpperCase();
    const level = m[4];
    const zoneName =
      zone === "EXPO"
        ? "ExpoDesign"
        : zone === "DILED"
          ? "Diled"
          : zone === "LONG"
            ? "Ilgos"
            : zone === "STAGING"
              ? "Išvežimas"
              : zone === "BROKAS"
                ? "Brokas"
                : zone;
    if (zone === "STAGING" || zone === "BROKAS") return zoneName;
    const sideName =
      side === "K" ? "kairė" : side === "D" ? "dešinė" : side === "M" ? "vidurys" : side || "";
    const levelName =
      level === "M" ? "mini lentyna" : level ? `${level} aukštas` : "";
    const parts = [
      rack && /^\d+$/.test(rack) ? `Stelažas ${rack}` : rack || null,
      sideName || null,
      levelName || null,
    ].filter(Boolean);
    if (parts.length) return `${parts.join(" · ")} (${zoneName})`;
  }

  if (code.includes("/")) {
    return code
      .replace(/^EXPO-/, "ExpoDesign ")
      .replace(/^DILED-/, "Diled ")
      .replace(/-/g, " · ");
  }

  return code;
}

export function locationOptionLabel(loc: {
  code: string;
  label?: string | null;
  rack?: number | null;
  side?: string | null;
  level?: number | null;
  zone?: Zone | null;
}): string {
  if (loc.rack != null) {
    const sideName =
      loc.side === "K"
        ? "kairė"
        : loc.side === "D"
          ? "dešinė"
          : loc.side === "M"
            ? "mini"
            : loc.side || "";
    const levelName =
      loc.level == null && loc.code.endsWith("-M")
        ? "mini lentyna"
        : loc.level != null
          ? `${loc.level} aukštas`
          : "";
    const parts = [
      `Stelažas ${loc.rack}`,
      sideName || null,
      levelName || null,
      zoneLabel(loc.zone),
    ].filter(Boolean);
    return parts.join(" · ");
  }
  return formatLocationHuman(loc.code, loc.label);
}

/** Trumpa etiketė 3D žemėlapyje / sąrašuose */
export function unitShortLabel(
  order: Pick<Order, "orderCode" | "project" | "client"> | undefined,
  unit: { labelTitle?: string },
  maxLen = 24,
): string {
  const code = order?.orderCode?.trim();
  const client = order?.client?.trim();
  if (code && client) {
    const s = `${code} · ${client}`;
    return s.length <= maxLen ? s : code.slice(0, maxLen);
  }
  const title = unit.labelTitle?.trim();
  if (code) return code.slice(0, maxLen);
  return (title || order?.project || "?").slice(0, maxLen);
}

export function formatOrderOption(order: Order): string {
  const code = order.orderCode?.trim() ?? "";
  const project = order.project?.trim() ?? "";
  const client = order.client?.trim() ?? "";

  const parts: string[] = [];
  if (code) parts.push(code);
  if (project && project !== code) parts.push(project);
  else if (!code && project) parts.push(project);
  if (client) parts.push(client);

  return parts.join(" · ") || order.id.slice(0, 8);
}
