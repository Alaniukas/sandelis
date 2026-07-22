import QRCode from "qrcode";
import type { Order, Unit, UnitKind } from "./types";

/** BarTender CSV — viena eilutė už užsakymą (identiški lipdukai) */
export const BARTENDER_COLUMNS = [
  "Kodas",
  "Objektas",
  "Kiek deziu paleciu",
  "atvykimo data",
] as const;

export const DEFAULT_APP_URL = "https://sandelio.vercel.app";

export type OrderLabelData = {
  kodas: string;
  objektas: string;
  kiekis: string;
  data: string;
  qr: string;
  qrDataUrl: string;
};

function shortDateLt(iso?: string | null): string {
  if (iso) {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}.${m[2]}.${m[1].slice(-2)}`;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yy = String(d.getFullYear()).slice(-2);
      return `${dd}.${mm}.${yy}`;
    }
  }
  const d = new Date();
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Agreguotas kiekis visam užsakymui */
export function formatOrderQty(units: Unit[]): string {
  const pallets = units.filter((u) => u.kind === "pallet").length;
  const boxes = units.filter((u) => u.kind === "box").length;
  const parts: string[] = [];
  if (pallets > 0) parts.push(`${pallets} pl`);
  if (boxes > 0) parts.push(`${boxes} dėž`);
  if (parts.length === 0 && units.length > 0) {
    const total = units[0]?.totalInSet ?? units.length;
    const kind: UnitKind = units[0]?.kind ?? "box";
    parts.push(kind === "pallet" ? `${total} pl` : `${total} dėž`);
  }
  return parts.join(", ") || "—";
}

/** Vienas lipdukas = vienas užsakymas. QR → /o/[orderToken] */
export async function buildOrderLabel(params: {
  order: Order;
  units: Unit[];
  appUrl: string;
  arrivedAt?: string | null;
}): Promise<OrderLabelData> {
  const { order, units, appUrl, arrivedAt } = params;
  const token = order.qrToken;
  if (!token) throw new Error("Užsakymas neturi QR token");

  const url = `${appUrl.replace(/\/$/, "")}/o/${token}`;
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 512 });

  return {
    kodas: order.orderCode,
    objektas: order.project || order.orderCode || order.client,
    kiekis: formatOrderQty(units),
    data: shortDateLt(arrivedAt ?? order.createdAt),
    qr: url,
    qrDataUrl,
  };
}

export function labelToCsv(label: OrderLabelData): string {
  const header = BARTENDER_COLUMNS.join(";");
  const row = [label.kodas, label.objektas, label.kiekis, label.data]
    .map((v) => `"${String(v).replace(/"/g, '""')}"`)
    .join(";");
  return `\uFEFF${header}\r\n${row}`;
}
