import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { patchSupabaseCookieOptions } from "@/lib/supabase/cookie-options";
import { getSupabaseEnv } from "@/lib/supabase/env";

export async function GET(request: Request) {
  const env = getSupabaseEnv();
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!env || !code) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const redirectTo = `${origin}${next}`;
  const cookieStore = await cookies();
  let response = NextResponse.redirect(redirectTo);

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, patchSupabaseCookieOptions(options));
        }
        response = NextResponse.redirect(redirectTo);
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

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  return response;
}
