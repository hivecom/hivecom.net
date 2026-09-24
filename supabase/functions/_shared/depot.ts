// ---------------------------------------------------------------------------
// Orbit Depot admin helper
// ---------------------------------------------------------------------------
// DEPOT_SERVICE_KEY is Depot's master key with full admin rights. This must only
// run inside edge functions, never ship to the client. Skips when unconfigured.

const PLACEHOLDER = "REPLACE-ME";

function depotConfig(): { baseUrl: string; serviceKey: string } | null {
  const baseUrl = Deno.env.get("DEPOT_URL");
  const serviceKey = Deno.env.get("DEPOT_SERVICE_KEY");
  if (
    !baseUrl || baseUrl === PLACEHOLDER ||
    !serviceKey || serviceKey === PLACEHOLDER
  ) {
    return null;
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), serviceKey };
}

/**
 * Depot keys uploads on the OIDC subject, so this works whether or not the
 * Supabase user still exists. Returns null when Depot isn't configured. A
 * configured Depot that errors throws, so the caller can abort.
 */
export async function wipeDepotUploads(userId: string): Promise<number | null> {
  const cfg = depotConfig();
  if (!cfg) {
    console.warn(
      "wipeDepotUploads: DEPOT_URL/DEPOT_SERVICE_KEY not configured, skipping",
    );
    return null;
  }

  const url = `${cfg.baseUrl}/admin/files?account=${
    encodeURIComponent(userId)
  }`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${cfg.serviceKey}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Depot wipe failed (HTTP ${res.status})${body ? `: ${body}` : ""}`,
    );
  }

  const data = await res.json().catch(() => ({})) as { deleted?: number };
  return data.deleted ?? 0;
}
