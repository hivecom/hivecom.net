import { corsHeaders } from "./cors.ts";

/**
 * Helper for handling cases where the request method is not allowed.
 * @param method The method that was not allowed
 * @returns A Response object with a 405 status code and a JSON body indicating the error.
 */
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
