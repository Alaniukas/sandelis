import { NextResponse } from "next/server";
import { createClient } from "./server";
import { roleFromUser, type WmsRole } from "./username-auth";
import type { User } from "@supabase/supabase-js";

export async function requireApiUser(opts?: { write?: boolean }) {
  const supabase = await createClient();
  if (!supabase) {
    return {
      user: null as User | null,
      role: "editor" as WmsRole,
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
      user: null as User | null,
      role: "editor" as WmsRole,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const role = roleFromUser(user);
  if (opts?.write && role === "viewer") {
    return {
      user,
      role,
      response: NextResponse.json(
        { error: "Peržiūros paskyra — keisti negalima" },
        { status: 403 },
      ),
    };
  }

  return { user, role, response: null };
}
