import { corsHeaders } from "./cors.ts";

export function responseMethodNotAllowed(method: string) {
  return new Response(
    JSON.stringify({
      success: false,
      error: `Method ${method} not allowed`,
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    },
  );
}
