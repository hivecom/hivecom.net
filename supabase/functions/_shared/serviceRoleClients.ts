import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database-types";

function requireServiceCredentials(): { url: string; key: string } {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_KEY");

  if (!url || !key) {
    throw new Error("Missing Supabase service role configuration");
  }

  return { url, key };
}

export type PublicServiceClient = SupabaseClient<Database, "public">;
export type PrivateServiceClient = SupabaseClient<Database, "private">;

export function createPublicServiceRoleClient(): PublicServiceClient {
  const { url, key } = requireServiceCredentials();
  return createClient<Database, "public">(url, key, {
    db: { schema: "public" },
  });
}

export function createPrivateServiceRoleClient(): PrivateServiceClient {
  const { url, key } = requireServiceCredentials();
  return createClient<Database, "private">(url, key, {
    db: { schema: "private" },
  });
}
