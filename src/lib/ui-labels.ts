import type { Order, ShipmentStatus, UnitKind, UnitStatus } from "./types";

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

export function unitStatusLabel(status: UnitStatus): string {
  return UNIT_STATUS_LABELS[status] ?? status;
}

export function formatLocationHuman(
  code: string | null,
  label?: string | null,
): string {
  if (label) return label;
  if (!code) return "Dar nepadėta";
  return code;
}

/** Užsakymo pasirinkimo sąrašui — kodas · projektas · klientas */
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
