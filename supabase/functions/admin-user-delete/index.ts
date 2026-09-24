import { getPublishableKey, getSecretKey } from "../_shared/env.ts";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import {
  authorizeAuthenticatedHasPermissionAal2,
  getAuthenticatedUserId,
} from "../_shared/auth.ts";
import { wipeDepotUploads } from "../_shared/depot.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";
import type { Database } from "database-types";

interface DeleteUserRequest {
  userId: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return responseMethodNotAllowed(req.method);
  }

  try {
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

    const authResponse = await authorizeAuthenticatedHasPermissionAal2(
      req,
      ["users.delete"],
    );

    if (authResponse) {
      return authResponse;
    }

    // Resolve the caller so they can't delete themselves
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
      getPublishableKey(),
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
          error: "You cannot delete yourself",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    // Service role client for the auth admin calls
    const supabaseClient = createClient<Database>(
      Deno.env.get("SUPABASE_URL") ?? "",
      getSecretKey(),
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
      `Attempting to delete user: ${userProfile.username} (${userId})`,
    );

    // Wipe Depot first so nothing outlives the account. A failing Depot aborts the
    // delete so it can be retried.
    try {
      const wiped = await wipeDepotUploads(userId);
      if (wiped !== null) {
        console.log(
          `Wiped ${wiped} Depot upload(s) for ${userProfile.username} (${userId})`,
        );
      }
    } catch (depotError) {
      console.error("Error wiping Depot uploads:", depotError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to wipe the user's Depot uploads; account not deleted",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 502,
        },
      );
    }

    // Cascades from auth.users to profiles through the foreign key
    const { error: deleteError } = await supabaseClient.auth.admin.deleteUser(
      userId,
    );

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

    console.log(
      `Successfully deleted user: ${userProfile.username} (${userId})`,
    );

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
