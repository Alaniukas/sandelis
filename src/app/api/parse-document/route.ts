import { NextResponse } from "next/server";
import {
  parseDocumentWithGemini,
  parseTextWithGemini,
} from "@/lib/gemini";
import { requireApiUser } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {    const body = await req.json();
    const { mimeType, base64, fileName, text, manufacturerHint, profileNotes } =
      body as {
        mimeType?: string;
        base64?: string;
        fileName?: string;
        text?: string;
        manufacturerHint?: string;
        profileNotes?: string;
      };

    const context = {
      manufacturerHint,
      profileNotes,
    };

    if (text && text.trim()) {
      const parsed = await parseTextWithGemini(text, context);
      return NextResponse.json(parsed);
    }

    if (!base64) {
      return NextResponse.json(
        { error: "Įklijuok tekstą arba įkelk failą" },
        { status: 400 },
      );
    }

    const parsed = await parseDocumentWithGemini({
      mimeType: mimeType || "application/pdf",
      base64,
      fileName: fileName || "document",
      context,
    });
    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Parse error" },
      { status: 500 },
    );
  }
}
