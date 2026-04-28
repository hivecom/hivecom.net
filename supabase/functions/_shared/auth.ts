import { corsHeaders } from "./cors.ts";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "database-types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether the authenticated user currently has an active ban in their
 * profile. Uses the service role client so RLS never interferes with the
 * lookup. Returns a 403 Response when banned, undefined when clear.
 */
async function checkBanStatus(userId: string): Promise<Response | undefined> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    "";

  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey);

  const { data: profile, error } = await adminClient
    .from("profiles")
    .select("banned, ban_end")
    .eq("id", userId)
    .single();

  if (error) {
    // Fail open - don't block legitimate users if the lookup fails
    console.warn("Unable to fetch ban status for user:", userId, error);
    return undefined;
  }

  const isActiveBan =
    profile?.banned === true &&
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

/**
 * Checks whether the caller's session satisfies aal2 when they have MFA
 * enrolled. If the user has no MFA factors this is a no-op. Returns a 403
 * Response when MFA is required but not satisfied, undefined when clear.
 */
async function checkAssuranceLevel(
  supabaseClient: ReturnType<typeof createClient<Database>>,
): Promise<Response | undefined> {
  const { data, error } =
    await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();

  if (error) {
    // Fail open - don't block if we can't determine the level
    console.warn("Unable to determine MFA assurance level:", error);
    return undefined;
  }

  const needsAal2 =
    data?.nextLevel === "aal2" && data?.currentLevel !== "aal2";

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

  // Extract token from Authorization header
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

  // Check if the provided token matches our system token from the vault
  if (authHeader !== systemCronSecret) {
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

/**
 * Authorizes a request by checking if the user is authenticated
 * @param req The request object
 * @returns Response with error if unauthorized, undefined if authorized
 */
export async function authorizeAuthenticated(
  req: Request,
): Promise<Response | undefined> {
  console.log("Authorizing authenticated user...");
  // Get the authorization header
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
    // Create a Supabase client with the Auth context of the logged in user
    const supabaseClient = createClient<Database>(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    );

    // Get user information from the token
    const {
      data: { user },
      error,
    } = await supabaseClient.auth.getUser();

    if (error || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Unauthorized: Invalid token or user not found",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          statusText: "Unauthorized - Invalid token or user not found",
          status: 401,
        },
      );
    }

    // Check active ban before allowing access
    const banResponse = await checkBanStatus(user.id);
    if (banResponse) return banResponse;

    // User is authenticated
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

/**
 * Authorizes a request by checking if the user has any of the specified permissions
 * @param req The request object
 * @param requiredPermissions Array of app_permission values that are required for this endpoint
 * @returns Response with error if unauthorized, undefined if authorized
 */
export async function authorizeAuthenticatedHasPermission(
  req: Request,
  requiredPermissions: Array<Database["public"]["Enums"]["app_permission"]>,
): Promise<Response | undefined> {
  // Get the authorization header
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
    // Create a Supabase client with the Auth context of the logged in user
    const supabaseClient = createClient<Database>(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    );

    // Get user information from the token
    const {
      data: { user },
      error,
    } = await supabaseClient.auth.getUser();

    if (error || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Unauthorized: Invalid token or user not found",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          statusText: "Unauthorized - Invalid token or user not found",
          status: 401,
        },
      );
    }

    // Check active ban before allowing access
    const banResponse = await checkBanStatus(user.id);
    if (banResponse) return banResponse;

    // Get the user_role claim from the token
    const { data: userRole, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
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

    // Query the role_permissions table to check if the user's role has any of the required permissions
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

    // Check if the user's role has any of the required permissions
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

    // User is authorized
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
// ---------------------------------------------------------------------------

/**
 * Like authorizeAuthenticatedHasPermission, but also enforces that the caller
 * has reached assurance level 2 when their account has MFA enrolled. Use this
 * for any admin action that should require completed 2FA.
 */
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
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    );

    const {
      data: { user },
      error,
    } = await supabaseClient.auth.getUser();

    if (error || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Unauthorized: Invalid token or user not found",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          statusText: "Unauthorized - Invalid token or user not found",
          status: 401,
        },
      );
    }

    // Check active ban
    const banResponse = await checkBanStatus(user.id);
    if (banResponse) return banResponse;

    // Enforce aal2 when MFA is enrolled
    const aalResponse = await checkAssuranceLevel(supabaseClient);
    if (aalResponse) return aalResponse;

    // Check role permissions
    const { data: userRole, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
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

  // Extract token from the System-Trigger-Secret header
  const triggerHeader = req.headers.get("System-Trigger-Secret");
  if (!triggerHeader) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Unauthorized: Missing or invalid System-Trigger-Secret header",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        statusText:
          "Unauthorized - Missing or invalid System-Trigger-Secret header",
        status: 401,
      },
    );
  }

  // Check if the provided token matches our system token from the vault
  if (triggerHeader !== systemTriggerSecret) {
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
