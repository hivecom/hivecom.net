import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeAuthenticatedHasPermission } from "../_shared/auth.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";
import { Database } from "database-types";

interface BanUserRequest {
  userId: string;
  banDuration: string; // Format: '300ms', '2h45m', '100y' for permanent, or 'none' to unban
  banReason?: string; // Optional reason for the ban
}

type AuthSchema = {
  auth: {
    Tables: {
      sessions: {
        Row: {
          id: string;
          user_id: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

Deno.serve(async (req: Request) => {
  // This is needed if you're planning to invoke your function from a browser. Which we are.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return responseMethodNotAllowed(req.method);
  }

  try {
    // Parse request body to get user ID and ban duration
    const body: BanUserRequest = await req.json();
    const { userId, banDuration, banReason } = body;

    // Normalize ban duration for Supabase Auth (it expects values like 1h, 7d, 100y, or none)
    let normalizedBanDuration = banDuration;
    if (banDuration === 'permanent') {
      normalizedBanDuration = '100y';
    }

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
          error: "Ban duration is required and must be a string (e.g., '1h', '30m', '100y' for permanent, or 'none' to unban)",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    // Verify user has permission to ban users
    const authResponse = await authorizeAuthenticatedHasPermission(
      req,
      ["users.update"],
    );

    if (authResponse) {
      return authResponse;
    }

    // Get current user to prevent self-banning
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
    const supabaseAnonKey =
      Deno.env.get("SUPABASE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceRoleKey =
      Deno.env.get("SUPABASE_SECRET_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      "";

    const tempClient = createClient<Database>(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    );

    const { data: { user: currentUser }, error: userError } = await tempClient.auth.getUser();

    if (userError || !currentUser) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to get current user",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        },
      );
    }

    // Prevent users from banning themselves
    if (currentUser.id === userId) {
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

    // Create a Supabase client with service role key for admin operations
    const supabaseClient = createClient<Database>(
      supabaseUrl,
      supabaseServiceRoleKey,
    );

    // First, check if the user exists by looking up their profile
    const { data: userProfile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("id, username")
      .eq("id", userId)
      .single();

    if (profileError) {
      if (profileError.code === "PGRST116") {
        // User not found
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

    console.log(`Attempting to ban user: ${userProfile.username} (${userId}) for duration: ${banDuration}${banReason ? ` with reason: ${banReason}` : ''}`);

    // Determine ban start and end times
    let banStart: string | null = null;
    let banEnd: string | null = null;

    if (banDuration !== 'none') {
      banStart = new Date().toISOString();

      if (banDuration !== 'permanent') {
        // Parse duration and calculate end time
        // This is a simplified parser - you might want to use a more robust one
        const durationMatch = banDuration.match(/^(\d+)([hmdy])$/);
        if (durationMatch) {
          const amount = parseInt(durationMatch[1]);
          const unit = durationMatch[2];
          const now = new Date();

          switch (unit) {
            case 'h':
              now.setHours(now.getHours() + amount);
              break;
            case 'd':
              now.setDate(now.getDate() + amount);
              break;
            case 'm':
              now.setMinutes(now.getMinutes() + amount);
              break;
            case 'y':
              now.setFullYear(now.getFullYear() + amount);
              break;
          }

          banEnd = now.toISOString();
        }
      }
    }

    const banMetadata = {
      ban_reason: banDuration === 'none' ? null : (banReason || null),
      ban_start: banDuration === 'none' ? null : banStart,
      ban_end: banDuration === 'none' ? null : banEnd,
    };

    // Ban the user using Supabase Auth Admin API
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

    if (banDuration !== 'none') {
      const authSchemaClient = createClient<AuthSchema>(
        supabaseUrl,
        supabaseServiceRoleKey,
        { db: { schema: "auth" } },
      );

      // Removing auth.sessions rows forces refresh tokens to become invalid immediately.
      const { error: sessionDeleteError } = await authSchemaClient
        .from("sessions")
        .delete()
        .eq("user_id", userId);

      if (sessionDeleteError) {
        console.error(
          "Error destroying active sessions for banned user:",
          sessionDeleteError,
        );
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to destroy active sessions for banned user",
            details: sessionDeleteError.message,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          },
        );
      }
    }

    const action = banDuration === 'none' ? 'unbanned' : 'banned';
    console.log(`Successfully ${action} user: ${userProfile.username} (${userId})`);

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        message: banDuration === 'none'
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
