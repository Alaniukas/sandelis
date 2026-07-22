import type { CookieOptions } from "@supabase/ssr";

/** HTTP dev (LAN IP) — be Secure; production HTTPS — su Secure. */
export function patchSupabaseCookieOptions(
  options: CookieOptions,
): CookieOptions {
  const secure =
    process.env.NODE_ENV === "production"
      ? options.secure !== false
      : false;
  return {
    ...options,
    path: options.path ?? "/",
    sameSite: options.sameSite ?? "lax",
    secure,
    httpOnly: options.httpOnly ?? true,
  };
}
