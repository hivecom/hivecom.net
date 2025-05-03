import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeAuthenticatedHasPermission } from "../_shared/auth.ts";
import { Database, Tables } from "database-types";

Deno.serve(async (req: Request) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get container name from request path or body
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');

    // Extract container name from path - assuming the path is like /.../container-name
    // The last part of the path should be the container name
    const containerName = pathParts[pathParts.length - 1];

    if (!containerName) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Container name is required",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Verify user has permission to manage servers
    const authResponse = await authorizeAuthenticatedHasPermission(
      req,
      ["containers.crud"]
    );

    if (authResponse) {
      return authResponse;
    }

    // Get the Docker Control token from environment variables
    const DOCKER_CONTROL_TOKEN = Deno.env.get("DOCKER_CONTROL_TOKEN");

    if (!DOCKER_CONTROL_TOKEN) {
      throw new Error("DOCKER_CONTROL_TOKEN environment variable is not set");
    }

    // Create a Supabase client
    const supabaseClient = createClient<Database>(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Get container details including the server it's hosted on
    const { data: container, error: containerError } = await supabaseClient
      .from("containers")
      .select("*, server(*)")
      .eq("name", containerName)
      .single();

    if (containerError || !container) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Container not found",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        }
      );
    }

    // Get the server that hosts this container
    const server = container.server as Tables<"servers">;

    if (!server) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Container is not associated with a server",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Check if docker-control is enabled on the server
    if (!server.docker_control || !server.active) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Docker control is not enabled for this server",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Construct the docker-control URL
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
    }/control/name/${containerName}/restart`;

    console.log(`Making request to Docker Control at: ${dockerControlUrl}`);

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
        console.error(`Error restarting container ${containerName}: ${response.status} ${response.statusText}`);
      } else {
        const result = await response.json();
        console.log(`Container ${containerName} restart result:`, result);
      }
    }).catch(error => {
      console.error(`Error restarting container ${containerName}:`, error);
    });

    // Return immediate success response
    return new Response(
      JSON.stringify({
        success: true,
        message: `Container ${containerName} restart command has been sent and is processing`,
        container: containerName,
        info: "The container may take some time to fully restart",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (err) {
    const error = err as Error;
    console.error("Error in admin-docker-control-container-restart:", error);

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
