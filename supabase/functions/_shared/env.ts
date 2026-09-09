/**
 * Resolves an API key from the new-style plural env var (a JSON object keyed
 * by key name, e.g. SUPABASE_SECRET_KEYS='{"default":"sb_secret_..."}'),
 * falling back through the given legacy var names.
 */
function readNamedKey(
  pluralVar: string,
  fallbackVars: string[],
): string | undefined {
  const plural = Deno.env.get(pluralVar);
  if (plural) {
    try {
      const parsed = JSON.parse(plural);
      if (typeof parsed?.default === "string") return parsed.default;
    } catch {
      // Not JSON - fall through to the legacy vars
    }
  }

  for (const name of fallbackVars) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
}

/**
 * Publishable (client-privilege) API key for user-context clients. Prefers
 * SUPABASE_PUBLISHABLE_KEYS; falls back to SUPABASE_ANON_KEY, which the
 * platform populates with the publishable key now that legacy keys are
 * disabled, and which local dev still injects as a JWT.
 */
export function getPublishableKey(): string {
  return readNamedKey("SUPABASE_PUBLISHABLE_KEYS", [
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
  ]) ?? "";
}

/**
 * Secret (service-privilege) API key for admin clients. Prefers
 * SUPABASE_SECRET_KEYS; falls back to SUPABASE_SERVICE_ROLE_KEY, same
 * platform behavior as above.
 */
export function getSecretKey(): string {
  return readNamedKey("SUPABASE_SECRET_KEYS", [
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) ?? "";
}

export function parseEnvMap(input?: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!input) return map;

  for (const entry of input.split(",")) {
    const [rawKey, rawValue] = entry.split(":");
    const key = rawKey?.trim();
    const value = rawValue?.trim();
    if (!key || !value) continue;
    map.set(key, value);
  }

  return map;
}
