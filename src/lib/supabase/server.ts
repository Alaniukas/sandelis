import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { patchSupabaseCookieOptions } from "./cookie-options";
import { getSupabaseEnv } from "./env";

export async function createClient() {
  const env = getSupabaseEnv();
  if (!env) return null;

  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, patchSupabaseCookieOptions(options));
          }
        } catch {
          // Server Component — cookies sometimes read-only
        }
      },
    },
  });
}
