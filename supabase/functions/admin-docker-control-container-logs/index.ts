import { createClient } from "@supabase/supabase-js";
import { authorizeAuthenticatedHasPermission } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  buildDockerControlActionUrl,
  extractContainerNameFromPath,
  getContainerWithServer,
  getDockerControlToken,
} from "../_shared/docker-control.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";
import type { Database } from "database-types";

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

    // Verify user has permission to manage containers
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

    // Process URL query parameters for log options
    const url = new URL(req.url);
    const tail = url.searchParams.get("tail") || "100"; // Default 100 lines
    const since = url.searchParams.get("since");

    // Build the Docker control URL for container logs
    const dockerControlUrl = buildDockerControlActionUrl(
      container!.server,
      containerName,
      `logs?tail=${tail}${since ? `&since=${since}` : ""}`,
    );

    console.log(`Making request to Docker Control at: ${dockerControlUrl}`);

    // Send the request to docker-control service
    const apiResponse = await fetch(dockerControlUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${DOCKER_CONTROL_TOKEN}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000), // 10 seconds timeout - logs can be large
    });

    if (!apiResponse.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            `Failed to get container logs: ${apiResponse.status} ${apiResponse.statusText}`,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: apiResponse.status,
        },
      );
    }

    // Get the logs from the response
    const logsData = await apiResponse.text();

    // Return success response with logs
    return new Response(
      JSON.stringify({
        success: true,
        container: containerName,
        logs: logsData,
        options: {
          tail,
          since,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    const error = err as Error;
    console.error("Error in admin-docker-control-container-logs:", error);

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
