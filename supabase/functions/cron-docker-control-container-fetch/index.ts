import { getSecretKey } from "../_shared/env.ts";
import { createClient } from "@supabase/supabase-js";
import { authorizeSystemCron } from "../_shared/auth.ts";
import {
  buildDockerControlServerUrl,
  type DockerControlResponse,
  getActiveDockerControlServers,
  getDockerControlToken,
} from "../_shared/docker-control.ts";
import type { Database, Tables } from "database-types";

Deno.serve(async (req: Request) => {
  // No CORS preflight, cron requests never come from a browser
  try {
    const authResponse = authorizeSystemCron(req);
    if (authResponse) {
      console.error("Authorization failed:", authResponse.statusText);
      return authResponse;
    }

    const DOCKER_CONTROL_TOKEN = getDockerControlToken();

    // Service role client, full admin access
    const supabaseClient = createClient<Database>(
      Deno.env.get("SUPABASE_URL") ?? "",
      getSecretKey(),
    );

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

    const results = await Promise.all(
      servers.map(async (server) => {
        try {
          console.log(`Processing server ${server.address}...`);

          const dockerControlUrl = buildDockerControlServerUrl(
            server,
            "status",
          );

          const fetchResponse = await fetch(dockerControlUrl, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${DOCKER_CONTROL_TOKEN}`,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(5000),
          });

          if (!fetchResponse.ok) {
            throw new Error(
              `Failed to fetch from ${server.address}: ${fetchResponse.statusText}`,
            );
          }

          const containers = await fetchResponse
            .json() as DockerControlResponse;

          const now = new Date().toISOString();

          const containerUpserts = await Promise.all(
            containers.map(async (container) => {
              const running = container.health === "running";
              const hasHealth = container.status.includes("healthy") ||
                container.status.includes("unhealthy");
              // "unhealthy" contains "healthy", so test for the negative.
              const healthy = hasHealth
                ? !container.status.includes("unhealthy")
                : null;

              const { error: dbError } = await supabaseClient
                .from("network_containers")
                .upsert({
                  name: container.name,
                  running: running,
                  healthy: healthy,
                  reported_at: now,
                  started_at: container.started
                    ? new Date(container.started).toISOString()
                    : null,
                  server: server.id,
                } as Tables<"network_containers">, {});

              return {
                container: container.name,
                success: !dbError,
                error: dbError?.message,
              };
            }),
          );

          const { error: accessError } = await supabaseClient
            .from("network_servers")
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
            .from("network_servers")
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
