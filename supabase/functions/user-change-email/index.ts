import * as constants from "app-constants" with { type: "json" };
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";

interface ChangeEmailRequest {
  newEmail?: string;
  origin?: string;
}

function isValidEmail(value: string): boolean {
  const [local, domain, ...rest] = value.split("@");
  if (!local || !domain || rest.length > 0)
    return false;
  if (domain.startsWith(".") || domain.endsWith("."))
    return false;
  return domain.includes(".");
}

function sanitizeOrigin(origin?: string): string | null {
  if (!origin)
    return null;
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}`;
  }
  catch (_error) {
    return null;
  }
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
      console.error("Missing Supabase credentials for user-change-email function");
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

    let body: ChangeEmailRequest | null = null;
    try {
      body = await req.json();
    }
    catch (_error) {
      body = null;
    }

    const normalizedNewEmail = body?.newEmail?.trim().toLowerCase() ?? "";

    if (!normalizedNewEmail) {
      return new Response(
        JSON.stringify({ error: "New email is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (!isValidEmail(normalizedNewEmail)) {
      return new Response(
        JSON.stringify({ error: "Please provide a valid email address" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (normalizedNewEmail === user.email.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: "Please use a different email address" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const redirectOrigin = sanitizeOrigin(body?.origin)
      ?? Deno.env.get("APP_BASE_URL")
      ?? "https://hivecom.net";
    const redirectUrl = `${redirectOrigin.replace(/\/$/, "")}/auth/confirm`;

    const serviceClient = createClient(supabaseUrl, serviceKey);

    const { error: currentEmailError } = await serviceClient.auth.admin.generateLink({
      type: "email_change_current",
      email: user.email,
      newEmail: normalizedNewEmail,
      options: { redirectTo: redirectUrl },
    });

    if (currentEmailError)
      throw currentEmailError;

    const { error: newEmailError } = await serviceClient.auth.admin.generateLink({
      type: "email_change_new",
      email: user.email,
      newEmail: normalizedNewEmail,
      options: { redirectTo: redirectUrl },
    });

    if (newEmailError)
      throw newEmailError;

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
  catch (error) {
    console.error("Error in user-change-email function:", error);
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
