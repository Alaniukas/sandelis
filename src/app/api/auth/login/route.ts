import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { getAuthEmail, usernameMatches } from "@/lib/supabase/username-auth";

export async function POST(request: Request) {
  const env = getSupabaseEnv();
  const authEmail = getAuthEmail();

  if (!env || !authEmail) {
    return NextResponse.json(
      { error: "Auth not configured" },
      { status: 503 },
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";

  if (!username || !password || !usernameMatches(username)) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 },
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({
    email: authEmail,
    password,
  });

  if (error) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 },
    );
  }

  return NextResponse.json({ ok: true });
}
