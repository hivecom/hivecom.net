import { getSecretKey } from "../_shared/env.ts";
import { createClient } from "@supabase/supabase-js";
import { authorizeAuthenticatedHasPermissionAal2 } from "../_shared/auth.ts";
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

    const url = new URL(req.url);
    const tail = url.searchParams.get("tail") || "100";
    const since = url.searchParams.get("since");

    const dockerControlUrl = buildDockerControlActionUrl(
      container!.server,
      containerName,
      `logs?tail=${encodeURIComponent(tail)}${
        since ? `&since=${encodeURIComponent(since)}` : ""
      }`,
    );

    console.log(`Making request to Docker Control at: ${dockerControlUrl}`);

    const apiResponse = await fetch(dockerControlUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${DOCKER_CONTROL_TOKEN}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000), // Logs can be large
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

    const logsData = await apiResponse.text();

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
