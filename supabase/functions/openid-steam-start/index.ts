import { corsHeaders } from "../_shared/cors.ts";

/**
 * Steam OpenID authentication start endpoint
 * Returns the Steam OpenID login URL for the client to redirect to
 *
 * POST body:
 * - mode: 'login' | 'link' (default: 'link')
 * - redirect: post-auth redirect path (default: /profile/settings)
 */
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { mode = "link", redirect = "/profile/settings", baseUrl } = await req
      .json();

    // Validate mode
    if (mode !== "login" && mode !== "link") {
      return new Response(
        JSON.stringify({ error: 'Invalid mode. Must be "login" or "link".' }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    if (!baseUrl) {
      return new Response(
        JSON.stringify({ error: "baseUrl is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // Build the return URL for Steam callback (goes back to frontend)
    const returnUrl = `${baseUrl}/auth/callback/steam`;

    // Create state parameter with mode and redirect info
    const state = btoa(JSON.stringify({ mode, redirect }));

    // Build Steam OpenID authentication URL
    const steamOpenIdUrl = new URL("https://steamcommunity.com/openid/login");
    steamOpenIdUrl.searchParams.set(
      "openid.ns",
      "http://specs.openid.net/auth/2.0",
    );
    steamOpenIdUrl.searchParams.set("openid.mode", "checkid_setup");
    steamOpenIdUrl.searchParams.set(
      "openid.return_to",
      `${returnUrl}?state=${encodeURIComponent(state)}`,
    );
    steamOpenIdUrl.searchParams.set("openid.realm", baseUrl);
    steamOpenIdUrl.searchParams.set(
      "openid.identity",
      "http://specs.openid.net/auth/2.0/identifier_select",
    );
    steamOpenIdUrl.searchParams.set(
      "openid.claimed_id",
      "http://specs.openid.net/auth/2.0/identifier_select",
    );

    return new Response(
      JSON.stringify({ url: steamOpenIdUrl.toString() }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error) {
    console.error("Steam OAuth start error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
});
