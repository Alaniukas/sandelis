import { NextResponse } from "next/server";
import { createClient } from "./server";

export async function requireApiUser() {
  const supabase = await createClient();
  if (!supabase) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Supabase not configured" },
        { status: 503 },
      ),
    };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { user, response: null };
}
