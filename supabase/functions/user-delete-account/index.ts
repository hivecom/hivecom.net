import * as constants from "constants" with { type: "json" };
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { checkAssuranceLevel } from "../_shared/auth.ts";
import { wipeDepotUploads } from "../_shared/depot.ts";
import type { Database } from "database-types";

interface DeleteAccountRequest {
  confirmEmail?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SECRET_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error(
        "Missing Supabase credentials for user-delete-account function",
      );
      return new Response(
        JSON.stringify({ error: "Function misconfigured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    const supabaseClient = createClient(
      supabaseUrl,
      anonKey,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: userError } = await supabaseClient.auth
      .getClaims(token);

    if (userError) {
      throw userError;
    }

    const claims = claimsData?.claims;
    const userEmail = typeof claims?.email === "string" ? claims.email : null;
    const user = claims?.sub ? { id: claims.sub, email: userEmail } : null;
    if (!user || !user.email) {
      return new Response(
        JSON.stringify({ error: "Unable to resolve current user" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    const aalResponse = await checkAssuranceLevel(supabaseClient);
    if (aalResponse) return aalResponse;

    let body: DeleteAccountRequest | null = null;
    try {
      body = await req.json();
    } catch (_error) {
      body = null;
    }

    const confirmEmail = body?.confirmEmail?.trim().toLowerCase();

    if (!confirmEmail) {
      return new Response(
        JSON.stringify({ error: "Confirmation email is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    if (confirmEmail !== user.email.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: "Confirmation email does not match" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // Wipe the user's Orbit Depot uploads first, so nothing survives the account
    // deletion. Runs server-side with the gateway service key. A configured
    // Depot that fails aborts the delete (retryable); an unconfigured Depot is
    // skipped (null).
    try {
      const wiped = await wipeDepotUploads(user.id);
      if (wiped !== null) {
        console.log(`Wiped ${wiped} Depot upload(s) for user ${user.id}`);
      }
    } catch (depotError) {
      console.error("Error wiping Depot uploads:", depotError);
      return new Response(
        JSON.stringify({
          error: "Failed to wipe your Depot uploads; account not deleted",
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    const serviceClient = createClient<Database>(supabaseUrl, serviceKey);

    const { error: profileError } = await serviceClient
      .from("profiles")
      .delete()
      .eq("id", user.id);

    if (profileError) {
      console.error("Failed to delete profile for user", user.id, profileError);
    }

    const { error: deleteUserError } = await serviceClient.auth.admin
      .deleteUser(user.id);

    if (deleteUserError) {
      throw deleteUserError;
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error) {
    console.error("Error in user-delete-account function:", error);
    const message = error instanceof Error
      ? error.message
      : constants.default.API_ERROR;
    const status = error && typeof error === "object" && "status" in error &&
        typeof (error as { status?: number }).status === "number"
      ? (error as { status?: number }).status ?? 400
      : 400;
    return new Response(
      JSON.stringify({ error: message ?? constants.default.API_ERROR }),
      {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
});
