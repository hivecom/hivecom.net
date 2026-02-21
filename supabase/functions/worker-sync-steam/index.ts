import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "database-types";
import { corsHeaders } from "../_shared/cors.ts";

// Steam API constants
const STEAM_API_KEY = Deno.env.get("STEAM_API_KEY");
const STEAM_API_URL =
  "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/";

// Default configuration (conservative fallback)
const DEFAULT_CONFIG = {
  max_wall_clock_ms: 50000,
  batch_size: 10,
  visibility_timeout_sec: 60,
};

interface WorkerConfig {
  max_wall_clock_ms: number;
  batch_size: number;
  visibility_timeout_sec: number;
  max_concurrency: number;
}

interface QueueMessage {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: {
    profile_id: string;
    steam_id: string;
  };
}

interface SteamPlayer {
  steamid: string;
  personaname: string;
  profileurl: string;
  avatar: string;
  avatarmedium: string;
  avatarfull: string;
  personastate: number;
  communityvisibilitystate: number;
  profilestate?: number;
  lastlogoff?: number;
  commentpermission?: number;
  realname?: string;
  primaryclanid?: string;
  timecreated?: number;
  gameid?: string;
  gameserverip?: string;
  gameextrainfo?: string;
  gameicon?: string;
  loccountrycode?: string;
  locstatecode?: string;
  loccityid?: number;
}

interface SteamApiResponse {
  response: {
    players: SteamPlayer[];
  };
}

// Create Supabase client with service role
function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_KEY");

  if (!url || !key) {
    throw new Error("Missing Supabase configuration");
  }

  return createClient<Database>(url, key);
}

// Fetch configuration from private.kvstore
async function getWorkerConfig(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<WorkerConfig> {
  try {
    // Use raw SQL query since get_private_config is not in the generated types
    const { data, error } = await supabase
      .from("kvstore" as never)
      .select("value")
      .eq("key" as never, "worker_sync_steam" as never)
      .single();

    // Fallback: try the private config function via raw RPC
    if (error || !data) {
      // Try direct RPC call
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "get_private_config" as never,
        { config_key: "worker_sync_steam" } as never,
      );

      if (rpcError || !rpcData) {
        console.warn(
          "Failed to fetch config, using defaults:",
          rpcError?.message ?? error?.message,
        );
        return DEFAULT_CONFIG as WorkerConfig;
      }

      const configData = rpcData as unknown as Record<string, unknown>;
      return {
        max_wall_clock_ms: (configData.max_wall_clock_ms as number) ??
          DEFAULT_CONFIG.max_wall_clock_ms,
        batch_size: (configData.batch_size as number) ??
          DEFAULT_CONFIG.batch_size,
        visibility_timeout_sec: (configData.visibility_timeout_sec as number) ??
          DEFAULT_CONFIG.visibility_timeout_sec,
        max_concurrency: (configData.max_concurrency as number) ?? 5,
      };
    }

    const configData = (data as { value: Record<string, unknown> }).value;
    return {
      max_wall_clock_ms: (configData.max_wall_clock_ms as number) ??
        DEFAULT_CONFIG.max_wall_clock_ms,
      batch_size: (configData.batch_size as number) ??
        DEFAULT_CONFIG.batch_size,
      visibility_timeout_sec: (configData.visibility_timeout_sec as number) ??
        DEFAULT_CONFIG.visibility_timeout_sec,
      max_concurrency: (configData.max_concurrency as number) ?? 5,
    };
  } catch (error) {
    console.warn("Error fetching config:", error);
    return DEFAULT_CONFIG as WorkerConfig;
  }
}

// Read messages from the queue
async function readMessages(
  supabase: ReturnType<typeof createServiceClient>,
  batchSize: number,
  visibilityTimeout: number,
): Promise<QueueMessage[]> {
  const { data, error } = await supabase.rpc("pgmq_read", {
    queue_name: "queue_sync_steam",
    qty: batchSize,
    vt: visibilityTimeout,
  });

  if (error) {
    console.error("Failed to read messages:", error.message);
    return [];
  }

  return (data as QueueMessage[]) ?? [];
}

// Delete a message from the queue
async function deleteMessage(
  supabase: ReturnType<typeof createServiceClient>,
  msgId: number,
): Promise<boolean> {
  const { error } = await supabase.rpc("pgmq_delete", {
    queue_name: "queue_sync_steam",
    msg_id: msgId,
  });

  if (error) {
    console.error(`Failed to delete message ${msgId}:`, error.message);
    return false;
  }

  return true;
}

