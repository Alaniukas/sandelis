import type { ShipmentStatus, UnitKind, UnitStatus } from "./types";

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
