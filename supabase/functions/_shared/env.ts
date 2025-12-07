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
