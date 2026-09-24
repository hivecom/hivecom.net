import { getSecretKey } from "../_shared/env.ts";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeAuthenticatedHasPermissionAal2 } from "../_shared/auth.ts";
import {
  buildDockerControlActionUrl,
  extractContainerNameFromPath,
  getContainerWithServer,
  getDockerControlToken,
  updateContainerStatus,
} from "../_shared/docker-control.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";
import type { Database, Tables } from "database-types";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return responseMethodNotAllowed(req.method);
  }

  try {
    const containerName = extractContainerNameFromPath(req);

    if (!containerName) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Container name is required",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    const authResponse = await authorizeAuthenticatedHasPermissionAal2(
      req,
      ["network.read"],
    );

    if (authResponse) {
      return authResponse;
    }

    const DOCKER_CONTROL_TOKEN = getDockerControlToken();

    // Service role client, created only after the permission check
    const supabaseClient = createClient<Database>(
      Deno.env.get("SUPABASE_URL") ?? "",
      getSecretKey(),
    );

    const { container, error: containerError } = await getContainerWithServer(
      supabaseClient,
      containerName,
    );

    if (containerError) {
      return containerError;
    }

    const dockerControlUrl = buildDockerControlActionUrl(
      container!.server,
      containerName,
      "status",
    );

    console.log(`Making request to Docker Control at: ${dockerControlUrl}`);

    const response = await fetch(dockerControlUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${DOCKER_CONTROL_TOKEN}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to get container status: ${response.status} ${response.statusText}`,
      );
    }

    const result = await response.json();

    // Docker states: created, restarting, running, removing, paused, exited, dead

    let isRunning = false;
    let isHealthy: boolean | null = null;

    if (result && result.State) {
      const dockerStatus = result.State.Status
        ? result.State.Status.toLowerCase()
        : "";
      isRunning = ["running", "restarting", "created"].includes(dockerStatus);

      if (result.State.Health && result.State.Health.Status) {
        const healthStatus = result.State.Health.Status.toLowerCase();
        isHealthy = healthStatus === "healthy";
      }

      const updateData: Partial<Tables<"network_containers">> = {
        running: isRunning,
        healthy: isHealthy,
      };

      // started_at only moves when the container comes up
      if (
        isRunning &&
        (!container?.container.started_at || !container?.container.running)
      ) {
        updateData.started_at = new Date().toISOString();
      }

      await updateContainerStatus(supabaseClient, containerName, updateData);
    }

    return new Response(
      JSON.stringify({
        success: true,
        container: containerName,
        status: result,
        databaseState: {
          running: isRunning,
          healthy: isHealthy,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    const error = err as Error;
    console.error("Error in admin-docker-control-container-status:", error);

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
