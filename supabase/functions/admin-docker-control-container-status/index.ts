import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeAuthenticatedHasPermission } from "../_shared/auth.ts";
import {
  buildDockerControlActionUrl,
  extractContainerNameFromPath,
  getContainerWithServer,
  getDockerControlToken,
  updateContainerStatus,
} from "../_shared/docker-control.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";
import { Database, Tables } from "database-types";

Deno.serve(async (req: Request) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return responseMethodNotAllowed(req.method);
  }

  try {
    // Get container name from request path
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

    // Verify user has permission to manage servers
    const authResponse = await authorizeAuthenticatedHasPermission(
      req,
      ["containers.read"],
    );

    if (authResponse) {
      return authResponse;
    }

    // Get the Docker Control token from environment variables
    const DOCKER_CONTROL_TOKEN = getDockerControlToken();

    // Create a Supabase client
    const supabaseClient = createClient<Database>(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Get container details including the server it's hosted on
    const { container, error: containerError } = await getContainerWithServer(
      supabaseClient,
      containerName,
    );

    if (containerError) {
      return containerError;
    }

    // Build the Docker control URL for checking container status
    const dockerControlUrl = buildDockerControlActionUrl(
      container!.server,
      containerName,
      "status",
    );

    console.log(`Making request to Docker Control at: ${dockerControlUrl}`);

    // Send the request to docker-control service
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
        `Failed to get container status: ${response.status} ${response.statusText}`,
      );
    }

    const result = await response.json();

    // Map Docker state to our database fields (running, healthy)
    // Docker status can be: "created", "restarting", "running", "removing", "paused", "exited", "dead"

    let isRunning = false;
    let isHealthy: boolean | null = null;

    if (result && result.State) {
      // Determine running state based on Docker status
      const dockerStatus = result.State.Status
        ? result.State.Status.toLowerCase()
        : "";
      isRunning = ["running", "restarting", "created"].includes(dockerStatus);

      // Determine health status if available
      if (result.State.Health && result.State.Health.Status) {
        const healthStatus = result.State.Health.Status.toLowerCase();
        isHealthy = healthStatus === "healthy";
      }

      // Update container state in database
      const updateData: Partial<Tables<"containers">> = {
        running: isRunning,
        healthy: isHealthy,
      };

      // Only update started_at if needed
      if (
        isRunning &&
        (!container?.container.started_at || !container?.container.running)
      ) {
        updateData.started_at = new Date().toISOString();
      }

      await updateContainerStatus(supabaseClient, containerName, updateData);
    }

    // Return the success response with container status information
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
