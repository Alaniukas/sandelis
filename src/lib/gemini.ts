import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuid } from "uuid";
import type { CustomField, ParsedDocument, ParsedLine } from "./types";

/** Override via GEMINI_MODEL env. See https://ai.google.dev/gemini-api/docs/models */
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";

function getGeminiModel(key: string) {
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({ model: GEMINI_MODEL });
}

const SCHEMA_HINT = `Return ONLY valid JSON with this shape:
{
  "source": "string (gamintojo arba šaltinio pavadinimas)",
  "orderCode": "string",
  "project": "string",
  "client": "string",
  "lines": [{"name":"string","qty":number,"unit":"string"}],
  "colliHint": number|null,
  "notes": "string (svarbi info, kurios nepavyko sudėti į laukus)",
  "confidence": number,
  "zone": "EXPO"|"DILED"|null,
  "customFields": [{"label":"string","value":"string","showOnLabel":boolean}]
}`;

export type ParseContext = {
  manufacturerHint?: string;
  profileNotes?: string;
};

function normalizeCustomFields(
  fields: unknown,
): CustomField[] | undefined {
  if (!Array.isArray(fields)) return undefined;
  return fields
    .filter((f) => f && typeof f === "object")
    .map((f) => {
      const row = f as Partial<CustomField>;
      return {
        id: uuid(),
        label: String(row.label ?? "").trim(),
        value: String(row.value ?? "").trim(),
        showOnLabel: !!row.showOnLabel,
      };
    })
    .filter((f) => f.label || f.value);
}

function normalizeParsed(
  parsed: Partial<ParsedDocument>,
  sourceFallback: string,
): ParsedDocument {
  const customFields = normalizeCustomFields(parsed.customFields);
  return {
    source: parsed.source || sourceFallback,
    orderCode: parsed.orderCode || "",
    project: parsed.project || "",
    client: parsed.client || "",
    lines: Array.isArray(parsed.lines) ? parsed.lines : [],
    colliHint: parsed.colliHint ?? null,
    notes: parsed.notes || "",
    confidence: parsed.confidence ?? 0.5,
    zone: parsed.zone ?? undefined,
    customFields: customFields?.length ? customFields : undefined,
  };
}

function buildContextBlock(ctx?: ParseContext): string {
  if (!ctx?.manufacturerHint && !ctx?.profileNotes) return "";
  return `
Kontekstas:
${ctx.manufacturerHint ? `- Gamintojas / šaltinis: ${ctx.manufacturerHint}` : ""}
${ctx.profileNotes ? `- Žinomas šio gamintojo formatas: ${ctx.profileNotes}` : ""}
`;
}

const UNIVERSAL_RULES = `
Taisyklės:
- Dokumentas gali būti LT, EN arba mišrus — suprask abu.
- Šaltiniai: sąskaitos, packing list, važtaraščiai, el. laiškai, screenshot, užsakymo patvirtinimai.
- Ištrauk VISĄ naudingą info. Jei laukas netelpa į standartinius — dėk į customFields su aiškiu label (pvz. "Gamintojo ref", "Adresas", "Vežėjas", "Kontaktas", "Pristatymo data").
- showOnLabel=true tik svarbiausiems laukams (max 3), kurie turi matytis ant lipduko.
- orderCode = vidinis kodas, reference, BJ-xxxx, I-xxxx ir pan.
- project = projekto pavadinimas, adresas arba pagrindinė prekė.
- client = klientas, gavėjas, kontaktinis asmuo arba įmonė.
- source = gamintojo / siuntėjo pavadinimas.
- Jei abejoji — notes laukelyje palik originalų teksto fragmentą.
- zone: DILED (apšvietimo detalės), EXPO (ExpoDesign projektai), null jei neaišku.
`;

