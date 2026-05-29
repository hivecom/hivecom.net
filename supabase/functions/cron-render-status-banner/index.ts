import { createClient } from "@supabase/supabase-js";
import type { Database } from "database-types";
import type { MetricsSnapshot } from "metrics-types";
import constants from "constants" with { type: "json" };

import { authorizeSystemCron } from "../_shared/auth.ts";
import { formatCountdown, type LiveInfo, renderBanner } from "./banner.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const METRICS_BUCKET = "hivecom-content-static";
const METRICS_OBJECT = "metrics/latest.json";
const BANNER_OBJECT = "banners/status.png";

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  try {
    const authorizeResponse = authorizeSystemCron(req);
    if (authorizeResponse) {
      console.error("Authorization failed:", authorizeResponse.statusText);
      return authorizeResponse;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SECRET_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      "";

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase service role configuration");
    }

    const supabaseClient = createClient<Database>(supabaseUrl, supabaseKey);

    // -----------------------------------------------------------------------
    // Load latest metrics snapshot + live info in parallel
    // -----------------------------------------------------------------------
    const now = new Date().toISOString();
    const [snapshotResult, eventResult, gameResult, nextEventResult] =
      await Promise.all([
        supabaseClient.storage.from(METRICS_BUCKET).download(METRICS_OBJECT),
        // Active official event: started and not yet finished (for footer)
        supabaseClient
          .from("events")
          .select("title, duration_minutes")
          .eq("is_official", true)
          .lte("date", now)
          .gt("date", new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString())
          .not("duration_minutes", "is", null)
          .order("date", { ascending: false })
          .limit(5),
        // Top currently-played Steam game (mirrors cron-metrics-fetch logic)
        supabaseClient
          .from("presences_steam")
          .select(
            "current_app_name, profile:profiles!presences_steam_profile_id_fkey(rich_presence_enabled)",
          )
          .not("current_app_name", "is", null),
        // Next upcoming official event (for countdown KPI)
        supabaseClient
          .from("events")
          .select("date")
          .eq("is_official", true)
          .gt("date", now)
          .order("date", { ascending: true })
          .limit(1),
      ]);

    if (snapshotResult.error || !snapshotResult.data) {
      throw new Error(
        `Failed to load metrics snapshot: ${snapshotResult.error?.message ?? "no data"
        }`,
      );
    }

    const metrics = JSON.parse(
      await snapshotResult.data.text(),
    ) as MetricsSnapshot;

    // -----------------------------------------------------------------------
    // Resolve footer info: top currently-played game only
    // -----------------------------------------------------------------------
    let live: LiveInfo | null = null;

    const activeEvent = (eventResult.data ?? []).find((e) => {
      if (!e.duration_minutes) return false;
      const start = new Date(
        (e as unknown as Record<string, string>).date,
      ).getTime();
      return Date.now() < start + e.duration_minutes * 60_000;
    });
    const eventOngoing = Boolean(activeEvent);

    // Count occurrences of each game name
    const counts: Record<string, number> = {};
    for (const row of gameResult.data ?? []) {
      const profile = row.profile as
        | { rich_presence_enabled: boolean }
        | null;
      if (!profile?.rich_presence_enabled) continue;
      const name = row.current_app_name;
      if (name) counts[name] = (counts[name] ?? 0) + 1;
    }
    const topGame = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (topGame) {
      live = {
        kind: "game",
        title: topGame[0],
        subtitle: `${topGame[1]} playing`,
      };
    }

    // -----------------------------------------------------------------------
    // Countdown for next upcoming event
    // -----------------------------------------------------------------------
    const nextEvent = (nextEventResult.data ?? [])[0] as
      | { date: string }
      | undefined;
    const nextEventCountdown = nextEvent
      ? formatCountdown(
        new Date((nextEvent as unknown as Record<string, string>).date)
          .getTime() - Date.now(),
      )
      : null;

    // -----------------------------------------------------------------------
    // Render and upload
    // -----------------------------------------------------------------------
    const png = renderBanner(metrics, live, nextEventCountdown, eventOngoing);

    const { error: uploadError } = await supabaseClient.storage
      .from(METRICS_BUCKET)
      .upload(
        BANNER_OBJECT,
        new Blob([png as unknown as Uint8Array<ArrayBuffer>], {
          type: "image/png",
        }),
        { upsert: true, cacheControl: "60", contentType: "image/png" },
      );

    if (uploadError) {
      throw new Error(`Failed to upload banner: ${uploadError.message}`);
    }

    console.log(
      `Rendered status banner (${png.byteLength}b) from snapshot at ${metrics.collectedAt}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Rendered status banner",
        path: `${METRICS_BUCKET}/${BANNER_OBJECT}`,
        bytes: png.byteLength,
        snapshotAt: metrics.collectedAt,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const error = err as Error;
    console.error("Error in cron-render-status-banner:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: constants.API_ERROR,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
