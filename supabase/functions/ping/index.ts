import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { who } = await req.json();
  const data = {
    message: who ? `Pinging ${who}!` : "Pinging!",
    date: new Date().toISOString(),
  };

  console.log("Received request:", data);

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});
