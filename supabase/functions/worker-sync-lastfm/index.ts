import { createClient } from "@supabase/supabase-js";
import type { Database } from "database-types";
import { corsHeaders } from "../_shared/cors.ts";
import { fetchRecentTrack, resolveAlbumArt } from "../_shared/lastfm.ts";

// Convenience alias - used for queries against tables/columns not yet in
// the generated types (presences_lastfm).
// Remove this alias once the migration has been applied and types regenerated.
// deno-lint-ignore no-explicit-any
type AnyClient = ReturnType<typeof createClient<any>>;

// Last.fm API key - read once at module load
const LASTFM_API_KEY = Deno.env.get("LASTFM_API_KEY");

// Conservative defaults used when kvstore config is unavailable
const DEFAULT_CONFIG = {
  max_wall_clock_ms: 50000,
  batch_size: 10,
  visibility_timeout_sec: 60,
  max_concurrency: 5,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
    lastfm_username: string;
  };
}

// ---------------------------------------------------------------------------
// Supabase service-role client
// ---------------------------------------------------------------------------

function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_KEY");

  if (!url || !key) {
    throw new Error("Missing Supabase configuration");
  }

  return createClient<Database>(url, key);
}

// ---------------------------------------------------------------------------
// Worker config
// ---------------------------------------------------------------------------

async function getWorkerConfig(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<WorkerConfig> {
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "get_private_config" as never,
      { config_key: "worker_sync_lastfm" } as never,
    );

    if (rpcError || !rpcData) {
      console.warn(
        "Failed to fetch config, using defaults:",
        rpcError?.message,
      );
      return DEFAULT_CONFIG;
    }

    const cfg = rpcData as unknown as Record<string, unknown>;
    return {
      max_wall_clock_ms: (cfg.max_wall_clock_ms as number) ??
        DEFAULT_CONFIG.max_wall_clock_ms,
      batch_size: (cfg.batch_size as number) ?? DEFAULT_CONFIG.batch_size,
      visibility_timeout_sec: (cfg.visibility_timeout_sec as number) ??
        DEFAULT_CONFIG.visibility_timeout_sec,
      max_concurrency: (cfg.max_concurrency as number) ??
        DEFAULT_CONFIG.max_concurrency,
    };
  } catch (error) {
    console.warn("Error fetching config:", error);
    return DEFAULT_CONFIG;
  }
}

// ---------------------------------------------------------------------------
// Queue helpers
// ---------------------------------------------------------------------------

async function readMessages(
  supabase: ReturnType<typeof createServiceClient>,
  batchSize: number,
  visibilityTimeout: number,
): Promise<QueueMessage[]> {
  const { data, error } = await supabase.rpc("pgmq_read", {
    queue_name: "queue_sync_lastfm",
    qty: batchSize,
    vt: visibilityTimeout,
  });

  if (error) {
    console.error("Failed to read queue messages:", error.message);
    return [];
  }

  return (data as QueueMessage[]) ?? [];
}

async function archiveMessage(
  supabase: ReturnType<typeof createServiceClient>,
  msgId: number,
): Promise<void> {
  const { error } = await supabase.rpc("pgmq_delete", {
    queue_name: "queue_sync_lastfm",
    msg_id: msgId,
  });

  if (error) {
    console.error(`Failed to archive message ${msgId}:`, error.message);
  }
}

// ---------------------------------------------------------------------------
// Per-message processing
// ---------------------------------------------------------------------------

async function processMessage(
  supabase: ReturnType<typeof createServiceClient>,
  msg: QueueMessage,
): Promise<void> {
  const { profile_id, lastfm_username } = msg.message;

  if (!LASTFM_API_KEY) {
    throw new Error("LASTFM_API_KEY not configured");
  }

  const track = await fetchRecentTrack(lastfm_username, LASTFM_API_KEY);

  const now = new Date().toISOString();
  // presences_lastfm is a new table not yet in generated types
  const anySupabase = supabase as AnyClient;

  if (!track) {
    await anySupabase
      .from("presences_lastfm")
      .upsert(
        {
          profile_id,
          lastfm_username,
          now_playing: false,
          track_name: null,
          artist_name: null,
          album_name: null,
          album_art_url: null,
          track_url: null,
          played_at: null,
          updated_at: now,
        },
        { onConflict: "profile_id" },
      );

    await archiveMessage(supabase, msg.msg_id);
    return;
  }

  const albumArtUrl = await resolveAlbumArt(track.artist, track.name);

  const { error: upsertError } = await anySupabase
    .from("presences_lastfm")
    .upsert(
      {
        profile_id,
        lastfm_username,
        now_playing: track.nowPlaying,
        track_name: track.name,
        artist_name: track.artist,
        album_name: track.album || null,
        album_art_url: albumArtUrl,
        track_url: track.url,
        played_at: track.playedAt?.toISOString() ?? null,
        updated_at: now,
      },
      { onConflict: "profile_id" },
    );

  if (upsertError) {
    console.error(
      `Failed to upsert Last.fm presence for ${profile_id}:`,
      upsertError.message,
    );
    // Don't archive - let visibility timeout expire so it can be retried
    return;
  }

  console.log(
    `Synced Last.fm presence for ${profile_id} (${lastfm_username}): ${
      track.nowPlaying ? "now playing" : "last played"
    } "${track.name}" by ${track.artist}`,
  );

  await archiveMessage(supabase, msg.msg_id);
}

// ---------------------------------------------------------------------------
// Batch processing with concurrency limit
// ---------------------------------------------------------------------------

async function processBatch(
  supabase: ReturnType<typeof createServiceClient>,
  messages: QueueMessage[],
  maxConcurrency: number,
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  // Process in chunks of maxConcurrency
  for (let i = 0; i < messages.length; i += maxConcurrency) {
    const chunk = messages.slice(i, i + maxConcurrency);

    const results = await Promise.allSettled(
      chunk.map((msg) => processMessage(supabase, msg)),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        processed++;
      } else {
        failed++;
        console.error("Message processing failed:", result.reason);
      }
    }
  }

  return { processed, failed };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

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

    if (!LASTFM_API_KEY) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "LASTFM_API_KEY not configured",
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

    while ((Date.now() - startTime) < config.max_wall_clock_ms) {
      const messages = await readMessages(
        supabase,
        config.batch_size,
        config.visibility_timeout_sec,
      );

      if (!messages.length) {
        console.log("Queue empty, exiting early");
        break;
      }

      batchCount++;
      console.log(
        `Processing batch ${batchCount} with ${messages.length} messages`,
      );

      const { processed, failed } = await processBatch(
        supabase,
        messages,
        config.max_concurrency,
      );

      totalProcessed += processed;
      totalFailed += failed;
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
