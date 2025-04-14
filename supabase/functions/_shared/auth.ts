import { corsHeaders } from "../_shared/cors.ts";

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
        status: 401,
      },
    );
  }

  // Extract token from Authorization header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Unauthorized: Missing or invalid Authorization header",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      },
    );
  }

  // Get the token part from the Bearer token
  const token = authHeader.slice(7); // Remove 'Bearer ' prefix

  // Check if the provided token matches our system token from the vault
  if (token !== systemCronSecret) {
    return new Response(
      JSON.stringify({ success: false, message: "Unauthorized" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      },
    );
  }
}
