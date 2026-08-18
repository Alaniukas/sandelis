import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  return NextResponse.json({ role: auth.role });
}
