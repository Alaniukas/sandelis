import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/api-auth";
import { createClient } from "@/lib/supabase/server";
import type { AppState } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 },
    );
  }

  const { data, error } = await supabase
    .from("wms_shared_state")
    .select("payload, updated_at")
    .eq("id", "shared")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    payload: (data?.payload as AppState | null) ?? null,
    updatedAt: data?.updated_at ?? null,
  });
}

export async function PUT(req: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 },
    );
  }

  const body = await req.json();
  const payload = body.payload as AppState;
  if (!payload?.locations) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("wms_shared_state")
    .upsert(
      {
        id: "shared",
        payload,
        updated_at: now,
      },
      { onConflict: "id" },
    )
    .select("updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updatedAt: data?.updated_at ?? now });
}
