import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeSystemCron } from "../_shared/auth.ts";
import { Database, Tables } from "database-types";

interface DockerControlContainer {
  id: string;
  name: string;
  health: string;
  status: string;
  startTimestamp: number;
}

type DockerControlResponse = DockerControlContainer[];

Deno.serve(async (req: Request) => {
  // Skip CORS preflight check for OPTIONS requests as this should not originate from a browser.
  try {
    // Authorize the request using the system cron authorization function
    const authorizeResponse = authorizeSystemCron(req);
    if (authorizeResponse) {
      console.error("Authorization failed:", authorizeResponse.statusText);

      return authorizeResponse;
    }

    // Get the Docker Control token from environment variables
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

    // Fetch all active servers with docker control enabled from the database
    const { data: servers, error: serversError } = (await supabaseClient
      .from("servers")
      .select("*")
      .eq("active", true)
      .eq("docker_control", true)) as {
        data: Tables<"servers">[];
        error: Error | null;
      };

    if (serversError) {
      throw serversError;
    }

    if (!servers || servers.length === 0) {
      console.log("No active servers with Docker Control enabled found");

      return new Response(
        JSON.stringify({
          success: true,
          message: "No active servers with Docker Control enabled found",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Process each server in parallel
    const results = await Promise.all(
      servers.map(async (server) => {
        try {
          console.log(`Processing server ${server.address}...`);

          const dockerControlUrl = `${
            server.docker_control_secure ? "https" : "http"
          }://${
            server.docker_control_subdomain
              ? `${server.docker_control_subdomain}.`
              : ""
          }${server.address}${
            server.docker_control_port
              ? `:${server.docker_control_port.toString()}`
              : ""
          }/status`;

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
          const containers = await response.json() as DockerControlResponse;

          // Current timestamp for reporting
          const now = new Date().toISOString();

          // Process each container and upsert to the containers table
          const containerUpserts = await Promise.all(
            containers.map(async (container) => {
              // Determine running and healthy state from the health and status fields
              const running = container.health === "running";
              // Check if the status contains "healthy" text
              const healthy = container.status.includes("healthy");

              const { error } = await supabaseClient
                .from("containers")
                .upsert({
                  name: container.name,
                  running: running,
                  healthy: healthy,
                  reported_at: now,
                  started_at: new Date(container.startTimestamp).toISOString(),
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
        error:
          "Internal server error - please email contact@hivecom.net or visit #staff on irc.hivecom.net for support",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
