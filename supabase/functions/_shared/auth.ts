import { getPublishableKey, getSecretKey } from "./env.ts";
import { corsHeaders } from "./cors.ts";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "database-types";

// ---------------------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------------------
// Service role client so RLS never interferes with the ban lookup
async function checkBanStatus(userId: string): Promise<Response | undefined> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = getSecretKey();

  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey);

  const { data: profile, error } = await adminClient
    .from("profiles")
    .select("banned, ban_end")
    .eq("id", userId)
    .single();

  if (error) {
    // Fail open so a lookup error doesn't lock out legitimate users
    console.warn("Unable to fetch ban status for user:", userId, error);
    return undefined;
  }

  const isActiveBan = profile?.banned === true &&
    (profile.ban_end == null || new Date(profile.ban_end) > new Date());

  if (isActiveBan) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Forbidden: Your account has been banned",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        statusText: "Forbidden - Account banned",
        status: 403,
      },
    );
  }

  return undefined;
}

// Requires aal2 only when the user has MFA enrolled
export async function checkAssuranceLevel(
  supabaseClient: ReturnType<typeof createClient<Database>>,
): Promise<Response | undefined> {
  const { data, error } = await supabaseClient.auth.mfa
    .getAuthenticatorAssuranceLevel();

  if (error) {
    // Fail open when the level can't be determined
    console.warn("Unable to determine MFA assurance level:", error);
    return undefined;
  }

  const needsAal2 = data?.nextLevel === "aal2" && data?.currentLevel !== "aal2";

  if (needsAal2) {
    return new Response(
      JSON.stringify({
        success: false,
        message:
          "Forbidden: Multi-factor authentication is required for this action",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        statusText: "Forbidden - MFA required",
        status: 403,
      },
    );
  }

  return undefined;
}

// Structural so any Supabase client fits. jsr and npm resolutions of
// supabase-js otherwise produce mismatched nominal SupabaseClient types.
interface ClaimsVerifier {
  auth: {
    getClaims(
      jwt?: string,
    ): Promise<
      { data: { claims: { sub?: string } } | null; error: unknown }
    >;
  };
}

// Local JWKS signature and expiry check via getClaims. Unlike getUser it doesn't
// need the session row, so a valid unexpired token is accepted even after its
// session is revoked.
export async function getAuthenticatedUserId(
  supabaseClient: ClaimsVerifier,
  authHeader: string,
): Promise<{ userId: string } | { response: Response }> {
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  const { data, error } = await supabaseClient.auth.getClaims(token);
  const userId = data?.claims?.sub;

  if (error || !userId) {
    return {
      response: new Response(
        JSON.stringify({
          success: false,
          message: "Unauthorized: Invalid token or user not found",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          statusText: "Unauthorized - Invalid token or user not found",
          status: 401,
        },
      ),
    };
  }

  return { userId };
}

/**
 * Constant-time string equality for shared-secret comparison, so response
 * timing doesn't leak how many leading characters of a guess matched.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  if (aBytes.length !== bBytes.length) return false;

  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

export function authorizeSystemCron(req: Request): Response | undefined {
  const systemCronSecret = Deno.env.get("SYSTEM_CRON_SECRET");

  if (!systemCronSecret) {
    return new Response(
      JSON.stringify({
        success: false,
        message:
          "Unauthorized: SYSTEM_CRON_SECRET environment variable is not set",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        statusText: "Unauthorized - SYSTEM_CRON_SECRET not set",
        status: 401,
      },
    );
  }

  const authHeader = req.headers.get("System-Cron-Secret");
  if (!authHeader) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Unauthorized: Missing or invalid System-Cron-Secret header",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        statusText:
          "Unauthorized - Missing or invalid System-Cron-Secret header",
        status: 401,
      },
    );
  }

  if (!timingSafeEqualString(authHeader, systemCronSecret)) {
    return new Response(
      JSON.stringify({ success: false, message: "Unauthorized" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        statusText: "Unauthorized - Invalid System-Cron-Secret",
        status: 401,
      },
    );
  }
}

export async function authorizeAuthenticated(
  req: Request,
): Promise<Response | undefined> {
  console.log("Authorizing authenticated user...");
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Unauthorized: Missing or invalid Authorization header",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        statusText: "Unauthorized - Missing or invalid Authorization header",
        status: 401,
      },
    );
  }

  try {
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
    const userId = auth.userId;

    const banResponse = await checkBanStatus(userId);
    if (banResponse) return banResponse;

    return undefined;
  } catch (error) {
    console.error("Authentication error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: "Authentication error",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        statusText: "Internal Server Error",
        status: 500,
      },
    );
  }
}

export async function authorizeAuthenticatedHasPermission(
  req: Request,
  requiredPermissions: Array<Database["public"]["Enums"]["app_permission"]>,
): Promise<Response | undefined> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Unauthorized: Missing or invalid Authorization header",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        statusText: "Unauthorized - Missing or invalid Authorization header",
        status: 401,
      },
    );
  }

  try {
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
    const userId = auth.userId;

    const banResponse = await checkBanStatus(userId);
    if (banResponse) return banResponse;

    const { data: userRole, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (roleError) {
      console.error("Error fetching user role:", roleError);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Error fetching user role",
          error: roleError.message,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          statusText: "Internal Server Error",
          status: 500,
        },
      );
    }

    if (!userRole) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Forbidden: User has no assigned role",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          statusText: "Forbidden - User has no assigned role",
          status: 403,
        },
      );
    }

    const { data: permissions, error: permissionsError } = await supabaseClient
      .from("role_permissions")
      .select("permission")
      .eq("role", userRole.role)
      .in("permission", requiredPermissions);

    if (permissionsError) {
      console.error("Error fetching permissions:", permissionsError);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Error checking permissions",
          error: permissionsError.message,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          statusText: "Internal Server Error",
          status: 500,
        },
      );
    }

    if (!permissions || permissions.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Forbidden: Insufficient permissions",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          statusText: "Forbidden - Insufficient permissions",
          status: 403,
        },
      );
    }

    return undefined;
  } catch (error) {
    console.error("Authorization error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: "Authorization error",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        statusText: "Internal Server Error",
        status: 500,
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Admin-level guard: permission check + ban check + aal2 assurance
// ------------------------------------------------------------------------
// Use for any admin action that should require completed 2FA
export async function authorizeAuthenticatedHasPermissionAal2(
  req: Request,
  requiredPermissions: Array<Database["public"]["Enums"]["app_permission"]>,
): Promise<Response | undefined> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Unauthorized: Missing or invalid Authorization header",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        statusText: "Unauthorized - Missing or invalid Authorization header",
        status: 401,
      },
    );
  }

  try {
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
    const userId = auth.userId;

    const banResponse = await checkBanStatus(userId);
    if (banResponse) return banResponse;

    const aalResponse = await checkAssuranceLevel(supabaseClient);
    if (aalResponse) return aalResponse;

    const { data: userRole, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (roleError) {
      console.error("Error fetching user role:", roleError);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Error fetching user role",
          error: roleError.message,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          statusText: "Internal Server Error",
          status: 500,
        },
      );
    }

    if (!userRole) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Forbidden: User has no assigned role",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          statusText: "Forbidden - User has no assigned role",
          status: 403,
        },
      );
    }

    const { data: permissions, error: permissionsError } = await supabaseClient
      .from("role_permissions")
      .select("permission")
      .eq("role", userRole.role)
      .in("permission", requiredPermissions);

    if (permissionsError) {
      console.error("Error fetching permissions:", permissionsError);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Error checking permissions",
          error: permissionsError.message,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          statusText: "Internal Server Error",
          status: 500,
        },
      );
    }

    if (!permissions || permissions.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Forbidden: Insufficient permissions",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          statusText: "Forbidden - Insufficient permissions",
          status: 403,
        },
      );
    }

    return undefined;
  } catch (error) {
    console.error("Authorization error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: "Authorization error",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        statusText: "Internal Server Error",
        status: 500,
      },
    );
  }
}

export function authorizeSystemTrigger(req: Request): Response | undefined {
  const systemTriggerSecret = Deno.env.get("SYSTEM_TRIGGER_SECRET");

  if (!systemTriggerSecret) {
    return new Response(
      JSON.stringify({
        success: false,
        message:
          "Unauthorized: SYSTEM_TRIGGER_SECRET environment variable is not set",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        statusText: "Unauthorized - SYSTEM_TRIGGER_SECRET not set",
        status: 401,
      },
    );
  }

  const triggerHeader = req.headers.get("System-Trigger-Secret");
  if (!triggerHeader) {
    return new Response(
      JSON.stringify({
        success: false,
        message:
          "Unauthorized: Missing or invalid System-Trigger-Secret header",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        statusText:
          "Unauthorized - Missing or invalid System-Trigger-Secret header",
        status: 401,
      },
    );
  }

  if (!timingSafeEqualString(triggerHeader, systemTriggerSecret)) {
    return new Response(
      JSON.stringify({ success: false, message: "Unauthorized" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        statusText: "Unauthorized - Invalid System-Trigger-Secret",
        status: 401,
      },
    );
  }
}
