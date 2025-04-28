import { corsHeaders } from "./cors.ts";
import { createClient } from "@supabase/supabase-js";
import { Database } from "database-types";

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
  req: Request
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

    // Get the user_role claim from the token
    const userRole = user.app_metadata?.user_role as Database["public"]["Enums"]["app_role"] | undefined;

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
      .eq("role", userRole)
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

