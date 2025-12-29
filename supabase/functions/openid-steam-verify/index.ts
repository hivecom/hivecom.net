import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import type { Database } from "database-types";

/**
 * Steam OpenID verification endpoint
 * Verifies the Steam OpenID response and links/validates the Steam account
 *
 * POST body:
 * - openIdParams: Object containing all openid.* query params from Steam callback
 * - mode: 'login' | 'link'
 */
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { openIdParams, mode } = await req.json();

    if (!openIdParams) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing OpenID parameters" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // Check if user cancelled
    if (openIdParams["openid.mode"] === "cancel") {
      return new Response(
        JSON.stringify({ success: false, error: "cancelled" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // Verify the OpenID response with Steam
    const isValid = await verifySteamOpenId(openIdParams);
    if (!isValid) {
      return new Response(
        JSON.stringify({ success: false, error: "verification_failed" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // Extract Steam ID from the claimed_id
    const claimedId = openIdParams["openid.claimed_id"] as string;
    const steamIdMatch = claimedId?.match(/\/id\/(\d+)$/);
    if (!steamIdMatch) {
      return new Response(
        JSON.stringify({ success: false, error: "invalid_steam_id" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    const steamId = steamIdMatch[1];

    // For link mode, we need the user's auth token to update their profile
    if (mode === "link") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ success: false, error: "not_authenticated" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      const token = authHeader.replace("Bearer ", "");

      const supabaseClient = createClient<Database>(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        {
          global: {
            headers: { Authorization: authHeader },
          },
        },
      );

      const { data: { user }, error: userError } = await supabaseClient.auth
        .getUser(token);

      if (userError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: "not_authenticated" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      // Update profile with Steam ID
      const { error: updateError } = await supabaseClient
        .from("profiles")
        .update({ steam_id: steamId })
        .eq("id", user.id);

      if (updateError) {
        if (updateError.code === "23505") {
          return new Response(
            JSON.stringify({ success: false, error: "already_linked" }),
            {
              status: 200,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            },
          );
        }
        throw updateError;
      }

      return new Response(
        JSON.stringify({ success: true, steamId }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // For login mode, just return the verified Steam ID
    // The frontend will check if this Steam ID is linked to an account
    return new Response(
      JSON.stringify({ success: true, steamId, mode: "login" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error) {
    console.error("Steam OAuth verify error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
});

/**
 * Verify Steam OpenID response by sending it back to Steam
 */
async function verifySteamOpenId(
  params: Record<string, string>,
): Promise<boolean> {
  const verifyParams = new URLSearchParams();

  // Copy all openid params
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith("openid.") && typeof value === "string") {
      verifyParams.set(key, value);
    }
  }

  // Change mode to check_authentication
  verifyParams.set("openid.mode", "check_authentication");

  try {
    const response = await fetch("https://steamcommunity.com/openid/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: verifyParams.toString(),
    });

    const text = await response.text();
    return text.includes("is_valid:true");
  } catch (error) {
    console.error("Steam OpenID verification error:", error);
    return false;
  }
}
