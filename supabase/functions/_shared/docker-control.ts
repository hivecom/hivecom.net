import type { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "./cors.ts";
import type { Database, Tables } from "database-types";

export interface ContainerWithServer {
  container: Tables<"network_containers">;
  server: Tables<"network_servers">;
}

export interface DockerControlContainer {
  id: string;
  name: string;
  health: string;
  status: string;
  started: number | null;
}

export type DockerControlResponse = DockerControlContainer[];

export function buildDockerControlServerUrl(
  server: Tables<"network_servers">,
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

export function buildDockerControlActionUrl(
  server: Tables<"network_servers">,
  containerName: string,
  action: string,
): string {
  return buildDockerControlServerUrl(
    server,
    `control/name/${containerName}/${action}`,
  );
}

export async function getContainerWithServer(
  supabaseClient: ReturnType<typeof createClient<Database>>,
  containerName: string,
): Promise<{ container: ContainerWithServer | null; error: Response | null }> {
  const { data: container, error: containerError } = await supabaseClient
    .from("network_containers")
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

  const server = container.server as Tables<"network_servers">;

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

export async function updateContainerStatus(
  supabaseClient: ReturnType<typeof createClient<Database>>,
  containerName: string,
  statusUpdate: Partial<Tables<"network_containers">>,
): Promise<{ success: boolean; error: string | null }> {
  try {
    const now = new Date().toISOString();
    const updateData = {
      ...statusUpdate,
      reported_at: now,
    };

    const { error: dbError } = await supabaseClient
      .from("network_containers")
      .update(updateData as Tables<"network_containers">)
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

export async function getActiveDockerControlServers(
  supabaseClient: ReturnType<typeof createClient<Database>>,
): Promise<
  { servers: Tables<"network_servers">[] | null; error: Response | null }
> {
  try {
    const { data: servers, error: dbError } = await supabaseClient
      .from("network_servers")
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

export function extractContainerNameFromPath(req: Request): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  return pathParts[pathParts.length - 1] || null;
}

export function getDockerControlToken(): string {
  const token = Deno.env.get("DOCKER_CONTROL_TOKEN");
  if (!token) {
    throw new Error("DOCKER_CONTROL_TOKEN environment variable is not set");
  }
  return token;
}
