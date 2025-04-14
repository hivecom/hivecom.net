import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { Database } from "../../../types/database.types.ts";
import { corsHeaders } from "../_shared/cors.ts";

export async function authorizeSystemCron(
  req: Request,
  client: SupabaseClient<Database>,
): Promise<Response | undefined> {
  // Security check - verify the request is from our internal system
  // Get the system secret token directly from the vault
  const { data: vaultData, error: vaultError } = await client.schema("vault")
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("name", "system_cron_secret")
    .single();

  if (vaultError || !vaultData) {
    throw new Error(
      "Failed to retrieve system_cron_secret from vault: " +
        (vaultError?.message || "No data returned"),
    );
  }

  const systemCronSecret = vaultData.decrypted_secret;

  // Extract token from Authorization header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Unauthorized: Missing or invalid Authorization header",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      },
    );
  }

  // Get the token part from the Bearer token
  const token = authHeader.slice(7); // Remove 'Bearer ' prefix

  // Check if the provided token matches our system token from the vault
  if (token !== systemCronSecret) {
    return new Response(
      JSON.stringify({ success: false, message: "Unauthorized" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      },
    );
  }
}
