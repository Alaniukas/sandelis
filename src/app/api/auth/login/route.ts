import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { patchSupabaseCookieOptions } from "@/lib/supabase/cookie-options";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { resolveAuthAccount } from "@/lib/supabase/username-auth";

export async function POST(request: Request) {
  const env = getSupabaseEnv();
  if (!env) {
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
  const account = resolveAuthAccount(username);

  if (!username || !password || !account) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 },
    );
  }

  const cookieStore = await cookies();
  let response = NextResponse.json({ ok: true, role: account.role });

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, patchSupabaseCookieOptions(options));
        }
        response = NextResponse.json({ ok: true, role: account.role });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(
            name,
            value,
            patchSupabaseCookieOptions(options),
          );
        }
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({
    email: account.email,
    password,
  });

  if (error) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 },
    );
  }

  await supabase.auth.getSession();

  return response;
}
