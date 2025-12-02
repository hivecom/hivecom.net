import * as constants from "app-constants" with { type: "json" };
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import type { Database } from "database-types";

interface DeleteAccountRequest {
  confirmEmail?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error("Missing Supabase credentials for user-delete-account function");
      return new Response(
        JSON.stringify({ error: "Function misconfigured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
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
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError)
      throw userError;

    const user = userData.user;
    if (!user || !user.email) {
      return new Response(
        JSON.stringify({ error: "Unable to resolve current user" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    let body: DeleteAccountRequest | null = null;
    try {
      body = await req.json();
    }
    catch (_error) {
      body = null;
    }

    const confirmEmail = body?.confirmEmail?.trim().toLowerCase();

    if (!confirmEmail) {
      return new Response(
        JSON.stringify({ error: "Confirmation email is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (confirmEmail !== user.email.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: "Confirmation email does not match" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const serviceClient = createClient<Database>(supabaseUrl, serviceKey);

    const { error: profileError } = await serviceClient
      .from("profiles")
      .delete()
      .eq("id", user.id);

    if (profileError)
      console.error("Failed to delete profile for user", user.id, profileError);

    const { error: deleteUserError } = await serviceClient.auth.admin.deleteUser(user.id);

    if (deleteUserError)
      throw deleteUserError;

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
  catch (error) {
    console.error("Error in user-delete-account function:", error);
    const message = error instanceof Error ? error.message : constants.default.API_ERROR;
    const status = error && typeof error === "object" && "status" in error && typeof (error as { status?: number }).status === "number"
      ? (error as { status?: number }).status ?? 400
      : 400;
    return new Response(
      JSON.stringify({ error: message ?? constants.default.API_ERROR }),
      { status, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
});
