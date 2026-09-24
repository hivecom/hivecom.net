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
import type { Database } from "database-types";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
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
      ["network.update"],
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
      "stop",
    );

    console.log(`Making request to Docker Control at: ${dockerControlUrl}`);

    // healthy is left null for the health check to report
    await updateContainerStatus(supabaseClient, containerName, {
      running: false,
      healthy: null,
    });

    // Fire and forget
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

        // A failed stop most likely left it running
        await updateContainerStatus(supabaseClient, containerName, {
          running: true,
          healthy: null,
        });
      } else {
        const result = await response.json();
        console.log(`Container ${containerName} stop result:`, result);

        await updateContainerStatus(supabaseClient, containerName, {
          running: false,
          healthy: null,
        });
      }
    }).catch((error) => {
      console.error(`Error stopping container ${containerName}:`, error);
      updateContainerStatus(supabaseClient, containerName, {
        healthy: null,
        // Unknown whether the stop succeeded, so running is left alone
      }).catch((dbError) => {
        console.error(`Failed to update container status: ${dbError.error}`);
      });
    });

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
