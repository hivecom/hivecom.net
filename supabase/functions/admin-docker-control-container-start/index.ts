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
      Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Get container details including the server it's hosted on
    const { container, error: containerError } = await getContainerWithServer(
      supabaseClient,
      containerName,
    );

    if (containerError) {
      return containerError;
    }

    // Build the Docker control URL for starting the container
    const dockerControlUrl = buildDockerControlActionUrl(
      container!.server,
      containerName,
      "start",
    );

    console.log(`Making request to Docker Control at: ${dockerControlUrl}`);

    // Update container status in the database to indicate it's starting
    // Set running to true and healthy to null since it will be checked/reported by a separate process
    await updateContainerStatus(supabaseClient, containerName, {
      running: true,
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
          `Error starting container ${containerName}: ${response.status} ${response.statusText}`,
        );
        // If there was an error, set running to false and healthy to null
        await updateContainerStatus(supabaseClient, containerName, {
          running: false,
          healthy: null,
        });
      } else {
        const result = await response.json();
        console.log(`Container ${containerName} start result:`, result);

        // Set started_at timestamp on successful start
        await updateContainerStatus(supabaseClient, containerName, {
          running: true,
          healthy: null,
          started_at: new Date().toISOString(),
        });
      }
    }).catch((error) => {
      console.error(`Error starting container ${containerName}:`, error);
      // If there was an exception, update the container state
      updateContainerStatus(supabaseClient, containerName, {
        running: false,
        healthy: null,
      }).catch((dbError) => {
        console.error(`Failed to update container status: ${dbError.error}`);
      });
    });

    // Return immediate success response
    return new Response(
      JSON.stringify({
        success: true,
        message:
          `Container ${containerName} start command has been sent and is processing`,
        container: containerName,
        info: "The container may take some time to fully start",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    const error = err as Error;
    console.error("Error in admin-docker-control-container-start:", error);

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
