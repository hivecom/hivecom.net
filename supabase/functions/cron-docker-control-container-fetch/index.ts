import { createClient } from "@supabase/supabase-js";
import { authorizeSystemCron } from "../_shared/auth.ts";
import {
  buildDockerControlServerUrl,
  DockerControlResponse,
  getActiveDockerControlServers,
  getDockerControlToken,
} from "../_shared/docker-control.ts";
import { Database, Tables } from "database-types";

Deno.serve(async (req: Request) => {
  // Skip CORS preflight check for OPTIONS requests as this should not originate from a browser.
  try {
    // Authorize the request using the system cron authorization function
    const authResponse = authorizeSystemCron(req);
    if (authResponse) {
      console.error("Authorization failed:", authResponse.statusText);
      return authResponse;
    }

    // Get the Docker Control token from environment variables
    const DOCKER_CONTROL_TOKEN = getDockerControlToken();

    // Create a Supabase client with the service role key (full admin access)
    const supabaseClient = createClient<Database>(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Fetch all active servers with docker control enabled from the database
    const { servers, error: serversError } =
      await getActiveDockerControlServers(supabaseClient);

    if (serversError) {
      return serversError;
    }

    if (!servers || servers.length === 0) {
      console.log("No active servers with Docker Control enabled found");

      return new Response(
        JSON.stringify({
          success: true,
          message: "No active servers with Docker Control enabled found",
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // Process each server in parallel
    const results = await Promise.all(
      servers.map(async (server) => {
        try {
          console.log(`Processing server ${server.address}...`);

          // Build the Docker control URL for server status endpoint
          const dockerControlUrl = buildDockerControlServerUrl(
            server,
            "status",
          );

          // Make a request to the Docker Control service
          const fetchResponse = await fetch(dockerControlUrl, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${DOCKER_CONTROL_TOKEN}`,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(5000), // 5 seconds timeout
          });

          if (!fetchResponse.ok) {
            throw new Error(
              `Failed to fetch from ${server.address}: ${fetchResponse.statusText}`,
            );
          }

          // Parse the response JSON
          const containers = await fetchResponse
            .json() as DockerControlResponse;

          // Current timestamp for reporting
          const now = new Date().toISOString();

          // Process each container and upsert to the containers table
          const containerUpserts = await Promise.all(
            containers.map(async (container) => {
              // Determine running and healthy state from the health and status fields
              const running = container.health === "running";
              // Check if the status contains "healthy" text
              const hasHealth = container.status.includes("healthy") ||
                container.status.includes("unhealthy");
              const healthy = hasHealth
                ? container.status.includes("healthy")
                : null;

              const { error: dbError } = await supabaseClient
                .from("containers")
                .upsert({
                  name: container.name,
                  running: running,
                  healthy: healthy,
                  reported_at: now,
                  started_at: container.started
                    ? new Date(container.started).toISOString()
                    : null,
                  server: server.id,
                } as Tables<"containers">, {});

              return {
                container: container.name,
                success: !dbError,
                error: dbError?.message,
              };
            }),
          );

          const { error: accessError } = await supabaseClient
            .from("servers")
            .update({ accessible: true, last_accessed: now })
            .eq("id", server.id);

          if (accessError) {
            throw new Error(
              `Failed to update server access state for ${server.address}: ${accessError.message}`,
            );
          }

          return {
            server: server.address,
            success: true,
            containers: containerUpserts,
          };
        } catch (err) {
          const error = err as Error;
          console.error(`Error processing server ${server.address}:`, error);

          const { error: accessError } = await supabaseClient
            .from("servers")
            .update({ accessible: false })
            .eq("id", server.id);

          if (accessError) {
            console.error(
              `Failed to flag server ${server.address} as inaccessible: ${accessError.message}`,
            );
          }

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
      { headers: { "Content-Type": "application/json" } },
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
        headers: { "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
