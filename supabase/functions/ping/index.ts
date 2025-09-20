import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let who;
  try {
    // Only try to parse JSON if there's content to parse
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 0) {
      const body = await req.json();
      who = body.who;
    }
  } catch (error) {
    console.error("Error parsing request body:", error);

    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const data = {
    message: who ? `Pinging ${who}!` : "Pinging!",
    date: new Date().toISOString(),
  };

  console.log("Received request:", data);

  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
