import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeAuthenticatedHasPermission } from "../_shared/auth.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";
import { Database } from "database-types";

interface DeleteUserRequest {
  userId: string;
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
    // Parse request body to get user ID
    const body: DeleteUserRequest = await req.json();
    const { userId } = body;

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

    // Verify user has permission to delete users
    const authResponse = await authorizeAuthenticatedHasPermission(
      req,
      ["users.delete"],
    );

    if (authResponse) {
      return authResponse;
    }

    // Get current user to prevent self-deletion
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

    const tempClient = createClient<Database>(
      Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "",
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

    // Prevent users from deleting themselves
    if (currentUser.id === userId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "You cannot delete yourself",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    // Create a Supabase client with service role key for admin operations
    const supabaseClient = createClient<Database>(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
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

    console.log(`Attempting to delete user: ${userProfile.username} (${userId})`);

    // Delete the user using Supabase Auth Admin API
    // This will delete from auth.users table, which will cascade to profiles due to foreign key constraint
    const { error: deleteError } = await supabaseClient.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("Error deleting user:", deleteError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to delete user",
          details: deleteError.message,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }

    console.log(`Successfully deleted user: ${userProfile.username} (${userId})`);

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        message: `User ${userProfile.username} has been successfully deleted`,
        userId: userId,
        deletedUser: {
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
    console.error("Error in admin-user-delete:", error);

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
