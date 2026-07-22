import type { AppState, CustomField } from "./types";
import { sourceLabel } from "./ui-labels";

export type OrderDetailBlock = {
  title: string;
  body: string;
};

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isDuplicateBody(text: string, seenBodies: Set<string>): boolean {
  const norm = normalizeText(text);
  if (!norm) return true;
  for (const existing of seenBodies) {
    const en = normalizeText(existing);
    if (norm === en || norm.includes(en) || en.includes(norm)) return true;
  }
  return false;
}

function pushBlock(
  blocks: OrderDetailBlock[],
  seen: Set<string>,
  seenBodies: Set<string>,
  title: string,
  body: string | null | undefined,
) {
  const text = body?.trim();
  if (!text) return;
  if (isDuplicateBody(text, seenBodies)) return;
  const key = `${title}\0${text}`;
  if (seen.has(key)) return;
  seen.add(key);
  seenBodies.add(text);
  blocks.push({ title, body: text });
}

function pushCustomFields(
  blocks: OrderDetailBlock[],
  seen: Set<string>,
  seenBodies: Set<string>,
  fields: CustomField[] | undefined,
) {
  for (const f of fields ?? []) {
    if (!f.label?.trim() && !f.value?.trim()) continue;
    const val = f.value?.trim();
    if (!val || isDuplicateBody(val, seenBodies)) continue;
    pushBlock(
      blocks,
      seen,
      seenBodies,
      f.label?.trim() || "Papildoma informacija",
      f.value,
    );
  }
}

function isTrivialSource(source: string | null | undefined, documentName?: string | null): boolean {
  const s = source?.trim().toLowerCase() ?? "";
  if (!s || s === "manual" || s === "document") return true;
  if (documentName && s === documentName.trim().toLowerCase()) return true;
  return false;
}

function linesCoveredByCustomFields(
  linesText: string,
  fields: CustomField[] | undefined,
): boolean {
  const norm = normalizeText(linesText);
  for (const f of fields ?? []) {
    const v = normalizeText(f.value ?? "");
    if (v && (norm === v || norm.includes(v) || v.includes(norm))) return true;
  }
  return false;
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
  const seenBodies = new Set<string>();
  const shipments = state.shipments.filter((s) => s.orderId === orderId);
  const units = state.units.filter((u) => u.orderId === orderId);

  pushBlock(blocks, seen, seenBodies, "Užsakymo pastabos", order.notes);
  pushCustomFields(blocks, seen, seenBodies, order.customFields);

  const orderNotesNorm = normalizeText(order.notes ?? "");

  for (const s of shipments) {
    const docLabel = s.documentName
      ? `Siuntos pastabos (${s.documentName})`
      : "Siuntos pastabos";
    pushBlock(blocks, seen, seenBodies, docLabel, s.notes);

    const parsed = s.parsedJson;
    if (parsed) {
      if (!isTrivialSource(parsed.source, s.documentName)) {
        pushBlock(
          blocks,
          seen,
          seenBodies,
          "Gamintojas / šaltinis",
          sourceLabel(parsed.source),
        );
      }

      const parsedNotesNorm = normalizeText(parsed.notes ?? "");
      const isDupNotes =
        parsedNotesNorm &&
        orderNotesNorm &&
        (parsedNotesNorm === orderNotesNorm ||
          parsedNotesNorm.includes(orderNotesNorm) ||
          orderNotesNorm.includes(parsedNotesNorm));
      if (!isDupNotes) {
        pushBlock(blocks, seen, seenBodies, "Iš dokumento (pastabos)", parsed.notes);
      }

      pushCustomFields(blocks, seen, seenBodies, parsed.customFields);
      pushCustomFields(blocks, seen, seenBodies, s.customFields);

      if (parsed.lines?.length) {
        const linesText = parsed.lines
          .map((l) => `${l.name} × ${l.qty}${l.unit ? ` ${l.unit}` : ""}`)
          .join("\n");
        const allCustom = [
          ...(order.customFields ?? []),
          ...(parsed.customFields ?? []),
          ...(s.customFields ?? []),
        ];
        if (!linesCoveredByCustomFields(linesText, allCustom)) {
          pushBlock(blocks, seen, seenBodies, "Prekės iš dokumento", linesText);
        }
      }
    } else {
      pushCustomFields(blocks, seen, seenBodies, s.customFields);
    }

    if (s.carrier?.trim()) {
      pushBlock(blocks, seen, seenBodies, "Vežėjas", s.carrier);
    }
  }

  const unitNotes = new Map<string, string>();
  for (const u of units) {
    const n = u.notes?.trim();
    if (!n || isDuplicateBody(n, seenBodies)) continue;
    const label =
      units.length > 1
        ? `Dėžė ${u.indexInSet}/${u.totalInSet}`
        : "Dėžės pastabos";
    if (!unitNotes.has(n)) unitNotes.set(n, label);
  }
  for (const [text, title] of unitNotes) {
    pushBlock(blocks, seen, seenBodies, title, text);
  }

  for (const d of state.defects.filter(
    (x) => x.shipmentId && shipments.some((s) => s.id === x.shipmentId),
  )) {
    pushBlock(blocks, seen, seenBodies, "Brokas / defektas", d.description);
  }

  return blocks;
}

/** Ar unit pastabos jau rodomos OrderInfoSection. */
export function unitNotesVisibleInOrderInfo(
  state: AppState,
  orderId: string,
  unitNotes: string | null | undefined,
): boolean {
  const n = unitNotes?.trim();
  if (!n) return false;
  const blocks = collectOrderDetailBlocks(state, orderId);
  const norm = normalizeText(n);
  return blocks.some((b) => {
    const bn = normalizeText(b.body);
    return bn === norm || bn.includes(norm) || norm.includes(bn);
  });
}

/** Sujungia pastabas be dubliavimo (vienas tekstas kito potipis — praleidžiam). */
export function mergeUniqueNotes(
  ...parts: (string | null | undefined)[]
): string {
  const kept: string[] = [];
  for (const p of parts) {
    const text = p?.trim();
    if (!text) continue;
    const norm = normalizeText(text);
    const dup = kept.some((existing) => {
      const en = normalizeText(existing);
      return en === norm || en.includes(norm) || norm.includes(en);
    });
    if (!dup) kept.push(text);
  }
  return kept.join("\n");
}

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
