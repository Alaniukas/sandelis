import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { requireApiUser } from "@/lib/supabase/api-auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BUCKET = "wms-attachments";

export async function POST(req: Request) {
  const auth = await requireApiUser({ write: true });
  if (auth.response) return auth.response;

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const rawName = file.name.replace(/[^\w.\-() ]+/g, "_").slice(0, 80);
  const ext = rawName.includes(".") ? rawName.split(".").pop() : "bin";
  const path = `${new Date().toISOString().slice(0, 10)}/${uuid()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path });
}
