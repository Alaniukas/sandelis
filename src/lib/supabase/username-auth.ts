/** Vidinis el. paštas Supabase Auth — vartotojas jo nemato. */
export function getAuthEmail(): string | null {
  return process.env.WMS_AUTH_EMAIL?.trim() || null;
}

export function getAuthUsername(): string | null {
  return process.env.WMS_AUTH_USERNAME?.trim() || null;
}

export function usernameMatches(input: string): boolean {
  const expected = getAuthUsername();
  if (!expected) return false;
  return input.trim() === expected;
}
