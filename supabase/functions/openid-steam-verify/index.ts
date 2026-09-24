import { getPublishableKey } from "../_shared/env.ts";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { getAuthenticatedUserId } from "../_shared/auth.ts";
import type { Database } from "database-types";

/**
 * POST { openIdParams, mode }. openIdParams holds every openid.* param from the
 * Steam callback.
 */
Deno.serve(async (req) => {
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

    if (openIdParams["openid.mode"] === "cancel") {
      return new Response(
        JSON.stringify({ success: false, error: "cancelled" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

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

      const supabaseClient = createClient<Database>(
        Deno.env.get("SUPABASE_URL") ?? "",
        getPublishableKey(),
        {
          global: {
            headers: { Authorization: authHeader },
          },
        },
      );

      const auth = await getAuthenticatedUserId(supabaseClient, authHeader);
      if ("response" in auth) return auth.response;
      const user = { id: auth.userId };

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

    // Login mode only returns the verified Steam ID. The frontend works out which
    // account it belongs to.
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

// Posts the params back to Steam with check_authentication to confirm the signature
async function verifySteamOpenId(
  params: Record<string, string>,
): Promise<boolean> {
  const verifyParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith("openid.") && typeof value === "string") {
      verifyParams.set(key, value);
    }
  }

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
