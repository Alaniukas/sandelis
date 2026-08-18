/** Vidinis el. paštas Supabase Auth — vartotojas jo nemato. */

export type WmsRole = "editor" | "viewer";

export function getAuthEmail(): string | null {
  return process.env.WMS_AUTH_EMAIL?.trim() || null;
}

export function getAuthUsername(): string | null {
  return process.env.WMS_AUTH_USERNAME?.trim() || null;
}

export function getViewEmail(): string | null {
  return process.env.WMS_VIEW_EMAIL?.trim() || null;
}

export function getViewUsername(): string | null {
  return process.env.WMS_VIEW_USERNAME?.trim() || null;
}

export function usernameMatches(input: string): boolean {
  return resolveAuthAccount(input) != null;
}

export function resolveAuthAccount(
  username: string,
): { email: string; role: WmsRole } | null {
  const u = username.trim();
  if (!u) return null;
  const editorUser = getAuthUsername();
  const editorEmail = getAuthEmail();
  if (editorUser && editorEmail && u === editorUser) {
    return { email: editorEmail, role: "editor" };
  }
  const viewUser = getViewUsername();
  const viewEmail = getViewEmail();
  if (viewUser && viewEmail && u === viewUser) {
    return { email: viewEmail, role: "viewer" };
  }
  return null;
}

type AuthUserLike = {
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
};

export function roleFromUser(user: AuthUserLike | null | undefined): WmsRole {
  if (!user) return "editor";
  const meta = user.app_metadata?.wms_role;
  if (meta === "viewer") return "viewer";
  if (meta === "editor") return "editor";
  const viewEmail = getViewEmail()?.toLowerCase();
  if (viewEmail && user.email?.toLowerCase() === viewEmail) return "viewer";
  return "editor";
}
