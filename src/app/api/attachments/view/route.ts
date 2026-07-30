import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/api-auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BUCKET = "wms-attachments";

function storagePathFromRef(ref: string): string | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("http")) return trimmed.replace(/^\/+/, "");

  const marker = `/${BUCKET}/`;
  const idx = trimmed.indexOf(marker);
  if (idx >= 0) return trimmed.slice(idx + marker.length);

  const publicMarker = "/object/public/" + BUCKET + "/";
  const pubIdx = trimmed.indexOf(publicMarker);
  if (pubIdx >= 0) return trimmed.slice(pubIdx + publicMarker.length);

  const signedMarker = "/object/sign/" + BUCKET + "/";
  const signIdx = trimmed.indexOf(signedMarker);
  if (signIdx >= 0) {
    const rest = trimmed.slice(signIdx + signedMarker.length);
    return rest.split("?")[0] ?? null;
  }

  return null;
}

export async function GET(req: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 },
    );
  }

  const u = new URL(req.url).searchParams.get("u");
  const pathParam = new URL(req.url).searchParams.get("path");
  const storagePath = storagePathFromRef(pathParam || u || "");

  if (!storagePath) {
    return NextResponse.json({ error: "Invalid attachment ref" }, { status: 400 });
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: error?.message ?? "Nepavyko atidaryti priedo" },
      { status: 404 },
    );
  }

  return NextResponse.redirect(data.signedUrl);
}
