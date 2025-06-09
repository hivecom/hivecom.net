import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeAuthenticatedHasPermission } from "../_shared/auth.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";
import { Database } from "database-types";

interface BanUserRequest {
  userId: string;
  banDuration: string; // Format: '300ms', '2h45m', '100y' for permanent, or 'none' to unban
}

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
    const { userId, banDuration } = body;

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

    // Create a Supabase client with service role key for admin operations
    const supabaseClient = createClient<Database>(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
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

    console.log(`Attempting to ban user: ${userProfile.username} (${userId}) for duration: ${banDuration}`);

    // Ban the user using Supabase Auth Admin API
    const { error: banError } = await supabaseClient.auth.admin.updateUserById(
      userId,
      { ban_duration: banDuration }
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
