import { NextResponse } from "next/server";
import { rackFill } from "@/lib/demo-store";
import { refinePlacementReasonWithGemini } from "@/lib/gemini";
import { suggestPlacementLocal } from "@/lib/placement";
import { requireApiUser } from "@/lib/supabase/api-auth";
import type { AppState, Zone } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const body = await req.json();
    const { notes, project, zone, colli, state } = body as {
      notes?: string;
      project?: string;
      zone?: Zone | null;
      colli?: number;
      state?: AppState;
    };

    if (!state?.locations?.length) {
      return NextResponse.json(
        { error: "Trūksta sandėlio būsenos" },
        { status: 400 },
      );
    }

    const suggestion = suggestPlacementLocal(state, {
      notes: notes || "",
      project: project || "",
      zone: zone ?? null,
      colli: colli ?? 1,
    });

    if (!suggestion) {
      return NextResponse.json(
        { error: "Nerasta laisvos vietos pagal zoną / užimtumą" },
        { status: 404 },
      );
    }

    const fill = rackFill(state);
    const occBits: string[] = [];
    for (const [rack, f] of fill) {
      if (f !== "empty") occBits.push(`${rack}:${f}`);
    }

    const reason = await refinePlacementReasonWithGemini({
      notes: `${project || ""} ${notes || ""}`.trim(),
      suggestion: {
        code: suggestion.code,
        rack: suggestion.rack,
        reason: suggestion.reason,
        occupyEntireRack: suggestion.occupyEntireRack,
      },
      occupancySummary: occBits.slice(0, 24).join(", ") || "dauguma laisva",
    });

    return NextResponse.json({ ...suggestion, reason });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Suggest error" },
      { status: 500 },
    );
  }
}
