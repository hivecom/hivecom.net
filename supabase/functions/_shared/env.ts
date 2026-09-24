// The plural var is a JSON object keyed by name, e.g.
// SUPABASE_SECRET_KEYS='{"default":"sb_secret_..."}'
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
      // Not JSON, fall through to the legacy vars
    }
  }

  for (const name of fallbackVars) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
}

// Client privilege. With legacy keys disabled the platform puts the publishable
// key in SUPABASE_ANON_KEY, while local dev still injects a JWT there.
export function getPublishableKey(): string {
  return readNamedKey("SUPABASE_PUBLISHABLE_KEYS", [
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
  ]) ?? "";
}

// Service privilege, for admin clients only
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
