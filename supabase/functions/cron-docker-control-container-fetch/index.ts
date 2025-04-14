import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeSystemCron } from "../_shared/auth.ts";
import { Database, Tables } from "database-types";

interface DockerControlResponse {
  containers: {
    name: string;
    running: boolean;
    healthy: boolean;
  }[];
}

Deno.serve(async (req: Request) => {
  // Skip CORS preflight check for OPTIONS requests as this should not originate from a browser.
  try {
    // Authorize the request using the system cron authorization function
    const authorizeResponse = authorizeSystemCron(req);
    if (authorizeResponse) {
      console.error("Authorization failed:", authorizeResponse.statusText);

      return authorizeResponse;
    }

    // Get the Docker Control port and token from environment variables
    const DOCKER_CONTROL_PORT = Deno.env.get("DOCKER_CONTROL_PORT") ?? "8080";
    const DOCKER_CONTROL_TOKEN = Deno.env.get("DOCKER_CONTROL_TOKEN");

    if (!DOCKER_CONTROL_TOKEN) {
      throw new Error("DOCKER_CONTROL_TOKEN environment variable is not set");
    }

    // Create a Supabase client with the service role key (full admin access)
    // Don't pass Authorization header from the request
    const supabaseClient = createClient<Database>(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Fetch all active servers from the database
    const { data: servers, error: serversError } = (await supabaseClient
      .from("servers")
      .select("*")
      .eq("active", true)) as {
      data: Tables<"servers">[];
      error: Error | null;
    };

    if (serversError) {
      throw serversError;
    }

    if (!servers || servers.length === 0) {
      console.log("No active servers found");

      return new Response(
        JSON.stringify({ success: true, message: "No active servers found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Process each server in parallel
    const results = await Promise.all(
      servers.map(async (server) => {
        try {
          console.log(`Processing server ${server.address}...`);

          // Construct the Docker Control URL
          const dockerControlUrl = `https://${server.address}:${DOCKER_CONTROL_PORT}/containers`;

          // Make a request to the Docker Control service
          const response = await fetch(dockerControlUrl, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${DOCKER_CONTROL_TOKEN}`,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(5000), // 5 seconds timeout
          });

          if (!response.ok) {
            throw new Error(
              `Failed to fetch from ${server.address}: ${response.statusText}`,
            );
          }

          // Parse the response JSON
          const data = (await response.json()) as DockerControlResponse;

          // Current timestamp for reporting
          const now = new Date().toISOString();

          // Process each container and upsert to the gameserver_containers table
          const containerUpserts = await Promise.all(
            data.containers.map(async (container) => {
              const { error } = await supabaseClient
                .from("gameserver_containers")
                .upsert({
                  name: container.name,
                  running: container.running,
                  healthy: container.healthy,
                  reported_at: now,
                  server: server.id,
                });

              return {
                container: container.name,
                success: !error,
                error: error?.message,
              };
            }),
          );

          return {
            server: server.address,
            success: true,
            containers: containerUpserts,
          };
        } catch (err) {
          const error = err as Error;
          console.error(`Error processing server ${server.address}:`, error);

          return {
            server: server.address,
            success: false,
            error: error.message || "Unknown error",
          };
        }
      }),
    );

    console.log("Processed servers:", results);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Processed servers successfully",
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const error = err as Error;
    console.error("Error in cron-docker-container-fetch:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
