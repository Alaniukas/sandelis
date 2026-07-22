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
  EXPO: "Ekspozicija",
  DILED: "Diled",
  STAGING: "Išvežimas",
  BROKAS: "Brokas",
  LONG: "Ilgas saugojimas",
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
  code: string | null,
  label?: string | null,
): string {
  if (label) {
    if (label === "STAGING") return "Išvežimas";
    if (label === "BROKAS") return "Brokas";
    return label;
  }
  if (!code) return "Dar nepadėta";
  return code;
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
