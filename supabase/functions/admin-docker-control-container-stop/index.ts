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
import { Database } from "database-types";

Deno.serve(async (req: Request) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
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
      ["containers.update"],
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

    // Build the Docker control URL for stopping the container
    const dockerControlUrl = buildDockerControlActionUrl(
      container!.server,
      containerName,
      "stop",
    );

    console.log(`Making request to Docker Control at: ${dockerControlUrl}`);

    // Update container in database to indicate it's stopping
    // Set running to false and healthy to null since it will be checked/reported by a separate process
    await updateContainerStatus(supabaseClient, containerName, {
      running: false,
      healthy: null,
    });

    // Send the request to docker-control service asynchronously
    // Don't wait for the response - just fire and forget
    fetch(dockerControlUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DOCKER_CONTROL_TOKEN}`,
        "Content-Type": "application/json",
      },
    }).then(async (response) => {
      if (!response.ok) {
        console.error(
          `Error stopping container ${containerName}: ${response.status} ${response.statusText}`,
        );

        // Since the stop command failed, container is likely still running
        await updateContainerStatus(supabaseClient, containerName, {
          running: true, // Container likely still running if stop failed
          healthy: null, // Health needs to be checked again
        });
      } else {
        const result = await response.json();
        console.log(`Container ${containerName} stop result:`, result);

        // Confirm container stopped state in database
        await updateContainerStatus(supabaseClient, containerName, {
          running: false,
          healthy: null,
        });
      }
    }).catch((error) => {
      console.error(`Error stopping container ${containerName}:`, error);
      // If there was an exception, update the container state
      updateContainerStatus(supabaseClient, containerName, {
        healthy: null,
        // Not updating running status since we don't know if stop succeeded
      }).catch((dbError) => {
        console.error(`Failed to update container status: ${dbError.error}`);
      });
    });

    // Return immediate success response
    return new Response(
      JSON.stringify({
        success: true,
        message:
          `Container ${containerName} stop command has been sent and is processing`,
        container: containerName,
        info: "The container may take some time to fully stop",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    const error = err as Error;
    console.error("Error in admin-docker-control-container-stop:", error);

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
