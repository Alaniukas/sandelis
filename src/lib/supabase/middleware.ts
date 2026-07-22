import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

const PUBLIC_PATHS = ["/login", "/auth/callback"];
const PUBLIC_API_PATHS = ["/api/auth/login"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function isPublicApi(pathname: string) {
  return PUBLIC_API_PATHS.some((p) => pathname === p);
}

export async function updateSession(request: NextRequest) {
  const env = getSupabaseEnv();
  let response = NextResponse.next({ request });

  if (!env) {
    if (process.env.NODE_ENV === "development") {
      return response;
    }
    if (!isPublicPath(request.nextUrl.pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "config");
      return NextResponse.redirect(url);
    }
    return response;
  }

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!user && pathname.startsWith("/api/") && !isPublicApi(pathname)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return response;
}