export function parseIguzziniInvoiceText(text: string): ParsedDocument | null {
  if (!/iguzzini|invoice|order no/i.test(text)) return null;

  const orderMatch = text.match(/Order no\.?\s*[\s\S]*?(\d{5,})/i);
  const refMatch =
    text.match(/Your order no\.?\s*([A-Z0-9-]+)/i) ||
    text.match(/\b(I-\d+-\d+)\b/);
  const clientRow = text.match(
    /Your reference[\s\S]*?\n\s*\d+\s+([^\n]+)/i,
  );
  const contactMatch = text.match(/Contact person\s+([^\n]+)/i);
  const dispatchMatch = text.match(/Date of dispatch\s+(\d+)/i);

  const lines: ParsedLine[] = [];
  const lineRe = /\d+\s+\d{6,}\s+(.+?)\s+(\d+)\s+[\d.]+\s*pcs/gi;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(text)) !== null) {
    lines.push({
      name: m[1].trim(),
      qty: Number(m[2]) || 1,
      unit: "VNT",
    });
  }

  const client = clientRow?.[1]?.trim() || contactMatch?.[1]?.trim() || "";
  const orderCode = refMatch?.[1] || orderMatch?.[1] || "";

  return {
    source: "Iguzzini",
    orderCode,
    project:
      lines.length > 1
        ? `${lines[0].name} + ${lines.length - 1} kt.`
        : lines[0]?.name || orderCode || "Iguzzini užsakymas",
    client,
    lines,
    colliHint: Math.max(1, lines.length),
    notes: [
      orderMatch ? `Gamintojo užs. ${orderMatch[1]}` : "",
      dispatchMatch ? `Išsiuntimo data ${dispatchMatch[1]}` : "",
      "FedEx",
    ]
      .filter(Boolean)
      .join(" · "),
    confidence: 0.75,
    zone: "DILED",
    customFields: [
      orderMatch
        ? {
            id: uuid(),
            label: "Gamintojo užs.",
            value: orderMatch[1],
            showOnLabel: false,
          }
        : null,
      dispatchMatch
        ? {
            id: uuid(),
            label: "Išsiuntimo data",
            value: dispatchMatch[1],
            showOnLabel: true,
          }
        : null,
    ].filter(Boolean) as CustomField[],
  };
}

function demoParsed(source: string, note: string): ParsedDocument {
  return {
    source,
    orderCode: "",
    project: "",
    client: "",
    lines: [],
    colliHint: null,
    notes: note,
    confidence: 0.2,
    zone: undefined,
  };
}

export async function parseTextWithGemini(
  rawText: string,
  ctx?: ParseContext,
): Promise<ParsedDocument> {
  const text = rawText.trim();
  if (!text) throw new Error("Tuščias tekstas");

  const iguzzini = parseIguzziniInvoiceText(text);
  if (iguzzini) return iguzzini;

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const lines = text
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    return {
      source: ctx?.manufacturerHint || "pasted-text",
      orderCode: "",
      project: lines[0] || "",
      client: "",
      lines: lines.slice(1).map((name) => ({ name, qty: 1, unit: "VNT" })),
      colliHint: null,
      notes: text,
      confidence: 0.3,
      zone: undefined,
    };
  }

  const model = getGeminiModel(key);
  const prompt = `Tu esi universalus sandėlio dokumentų parseris.
Iš bet kokio teksto (el. laiškas, užrašai, kopijuotas PDF tekstas) ištrauk struktūruotą info.
${SCHEMA_HINT}
${UNIVERSAL_RULES}
${buildContextBlock(ctx)}
Tekstas:
---
${text}
---`;

  const result = await model.generateContent([{ text: prompt }]);
  const out = result.response.text();
  const jsonMatch = out.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Gemini negrąžino JSON");
  return normalizeParsed(JSON.parse(jsonMatch[0]), "pasted-text");
}

export async function parseDocumentWithGemini(params: {
  mimeType: string;
  base64: string;
  fileName: string;
  context?: ParseContext;
}): Promise<ParsedDocument> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return demoParsed(
      params.fileName,
      "API raktas nenustatytas — užpildyk laukus ranka arba įklijuok tekstą.",
    );
  }

  const model = getGeminiModel(key);

  const prompt = `Tu esi universalus sandėlio dokumentų parseris.
Ištrauk info iš dokumento (PDF, screenshot, sąskaita, packing list, važtaraštis, el. laiškas).
${SCHEMA_HINT}
${UNIVERSAL_RULES}
${buildContextBlock(params.context)}
Failo pavadinimas: ${params.fileName}`;

  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType: params.mimeType,
        data: params.base64,
      },
    },
  ]);

  const text = result.response.text();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Gemini negrąžino JSON");
  return normalizeParsed(JSON.parse(jsonMatch[0]), params.fileName);
}

export async function refinePlacementReasonWithGemini(params: {
  notes: string;
  suggestion: {
    code: string;
    rack: number;
    reason: string;
    occupyEntireRack: boolean;
  };
  occupancySummary: string;
}): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return params.suggestion.reason;

  const model = getGeminiModel(key);
  const prompt = `Tu esi sandėlio planuotojas (EXPO / DILED, stelažai 1–18).
Klientas parašė: """${params.notes}"""
Siūloma vieta: ${params.suggestion.code} (stelažas ${params.suggestion.rack})${
    params.suggestion.occupyEntireRack ? ", visas stelažas" : ""
  }.
Užimtumas (santrauka): ${params.occupancySummary}
Parašyk 1–2 sakinius LT kodėl ši vieta tinka. Be markdown.`;

  try {
    const result = await model.generateContent([{ text: prompt }]);
    const text = result.response.text().trim();
    return text || params.suggestion.reason;
  } catch {
    return params.suggestion.reason;
  }
}
