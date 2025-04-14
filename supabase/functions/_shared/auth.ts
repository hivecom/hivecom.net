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
