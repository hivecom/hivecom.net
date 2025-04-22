import * as constants from "app-constants" with { type: "json" };
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { Database, Tables } from "database-types";

const patreonClientId = Deno.env.get("PATREON_CLIENT_ID") || "";
const patreonClientSecret = Deno.env.get("PATREON_CLIENT_SECRET") || "";

interface PatreonTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface PatreonUserData {
  data: {
    id: string;
    attributes: {
      full_name: string;
      is_email_verified: boolean;
      email: string;
    };
    relationships: {
      pledges: {
        data: Array<{
          type: string;
          id: string;
        }>;
      };
    };
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { code, redirectUri } = await req.json();

    if (!code) {
      return new Response(
        JSON.stringify({ error: "Missing authorization code" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // Get the authentication token from the header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }
    const token = authHeader.replace("Bearer ", "");

    // Create a Supabase client with the Auth context of the logged in user
    const supabaseClient = createClient(
      // Supabase API URL - env var exported by default
      Deno.env.get("SUPABASE_URL") ?? "",
      // Supabase API ANON KEY - env var exported by default
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      // Create client with Auth context of the user that called the function
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    );

    // Get user information from the token
    const {
      data: { user },
    } = await supabaseClient.auth.getUser(token);

    if (!user) {
      return new Response(
        JSON.stringify({ error: "User not found or invalid token" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    const PATREON_CLIENT_ID = Deno.env.get("PATREON_CLIENT_ID");
    const PATREON_CLIENT_SECRET = Deno.env.get("PATREON_CLIENT_SECRET");

    if (!PATREON_CLIENT_ID) {
      throw new Error("PATREON_CLIENT_ID is not set");
    }

    if (!PATREON_CLIENT_SECRET) {
      throw new Error("PATREON_CLIENT_SECRET is not set");
    }

    // Ensure the code is properly encoded
    const encodedCode = encodeURIComponent(code.trim());

    // Exchange the authorization code for an access token
    const tokenResponse = await fetch(
      "https://www.patreon.com/api/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code: encodedCode,
          grant_type: "authorization_code",
          client_id: patreonClientId,
          client_secret: patreonClientSecret,
          redirect_uri: redirectUri,
        }).toString(),
      },
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Patreon token exchange error:", errorText);

      // Provide more specific error messages based on common issues
      let errorMessage = "Failed to exchange authorization code";
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error === "invalid_grant") {
          errorMessage =
            "Authorization code is invalid or expired. Please try connecting your Patreon account again.";
        } else if (errorData.error === "invalid_client") {
          errorMessage =
            "Client authentication failed. Please contact support.";
        } else if (errorData.error_description) {
          errorMessage = `Patreon error: ${errorData.error_description}`;
        }
      } catch (_) {
        // If we can't parse the error, just use the generic message
      }

      return new Response(
        JSON.stringify({ error: errorMessage }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    const tokenData = await tokenResponse.json() as PatreonTokenResponse;

    // Fetch the user's Patreon data using the access token
    const patreonUserResponse = await fetch(
      "https://www.patreon.com/api/oauth2/v2/identity?include=memberships,memberships.currently_entitled_tiers&fields[user]=full_name,email,is_email_verified",
      {
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`,
        },
      },
    );

    if (!patreonUserResponse.ok) {
      const error = await patreonUserResponse.text();
      console.error("Patreon user data fetch error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch Patreon user data" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    const patreonUser = await patreonUserResponse.json() as PatreonUserData;
    const patreonId = patreonUser.data.id;

    // Create Supabase admin client for database operations
    const supabaseAdmin = createClient<Database>(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Update the user's profile with Patreon data
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        patreon_id: patreonId,
        modified_at: new Date().toISOString(),
      } as Tables<'profiles'>)
      .eq("id", user.id);

    if (updateError) {
      console.error("Error updating profile:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update user profile" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    console.log(
      `Patreon account ${patreonId} connected successfully for user ${user.id}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: `Patreon account ${patreonId} connected successfully`,
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error) {
    console.error("Error in oauth-patreon function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: constants.default.API_ERROR,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
});
