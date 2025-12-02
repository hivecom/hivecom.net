import * as constants from "app-constants" with { type: "json" };
import { createClient, type UserIdentity } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import type { Database } from "database-types";

function extractDiscordId(identity?: UserIdentity | null): string | null {
  if (!identity)
    return null;

  const identityData = identity.identity_data as Record<string, unknown> | null;
  const getField = (key: string) => {
    const value = identityData?.[key];
    return typeof value === "string" ? value : undefined;
  };

  return getField("id")
    || getField("user_id")
    || getField("sub")
    || getField("provider_id")
    || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "No authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    );

    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError)
      throw userError;

    const user = userData.user;
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: "User not found" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const discordIdentity = user.identities?.find((identity: UserIdentity) => identity.provider === "discord") ?? null;

    if (!discordIdentity) {
      return new Response(
        JSON.stringify({ success: false, error: "Discord identity not linked" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const discordId = extractDiscordId(discordIdentity);
    if (!discordId) {
      return new Response(
        JSON.stringify({ success: false, error: "Discord identity missing id" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const serviceClient = createClient<Database>(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { error: updateError } = await serviceClient
      .from("profiles")
      .update({
        discord_id: discordId,
        modified_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("Error updating Discord ID:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to update profile" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, discordId }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
  catch (error) {
    console.error("Error in user-link-discord function:", error);
    return new Response(
      JSON.stringify({ success: false, error: constants.default.API_ERROR }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
});
