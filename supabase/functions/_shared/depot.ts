// ---------------------------------------------------------------------------
// Orbit Depot admin helper
// ---------------------------------------------------------------------------
// Server-side access to the Depot gateway's admin API, authenticated with the
// master service key (Depot's [depot.service_key]). Reads DEPOT_URL and
// DEPOT_SERVICE_KEY from the environment. Because the service key grants full
// admin rights, this must only ever run inside edge functions, never shipped to
// the client. Skips cleanly when unconfigured so an environment without Depot
// wired up still works.

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
  // Trim a trailing slash so path joins stay clean.
  return { baseUrl: baseUrl.replace(/\/+$/, ""), serviceKey };
}

/**
 * Wipes every Orbit Depot upload owned by the given user via the gateway's admin
 * wipe endpoint, using the service key. The account is the user's Supabase id
 * (Depot keys uploads on the OIDC subject), so this works whether or not the
 * Supabase user still exists.
 *
 * Returns the number of uploads removed, or null when Depot is not configured,
 * so a caller can proceed without treating an unwired environment as a failure.
 * A configured Depot that errors throws, so the caller can abort and surface it.
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
