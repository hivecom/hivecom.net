import { corsHeaders } from "../_shared/cors.ts";

/**
 * POST { mode?: 'login' | 'link', redirect?, baseUrl }. mode defaults to 'link',
 * redirect to /profile/settings.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { mode = "link", redirect = "/profile/settings", baseUrl } = await req
      .json();

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

    const returnUrl = `${baseUrl}/auth/callback/steam/`;

    const state = btoa(JSON.stringify({ mode, redirect }));

    const steamOpenIdUrl = new URL("https://steamcommunity.com/openid/login");
    steamOpenIdUrl.searchParams.set(
      "openid.ns",
      "http://specs.openid.net/auth/2.0",
    );
    steamOpenIdUrl.searchParams.set("openid.mode", "checkid_setup");
    const returnToUrl = new URL(returnUrl);
    returnToUrl.searchParams.set("state", state);
    steamOpenIdUrl.searchParams.set(
      "openid.return_to",
      returnToUrl.toString(),
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
