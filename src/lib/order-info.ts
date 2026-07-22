import type { AppState, CustomField } from "./types";

export type OrderDetailBlock = {
  title: string;
  body: string;
};

function pushBlock(
  blocks: OrderDetailBlock[],
  seen: Set<string>,
  title: string,
  body: string | null | undefined,
) {
  const text = body?.trim();
  if (!text) return;
  const key = `${title}\0${text}`;
  if (seen.has(key)) return;
  seen.add(key);
  blocks.push({ title, body: text });
}

function pushCustomFields(
  blocks: OrderDetailBlock[],
  seen: Set<string>,
  fields: CustomField[] | undefined,
) {
  for (const f of fields ?? []) {
    if (!f.label?.trim() && !f.value?.trim()) continue;
    pushBlock(
      blocks,
      seen,
      f.label?.trim() || "Papildoma informacija",
      f.value,
    );
  }
}

/** Visi užsakymo komentarai, pastabos ir papildomi laukai — vienoje vietoje. */
export function collectOrderDetailBlocks(
  state: AppState,
  orderId: string,
): OrderDetailBlock[] {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return [];

  const blocks: OrderDetailBlock[] = [];
  const seen = new Set<string>();
  const shipments = state.shipments.filter((s) => s.orderId === orderId);
  const units = state.units.filter((u) => u.orderId === orderId);

  pushBlock(blocks, seen, "Užsakymo pastabos", order.notes);
  pushCustomFields(blocks, seen, order.customFields);

  for (const s of shipments) {
    const docLabel = s.documentName
      ? `Siuntos pastabos (${s.documentName})`
      : "Siuntos pastabos";
    pushBlock(blocks, seen, docLabel, s.notes);

    const parsed = s.parsedJson;
    if (parsed) {
      pushBlock(blocks, seen, "Gamintojas / šaltinis", parsed.source);
      pushBlock(blocks, seen, "Iš dokumento (pastabos)", parsed.notes);
      pushCustomFields(blocks, seen, parsed.customFields);
      pushCustomFields(blocks, seen, s.customFields);

      if (parsed.lines?.length) {
        const linesText = parsed.lines
          .map((l) => `${l.name} × ${l.qty}${l.unit ? ` ${l.unit}` : ""}`)
          .join("\n");
        pushBlock(blocks, seen, "Prekės iš dokumento", linesText);
      }
    } else {
      pushCustomFields(blocks, seen, s.customFields);
    }

    if (s.carrier?.trim()) {
      pushBlock(blocks, seen, "Vežėjas", s.carrier);
    }
  }

  const unitNotes = new Map<string, string>();
  for (const u of units) {
    const n = u.notes?.trim();
    if (!n) continue;
    const label =
      units.length > 1
        ? `Dėžė ${u.indexInSet}/${u.totalInSet}`
        : "Dėžės pastabos";
    if (!unitNotes.has(n)) unitNotes.set(n, label);
  }
  for (const [text, title] of unitNotes) {
    pushBlock(blocks, seen, title, text);
  }

  for (const d of state.defects.filter(
    (x) => x.shipmentId && shipments.some((s) => s.id === x.shipmentId),
  )) {
    pushBlock(blocks, seen, "Brokas / defektas", d.description);
  }

  return blocks;
}

/** Trumpa santrauka paieškos rezultatams. */
export function orderDetailSummary(
  state: AppState,
  orderId: string,
  maxLen = 160,
): string {
  const blocks = collectOrderDetailBlocks(state, orderId);
  if (!blocks.length) return "";
  const joined = blocks.map((b) => `${b.title}: ${b.body}`).join(" · ");
  if (joined.length <= maxLen) return joined;
  return `${joined.slice(0, maxLen).trim()}…`;
}
