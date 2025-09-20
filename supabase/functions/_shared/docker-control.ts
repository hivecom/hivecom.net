import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "./cors.ts";
import { Database, Tables } from "database-types";

// Interface for container with its server details
export interface ContainerWithServer {
  container: Tables<"containers">;
  server: Tables<"servers">;
}

// Interface for Docker control container response
export interface DockerControlContainer {
  id: string;
  name: string;
  health: string;
  status: string;
  started: number | null;
}

export type DockerControlResponse = DockerControlContainer[];

/**
 * Builds a Docker control URL for server-wide actions
 */
export function buildDockerControlServerUrl(
  server: Tables<"servers">,
  endpoint: string = "status",
): string {
  return `${server.docker_control_secure ? "https" : "http"}://${
    server.docker_control_subdomain ? `${server.docker_control_subdomain}.` : ""
  }${server.address}${
    server.docker_control_port
      ? `:${server.docker_control_port.toString()}`
      : ""
  }/${endpoint}`;
}

/**
 * Builds a Docker control URL for a specific container and action
 */
export function buildDockerControlActionUrl(
  server: Tables<"servers">,
  containerName: string,
  action: string,
): string {
  // Use the server URL builder as a base, with a specific endpoint for container actions
  return buildDockerControlServerUrl(
    server,
    `control/name/${containerName}/${action}`,
  );
}

/**
 * Fetches container details along with its associated server
 */
export async function getContainerWithServer(
  supabaseClient: ReturnType<typeof createClient<Database>>,
  containerName: string,
): Promise<{ container: ContainerWithServer | null; error: Response | null }> {
  // Get container details including the server it's hosted on
  const { data: container, error: containerError } = await supabaseClient
    .from("containers")
    .select("*, server(*)")
    .eq("name", containerName)
    .single();

  if (containerError || !container) {
    return {
      container: null,
      error: new Response(
        JSON.stringify({
          success: false,
          error: "Container not found",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        },
      ),
    };
  }

  // Get the server that hosts this container
  const server = container.server as Tables<"servers">;

  if (!server) {
    return {
      container: null,
      error: new Response(
        JSON.stringify({
          success: false,
          error: "Container is not associated with a server",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      ),
    };
  }

  // Check if docker-control is enabled on the server
  if (!server.docker_control || !server.active) {
    return {
      container: null,
      error: new Response(
        JSON.stringify({
          success: false,
          error: "Docker control is not enabled for this server",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      ),
    };
  }

  return {
    container: { container, server },
    error: null,
  };
}

/**
 * Updates container status in the database
 */
export async function updateContainerStatus(
  supabaseClient: ReturnType<typeof createClient<Database>>,
  containerName: string,
  statusUpdate: Partial<Tables<"containers">>,
): Promise<{ success: boolean; error: string | null }> {
  try {
    const now = new Date().toISOString();
    const updateData = {
      ...statusUpdate,
      reported_at: now,
    };

    const { error: dbError } = await supabaseClient
      .from("containers")
      .update(updateData as Tables<"containers">)
      .eq("name", containerName);

    if (dbError) {
      console.error(
        `Error updating container status in database: ${dbError.message}`,
      );
      return { success: false, error: dbError.message };
    }

    return { success: true, error: null };
  } catch (err) {
    const error = err as Error;
    console.error(`Failed to update container status: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Performs a Docker control API request and handles the response
 */
export async function performDockerControlAction(
  url: string,
  method: string = "POST",
  headers: Record<string, string>,
  timeout: number = 5000,
): Promise<{ apiResponse: Response | null; error: Error | null }> {
  try {
    const apiResponse = await fetch(url, {
      method,
      headers,
      signal: AbortSignal.timeout(timeout),
    });

    return { apiResponse, error: null };
  } catch (err) {
    const error = err as Error;
    console.error(`Docker control request failed: ${error.message}`);
    return { apiResponse: null, error };
  }
}

/**
 * Get all active Docker control enabled servers
 */
export async function getActiveDockerControlServers(
  supabaseClient: ReturnType<typeof createClient<Database>>,
): Promise<{ servers: Tables<"servers">[] | null; error: Response | null }> {
  try {
    const { data: servers, error: dbError } = await supabaseClient
      .from("servers")
      .select("*")
      .eq("active", true)
      .eq("docker_control", true);

    if (dbError) {
      console.error(
        `Error fetching active Docker control servers: ${dbError.message}`,
      );
      return {
        servers: null,
        error: new Response(
          JSON.stringify({
            success: false,
            error: `Failed to fetch servers: ${dbError.message}`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          },
        ),
      };
    }

    if (!servers || servers.length === 0) {
      return {
        servers: [],
        error: null,
      };
    }

    return { servers, error: null };
  } catch (err) {
    const error = err as Error;
    console.error(
      `Failed to get active Docker control servers: ${error.message}`,
    );

    return {
      servers: null,
      error: new Response(
        JSON.stringify({
          success: false,
          error: `Server query failed: ${error.message}`,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      ),
    };
  }
}

/**
 * Extracts container name from URL path
 */
export function extractContainerNameFromPath(req: Request): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  // Extract container name from path - assuming the path is like /.../container-name
  // The last part of the path should be the container name
  return pathParts[pathParts.length - 1] || null;
}

/**
 * Gets Docker control token from environment variables
 */
export function getDockerControlToken(): string {
  const token = Deno.env.get("DOCKER_CONTROL_TOKEN");
  if (!token) {
    throw new Error("DOCKER_CONTROL_TOKEN environment variable is not set");
  }
  return token;
}
