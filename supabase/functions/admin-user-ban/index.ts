import { getPublishableKey, getSecretKey } from "../_shared/env.ts";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import {
  authorizeAuthenticatedHasPermissionAal2,
  getAuthenticatedUserId,
} from "../_shared/auth.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";
import type { Database } from "database-types";

interface BanUserRequest {
  userId: string;
  banDuration: string; // e.g. '1h', '2h45m', '7d', 'permanent', or 'none' to unban
  banReason?: string;
}

const BAN_UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  y: 365 * 24 * 60 * 60 * 1000,
};

// Parses compound durations like "2h45m" or "7d". Undefined when malformed.
function parseBanDurationMs(value: string): number | undefined {
  if (!/^(\d+(ms|s|m|h|d|y))+$/.test(value)) return undefined;

  let total = 0;
  for (const [, amount, unit] of value.matchAll(/(\d+)(ms|s|m|h|d|y)/g)) {
    total += Number(amount) * BAN_UNIT_MS[unit];
  }

  return total > 0 ? total : undefined;
}

type DatabaseWithSessionRpc = Database & {
  public: Database["public"] & {
    Functions: Database["public"]["Functions"] & {
      admin_delete_user_sessions: {
        Args: { target_user: string };
        Returns: void;
      };
    };
  };
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return responseMethodNotAllowed(req.method);
  }

  try {
    const body: BanUserRequest = await req.json();
    const { userId, banDuration, banReason } = body;

    if (!userId || typeof userId !== "string") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "User ID is required and must be a string",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    if (!banDuration || typeof banDuration !== "string") {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Ban duration is required and must be a string (e.g., '1h', '30m', '7d', 'permanent', or 'none' to unban)",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    const banMs = banDuration === "none" || banDuration === "permanent"
      ? null
      : parseBanDurationMs(banDuration);

    if (banMs === undefined) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Invalid ban duration. Use units ms, s, m, h, d or y (e.g., '2h45m', '7d')",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    // Supabase Auth only takes Go duration units (up to h), so days and years
    // are sent as seconds. Permanent is 100 years.
    const normalizedBanDuration = banDuration === "none"
      ? "none"
      : banDuration === "permanent"
      ? "876000h"
      : `${Math.ceil(banMs! / 1000)}s`;

    const authResponse = await authorizeAuthenticatedHasPermissionAal2(
      req,
      ["users.update"],
    );

    if (authResponse) {
      return authResponse;
    }

    // Resolve the caller so they can't ban themselves
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Authorization header missing",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = getPublishableKey();
    const supabaseServiceRoleKey = getSecretKey();

    const tempClient = createClient<Database>(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    );

    const currentUser = await getAuthenticatedUserId(tempClient, authHeader);
    if ("response" in currentUser) {
      return currentUser.response;
    }

    if (currentUser.userId === userId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "You cannot ban yourself",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    // Service role client for the auth admin calls
    const supabaseClient = createClient<DatabaseWithSessionRpc>(
      supabaseUrl,
      supabaseServiceRoleKey,
    );

    const { data: userProfile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("id, username")
      .eq("id", userId)
      .single();

    if (profileError) {
      if (profileError.code === "PGRST116") {
        return new Response(
          JSON.stringify({
            success: false,
            error: "User not found",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          },
        );
      }

      console.error("Error fetching user profile:", profileError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to verify user existence",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }

    console.log(
      `Attempting to ban user: ${userProfile.username} (${userId}) for duration: ${banDuration}${
        banReason ? ` with reason: ${banReason}` : ""
      }`,
    );

    let banStart: string | null = null;
    let banEnd: string | null = null;

    if (banDuration !== "none") {
      banStart = new Date().toISOString();

      if (banMs != null) {
        banEnd = new Date(Date.now() + banMs).toISOString();
      }
    }

    const banMetadata = {
      ban_reason: banDuration === "none" ? null : (banReason || null),
      ban_start: banDuration === "none" ? null : banStart,
      ban_end: banDuration === "none" ? null : banEnd,
    };

    const { error: banError } = await supabaseClient.auth.admin.updateUserById(
      userId,
      {
        ban_duration: normalizedBanDuration,
        user_metadata: banMetadata,
      },
    );

    if (banError) {
      console.error("Error banning user:", banError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to ban user",
          details: banError.message,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }

    if (banDuration !== "none") {
      // Security-definer RPC that purges sessions and refresh tokens, so the ban
      // signs the user out immediately
      const { error: sessionPurgeError } = await supabaseClient.rpc(
        "admin_delete_user_sessions",
        { target_user: userId },
      );

      if (sessionPurgeError) {
        console.error(
          "Error destroying active sessions for banned user:",
          sessionPurgeError,
        );
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to destroy active sessions for banned user",
            details: sessionPurgeError.message,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          },
        );
      }
    }

    const action = banDuration === "none" ? "unbanned" : "banned";
    console.log(
      `Successfully ${action} user: ${userProfile.username} (${userId})`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: banDuration === "none"
          ? `User ${userProfile.username} has been successfully unbanned`
          : `User ${userProfile.username} has been successfully banned for ${banDuration}`,
        userId: userId,
        banDuration: banDuration,
        actionedUser: {
          id: userProfile.id,
          username: userProfile.username,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    const error = err as Error;
    console.error("Error in admin-user-ban:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error:
          "Internal server error - please email contact@hivecom.net or visit #staff on irc.hivecom.net for support",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
