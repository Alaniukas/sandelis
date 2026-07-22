export type Zone = "EXPO" | "DILED" | "STAGING" | "BROKAS" | "LONG";
export type Side = "K" | "D";
export type UnitStatus =
  | "expected"
  | "received"
  | "stored"
  | "staged"
  | "issued"
  | "archived";
export type UnitKind = "box" | "pallet";
export type ShipmentStatus = "expected" | "arrived" | "closed";
export type LocationKind = "pallet" | "small_shelf" | "special";

export type RackSize = "red_2.9" | "blue_1.9";

export interface Location {
  id: string;
  code: string;
  zone: Zone;
  rack: number | null;
  side: Side | null;
  level: number | null;
  kind: LocationKind;
  label: string;
  rackSize?: RackSize;
}

export interface CustomField {
  id: string;
  label: string;
  value: string;
  showOnLabel: boolean;
}

export interface ManufacturerProfile {
  id: string;
  name: string;
  notes: string;
  createdAt: string;
}

export interface Order {
  id: string;
  orderCode: string;
  project: string;
  client: string;
  zone: Zone | null;
  notes: string;
  blockStorage: boolean;
  status: "active" | "archived";
  customFields?: CustomField[];
  /** QR lipdukas — vienas visam užsakymui → /o/[qrToken] */
  qrToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface Shipment {
  id: string;
  orderId: string | null;
  status: ShipmentStatus;
  carrier: string;
  expectedAt: string | null;
  arrivedAt: string | null;
  palletCount: number | null;
  boxCount: number | null;
  notes: string;
  documentName: string | null;
  parsedJson: ParsedDocument | null;
  /** Įkeltas PDF / el. laiškas (demo: data URL) */
  attachmentDataUrl?: string | null;
  customFields?: CustomField[];
  createdAt: string;
}

export interface Unit {
  id: string;
  orderId: string;
  shipmentId: string | null;
  locationId: string | null;
  /** Jei true — unitas užima visą stelažą (visus K/D × aukštus) */
  occupiesEntireRack: boolean;
  /** @deprecated — naudok footprint*; laikoma migracijai */
  slotSpan: "full" | "half";
  /** @deprecated */
  slotHalf: "L" | "R" | null;
  /** Plotas ant sijos (m): plotis palei stelažą */
  footprintW: number | null;
  /** Plotas ant sijos (m): gylis */
  footprintD: number | null;
  /** Offset palei bay plotį nuo centro (m), neigiamas = K pusė */
  footprintOffsetX: number | null;
  /** Offset gylio kryptimi nuo bay centro (m) */
  footprintOffsetZ: number | null;
  /** Prekė ant grindų pažymėtame plote */
  floorAreaId: string | null;
  kind: UnitKind;
  indexInSet: number;
  totalInSet: number;
  qrToken: string;
  labelTitle: string;
  status: UnitStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** Pažymėtas plotas ant stelažo aukšto (kaip FloorArea, bet ant sijos) */
export interface ShelfFootprint {
  rack: number;
  level: number;
  /** lokalus X nuo bay centro */
  offsetX: number;
  w: number;
  d: number;
}

/** Stačiakampis plotas ant grindų (kambario koordinatės, metrai) */
export interface FloorArea {
  id: string;
  label: string;
  x: number;
  z: number;
  w: number;
  d: number;
  notes: string;
  orderId: string | null;
  createdAt: string;
}

export interface Defect {
  id: string;
  unitId: string | null;
  shipmentId: string;
  description: string;
  photoDataUrl: string | null;
  createdAt: string;
}

export interface Handover {
  id: string;
  orderId: string;
  recipientName: string;
  notes: string;
  unitIds: string[];
  issuedAt: string;
}

export interface ParsedLine {
  name: string;
  qty: number;
  unit: string;
}

export interface ParsedDocument {
  source: string;
  orderCode: string;
  project: string;
  client: string;
  lines: ParsedLine[];
  colliHint: number | null;
  notes: string;
  confidence: number;
  zone?: Zone;
  customFields?: CustomField[];
}

export interface AppState {
  locations: Location[];
  orders: Order[];
  shipments: Shipment[];
  units: Unit[];
  defects: Defect[];
  handovers: Handover[];
  floorAreas: FloorArea[];
  manufacturerProfiles?: ManufacturerProfile[];
}