// Fetch Steam player data
async function fetchSteamPlayers(
  steamIds: string[],
): Promise<Map<string, SteamPlayer>> {
  if (!STEAM_API_KEY) {
    throw new Error("STEAM_API_KEY not configured");
  }

  const playerMap = new Map<string, SteamPlayer>();

  // Steam API allows up to 100 Steam IDs per request
  const chunks: string[][] = [];
  for (let i = 0; i < steamIds.length; i += 100) {
    chunks.push(steamIds.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    const url = `${STEAM_API_URL}?key=${STEAM_API_KEY}&steamids=${chunk.join(",")
      }`;

    try {
      const response = await fetch(url);

      if (response.status === 429) {
        console.warn("Steam API rate limit hit");
        throw new Error("RATE_LIMITED");
      }

      if (!response.ok) {
        console.error(
          `Steam API error: ${response.status} ${response.statusText}`,
        );
        continue;
      }

      const data = (await response.json()) as SteamApiResponse;

      for (const player of data.response.players) {
        playerMap.set(player.steamid, player);
      }
    } catch (error) {
      if (error instanceof Error && error.message === "RATE_LIMITED") {
        throw error;
      }
      console.error("Failed to fetch Steam data:", error);
    }
  }

  return playerMap;
}

// Steam presence status type (matches database enum)
type PresenceSteamStatus =
  | "offline"
  | "online"
  | "busy"
  | "away"
  | "snooze"
  | "looking_to_trade"
  | "looking_to_play";

// Map Steam personastate to enum status
function mapPersonaState(state: number): PresenceSteamStatus {
  switch (state) {
    case 0:
      return "offline";
    case 1:
      return "online";
    case 2:
      return "busy";
    case 3:
      return "away";
    case 4:
      return "snooze";
    case 5:
      return "looking_to_trade";
    case 6:
      return "looking_to_play";
    default:
      return "offline"; // Default to offline for unknown states
  }
}

// Map Steam community visibility state to readable string
function mapVisibilityState(state: number): string {
  switch (state) {
    case 1:
      return "private";
    case 2:
      return "friends_only";
    case 3:
      return "public";
    default:
      return "unknown";
  }
}

// Update presences_steam with Steam data
async function updateSteamPresence(
  supabase: ReturnType<typeof createServiceClient>,
  profileId: string,
  player: SteamPlayer,
): Promise<boolean> {
  const status = mapPersonaState(player.personastate);
  const visibility = mapVisibilityState(player.communityvisibilitystate);
  const isOnline = player.personastate !== 0;

  const { data: existingPresence, error: existingError } = await supabase
    .from("presences_steam")
    .select(
      "current_app_id, current_app_name, last_app_id, last_app_name",
    )
    .eq("profile_id", profileId)
    .single();

  if (existingError && existingError.code !== "PGRST116") {
    console.error(
      `Failed to load existing Steam presence for ${profileId}:`,
      existingError.message,
    );
  }

  // Build the details JSON with all available Steam data
  const details: { [key: string]: Json | undefined } = {
    profileurl: player.profileurl,
    avatar: player.avatar,
    avatarmedium: player.avatarmedium,
    avatarfull: player.avatarfull,
  };

  // Add optional fields if present
  if (player.realname) details.realname = player.realname;
  if (player.loccountrycode) details.country = player.loccountrycode;
  if (player.locstatecode) details.state = player.locstatecode;
  if (player.timecreated) {
    details.account_created = new Date(player.timecreated * 1000).toISOString();
  }
  if (player.primaryclanid) details.primary_clan_id = player.primaryclanid;
  if (player.gameserverip) details.game_server_ip = player.gameserverip;
  if (player.gameicon && player.gameid) {
    details.game_icon = player.gameicon;
    details.game_icon_url =
      `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${player.gameid}/${player.gameicon}.jpg`;
  }

  const now = new Date().toISOString();

  // Prepare the upsert data
  const presenceData: {
    profile_id: string;
    status: PresenceSteamStatus;
    visibility: string;
    steam_name: string;
    updated_at: string;
    fetched_at: string;
    last_online_at?: string;
    current_app_id?: number | null;
    current_app_name?: string | null;
    last_app_id?: number | null;
    last_app_name?: string | null;
    details: { [key: string]: Json | undefined };
  } = {
    profile_id: profileId,
    status,
    visibility,
    steam_name: player.personaname,
    updated_at: now,
    fetched_at: now,
    details,
  };

  // Set last_online_at if currently online
  if (isOnline) {
    presenceData.last_online_at = new Date().toISOString();
  } else if (player.lastlogoff) {
    // Use lastlogoff timestamp if available and user is offline
    presenceData.last_online_at = new Date(
      player.lastlogoff * 1000,
    ).toISOString();
  }

  // Set game info if currently playing
  const currentAppId = player.gameid ? parseInt(player.gameid, 10) : null;
  const currentAppName = player.gameid && player.gameextrainfo
    ? player.gameextrainfo
    : null;

  const existingCurrentAppId = existingPresence?.current_app_id ?? null;
  const existingCurrentAppName = existingPresence?.current_app_name ?? null;

  let lastAppId = existingPresence?.last_app_id ?? null;
  let lastAppName = existingPresence?.last_app_name ?? null;

  if (!currentAppId && existingCurrentAppId) {
    lastAppId = existingCurrentAppId;
    lastAppName = existingCurrentAppName;
  } else if (
    currentAppId
    && existingCurrentAppId
    && currentAppId !== existingCurrentAppId
  ) {
    lastAppId = existingCurrentAppId;
    lastAppName = existingCurrentAppName;
  }

  presenceData.current_app_id = currentAppId;
  presenceData.current_app_name = currentAppName;
  presenceData.last_app_id = currentAppId ?? lastAppId;
  presenceData.last_app_name = currentAppName ?? lastAppName;

  // Upsert into presences_steam
  const { error } = await supabase
    .from("presences_steam")
    .upsert(presenceData, {
      onConflict: "profile_id",
    });

  if (error) {
    console.error(
      `Failed to upsert Steam presence for ${profileId}:`,
      error.message,
    );
    return false;
  }

  console.log(
    `Synced Steam presence for ${profileId}: ${player.personaname} (${status})${player.gameextrainfo ? ` playing ${player.gameextrainfo}` : ""
    }`,
  );

  return true;
}

// Process a batch of messages
async function processBatch(
  supabase: ReturnType<typeof createServiceClient>,
  messages: QueueMessage[],
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  // Collect all Steam IDs from the batch
  const steamIdToMessage = new Map<string, QueueMessage>();
  for (const msg of messages) {
    steamIdToMessage.set(msg.message.steam_id, msg);
  }

  // Fetch Steam player data in bulk
  const steamIds = Array.from(steamIdToMessage.keys());
  const playerMap = await fetchSteamPlayers(steamIds);

  // Process each message
  const results = await Promise.allSettled(
    messages.map(async (msg) => {
      const player = playerMap.get(msg.message.steam_id);

      if (!player) {
        // Steam ID not found - could be private or invalid
        console.warn(
          `Steam ID ${msg.message.steam_id} not found in API response`,
        );
        // Still delete the message to avoid reprocessing
        await deleteMessage(supabase, msg.msg_id);
        return { success: false, reason: "not_found" };
      }

      // Update the Steam presence data
      const updated = await updateSteamPresence(
        supabase,
        msg.message.profile_id,
        player,
      );

      if (updated) {
        // Successfully processed - delete from queue
        await deleteMessage(supabase, msg.msg_id);
        return { success: true };
      }

      return { success: false, reason: "update_failed" };
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.success) {
      processed++;
    } else {
      failed++;
    }
  }

  return { processed, failed };
}

// Main handler
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify system cron secret
    const cronSecret = Deno.env.get("SYSTEM_CRON_SECRET");
    const providedSecret = req.headers.get("System-Cron-Secret");

    if (!cronSecret || providedSecret !== cronSecret) {
      return new Response(
        JSON.stringify({ success: false, message: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate Steam API key is configured
    if (!STEAM_API_KEY) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "STEAM_API_KEY not configured",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createServiceClient();
    const config = await getWorkerConfig(supabase);
    const startTime = Date.now();

    let totalProcessed = 0;
    let totalFailed = 0;
    let batchCount = 0;

    // The main processing loop
    while ((Date.now() - startTime) < config.max_wall_clock_ms) {
      // Read messages from queue
      const messages = await readMessages(
        supabase,
        config.batch_size,
        config.visibility_timeout_sec,
      );

      // If queue is empty, exit early
      if (!messages.length) {
        console.log("Queue empty, exiting early");
        break;
      }

      batchCount++;
      console.log(
        `Processing batch ${batchCount} with ${messages.length} messages`,
      );

      try {
        const { processed, failed } = await processBatch(supabase, messages);
        totalProcessed += processed;
        totalFailed += failed;
      } catch (error) {
        if (error instanceof Error && error.message === "RATE_LIMITED") {
          console.warn("Rate limited by Steam API, exiting loop");
          break;
        }
        console.error("Batch processing error:", error);
        totalFailed += messages.length;
      }
    }

    const duration = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        batches: batchCount,
        processed: totalProcessed,
        failed: totalFailed,
        duration_ms: duration,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Worker error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
